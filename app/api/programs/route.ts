import { NextRequest, NextResponse } from "next/server";
import { getPublicPrograms } from "@/lib/catalog/programs";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // Sheets reads can outlast the platform default

/**
 * Public programs, campaigns and causes (filter with ?kind=): only OPEN entries (Active or Urgent), with their page content, in the administrator's order.
 * Funding progress counts verified donations explicitly designated to the program's cause. No fallback content: when the
 * catalog cannot be read this answers 503.
 */
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    const kind = params.get("kind");
    const category = params.get("category");
    let body = await getPublicPrograms();
    if (id) body = body.filter((p) => p.id === id);
    if (kind) body = body.filter((p) => p.kind === kind);
    if (category) body = body.filter((p) => p.content.programCategory === category);
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60", "X-Generated-At": new Date().toISOString() } });
  } catch (error: any) {
    console.error("[API/Programs] Error retrieving programs:", error?.message);
    return NextResponse.json({ error: "The programs could not be read from Google Sheets." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
