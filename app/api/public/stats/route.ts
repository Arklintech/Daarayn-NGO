import { NextResponse } from "next/server";
import { getPublicStats } from "@/lib/catalog/stats";

export const dynamic = "force-dynamic";

/** Public aggregate counts for the homepage. Counts only: no ids, titles, donors, amounts or evidence. 503 when the source cannot be read (never zeros). */
export async function GET() {
  try {
    const { casesCompleted, masjidProjects, studentsSponsored, generatedAt } = await getPublicStats();
    return NextResponse.json({ casesCompleted, masjidProjects, studentsSponsored, generatedAt }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
  } catch (err: any) {
    console.error("[API/PublicStats]", String(err?.message || err).slice(0, 160));
    return NextResponse.json({ error: "The statistics are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
