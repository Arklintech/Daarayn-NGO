import { NextRequest, NextResponse } from "next/server";
import { driveService } from "@/lib/google/drive";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string) || "General Media";
    const entityId = (formData.get("entityId") as string) || undefined;
    const uploadedBy = (formData.get("uploadedBy") as string) || "Admin";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const metadata = await driveService.uploadFile(
      buffer,
      file.name,
      file.type || "application/octet-stream",
      category,
      entityId,
      uploadedBy
    );

    const fileUrl = `/api/media/${metadata.drive_file_id}`;

    return NextResponse.json({
      success: true,
      fileId: metadata.drive_file_id,
      url: fileUrl,
      metadata,
    });
  } catch (error: any) {
    console.error("[API/Media] Upload failed:", error);
    return NextResponse.json(
      { error: "Failed to upload file to Google Drive storage." },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
