/**
 * app/api/admin/ai/drafts/route.ts
 *
 * Returns AI communication drafts. The drafts collection has been migrated
 * away from Firestore; we now return an empty list so callers degrade gracefully.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Drafts previously lived in Firestore `ai_drafts` collection.
  // That collection is no longer accessible from server routes because
  // Firestore security rules require client auth context.
  // Return an empty array so the KHIZR AI page loads without a 500 error.
  return NextResponse.json({ success: true, drafts: [] });
}
