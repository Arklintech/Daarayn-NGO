import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    aiProvider: process.env.AI_PROVIDER,
    hasKey: !!process.env.GROK_API_KEY,
    keyPrefix: process.env.GROK_API_KEY ? process.env.GROK_API_KEY.substring(0, 4) : null
  });
}
