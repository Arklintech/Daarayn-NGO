import { describe, it, expect, beforeEach } from "vitest";
import { resetWorld, driveMock } from "./helpers/mocks";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { donationService } from "@/lib/services/donationService";

beforeEach(resetWorld);

const donate = (over: Record<string, any> = {}) =>
  donationService.processDonation({
    donorName: "Dup Test", donorContact: "dup@example.invalid", amount: 200, cause: "General",
    screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", ...over,
  });

// Regression (D3-F3): every retry of one submission uploaded its own proof before the duplicate was detected, leaving
// unreferenced copies of the evidence in Drive.
describe("a replayed submission does not leave orphan proof files", () => {
  it("deletes only its own redundant upload; the recorded proof is untouched", async () => {
    driveMock.uploadFile.mockResolvedValueOnce({ drive_file_id: "PROOF_FIRST", storage_backend: "google_drive" });
    const first = await donate({ submissionKey: "KEY-1" });
    expect(first.duplicate).toBeFalsy();
    expect(first.proofDriveFileId).toBe("PROOF_FIRST");

    driveMock.uploadFile.mockResolvedValueOnce({ drive_file_id: "PROOF_SECOND", storage_backend: "google_drive" });
    const second = await donate({ submissionKey: "KEY-1" });

    expect(second.duplicate).toBe(true);
    expect(second.donationId).toBe(first.donationId);
    expect(second.proofDriveFileId).toBe("PROOF_FIRST");
    expect(driveMock.deleteFile).toHaveBeenCalledTimes(1);
    expect(driveMock.deleteFile).toHaveBeenCalledWith("PROOF_SECOND");
    const rows = await donationRepository.getAll(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].proofDriveFileId).toBe("PROOF_FIRST");
  });

  it("does not delete anything for a normal first submission", async () => {
    await donate({ submissionKey: "KEY-2" });
    expect(driveMock.deleteFile).not.toHaveBeenCalled();
  });

  it("a failed cleanup never fails the donor's request", async () => {
    await donate({ submissionKey: "KEY-3" });
    driveMock.uploadFile.mockResolvedValueOnce({ drive_file_id: "PROOF_OTHER", storage_backend: "google_drive" });
    driveMock.deleteFile.mockRejectedValueOnce(new Error("drive unavailable"));
    const again = await donate({ submissionKey: "KEY-3" });
    expect(again.duplicate).toBe(true);
  });
});

// Regression (D8): the browser lost the first response and retried while Google Drive was briefly unreachable (ECONNRESET).
// The retry answered 503 even though the donation was already recorded, instead of returning the original tracking id.
describe("a retry of an already-recorded donation survives a Drive outage", () => {
  it("returns the original donation (duplicate) without uploading, instead of failing with a storage error", async () => {
    const first = await donate({ submissionKey: "KEY-OUTAGE" });
    driveMock.uploadFile.mockRejectedValueOnce(new Error("read ECONNRESET"));
    const retry = await donate({ submissionKey: "KEY-OUTAGE" });
    expect(retry.duplicate).toBe(true);
    expect(retry.donationId).toBe(first.donationId);
    expect(await donationRepository.getAll(true)).toHaveLength(1);
  });

  it("a NEW submission during a Drive outage is still refused (nothing stored)", async () => {
    driveMock.uploadFile.mockRejectedValueOnce(new Error("read ECONNRESET"));
    await expect(donate({ submissionKey: "KEY-NEW-OUTAGE" })).rejects.toThrow(/payment proof could not be stored/);
    expect(await donationRepository.getAll(true)).toHaveLength(0);
  });
});
