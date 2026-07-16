import { NextRequest, NextResponse } from "next/server";
import { db, storage } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getOrCreateDonor, createDonation } from "@/lib/db";
import { sendDonationEmail } from "@/lib/email";
import fs from "fs";
import path from "path";

import { VerifiedAnalyticsEngine } from "@/lib/ai/engines/VerifiedAnalyticsEngine";
import { notifyDonation, notifyDonor } from "@/lib/notifications";

let useLocalFallback = false;
const dbPath = path.join(process.cwd(), "data", "ledger.json");
const uploadsDir = path.join(process.cwd(), "public", "uploads");

function getLocalLedger() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify([], null, 2));
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const donorName = formData.get("donorName")?.toString() || "";
    const donorContact = formData.get("donorContact")?.toString() || "";
    const upiRef = formData.get("upiRef")?.toString() || "";
    const amount = formData.get("amount")?.toString() || "";
    const currency = formData.get("currency")?.toString() || "INR";
    const cause = formData.get("cause")?.toString() || "General Support";
    
    let selectedCauses = [];
    try {
      const selectedCausesStr = formData.get("selectedCauses")?.toString();
      if (selectedCausesStr) {
        selectedCauses = JSON.parse(selectedCausesStr);
      }
    } catch(e) {
      console.warn("Failed to parse selectedCauses", e);
    }

    const screenshot = formData.get("screenshot") as File | null;

    if (!upiRef || !amount || !screenshot || screenshot.size === 0) {
      return NextResponse.json({ error: "Required fields (Amount, UPI Ref Code, Payment Screenshot) are missing." }, { status: 400 });
    }

    let nextIdx = 1;
    if (!useLocalFallback) {
      try {
        const snapshot = await getDocs(collection(db, 'publicLedger'));
        nextIdx = snapshot.size + 1;
      } catch (err: any) {
        console.warn("Firestore size query failed, using local ledger count:", err.message);
        const local = getLocalLedger();
        nextIdx = local.length + 1;
      }
    } else {
      const local = getLocalLedger();
      nextIdx = local.length + 1;
    }
    const trackingId = 'DA' + String(nextIdx).padStart(3, '0');

    const numAmount = parseInt(amount, 10);
    const { directAid, opsCost } = VerifiedAnalyticsEngine.calculateAllocationSplits(numAmount);
    const finalDonor = donorName.trim() ? `${donorName.trim()} (UPI)` : "Anonymous (UPI)";

    let proofText = "⏳ Awaiting bank check";
    let proofUrl: string | null = null;

    if (screenshot && screenshot.size > 0) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const fileExt = path.extname(screenshot.name) || ".png";
      const filename = `proof-${uniqueSuffix}${fileExt}`;
      const fileBuffer = Buffer.from(await screenshot.arrayBuffer());

      if (!useLocalFallback) {
        try {
          const storageRef = ref(storage, 'proofs/' + filename);
          const uploadResult = await uploadBytes(storageRef, fileBuffer, {
            contentType: screenshot.type || "image/png"
          });
          proofUrl = await getDownloadURL(uploadResult.ref);
          proofText = "⏳ Proof Uploaded (Check)";
        } catch (uploadError: any) {
          console.warn("Firebase Storage upload failed, falling back to public/uploads folder:", uploadError.message);
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          fs.writeFileSync(path.join(uploadsDir, filename), fileBuffer);
          proofUrl = `/uploads/${filename}`;
          proofText = "⏳ Proof Uploaded (Local Fallback)";
        }
      } else {
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, filename), fileBuffer);
        proofUrl = `/uploads/${filename}`;
        proofText = "⏳ Proof Uploaded (Check)";
      }
    }

    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    const newRecord = {
      donor: finalDonor,
      cause: cause,
      selectedCauses: selectedCauses,
      amount: numAmount,
      directAid: directAid,
      status: "pending",
      date: formattedDate,
      refCode: upiRef,
      opsCost: opsCost,
      proof: proofText,
      proofUrl: proofUrl,
      createdAt: new Date().toISOString()
    };

    if (!useLocalFallback) {
      try {
        await setDoc(doc(db, 'publicLedger', trackingId), newRecord);
      } catch (firestoreErr: any) {
        console.warn("Firestore setDoc failed, saving locally:", firestoreErr.message);
        const local = getLocalLedger();
        local.unshift({ id: trackingId, ...newRecord });
        fs.writeFileSync(dbPath, JSON.stringify(local, null, 2));
      }
    } else {
      const local = getLocalLedger();
      local.unshift({ id: trackingId, ...newRecord });
      fs.writeFileSync(dbPath, JSON.stringify(local, null, 2));
    }

    // Integrate DIDMS
    try {
      const contact = donorContact.trim();
      const isEmail = contact.includes("@");
      const donor = await getOrCreateDonor({
        name: donorName,
        email: isEmail ? contact : "",
        phone: !isEmail ? contact : ""
      });

      await createDonation({
        donorId: donor.id,
        amount: numAmount,
        currency: currency,
        paymentMethod: "UPI",
        donationType: cause,
        selectedCauses: selectedCauses,
        transactionReference: upiRef,
        receiptUrl: proofUrl || undefined,
        status: "pending"
      });

      if (donorContact) {
        try {
          await sendDonationEmail({
            trackingId: trackingId,
            donorName: donorName || 'Generous Donor',
            donorEmail: donorContact,
            amount: numAmount,
            causes: selectedCauses,
            date: formattedDate
          });
        } catch (emailErr) {
          console.error("Failed to send email:", emailErr);
        }
      }
      // Publish notification for this donation
      const isDonorNew = donor.totalDonations <= 1;
      const isLarge = numAmount >= 50000;

      // Notify donation received
      if (isLarge) {
        await notifyDonation.largeDonation(trackingId, finalDonor, numAmount, currency);
      } else {
        await notifyDonation.received(trackingId, finalDonor, numAmount, currency);
      }

      // Notify donor status
      if (isDonorNew) {
        await notifyDonor.newRegistration(donor.id, finalDonor);
      } else if (isLarge) {
        await notifyDonor.majorDonor(donor.id, finalDonor, numAmount);
      } else {
        await notifyDonor.returningDonor(donor.id, finalDonor, donor.totalDonations);
      }

    } catch (didmsErr: any) {
      console.warn("DIDMS auto-sync skipped during payment session:", didmsErr.message);
    }

    return NextResponse.json({ success: true, trackingId: trackingId });
  } catch (error: any) {
    console.error("Donate submit error:", error);
    return NextResponse.json({ error: "Failed to process contribution." }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
