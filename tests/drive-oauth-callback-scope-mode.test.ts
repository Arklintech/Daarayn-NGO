import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import os from "os";
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { resetWorld } from "./helpers/mocks";
import * as oauth from "@/lib/google/driveOAuth";

/**
 * D40.2 regression. In GOOGLE_DRIVE_SCOPE_MODE=file the app asks Google for ONLY the non-sensitive drive.file scope, and Google grants exactly that. The callback
 * used to verify the granted scopes against the FULL `drive` scope regardless of the mode, so every connection in file mode ended in `missing_scope` and the
 * least-privilege configuration could never connect. The callback must validate against the scopes of the active mode.
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "daarayn-oauth-scope-"));
const DRIVE = "https://www.googleapis.com/auth/drive";
const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";

beforeEach(async () => {
  await resetWorld();
  vi.spyOn(process, "cwd").mockReturnValue(tmp);
  fs.rmSync(path.join(tmp, ".secrets"), { recursive: true, force: true });
  Object.assign(process.env, { GOOGLE_OAUTH_CLIENT_ID: "test-client.apps.googleusercontent.com", GOOGLE_OAUTH_CLIENT_SECRET: "test-secret", GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/admin/google-drive/callback" });
  delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  delete process.env.DRIVE_TOKEN_ENCRYPTION_KEY;
  delete process.env.GOOGLE_DRIVE_SCOPE_MODE;
  oauth.resetTokenCache();
});

async function callbackWithGrant(granted: string, mode?: "file") {
  if (mode) process.env.GOOGLE_DRIVE_SCOPE_MODE = mode;
  vi.spyOn(google.auth.OAuth2.prototype, "getToken").mockImplementation((async () => ({ tokens: { refresh_token: "1//test-refresh-token", scope: granted } })) as any);
  vi.spyOn(google, "drive").mockReturnValue({ about: { get: async () => ({ data: { user: { emailAddress: "test-account@example.invalid" } } }) } } as any);
  const { createStateCookie } = oauth;
  const { state, cookie } = createStateCookie("admin@example.invalid");
  const { GET } = await import("@/app/api/admin/google-drive/callback/route");
  const res = await GET(new NextRequest(`http://localhost:3000/api/admin/google-drive/callback?code=abc&state=${state}`, { headers: { cookie: `${oauth.STATE_COOKIE}=${cookie}` } }));
  return new URL(res.headers.get("location")!).searchParams.get("drive");
}

describe("D40.2: the OAuth callback checks the scopes of the ACTIVE mode", () => {
  it("file mode: Google grants exactly drive.file -> connected (it used to end in missing_scope)", async () => {
    expect(await callbackWithGrant(DRIVE_FILE, "file")).toBe("connected");
  });

  it("full mode (default): the full drive scope -> connected, unchanged", async () => {
    expect(await callbackWithGrant(DRIVE)).toBe("connected");
  });

  it("full mode: a drive.file-only grant is still refused (a narrower grant never satisfies the full mode)", async () => {
    expect(await callbackWithGrant(DRIVE_FILE)).toBe("missing_scope");
  });

  it("file mode: a grant without drive.file is refused", async () => {
    expect(await callbackWithGrant("openid email", "file")).toBe("missing_scope");
  });
});
