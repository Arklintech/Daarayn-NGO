import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { driveService } from "@/lib/google/drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Drive uploads can outlast the platform default

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

/** Cover image for a cause, program or campaign. Stored in Google Drive; it is served publicly only once an entry references it. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: "No image was uploaded." }, { status: 400 });
    if (!IMAGE_TYPES.has(file.type)) return NextResponse.json({ success: false, error: "Use a PNG, JPEG or WebP image." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ success: false, error: `The image is larger than ${MAX_BYTES / 1048576} MB.` }, { status: 400 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const meta = await driveService.uploadFile(Buffer.from(await file.arrayBuffer()), safeName, file.type, "Catalog Images", undefined, "Admin");
    return NextResponse.json({ success: true, driveFileId: meta.drive_file_id, url: `/api/media/${meta.drive_file_id}` });
  } catch (error: any) {
    console.error("[CatalogUpload] failed:", error?.message);
    return NextResponse.json({ success: false, error: "The image could not be stored in Google Drive. Nothing was saved." }, { status: 502 });
  }
}
