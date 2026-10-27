import { NextRequest, NextResponse } from "next/server";
import { driveService } from "@/lib/google/drive";
import { checkRateLimit } from "@/lib/security/rate-limiter";
import { readShareToken } from "@/lib/communications/attachments";

export const dynamic = "force-dynamic";

const gone = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

/**
 * Personal download link for a file that was too large to attach. The Drive file stays private (no Drive sharing is
 * created); this route checks the signed, expiring token and that the file is still exactly the one that was approved.
 * A replaced, modified or trashed file is refused instead of serving different content under an old approval.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = checkRateLimit(request, { limit: 60, windowMs: 60 * 1000 });
  if (!limited.allowed && limited.response) return limited.response;

  const { token } = await params;
  const read = readShareToken(token);
  if (!read.ok) {
    return read.reason === "expired"
      ? gone("This link has expired. Please ask Daarayn Foundation to send the document again.", 410)
      : gone("This link is not valid.", 404);
  }
  const { f: fileId, p: fingerprint } = read.claims;

  try {
    const info = await driveService.getFileInfo(fileId);
    if (info.trashed || info.fingerprint !== fingerprint) {
      return gone("This document was replaced or withdrawn after the message was sent. Please ask Daarayn Foundation for the current version.", 410);
    }
    const { stream, mimeType, filename, size } = await driveService.getFileStream(fileId);
    const web = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
    });
    return new NextResponse(web, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
        "Cache-Control": "private, no-store",
        ...(size ? { "Content-Length": String(size) } : {}),
      },
    });
  } catch (err: any) {
    const message = String(err?.message || "");
    if (/not found|404|File with id/i.test(message)) return gone("This document is no longer available.", 410);
    console.error(`[API/FileShare] ${fileId}: ${message}`);
    return gone("The document could not be retrieved right now. Please try again later.", 502);
  }
}
