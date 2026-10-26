import { NextRequest, NextResponse } from "next/server";
import { driveService } from "@/lib/google/drive";
import { requireAdminOrAgent } from "@/lib/server/auth";
import { causeRepository } from "@/lib/repositories/causeRepository";

export const dynamic = "force-dynamic";

/**
 * Serves Drive files through the server. Payment proofs, field evidence and
 * communication attachments are private: they require a signed-in admin or
 * active field agent. Only images that are attached to a cause (shown on the
 * public site) are served without sign-in. Errors are reported honestly
 * (401/403/404/502), not hidden behind a placeholder image.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;
  if (!fileId || !/^[A-Za-z0-9_-]{6,200}$/.test(fileId)) {
    return NextResponse.json({ error: "Invalid file id." }, { status: 400 });
  }

  let isPublicCauseImage = false;
  try {
    // A file is a public cause image when a cause points at it, either by driveFileId or by an
    // imageUrl of the form /api/media/<id> (what the Programs/Campaigns upload stores).
    isPublicCauseImage = (await causeRepository.getAll()).some(
      (c) => c.driveFileId === fileId || (c.imageUrl || "").split("?")[0].endsWith(`/api/media/${fileId}`)
    );
  } catch {
    // If causes cannot be read, treat the file as private.
  }

  if (!isPublicCauseImage) {
    const principal = await requireAdminOrAgent(request);
    if (principal instanceof NextResponse) return principal;
  }

  try {
    const { stream, mimeType, filename, size } = await driveService.getFileStream(fileId);
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
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": isPublicCauseImage ? "public, max-age=3600" : "private, no-store",
        ...(size ? { "Content-Length": String(size) } : {}),
      },
    });
  } catch (err: any) {
    const message = String(err?.message || "");
    const missing = /not found|404|File with id/i.test(message);
    if (/invalid_grant/i.test(message)) {
      return NextResponse.json(
        { error: "Google Drive authorisation has expired or was revoked. An administrator must reconnect Google Drive in Admin → Settings.", code: "DRIVE_REAUTH_REQUIRED" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    console.error(`[API/Media] ${fileId}: ${message}`);
    return NextResponse.json(
      { error: missing ? "File not found." : "The file could not be read from storage." },
      { status: missing ? 404 : 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
