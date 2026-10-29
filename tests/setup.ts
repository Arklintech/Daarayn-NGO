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

// Hard stop: no offline test can ever open a real SMTP connection, even if an e-mail module mock is removed by mistake.
// (A test that needs the Gmail provider supplies its own nodemailer mock, which overrides this one.)
vi.mock("nodemailer", () => {
  const forbidden = () => {
    throw new Error("Real SMTP is forbidden in offline tests: mock the transport explicitly.");
  };
  return { default: { createTransport: forbidden }, createTransport: forbidden };
});

// The request-rate limiter is exercised by its own tests; every other offline test runs unthrottled.
process.env.GOOGLE_SHEETS_READS_PER_MINUTE = "0";
process.env.GOOGLE_SHEETS_WRITES_PER_MINUTE = "0";

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
  generateLetterEmailTemplate: (o: any) => `<html>${o?.projectUpdate ?? ""}</html>`,
  attachDaaraynLogo: () => [],
}));

vi.mock("@/lib/realtime/broadcaster", () => ({
  realtimeBroadcaster: {
    publish: vi.fn(async () => ({ delivered: "log" })),
    publishBatch: vi.fn(async () => ({ delivered: "log" })),
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
