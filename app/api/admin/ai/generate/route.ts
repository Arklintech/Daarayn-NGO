/**
 * app/api/admin/ai/generate/route.ts
 *
 * API endpoint to trigger AI draft generation.
 * Safe collects data, calls context builder, Grok API, performs audits, and saves to drafts log.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { draftCommunication } from "@/lib/ai/services/communication";

export async function POST(request: Request) {
  try {
    const {
      category,
      donorId,
      donationId,
      allocationId,
      programId,
      updateId,
      customNotes,
      language,
    } = await request.json();

    if (!category) {
      return NextResponse.json({ success: false, error: "category is required." }, { status: 400 });
    }

    // Retrieve database records safely
    let rawDonor: any = null;
    let rawDonation: any = null;
    let rawAllocation: any = null;
    let rawProgram: any = null;
    let rawUpdate: any = null;

    if (donorId) {
      const snap = await getDoc(doc(db, "donors", donorId));
      if (snap.exists()) rawDonor = snap.data();
    }
    if (donationId) {
      const snap = await getDoc(doc(db, "donations", donationId));
      if (snap.exists()) rawDonation = snap.data();
    }
    if (allocationId) {
      const snap = await getDoc(doc(db, "allocations", allocationId));
      if (snap.exists()) rawAllocation = snap.data();
    }
    if (programId) {
      const snap = await getDoc(doc(db, "programs", programId));
      if (snap.exists()) {
        rawProgram = snap.data();
        // If updateId is specified, find it in the program's updates list
        if (updateId && Array.isArray(rawProgram.updates)) {
          rawUpdate = rawProgram.updates.find((u: any) => u.id === updateId);
        }
      }
    }

    // Orchestrate generation and audit flows
    const draftResult = await draftCommunication({
      category,
      rawDonor,
      rawDonation,
      rawAllocation,
      rawProgram,
      rawUpdate,
      customNotes,
      language,
    });

    // Generate unique draft record key
    const draftId = `AIDRAFT-${Date.now()}`;
    const draftRecord = {
      id: draftId,
      category,
      donorId: donorId || "",
      donorName: rawDonor?.name || "Anonymous",
      donationId: donationId || "",
      allocationId: allocationId || "",
      programId: programId || "",
      updateId: updateId || "",
      customNotes: customNotes || "",
      language: language || "English",
      status: "pending", // pending, approved, rejected, cancelled
      version: 1,
      payload: draftResult.payload,
      validation: draftResult.validation,
      compliance: draftResult.compliance,
      contextLogs: draftResult.contextLogs,
      createdAt: new Date().toISOString(),
      history: [
        {
          version: 1,
          payload: draftResult.payload,
          validation: draftResult.validation,
          compliance: draftResult.compliance,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    // Save to Firestore
    await setDoc(doc(db, "ai_drafts", draftId), draftRecord);

    return NextResponse.json({
      success: true,
      draftId,
      draft: draftRecord,
    });
  } catch (error) {
    console.error("[GenerateAPI] Exception:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
