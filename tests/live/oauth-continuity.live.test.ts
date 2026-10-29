/**
 * LIVE read-only OAuth continuity diagnostics. Run: npx vitest run --config vitest.live.config.ts tests/live/oauth-continuity.live.test.ts
 * Refreshes an access token with the stored refresh token (no new consent, nothing revoked or rotated) and prints ONLY booleans,
 * scope names, lifetimes and project-number match. No token, client secret, client id, e-mail or file content is printed.
 */
import "./env";
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";

const APPROVED = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";

beforeAll(() => {
  // Same isolation as the other live tests: the token store lookup may touch the `_Secrets` tab, so only the approved test sheet is ever used.
  process.env.GOOGLE_SHEET_ID = APPROVED;
  process.env.GOOGLE_TARGET_ENV = "test";
  process.env.GOOGLE_TEST_SHEET_ID = APPROVED;
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = "";
});

describe("LIVE Drive OAuth continuity (read-only)", () => {
  it("reports configuration, granted scopes, token usability and expiry policy without printing secrets", async () => {
    const oauth = await import("@/lib/google/driveOAuth");
    const problem = oauth.oauthConfigProblem();
    const cfg = oauth.oauthConfig() as any;
    const clientId = String(cfg.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID || "");
    const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS!;
    const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));
    const clientProject = clientId.split("-")[0];
    const quotaProjectNumber = "269969400623"; // appears in Google's own quota errors for the service account's project
    const out: Record<string, unknown> = {
      configProblem: problem,
      requestedScopes: oauth.DRIVE_OAUTH_SCOPES,
      declaredPublishingStatus: oauth.oauthPublishingStatus(),
      oauthClientProjectMatchesServiceAccountProject: clientProject === quotaProjectNumber,
      serviceAccountProjectId: sa.project_id,
    };
    const token = await oauth.loadRefreshToken();
    out.refreshTokenStored = !!token;
    if (token) {
      const client = oauth.createOAuthClient();
      client.setCredentials({ refresh_token: token });
      try {
        const access = await client.getAccessToken();
        out.refreshTokenUsable = !!access.token;
        const info = await (await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(String(access.token))}`)).json();
        out.grantedScopes = String(info.scope || "").split(" ").filter(Boolean).map((s: string) => s.replace("https://www.googleapis.com/auth/", ""));
        out.accessTokenSecondsLeft = Number(info.expires_in) || null;
        out.connectedAtRecorded = !!(await oauth.tokenConnectedAt());
        const status = await oauth.driveConnectionStatus();
        out.statusReauthorizeBy = status.reauthorizeBy;
        out.statusProblem = status.problem || null;
      } catch (err: any) {
        out.refreshTokenUsable = false;
        out.refreshError = /invalid_grant/i.test(String(err?.message)) ? "invalid_grant (expired or revoked)" : "other error: " + String(err?.message).slice(0, 80).replace(/[A-Za-z0-9_-]{25,}/g, "[redacted]");
      }
    }
    console.log("OAUTH DIAGNOSTICS " + JSON.stringify(out));
    expect(JSON.stringify(out)).not.toMatch(/ya29\.|1\/\/|GOCSPX|BEGIN PRIVATE/);
    expect(out.requestedScopes).toEqual(["https://www.googleapis.com/auth/drive"]);
  }, 60_000);
});
