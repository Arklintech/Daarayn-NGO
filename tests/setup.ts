/**
 * Test environment: every external integration is replaced. Nothing here can reach
 * Google Sheets/Drive, SMTP, Firebase or the network.
 */
import { vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/google/sheets", async () => {
  const { fakeSheets, FakeSheets } = await import("./helpers/fakeSheets");
  return { sheetsService: fakeSheets, SheetsService: FakeSheets };
});

vi.mock("@/lib/google/drive", async () => {
  const { driveMock } = await import("./helpers/mocks");
  return { driveService: driveMock };
});

vi.mock("@/lib/email", async () => {
  const { mailMock } = await import("./helpers/mocks");
  return { sendDonationEmail: mailMock.sendDonationEmail };
});

vi.mock("@/lib/email/providerManager", async () => {
  const { mailMock } = await import("./helpers/mocks");
  return { sendEmail: mailMock.sendEmail, verifyEmailProvider: mailMock.verifyEmailProvider };
});

vi.mock("@/lib/email/resend", () => ({
  generateLetterEmailTemplate: () => "<html></html>",
  attachDaaraynLogo: () => [],
}));

vi.mock("@/lib/realtime/broadcaster", () => ({
  realtimeBroadcaster: {
    publish: vi.fn(async () => ({ delivered: "log" })),
    broadcast: vi.fn(),
  },
}));

vi.mock("@/lib/server/auth", async () => {
  const { authState } = await import("./helpers/mocks");
  const deny = () => NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  return {
    requireAdmin: vi.fn(async () => (authState.role === "admin" ? { kind: "admin", uid: "u1", email: "admin@test.local" } : deny())),
    requireAgent: vi.fn(async () => (authState.role === "agent" ? { kind: "agent", uid: "u2", email: "agent@test.local", agent: { id: "FA001", name: "Agent" } } : deny())),
    requireAdminOrAgent: vi.fn(async () =>
      authState.role === "admin"
        ? { kind: "admin", uid: "u1", email: "admin@test.local" }
        : authState.role === "agent"
        ? { kind: "agent", uid: "u2", email: "agent@test.local", agent: { id: "FA001", name: "Agent" } }
        : deny()
    ),
  };
});
