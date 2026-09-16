import { NextRequest, NextResponse } from "next/server";
import { driveService } from "@/lib/google/drive";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ success: false, error: "No files uploaded" }, { status: 400 });
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
