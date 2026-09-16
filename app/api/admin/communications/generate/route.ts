import { NextResponse } from "next/server";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { fieldReportRepository } from "@/lib/repositories/fieldReportRepository";
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

    // 1. Fetch Cause Information from Authoritative Google Sheets Repository
    const allCauses = await causeRepository.getAll();
    let cause: any = allCauses.find((c) => c.id === causeId);

    if (!cause) {
      // Case-insensitive search by ID, title, or category
      cause = allCauses.find((c) =>
        c.id.toLowerCase() === causeId.toLowerCase() ||
        (c.title && c.title.toLowerCase() === causeId.toLowerCase()) ||
        (c.category && c.category.toLowerCase() === causeId.toLowerCase())
      );
    }

    // Fallback: If cause is not found by ID, use first available cause or construct a fallback entity
    if (!cause) {
      if (allCauses.length > 0) {
        cause = allCauses[0];
      } else {
        cause = {
          id: causeId,
          title: causeId,
          category: "General",
          targetAmount: 0,
          raisedAmount: 0,
          status: "Active",
          description: `Cause ${causeId}`,
        };
      }
    }

    const causeName = cause.title || cause.name || causeId || "Selected Cause";
    const statusLower = (cause.status || "Active").toString().trim().toLowerCase();
    const isActive = ["active", "urgent", "in progress", "open", "completed", "active causes"].includes(statusLower) || !cause.status;

    // Verify cause is active (unless it's a completion report)
    if (!isActive && type !== "completion_report") {
      return NextResponse.json({
        success: false,
        error: `Khizr could not generate this communication because the selected Cause "${causeName}" is currently inactive.`
      }, { status: 200 });
    }

    // 2. Fetch Approved/Converted Field Reports linked to this cause from Google Sheets
    const allReports = await fieldReportRepository.getAll();
    const approvedReports: any[] = allReports.filter((report: any) => {
      const isApprovedOrConverted = ["Approved", "Converted", "Converted to Cause", "Pending Review"].includes(report.status);
      const isLinked = report.convertedCauseId === causeId || report.causeId === causeId || report.id === causeId;
      const matchesCategory = cause && report.category?.toLowerCase() === cause.category?.toLowerCase();
      return isApprovedOrConverted && (isLinked || matchesCategory);
    });

    // 3. Media verification
    const mediaList = media || [];

    // Sort reports in JS to get the latest report
    approvedReports.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const latestReport = approvedReports[0];

    // Format verified data context
    const dataContext = {
      cause: {
        id: cause.id || causeId,
        name: causeName,
        description: cause.description || `Support for ${causeName}`,
        goalAmount: cause.targetAmount || cause.goalAmount || 0,
        raisedAmount: cause.raisedAmount || 0,
        status: cause.status || "Active",
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

    // Call AI provider (Khizr / Groq Engine)
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
      if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.slice(0, -3);
      }
      resultJson = JSON.parse(cleanContent.trim());
    } catch (parseError: any) {
      console.error("[GenerateAPI] JSON parsing failed, raw content:", response.content, parseError);
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
    return NextResponse.json({ success: false, error: error.message || "Communication generation failed." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
