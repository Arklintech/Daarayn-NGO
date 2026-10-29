import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { getDriveApi, driveScopeMode } from "@/lib/google/driveOAuth";
import { GOOGLE_DRIVE_ROOT_FOLDER_ID } from "@/lib/google/client";

export const dynamic = "force-dynamic";

/**
 * Creates the Drive folder the platform stores its files in, owned by the connected Google account and created BY this app. Needed once when
 * GOOGLE_DRIVE_SCOPE_MODE=file (the non-sensitive `drive.file` scope can only reach files the app itself created). The returned folder id is not
 * secret; the administrator then sets it as GOOGLE_DRIVE_ROOT_FOLDER_ID. Refuses when a root folder is already configured unless force=true,
 * so an existing evidence folder is never silently replaced. Nothing else is changed.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine */
  }
  if (GOOGLE_DRIVE_ROOT_FOLDER_ID && body?.force !== true) {
    return NextResponse.json({ success: false, error: "A Drive root folder is already configured. Send force=true only if you really want a second one." }, { status: 409 });
  }
  const name = String(body?.name || "Daarayn Platform Files").replace(/[^\w .-]/g, "").trim().slice(0, 80) || "Daarayn Platform Files";
  try {
    const drive = await getDriveApi(true);
    const res = await drive.files.create({ requestBody: { name, mimeType: "application/vnd.google-apps.folder" }, fields: "id", supportsAllDrives: true });
    const folderId = res.data.id;
    if (!folderId) throw new Error("Google did not return a folder id.");
    return NextResponse.json({ success: true, folderId, scopeMode: driveScopeMode(), next: "Set GOOGLE_DRIVE_ROOT_FOLDER_ID to this id in the server environment, then restart." }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    console.error("[API/DriveCreateRoot]", String(err?.message || err).slice(0, 200));
    const reauth = /invalid_grant|not connected|not configured/i.test(String(err?.message));
    return NextResponse.json({ success: false, error: reauth ? "Google Drive is not connected. Connect it in Admin, Settings, Google Drive first." : "The folder could not be created." }, { status: reauth ? 503 : 502 });
  }
}
