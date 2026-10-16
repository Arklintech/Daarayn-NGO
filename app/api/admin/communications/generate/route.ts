import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { causeRepository } from "@/lib/repositories/causeRepository";

export async function POST(req: Request) {
  const adminAuth = await requireAdmin(req);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const { causeId, type, media, causeName, category } = await req.json();

    if (!causeId) {
      return NextResponse.json({ success: false, error: "causeId is required" }, { status: 400 });
    }

    // Use provided cause data, fallback to fetch if not provided
    let finalCauseName = causeName;
    let finalCategory = category;

    if (!finalCauseName || !finalCategory) {
      const allCauses = await causeRepository.getAll();
      const cause = allCauses.find(c => c.id === causeId);

      if (!cause) {
        return NextResponse.json({ success: false, error: "Cause not found" }, { status: 404 });
      }

      finalCauseName = cause.name || cause.title || "Initiative";
      finalCategory = (cause as any).category || "Foundation Initiative";
    }

    const typeTitles: Record<string, string> = {
      contribution_confirmation: "Contribution Confirmation",
      project_progress: "Project Progress Update",
      allocation_confirmation: "Allocation Confirmation",
      completion_report: "Completion & Impact Report",
      general_communication: "General Communication",
    };

    // Generate professional heading and body based on communication type
    let heading = "";
    let body = "";

    switch (type) {
      case "project_progress":
        heading = `${finalCauseName}: Latest Progress Update`;
        body = `Dear Valued Supporter,\n\nWe are delighted to share the latest progress on ${finalCauseName}. Your generous contributions continue to make a meaningful impact in our community.\n\n• Project Status: Active and progressing on schedule\n• Community Engagement: Strong participation and support\n• Next Steps: Continuing implementation with your backing\n\nWe remain committed to transparency and regular updates on all ${finalCategory} initiatives. Thank you for being part of this important work.`;
        break;

      case "completion_report":
        heading = `${finalCauseName}: Completion & Impact Report`;
        body = `Dear Valued Supporter,\n\nWe are proud to report the successful completion of ${finalCauseName}. Thanks to your contribution, we have achieved meaningful results.\n\n• Project Completion: 100% - All objectives met\n• Community Impact: Verified and documented\n• Long-term Outcomes: Sustainable and measurable\n\nThis project exemplifies how collaborative efforts create lasting change. Your support made this success possible.`;
        break;

      case "allocation_confirmation":
        heading = `Funds Allocated for ${finalCauseName}`;
        body = `Dear Valued Supporter,\n\nWe confirm that your contribution to ${finalCauseName} has been allocated and is now supporting active initiatives.\n\n• Fund Status: Allocated to verified beneficiaries\n• Timeline: Implementation underway\n• Transparency: Full tracking available in public ledger\n\nEvery rupee of your donation is working directly toward the causes you care about. We are grateful for your trust.`;
        break;

      case "contribution_confirmation":
        heading = `Your Contribution to ${finalCauseName} Received`;
        body = `Dear Valued Supporter,\n\nThank you for your contribution to ${finalCauseName}. Your support strengthens our mission to create positive change.\n\n• Amount: Received and secured\n• Status: Under verification and allocation process\n• Next Steps: Will be allocated within 5-7 business days\n\nYour contribution is part of a larger effort to support ${finalCategory} work. We will keep you updated on impact.`;
        break;

      default:
        heading = `${finalCauseName}: Foundation Update`;
        body = `Dear Valued Supporter,\n\nWe are reaching out with an important update regarding ${finalCauseName}.\n\nYour continued support enables us to serve our community effectively. We remain committed to transparency and regular communication about the impact of your contributions.\n\nThank you for being part of our mission.`;
    }

    const response = NextResponse.json({
      success: true,
      heading,
      body,
    });

    // Cache for 1 hour since generated content doesn't change
    response.headers.set('Cache-Control', 'private, max-age=3600');

    return response;
  } catch (error: any) {
    const errorMsg = error?.message || "Unknown error";
    console.error("[Communications/Generate] Error:", errorMsg, error?.code);

    // Network/API errors
    if (errorMsg.includes("ENOTFOUND") || errorMsg.includes("ECONNREFUSED") || errorMsg.includes("timeout")) {
      return NextResponse.json({
        success: false,
        error: "Unable to reach data services. Please check your network connection.",
        code: "SERVICE_UNAVAILABLE"
      }, { status: 503 });
    }

    return NextResponse.json(
      { success: false, error: "Failed to generate content. Please try again.", code: "GENERATION_ERROR" },
      { status: 500 }
    );
  }
}
