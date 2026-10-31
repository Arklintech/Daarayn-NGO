import { NextResponse } from "next/server";
import { getPublicStats } from "@/lib/catalog/stats";
import { runWithPriority } from "@/lib/google/requestControl";

export const dynamic = "force-dynamic";

/** Public aggregate counts for the homepage. Counts only: no ids, titles, donors, amounts or evidence. 503 when the source cannot be read (never zeros). */
async function GET_handler() {
  try {
    const { casesCompleted, masjidProjects, studentsSponsored, generatedAt } = await getPublicStats();
    return NextResponse.json({ casesCompleted, masjidProjects, studentsSponsored, generatedAt }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
  } catch (err: any) {
    console.error("[API/PublicStats]", String(err?.message || err).slice(0, 160));
    return NextResponse.json({ error: "The statistics are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

/* D29: request priority for the shared Google budget (P0/P1 financial, P3 public catalogue). */
export const GET = (...args: Parameters<typeof GET_handler>) => runWithPriority("P3", () => GET_handler(...args));
