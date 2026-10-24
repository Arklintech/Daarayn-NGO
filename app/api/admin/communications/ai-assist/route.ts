import { NextResponse } from "next/server";

/**
 * The AI writing assistant (KHIZR) was removed by architecture decision: Daarayn
 * uses no AI chat or inference provider. This route is kept only so old clients
 * get a clear answer instead of a 404.
 */
export async function POST() {
  return NextResponse.json({ success: false, error: "The AI writing assistant has been removed." }, { status: 410 });
}

export const dynamic = "force-dynamic";
