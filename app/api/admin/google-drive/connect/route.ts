import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { buildAuthUrl, createStateCookie, oauthConfigProblem, STATE_COOKIE } from "@/lib/google/driveOAuth";

export const dynamic = "force-dynamic";

/** Starts the Google Drive connection for the signed-in administrator. Redirects to Google's consent screen. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const problem = oauthConfigProblem();
  if (problem) return NextResponse.json({ success: false, error: problem }, { status: 503 });

  const { state, cookie } = createStateCookie(admin.email);
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set(STATE_COOKIE, cookie, {
    httpOnly: true,
    sameSite: "lax", // must accompany Google's redirect back to the callback
    secure: request.nextUrl.protocol === "https:",
    path: "/api/admin/google-drive",
    maxAge: 600,
  });
  return res;
}
