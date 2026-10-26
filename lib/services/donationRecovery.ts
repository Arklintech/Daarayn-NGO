/**
 * lib/services/donationRecovery.ts
 *
 * Google Sheets has no multi-record transactions, so a donation's follow-up work (cause relationships, admin
 * notification, audit entry) can be interrupted after the donation row itself is safely written. Such donations carry
 * opStatus "pending"/"partial" and the list of outstanding steps. Recovery repeats only the missing steps, each of
 * them idempotent (checked by key before writing), never creates a second donation, and never invents financial facts.
 */
import { donationRepository } from "../repositories/donationRepository";
import { donationCauseRepository, designationsForSelection } from "../repositories/donationCauseRepository";
import { notificationRepository } from "../repositories/notificationRepository";
import { auditLogRepository } from "../repositories/auditLogRepository";
import { FOLLOW_UP_STEPS } from "./donationService";
import type { Donation } from "../db";

export const isIncomplete = (d: Pick<Donation, "opStatus">) => d.opStatus === "pending" || d.opStatus === "partial";

export function outstandingSteps(d: Pick<Donation, "opStatus" | "opPending">): string[] {
  if (!isIncomplete(d)) return [];
  const listed = String(d.opPending || "").split(",").map((s) => s.trim()).filter(Boolean);
  return listed.length ? listed : [...FOLLOW_UP_STEPS];
}

export async function recoverDonation(donationId: string, actorEmail: string): Promise<{ donationId: string; recovered: string[]; remaining: string[] }> {
  const matches = (await donationRepository.getAll(true)).filter((d) => d.id === donationId);
  if (matches.length !== 1) throw new Error(matches.length === 0 ? `Donation ${donationId} was not found.` : `Donation id ${donationId} is held by more than one row.`);
  const donation = matches[0];
  const todo = outstandingSteps(donation);
  if (todo.length === 0) return { donationId, recovered: [], remaining: [] };

  const recovered: string[] = [];
  const remaining: string[] = [];
  const nowIso = new Date().toISOString();

  for (const step of todo) {
    try {
      if (step === "designations") {
        const selection = (donation.selection || []).map((s) => ({ causeId: s.causeId, causeTitle: s.causeName }));
        await donationCauseRepository.createMissing(designationsForSelection({ id: donation.id, amount: donation.amount }, selection, nowIso));
      } else if (step === "notification") {
        const have = (await notificationRepository.getAll(true)).some((n) => n.relatedEntityId === donation.id && n.type === "DONATION");
        if (!have) {
          await notificationRepository.append({
            id: `NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            recipientType: "Admin",
            recipientId: "all",
            type: "DONATION",
            title: "New Donation Received",
            message: `Received ₹${donation.amount.toLocaleString()} for ${donation.causeTitle || "General"} from ${donation.donorName} — awaiting verification`,
            read: false,
            relatedEntityId: donation.id,
            createdAt: nowIso,
          });
        }
      } else if (step === "audit") {
        const have = (await auditLogRepository.getAll(true)).some((e) => e.action === "SUBMIT_DONATION" && e.entity_id === donation.id);
        if (!have) {
          await auditLogRepository.append({
            id: `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            actor_id: donation.donorId,
            actor_role: "donor",
            action: "SUBMIT_DONATION",
            entity_type: "Donation",
            entity_id: donation.id,
            before_state: null,
            after_state: { amount: donation.amount, cause: donation.causeTitle, trackingId: donation.id, recoveredLater: true },
            timestamp: donation.date || nowIso,
            source: "recovery",
          });
        }
      } else {
        remaining.push(step); // unknown step: leave it visible rather than pretending
        continue;
      }
      recovered.push(step);
    } catch (err: any) {
      console.error(`[Recovery] ${donationId} step ${step} failed:`, err.message);
      remaining.push(step);
    }
  }

  await donationRepository.setOperationState(donationId, remaining.length ? "partial" : "complete", remaining.join(","));
  try {
    await auditLogRepository.append({
      id: `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actor_id: actorEmail,
      actor_role: "admin",
      action: "RECOVER_DONATION_FOLLOW_UP",
      entity_type: "Donation",
      entity_id: donationId,
      before_state: { pending: todo },
      after_state: { recovered, remaining },
      timestamp: nowIso,
      source: "admin_reconciliation",
    });
  } catch (err: any) {
    console.error(`[Recovery] audit for ${donationId} failed:`, err.message);
  }
  return { donationId, recovered, remaining };
}
