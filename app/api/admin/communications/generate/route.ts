import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import { EnterpriseProviderManager } from "@/lib/ai/providers/EnterpriseProviderManager";

export async function POST(request: Request) {
  try {
    const { causeId, type, media, regenerateField, existingData } = await request.json();

    if (!causeId) {
      return NextResponse.json({ success: false, error: "causeId is required." }, { status: 400 });
    }
    if (!type) {
      return NextResponse.json({ success: false, error: "type is required." }, { status: 400 });
    }

    // 1. Fetch Cause Information
    let cause: any = null;
    const causeRef = doc(db, "causes", causeId);
    const causeSnap = await getDoc(causeRef);
    if (causeSnap.exists()) {
      cause = causeSnap.data();
    } else {
      // Fallback 1: Query by slug
      const q = query(collection(db, "causes"), where("slug", "==", causeId));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        cause = qSnap.docs[0].data();
      } else {
        // Fallback 2: Search all causes case-insensitively
        const allCausesSnap = await getDocs(collection(db, "causes"));
        allCausesSnap.forEach(d => {
          const data = d.data();
          if (
            d.id === causeId ||
            d.id.toLowerCase() === causeId.toLowerCase() ||
            (data.slug && data.slug.toLowerCase() === causeId.toLowerCase()) ||
            (data.name && data.name.toLowerCase() === causeId.toLowerCase()) ||
            (data.title && data.title.toLowerCase() === causeId.toLowerCase())
          ) {
            cause = data;
          }
        });
      }
    }

    if (!cause) {
      return NextResponse.json({
        success: false,
        error: `Khizr could not generate this communication because the selected Cause with ID "${causeId}" does not exist.`
      }, { status: 200 });
    }

    const causeName = cause.name || cause.title || causeId || "Selected Cause";
    const statusLower = (cause.status || "active").toString().trim().toLowerCase();
    const isActive = ["active", "urgent", "in progress", "open", "completed", "active causes"].includes(statusLower) || !cause.status;

    // Verify cause is active (unless it's a completion report)
    if (!isActive && type !== "completion_report") {
      return NextResponse.json({
        success: false,
        error: `Khizr could not generate this communication because the selected Cause "${causeName}" is currently inactive.`
      }, { status: 200 });
    }

    // 2. Fetch Approved/Converted Field Reports linked to this cause
    const reportsSnap = await getDocs(collection(db, "field_reports"));
    const approvedReports: any[] = [];
    reportsSnap.forEach(d => {
      const report = d.data();
      const isApprovedOrConverted = ["Approved", "Converted", "Converted to Cause"].includes(report.status);
      const isLinked = report.convertedCauseId === causeId || report.causeId === causeId;
      if (isApprovedOrConverted && isLinked) {
        approvedReports.push({ id: d.id, ...report });
      }
    });

    // Fallback search by category similarity if direct link is not established
    if (approvedReports.length === 0) {
      reportsSnap.forEach(d => {
        const report = d.data();
        const isApprovedOrConverted = ["Approved", "Converted", "Converted to Cause"].includes(report.status);
        const matchesCategory = report.category?.toLowerCase() === cause.category?.toLowerCase();
        if (isApprovedOrConverted && matchesCategory) {
          approvedReports.push({ id: d.id, ...report });
        }
      });
    }

    // 3. Media verification
    const mediaList = media || [];

    // 4. Data sufficiency check
    if (!cause || (!cause.name && !cause.title && !cause.id)) {
      return NextResponse.json({
        success: false,
        error: "Khizr could not generate this communication because there is insufficient verified information available for the selected Cause. Please approve field updates or upload verified media before generating."
      }, { status: 200 });
    }

    // Sort reports in JS to get the latest approved report
    approvedReports.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const latestReport = approvedReports[0];

    // Format verified data context
    const dataContext = {
      cause: {
        id: causeId,
        name: causeName,
        description: cause.description || `Support for ${causeName}`,
        goalAmount: cause.goalAmount || cause.targetAmount || 0,
        raisedAmount: cause.raisedAmount || 0,
        status: cause.status || "active",
        category: cause.category || "General",
      },
      latestReport: latestReport ? {
        id: latestReport.id,
        title: latestReport.title,
        description: latestReport.description,
        category: latestReport.category,
        urgency: latestReport.urgency,
        budget: latestReport.estimatedBudget,
        location: latestReport.location,
        beneficiaries: latestReport.beneficiaries,
        media: latestReport.media,
        date: latestReport.createdAt,
      } : null,
      uploadedMedia: mediaList.map((m: any) => ({
        name: m.name,
        type: m.type,
        url: m.serverUrl || m.previewUrl,
      })),
      timestamp: new Date().toISOString(),
    };

    // 5. Construct prompts
    const systemPrompt = `You are Khizr, the Executive Intelligence Operating System for the Daarayn Trust Operating System.
You are tasked with generating premium donor communications based ONLY on verified operational data.

CRITICAL RULES:
1. NEVER invent or fabricate facts, dates, milestones, beneficiary numbers, donation amounts, timelines, project status, statistics, success stories, quotes, Qur'an verses, or Hadiths.
2. If certain details are missing from the verified data, DO NOT make them up or use placeholders. Focus only on the provided verified information.
3. Aligned with Daarayn's core principles of Amanah (Trust), Transparency, Accountability, and Long-Term Donor Relationships.
4. Islamic Writing Style: Begin with a polite Islamic greeting (e.g., "Assalamu Alaikum") and close with an appropriate Islamic blessing/closing (e.g., offering a heartfelt du'a, "Wassalam", "Barakallahu Feekum").
5. Incorporate uploaded media naturally. If any media attachments are uploaded, generate clear, descriptive, professional captions based ONLY on the media description/names, referencing them in the communication.
6. The tone must be premium, elegant, and sound like an experienced executive of the Daarayn Foundation.

You must return a structured JSON response with the following keys:
- heading: A compelling, verified heading for the update.
- subject: A polished, premium email subject line.
- summary: A concise, executive summary of the verified progress/milestones.
- body: The full communication text, written in Daarayn's tone.
- preview: An HTML-formatted email preview matching the style of the landing page (elegant dark/emerald green aesthetics, clear typography, structured sections).
- captions: Descriptive captions for any uploaded media, separated by newlines (or a message indicating no media if none).
- internalNotes: Executive dispatch notes visible only to admins containing: Generation source ("Khizr AI Engine"), verification status ("Verified Operational Data"), latest approved update used (include the report ID/title of the most recent approved update), and generation timestamp.

Response must be valid JSON matching the exact schema above. Do not output markdown code blocks wrapper.`;

    let userPrompt = `Generate a donor communication of type "${type}" for the cause "${causeName}".
    
Verified Database Data:
${JSON.stringify(dataContext, null, 2)}
`;

    // Handle section regeneration requests
    if (regenerateField && existingData) {
      userPrompt += `\nThis is a REGENERATION request. The administrator wants to regenerate ONLY the field "${regenerateField}" while keeping the other fields exactly as they are.
      
Existing Data:
${JSON.stringify(existingData, null, 2)}

Please regenerate only the "${regenerateField}" field. All other fields in your JSON output must remain identical to the existing values. Make sure the regenerated "${regenerateField}" is fresh, premium, and compliant with all core rules.`;
    }

    // Call AI provider
    const response = await EnterpriseProviderManager.generate({
      systemPrompt,
      userPrompt,
      mode: "json",
      temperature: 0.2,
      maxTokens: 2000,
    });

    let resultJson: any = null;
    try {
      let cleanContent = response.content.trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.slice(7);
      }
      if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.slice(0, -3);
      }
      resultJson = JSON.parse(cleanContent.trim());
    } catch (parseError) {
      console.error("JSON parsing failed, falling back to raw output", parseError);
      return NextResponse.json({
        success: false,
        error: "Failed to parse Khizr's structured response. Please try again."
      }, { status: 200 });
    }

    return NextResponse.json({
      success: true,
      ...resultJson
    });

  } catch (error: any) {
    console.error("[GenerateAPI] Exception:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
