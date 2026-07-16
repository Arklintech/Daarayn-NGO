import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { 
  collection, doc, getDoc, getDocs, query, where, 
  updateDoc, setDoc, arrayUnion 
} from "firebase/firestore";
import { sendProjectUpdateEmail } from "@/lib/email/resend";

// Interfaces copied for type safety
interface Allocation {
  id: string;
  donationId: string;
  donorId: string;
  donorName: string;
  projectId?: string;
  caseId?: string;
  targetTitle: string;
  allocatedAmount: number;
  allocationDate: string;
  adminEmail: string;
  status: "active" | "reversed";
}

interface ProjectUpdate {
  id: string;
  title: string;
  content: string;
  date: string;
  progress: number;
  media: string[];
  receipts: { title: string; value: number }[];
  beneficiaryConfirmation: string;
  published: boolean;
}

export async function POST(request: Request) {
  try {
    console.log("[1] API called for dispatch-updates");
    const { programId, updateState, approvedMessageTemplate } = await request.json();
    console.log("    Program ID:", programId);

    if (!programId || !updateState || !approvedMessageTemplate) {
      return NextResponse.json({ success: false, error: "Missing required fields." }, { status: 400 });
    }

    const programRef = doc(db, "programs", programId);
    const progSnap = await getDoc(programRef);
    if (!progSnap.exists()) {
      return NextResponse.json({ success: false, error: "Program not found." }, { status: 404 });
    }
    const program = progSnap.data();

    // 1. Generate unique update record
    const updateId = `UPD-${Date.now()}`;
    const newUpdate: ProjectUpdate = {
      id: updateId,
      title: updateState.title,
      content: updateState.content,
      date: new Date().toISOString().split("T")[0],
      progress: updateState.progress,
      media: updateState.media || [],
      receipts: updateState.receipts || [],
      beneficiaryConfirmation: updateState.beneficiaryConfirmation || "",
      published: true
    };

    // Append update to project's updates list
    await updateDoc(programRef, {
      progress: updateState.progress,
      updates: arrayUnion(newUpdate)
    });

    // 2. Query all allocations connected to this project
    const allocationsRef = collection(db, "allocations");
    const qProject = query(allocationsRef, where("projectId", "==", programId));
    const qCase = query(allocationsRef, where("caseId", "==", programId));
    
    const allocsSnapProject = await getDocs(qProject);
    const allocsSnapCase = await getDocs(qCase);

    const matchedAllocations: Allocation[] = [];
    allocsSnapProject.forEach(d => matchedAllocations.push(d.data() as Allocation));
    allocsSnapCase.forEach(d => matchedAllocations.push(d.data() as Allocation));

    // Remove duplicate donor notifications
    const donorMap = new Map<string, { totalAllocated: number; donorName: string }>();
    matchedAllocations.forEach(a => {
      if (a.status === "active") {
        const prev = donorMap.get(a.donorId) || { totalAllocated: 0, donorName: a.donorName };
        donorMap.set(a.donorId, {
          totalAllocated: prev.totalAllocated + a.allocatedAmount,
          donorName: a.donorName
        });
      }
    });

    console.log(`[2] Donors found: ${donorMap.size}`);

    let emailsSent = 0;
    let emailsFailed = 0;
    let recipientsFound = donorMap.size;
    const communicationIds: string[] = [];
    const errorDetails: string[] = [];

    // 3. For each connected donor, send email and create log
    for (const [donorId, stats] of Array.from(donorMap.entries())) {
      try {
        const donorDoc = await getDoc(doc(db, "donors", donorId));
        if (!donorDoc.exists()) continue;
        const donor = donorDoc.data();

        // Personalize template with specific amounts
        const personalizedMessage = approvedMessageTemplate
          .replace(/₹[\d,]+/g, `₹${stats.totalAllocated.toLocaleString()}`)
          .replace(/Dear Supporter/g, `Dear ${stats.donorName}`);

        const subject = `Verified Project Update: ${program?.title || 'Daarayn'}`;
        
        // Use Resend service
        const emailResult = await sendProjectUpdateEmail(donor.email, subject, personalizedMessage);
        
        let deliveryStatus = "sent";
        let providerMessageId = "";
        let failureReason = "";

        if (emailResult.success) {
          emailsSent++;
          providerMessageId = emailResult.providerMessageId || "unknown";
        } else {
          emailsFailed++;
          deliveryStatus = "failed";
          failureReason = typeof emailResult.error === 'string' ? emailResult.error : JSON.stringify(emailResult.error);
          errorDetails.push(`Failed for ${donor.email}: ${failureReason}`);
        }

        const commId = `COMM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
        communicationIds.push(commId);
        
        const newLog = {
          id: commId,
          donorId,
          donorEmail: donor.email,
          subject,
          message: personalizedMessage,
          generatedByAI: true,
          approvedByAdmin: true,
          sentDate: new Date().toISOString(),
          deliveryStatus,
          openStatus: "unread",
          clickStatus: "none",
          provider: "Resend",
          providerMessageId,
          failureReason
        };

        // Save to communications collection
        await setDoc(doc(db, "communications", commId), newLog);

        // Save to donor profile list
        await updateDoc(doc(db, "donors", donorId), {
          communicationHistory: arrayUnion(newLog)
        });
        
        console.log(`[6] Firestore updated for donor ${donorId} | Status: ${deliveryStatus}`);

      } catch (err) {
        console.error(`Error processing donor ${donorId}:`, err);
        emailsFailed++;
        errorDetails.push(`Exception for donor ${donorId}: ${(err as Error).message}`);
      }
    }

    // 4. Update the Public Ledger with audit logs
    const ledgerId = `LEDGER-${Date.now()}`;
    const auditStatement = `📢 Case Progress Update Published: ${program.title} | Status at ${updateState.progress}%`;
    await setDoc(doc(db, "publicLedger", ledgerId), {
      id: ledgerId,
      donor: "Audit update",
      cause: program.title,
      amount: 0,
      status: "completed",
      date: new Date().toLocaleDateString("en-IN"),
      refCode: `UPDATE-${programId}`,
      proof: auditStatement
    });

    const summaryPayload = {
      success: true,
      summary: {
        recipientsFound,
        emailsSent,
        emailsFailed,
        communicationIds,
        errorDetails
      }
    };
    
    console.log("[7] Returning response summary:", JSON.stringify(summaryPayload, null, 2));

    return NextResponse.json(summaryPayload);

  } catch (error) {
    console.error("Dispatch API Error:", error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}
