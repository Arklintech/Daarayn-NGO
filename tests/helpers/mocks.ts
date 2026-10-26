import { vi } from "vitest";
import { fakeSheets } from "./fakeSheets";

// Process-wide singletons: vi.resetModules() would otherwise hand the mock factories a NEW copy of this module whose
// state the test (holding the old copy) can no longer control.
const g = globalThis as any;
export const authState: { role: "admin" | "agent" | "none" } = (g.__testAuthState ??= { role: "admin" });

export const driveMock = (g.__testDriveMock ??= {
  uploadFile: vi.fn(async () => ({ drive_file_id: "DRIVEPROOF_000001", storage_backend: "google_drive" })),
  getFileStream: vi.fn(async (id: string) => {
    if (id === "MISSINGFILE0001") throw new Error(`File with id ${id} not found in secure storage.`);
    const { Readable } = await import("stream");
    return { stream: Readable.from([Buffer.from("x")]), mimeType: "image/png", filename: "f.png", size: 1 };
  }),
}) as {
  uploadFile: ReturnType<typeof vi.fn>;
  getFileStream: ReturnType<typeof vi.fn>;
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
  authState.role = "admin";
  mailMock.failFor.clear();
  mailMock.sent.length = 0;
  vi.clearAllMocks();
  const repos = await import("@/lib/repositories");
  for (const r of Object.values(repos)) (r as any)?.invalidateCache?.();
  const { communicationRecipientRepository } = await import("@/lib/repositories/communicationRecipientRepository");
  communicationRecipientRepository.invalidateCache();
}
