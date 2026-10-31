/**
 * lib/intake/intakeService.ts  (D37, ISOLATED)
 *
 * Step 1 of the queued flow: durably ACCEPT a donation submission. It validates, checks eligibility with the same fresh read the direct path uses,
 * stores the payment proof in Drive, appends ONE literal-safe row to Donation_Intake and only then answers. "Received" is not "recorded as a donation":
 * no permanent id exists yet and nothing is added to any total.
 *
 * Cost: one fresh eligibility read and one write. A replay of the same submission (same key and payload) has the same reference and needs no read;
 * if it appends a second intake row the finaliser marks it DUPLICATE. Nothing here is imported by the active donation path.
 */
import crypto from "crypto";
import { sheetsService } from "../google/sheets";
import { driveService } from "../google/drive";
import { readEligibilityWithHeaders } from "../catalog/holds";
import { normalizeSelection, SelectionError } from "../donations/selection";
import { contactKeys } from "../donors/normalize";
import { DonationInputError, ProofStorageError } from "../services/donationService";
import { INTAKE_SHEET, INTAKE_HEADERS, assertIntakeSchema, payloadHash, submissionReference, type IntakePayload } from "./schema";

export interface AcceptDonationInput {
  donorName: string;
  donorContact: string;
  upiRef?: string;
  amount: number;
  currency?: string;
  cause?: string;
  selectedCauses?: unknown;
  screenshotBuffer?: Buffer;
  screenshotFilename?: string;
  screenshotMimeType?: string;
  /** The client's idempotency key. Without one a random key is used and there is no replay protection. */
  submissionKey?: string;
}

export interface AcceptedSubmission {
  reference: string;
  state: "RECEIVED";
  idempotencyKey: string;
  receivedAt: string;
}

export async function acceptDonation(input: AcceptDonationInput): Promise<AcceptedSubmission> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new DonationInputError("Invalid donation amount.");
  const keys = contactKeys(input.donorContact);
  if (!keys.email && !keys.phone) throw new DonationInputError("A valid email address or phone number is required.");
  const idempotencyKey = (input.submissionKey || "").trim().slice(0, 100) || `SUB-RAND-${crypto.randomBytes(9).toString("hex")}`;

  // ONE read: eligibility (fresh, never cached) and the intake worksheet header row travel in the same batched request. The header row is checked
  // against the schema contract on EVERY request (a cache could hide a drift); a mismatch writes nothing. A worksheet that does not exist yet is
  // provisioned once (slow path) and the read is repeated.
  const specific = Array.isArray(input.selectedCauses) ? input.selectedCauses.length > 0 : !!input.selectedCauses;
  let read;
  try {
    read = await readEligibilityWithHeaders([INTAKE_SHEET]);
  } catch (err: any) {
    if (!/Unable to parse range/i.test(String(err?.message))) throw err; // anything but "worksheet missing" fails closed
    await sheetsService.ensureSheetExists(INTAKE_SHEET, INTAKE_HEADERS);
    read = await readEligibilityWithHeaders([INTAKE_SHEET]);
  }
  assertIntakeSchema(read.headers[INTAKE_SHEET] || []);
  const catalog = read.catalog;
  const held = specific ? read.held : new Set<string>();
  let selection;
  try {
    selection = normalizeSelection(input.selectedCauses, catalog, "", held);
  } catch (err) {
    if (err instanceof SelectionError) throw new DonationInputError(err.message);
    throw err;
  }
  const single = selection.causes.length === 1 ? selection.causes[0] : null;
  const causeTitle = single ? single.causeTitle : selection.causes.length > 1 ? "Multiple Causes" : input.cause || "General Donation";

  // The proof is stored first, under the idempotency key; a failure stores nothing and the donor can retry.
  let proofDriveFileId = "";
  const donorName = (input.donorName || "").trim() || "Generous Donor";
  if (input.screenshotBuffer && input.screenshotBuffer.length > 0) {
    try {
      const meta = await driveService.uploadFile(input.screenshotBuffer, input.screenshotFilename || `proof-${Date.now()}.png`, input.screenshotMimeType || "image/png", "Payment Proofs", idempotencyKey, donorName);
      proofDriveFileId = meta.drive_file_id;
    } catch {
      throw new ProofStorageError("Your payment proof could not be stored right now. Please try again in a few minutes.");
    }
  }

  const payload: IntakePayload = {
    donorName,
    donorContact: (input.donorContact || "").trim(),
    amount,
    currency: input.currency || "INR",
    upiRef: input.upiRef || "",
    causeTitle,
    causeId: single ? single.causeId : "",
    selection: selection.causes.map((c) => ({ causeId: c.causeId, causeName: c.causeTitle })),
    proofDriveFileId,
  };
  const hash = payloadHash(payload);
  const reference = submissionReference(idempotencyKey, hash);
  const receivedAt = new Date().toISOString();

  // ONE literal-safe append (RAW: nothing is parsed or evaluated). If it throws, nothing was accepted and the caller must not say "received".
  await sheetsService.appendRowRaw(
    INTAKE_SHEET,
    { submissionRef: reference, idempotencyKey, payloadHash: hash, payload: JSON.stringify(payload), receivedAt, state: "RECEIVED", retryCount: 0, lastErrorCategory: "", donationId: "", completedAt: "", updatedAt: receivedAt },
    INTAKE_HEADERS
  );
  return { reference, state: "RECEIVED", idempotencyKey, receivedAt };
}
