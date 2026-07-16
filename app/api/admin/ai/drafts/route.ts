/**
 * app/api/admin/ai/drafts/route.ts
 *
 * API endpoint to retrieve all AI communication drafts from Firestore.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

export async function GET(request: Request) {
  try {
    const snap = await getDocs(collection(db, "ai_drafts"));
    const list: any[] = [];
    snap.forEach((doc) => {
      list.push(doc.data());
    });

    // Sort by createdAt descending
    list.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    return NextResponse.json({ success: true, drafts: list });
  } catch (error) {
    console.error("[DraftsGETAPI] Error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
