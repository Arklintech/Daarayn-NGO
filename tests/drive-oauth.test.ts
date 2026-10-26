import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import os from "os";
import fs from "fs";
import path from "path";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, authState } from "./helpers/mocks";
import * as oauth from "@/lib/google/driveOAuth";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "daarayn-oauth-"));

beforeEach(async () => {
  await resetWorld();
  vi.spyOn(process, "cwd").mockReturnValue(tmp); // never touch a real .secrets folder
  fs.rmSync(path.join(tmp, ".secrets"), { recursive: true, force: true });
  process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client.apps.googleusercontent.com";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_OAUTH_REDIRECT_URI = "http://localhost:3000/api/admin/google-drive/callback";
  delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  delete process.env.DRIVE_TOKEN_ENCRYPTION_KEY;
  oauth.resetTokenCache();
});

describe("OAuth state (CSRF protection)", () => {
  it("accepts the matching signed state and returns the admin who started the flow", () => {
    const { state, cookie } = oauth.createStateCookie("admin@test.local");
    expect(oauth.verifyStateCookie(cookie, state)).toEqual({ ok: true, email: "admin@test.local" });
  });
  it("rejects a different state, a forged cookie, a missing cookie and an expired state", () => {
    const { state, cookie } = oauth.createStateCookie("admin@test.local");
    expect(oauth.verifyStateCookie(cookie, "other").ok).toBe(false);
    const [payload] = cookie.split(".");
    expect(oauth.verifyStateCookie(`${payload}.forged`, state).ok).toBe(false);
    const forged = Buffer.from(JSON.stringify({ n: state, e: "attacker@x.com", x: Date.now() + 1e6 })).toString("base64url");
    expect(oauth.verifyStateCookie(`${forged}.${cookie.split(".")[1]}`, state).ok).toBe(false);
    expect(oauth.verifyStateCookie(undefined, state).ok).toBe(false);
    expect(oauth.verifyStateCookie(cookie, state, Date.now() + 11 * 60 * 1000)).toMatchObject({ ok: false });
  });
});

describe("refresh-token storage", () => {
  const key = Buffer.alloc(32, 7);
  it("AES-256-GCM round-trips and detects tampering", () => {
    const blob = oauth.encryptSecret("1//refresh-token", key);
    expect(blob).not.toContain("refresh-token");
    expect(oauth.decryptSecret(blob, key)).toBe("1//refresh-token");
    const parts = blob.split(".");
    parts[1] = (parts[1][0] === "A" ? "B" : "A") + parts[1].slice(1); // flip ciphertext bytes
    const bad = parts.join(".");
    expect(() => oauth.decryptSecret(bad, key)).toThrow();
  });
  it("stores the token encrypted in the _Secrets sheet tab when a key is set, never in plaintext", async () => {
    process.env.DRIVE_TOKEN_ENCRYPTION_KEY = key.toString("base64");
    expect(await oauth.saveRefreshToken("1//secret-token", "admin@test.local")).toBe("sheet");
    const rows = fakeSheets.records("_Secrets");
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("secret-token");
    oauth.resetTokenCache();
    expect(await oauth.loadRefreshToken()).toBe("1//secret-token");
    await oauth.saveRefreshToken("1//rotated", "admin@test.local"); // update, not duplicate
    expect(fakeSheets.records("_Secrets")).toHaveLength(1);
  });
  it("falls back to a local git-ignored file in development and refuses to store plaintext in production", async () => {
    expect(await oauth.saveRefreshToken("1//local", "admin@test.local")).toBe("file");
    expect(fs.existsSync(path.join(tmp, ".secrets", "google-drive-oauth.json"))).toBe(true);
    oauth.resetTokenCache();
    expect(await oauth.loadRefreshToken()).toBe("1//local");
    vi.stubEnv("NODE_ENV", "production");
    await expect(oauth.saveRefreshToken("1//x", "a")).rejects.toThrow(/DRIVE_TOKEN_ENCRYPTION_KEY/);
    vi.unstubAllEnvs();
  });
});

describe("OAuth routes", () => {
  it("connect requires an administrator and then redirects to Google with offline access, drive scope, state and an httpOnly cookie", async () => {
    const { GET } = await import("@/app/api/admin/google-drive/connect/route");
    authState.role = "none";
    expect((await GET(new NextRequest("http://localhost:3000/api/admin/google-drive/connect"))).status).toBe(401);
    authState.role = "admin";
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/google-drive/connect"));
    expect(res.status).toBe(307);
    const url = new URL(res.headers.get("location")!);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive");
    expect(url.searchParams.get("redirect_uri")).toBe(process.env.GOOGLE_OAUTH_REDIRECT_URI);
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toContain(url.searchParams.get("state")!.slice(0, 8) === "" ? "x" : "daarayn_drive_oauth=");
  });

  it("connect reports missing configuration instead of redirecting", async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    const { GET } = await import("@/app/api/admin/google-drive/connect/route");
    authState.role = "admin";
    const res = await GET(new NextRequest("http://localhost:3000/api/admin/google-drive/connect"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("GOOGLE_OAUTH_CLIENT_ID");
  });

  it("callback rejects a missing, forged or mismatched state and stores nothing", async () => {
    const { GET } = await import("@/app/api/admin/google-drive/callback/route");
    const { cookie } = oauth.createStateCookie("admin@test.local");
    const cases = [
      new NextRequest("http://localhost:3000/api/admin/google-drive/callback?code=abc&state=nope"),
      new NextRequest("http://localhost:3000/api/admin/google-drive/callback?code=abc&state=nope", { headers: { cookie: `daarayn_drive_oauth=${cookie}` } }),
      new NextRequest("http://localhost:3000/api/admin/google-drive/callback?code=abc"),
    ];
    for (const req of cases) {
      const res = await GET(req);
      expect(res.headers.get("location")).toContain("drive=invalid_state");
    }
    expect(fs.existsSync(path.join(tmp, ".secrets"))).toBe(false);
    const denied = await GET(new NextRequest("http://localhost:3000/api/admin/google-drive/callback?error=access_denied"));
    expect(denied.headers.get("location")).toContain("drive=denied");
  });

  it("status requires an administrator and never contains token fields", async () => {
    await oauth.saveRefreshToken("1//super-secret", "admin@test.local");
    const { GET } = await import("@/app/api/admin/google-drive/status/route");
    authState.role = "none";
    expect((await GET(new NextRequest("http://t/s"))).status).toBe(401);
    authState.role = "admin";
    const text = await (await GET(new NextRequest("http://t/s"))).text();
    expect(text).not.toContain("super-secret");
    expect(text).not.toMatch(/refresh|access_token/i);
  });
});

describe("DriveService uses OAuth for writes and never falls back to local storage", () => {
  it("an upload while Drive is not connected fails with an explicit error and stores nothing locally", async () => {
    const { DriveService } = await vi.importActual<typeof import("@/lib/google/drive")>("@/lib/google/drive");
    const svc = new DriveService("ROOTFOLDER0001");
    await expect(svc.uploadFile(Buffer.from("x"), "p.png", "image/png", "Payment Proofs")).rejects.toThrow(/not connected/i);
    expect(fs.existsSync(path.join(tmp, "data"))).toBe(false);
  });
  it("with OAuth unconfigured, an upload is refused (service account has no quota) rather than attempted", async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const { DriveService } = await vi.importActual<typeof import("@/lib/google/drive")>("@/lib/google/drive");
    await expect(new DriveService("ROOTFOLDER0001").uploadFile(Buffer.from("x"), "p.png", "image/png", "X")).rejects.toThrow(/OAuth is not configured/i);
  });
});
