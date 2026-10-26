/**
 * LIVE Google Drive OAuth test. Run: npx vitest run --config vitest.live.config.ts tests/live/drive-oauth.live.test.ts
 * Requires the OAuth client in .env.local AND an administrator to have connected Drive once
 * (Admin -> Settings -> Connect Google Drive), or GOOGLE_DRIVE_REFRESH_TOKEN to be set.
 *
 * Safety: uploads go ONLY to an isolated test folder (GOOGLE_DRIVE_TEST_FOLDER_ID, or a temporary folder this test
 * creates in the connected account's My Drive and deletes afterwards). The production evidence folder is touched
 * read-only (a metadata check). Nothing is written to Google Sheets or e-mailed.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { google } from "googleapis";

const auth = vi.hoisted(() => ({ role: "admin" as "admin" | "none" }));
vi.mock("@/lib/server/auth", async () => {
  const { NextResponse } = await import("next/server");
  const deny = () => NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const admin = { kind: "admin", uid: "live", email: "live@example.invalid" };
  return {
    requireAdmin: async () => (auth.role === "admin" ? admin : deny()),
    requireAgent: async () => deny(),
    requireAdminOrAgent: async () => (auth.role === "admin" ? admin : deny()),
  };
});

const RUN = `OAUTH-${Date.now().toString(36)}`;
const PRODUCTION_FOLDER = (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "").trim();
let connected = false;
let drive: any;
let testFolderId = "";
let createdFolder = false;
let uploadedId = "";
const need = (ctx: any) => { if (!connected) ctx.skip("BLOCKED: Drive is not connected yet (connect in Admin -> Settings, or set GOOGLE_DRIVE_REFRESH_TOKEN)."); };

beforeAll(async () => {
  const oauth = await import("@/lib/google/driveOAuth");
  expect(oauth.oauthConfigProblem(), "OAuth client variables").toBeNull();
  connected = !!(await oauth.loadRefreshToken());
  if (!connected) return;
  drive = await oauth.getDriveApi(true);
  if (process.env.GOOGLE_DRIVE_TEST_FOLDER_ID) {
    testFolderId = process.env.GOOGLE_DRIVE_TEST_FOLDER_ID.trim();
  } else {
    const r = await drive.files.create({ requestBody: { name: `Daarayn OAuth test ${RUN} (safe to delete)`, mimeType: "application/vnd.google-apps.folder" }, fields: "id" });
    testFolderId = r.data.id;
    createdFolder = true;
  }
  if (testFolderId === PRODUCTION_FOLDER) throw new Error("Refusing to run: the test folder must differ from the production evidence folder.");
});

afterAll(async () => {
  if (!connected || !drive) return;
  if (uploadedId) await drive.files.delete({ fileId: uploadedId, supportsAllDrives: true }).catch(() => undefined);
  if (createdFolder && testFolderId) await drive.files.delete({ fileId: testFolderId, supportsAllDrives: true }).catch(() => undefined);
});

describe("LIVE: Google Drive via OAuth", () => {
  it("the connected account is identified and the token works (no token value is read out)", async (ctx) => {
    need(ctx);
    const { driveConnectionStatus } = await import("@/lib/google/driveOAuth");
    const s = await driveConnectionStatus();
    expect(s).toMatchObject({ configured: true, connected: true });
    expect(s.account).toContain("@");
    console.log(`Connected Drive account: ${s.account}`);
  });

  it("the production evidence folder is visible to the connected account (read-only metadata)", async (ctx) => {
    need(ctx);
    const r = await drive.files.get({ fileId: PRODUCTION_FOLDER, fields: "name,capabilities(canAddChildren)", supportsAllDrives: true });
    expect(r.data.name).toBe("DAARAYN SECURE STORAGE");
    expect(r.data.capabilities.canAddChildren).toBe(true);
  });

  it("uploads a temporary file into the isolated test folder through DriveService (real Drive id, no local fallback)", async (ctx) => {
    need(ctx);
    const { DriveService } = await import("@/lib/google/drive");
    const svc = new DriveService(testFolderId);
    const meta = await svc.uploadFile(Buffer.from(`oauth live test ${RUN}`), `oauth-${RUN}.txt`, "text/plain", "Payment Proofs", `T-${RUN}`, "live-test");
    uploadedId = meta.drive_file_id;
    expect(meta.storage_backend).toBe("google_drive");
    expect(meta.drive_file_id.startsWith("local_")).toBe(false);
    const parents = await drive.files.get({ fileId: uploadedId, fields: "parents", supportsAllDrives: true });
    expect(parents.data.parents).toHaveLength(1);
  });

  it("retrieves it through the authorized media route; unauthorized callers are refused", async (ctx) => {
    need(ctx);
    const { GET } = await import("@/app/api/media/[fileId]/route");
    const call = () => GET(new NextRequest("http://t/m"), { params: Promise.resolve({ fileId: uploadedId }) });
    auth.role = "none";
    expect((await call()).status).toBe(401);
    auth.role = "admin";
    const ok = await call();
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe(`oauth live test ${RUN}`);
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
  });

  it("the file is private: no 'anyone' or domain-wide permission", async (ctx) => {
    need(ctx);
    const perms = await drive.permissions.list({ fileId: uploadedId, fields: "permissions(type,role)", supportsAllDrives: true });
    expect((perms.data.permissions || []).some((p: any) => p.type === "anyone" || p.type === "domain")).toBe(false);
  });

  it("a missing file is reported as 404 (not a placeholder image) and a failed upload never falls back to local storage", async (ctx) => {
    need(ctx);
    const { GET } = await import("@/app/api/media/[fileId]/route");
    auth.role = "admin";
    const res = await GET(new NextRequest("http://t/m"), { params: Promise.resolve({ fileId: "1" + "Z".repeat(32) }) });
    expect(res.status).toBe(404);
    // upload into a folder id that does not exist: must throw, and must not create local files
    const { DriveService } = await import("@/lib/google/drive");
    const fs = await import("fs");
    const before = fs.existsSync("data/secure_storage") ? fs.readdirSync("data/secure_storage").length : 0;
    await expect(new DriveService("1" + "Q".repeat(32)).uploadFile(Buffer.from("x"), "x.txt", "text/plain", "Payment Proofs")).rejects.toThrow(/could not be stored in Google Drive/i);
    const after = fs.existsSync("data/secure_storage") ? fs.readdirSync("data/secure_storage").length : 0;
    expect(after).toBe(before);
  });

  it("an invalid or revoked token is reported clearly, not as an empty result", async (ctx) => {
    need(ctx);
    const { createOAuthClient } = await import("@/lib/google/driveOAuth");
    const bad = createOAuthClient();
    bad.setCredentials({ refresh_token: "1//invalid-token" });
    await expect(google.drive({ version: "v3", auth: bad }).about.get({ fields: "user" })).rejects.toThrow(/invalid_grant|invalid_request|unauthorized/i);
  });
});
