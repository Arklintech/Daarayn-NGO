import { NextRequest, NextResponse } from "next/server";
import { driveService } from "@/lib/google/drive";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    if (!fileId) {
      return NextResponse.json({ error: "Missing fileId parameter" }, { status: 400 });
    }

    const { stream, mimeType, filename, size } = await driveService.getFileStream(fileId);

    // Convert node Readable to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
    });

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
        ...(size ? { "Content-Length": String(size) } : {}),
      },
    });
  } catch (error: any) {
    console.error("[MediaAPI] Failed to stream file from Google Drive:", error);
    return NextResponse.json(
      { error: "File not found or access denied" },
      { status: 404 }
    );
  }
}
