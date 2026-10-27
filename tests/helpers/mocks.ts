import { vi } from "vitest";
import { fakeSheets } from "./fakeSheets";

// Process-wide singletons: vi.resetModules() would otherwise hand the mock factories a NEW copy of this module whose
// state the test (holding the old copy) can no longer control.
const g = globalThis as any;
export const authState: { role: "admin" | "agent" | "none" } = (g.__testAuthState ??= { role: "admin" });

export const driveMock = (g.__testDriveMock ??= {
  uploadFile: vi.fn(async () => ({ drive_file_id: "DRIVEPROOF_000001", storage_backend: "google_drive" })),
  deleteFile: vi.fn(async () => true),
  /** Override per test: file bytes by id decide size/fingerprint; absent ids are "not found". */
  files: new Map<string, { name: string; mimeType: string; content: Buffer; trashed?: boolean }>(),
  getFileInfo: vi.fn(async (id: string) => {
    const f = driveMock.files.get(id);
    if (!f) {
      if (id.startsWith("MISSING")) throw new Error(`File with id ${id} not found in secure storage.`);
      return { id, name: "f.png", mimeType: "image/png", size: 1, fingerprint: "default", trashed: false }; // legacy fixtures
    }
    const crypto = await import("crypto");
    return { id, name: f.name, mimeType: f.mimeType, size: f.content.length, fingerprint: crypto.createHash("md5").update(f.content).digest("hex"), trashed: Boolean(f.trashed) };
  }),
  getFileStream: vi.fn(async (id: string) => {
    const known = driveMock.files.get(id);
    if (known) {
      const { Readable } = await import("stream");
      return { stream: Readable.from([known.content]), mimeType: known.mimeType, filename: known.name, size: known.content.length };
    }
    if (id === "MISSINGFILE0001") throw new Error(`File with id ${id} not found in secure storage.`);
    const { Readable } = await import("stream");
    return { stream: Readable.from([Buffer.from("x")]), mimeType: "image/png", filename: "f.png", size: 1 };
  }),
}) as {
  uploadFile: ReturnType<typeof vi.fn>;
  deleteFile: ReturnType<typeof vi.fn>;
  getFileStream: ReturnType<typeof vi.fn>;
  getFileInfo: ReturnType<typeof vi.fn>;
  files: Map<string, { name: string; mimeType: string; content: Buffer; trashed?: boolean }>;
};

export const mailMock = (g.__testMailMock ??= {
  sendDonationEmail: vi.fn(async () => ({ success: true, providerMessageId: "ack-1" })),
  /** Override per test: return { success:false, error, retryable } for given addresses. */
  failFor: new Set<string>(),
  sent: [] as string[],
  sendEmail: vi.fn(async (p: { to: string }) => {
    if (mailMock.failFor.has(p.to)) return { success: false, error: "550 mailbox unavailable", retryable: false };
    mailMock.sent.push(p.to);
    return { success: true, providerMessageId: `<msg-${p.to}>` };
  }),
  verifyEmailProvider: vi.fn(async () => ({ ok: true, provider: "gmail" })),
}) as any;

/** Fresh state for every test: empty sheets, no repository caches, no mock history. */
export async function resetWorld() {
  fakeSheets.reset();
  driveMock.files.clear();
  authState.role = "admin";
  mailMock.failFor.clear();
  mailMock.sent.length = 0;
  vi.clearAllMocks();
  const repos = await import("@/lib/repositories");
  for (const r of Object.values(repos)) (r as any)?.invalidateCache?.();
  const { communicationRecipientRepository } = await import("@/lib/repositories/communicationRecipientRepository");
  communicationRecipientRepository.invalidateCache();
}
