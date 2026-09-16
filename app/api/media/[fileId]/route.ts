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

    if (fileId.startsWith("local_") || fileId.includes("placeholder")) {
      const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" fill="none"><rect width="200" height="200" fill="#1e293b"/><path d="M70 110L90 90L130 130M120 100L135 85L150 100" stroke="#64748b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="85" cy="75" r="10" fill="#64748b"/></svg>`;
      return new NextResponse(placeholderSvg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
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
          "Cache-Control": "public, max-age=31536000, immutable",
          ...(size ? { "Content-Length": String(size) } : {}),
        },
      });
    } catch (err) {
      const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" fill="none"><rect width="200" height="200" fill="#1e293b"/><path d="M70 110L90 90L130 130M120 100L135 85L150 100" stroke="#64748b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="85" cy="75" r="10" fill="#64748b"/></svg>`;
      return new NextResponse(placeholderSvg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  } catch (outerErr) {
    const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" fill="none"><rect width="200" height="200" fill="#1e293b"/><path d="M70 110L90 90L130 130M120 100L135 85L150 100" stroke="#64748b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="85" cy="75" r="10" fill="#64748b"/></svg>`;
    return new NextResponse(placeholderSvg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
}
