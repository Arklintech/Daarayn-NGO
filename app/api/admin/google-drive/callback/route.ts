import { NextRequest, NextResponse } from "next/server";
import { createOAuthClient, oauthConfigProblem, saveRefreshToken, verifyStateCookie, STATE_COOKIE, DRIVE_OAUTH_SCOPES } from "@/lib/google/driveOAuth";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

function back(request: NextRequest, result: string) {
  const res = NextResponse.redirect(new URL(`/admin/settings?drive=${encodeURIComponent(result)}`, request.url));
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/admin/google-drive" });
  return res;
}

/**
 * Google redirects here. Identity comes from the signed state cookie issued by /connect to an admin (the
 * Strict auth cookie is not sent on a cross-site redirect). The code is exchanged server-side; the refresh
 * token is stored server-side and never leaves the server.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back(request, "denied");

  const check = verifyStateCookie(request.cookies.get(STATE_COOKIE)?.value, params.get("state"));
  if (!check.ok) {
    console.warn(`[DriveOAuth] Callback rejected: ${check.reason}`);
    return back(request, "invalid_state");
  }
  const code = params.get("code");
  if (!code || oauthConfigProblem()) return back(request, "not_configured");

  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) return back(request, "no_refresh_token");
    const granted = (tokens.scope || "").split(" ");
    if (!DRIVE_OAUTH_SCOPES.every((s) => granted.includes(s))) return back(request, "missing_scope");

    // Confirm the token works and record which account was connected (logged without the token).
    client.setCredentials(tokens);
    const about = await google.drive({ version: "v3", auth: client }).about.get({ fields: "user(emailAddress)" });
    const where = await saveRefreshToken(tokens.refresh_token, check.email);
    console.log(`[DriveOAuth] Drive connected as ${about.data.user?.emailAddress} by ${check.email} (token stored: ${where}).`);
    return back(request, "connected");
  } catch (err: any) {
    console.error("[DriveOAuth] Token exchange failed:", err?.message);
    return back(request, "exchange_failed");
  }
}
