import { requireAdmin } from "@/lib/server/auth";
import { NextRequest, NextResponse } from "next/server";
import { driveService } from "@/lib/google/drive";

/** Documents and images only. No executables, scripts, HTML or SVG (which can carry script) go into donor emails. */
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const adminAuth = await requireAdmin(req);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ success: false, error: "No files uploaded" }, { status: 400 });
    }

    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ success: false, error: `"${file.name}" is not an allowed file type. Use a PDF, image (PNG, JPEG, WebP), text, CSV, Word or Excel file.` }, { status: 400 });
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ success: false, error: `"${file.name}" is larger than ${MAX_FILE_BYTES / 1048576} MB.` }, { status: 400 });
      }
    }

    const uploadedResults: { name: string; driveFileId: string; url: string }[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

      const metadata = await driveService.uploadFile(
        buffer,
        safeName,
        file.type || "application/octet-stream",
        "Communications",
        undefined,
        "Admin"
      );

      uploadedResults.push({
        name: file.name,
        driveFileId: metadata.drive_file_id,
        url: `/api/media/${metadata.drive_file_id}`
      });
    }

    return NextResponse.json({
      success: true,
      files: uploadedResults
    });
  } catch (error: any) {
    console.error("[CommunicationsUpload] Failed to upload to Google Drive:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
