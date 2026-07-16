/**
 * lib/ai/engines/ResponseContracts.ts
 *
 * Enterprise Response Contracts (RC) for Phase 3.
 * Defines interfaces, schemas, and strict runtime validators for entity types.
 */

export interface DonationContract {
  id: string;
  amount: number;
  currency: string;
  date: string;
  status: "pending" | "completed" | "failed";
  donorName: string;
  refCode: string;
  allocatedAmount?: number;
  allocationStatus?: "pending" | "partially" | "fully";
}

export interface DonorContract {
  id: string;
  name: string;
  email: string;
  totalAmountDonated: number;
  totalDonations: number;
  status: "active" | "inactive";
}

export interface ProjectContract {
  id: string;
  title: string;
  amountRequired: number;
  amountCollected: number;
  progress: number;
  status: "Ongoing" | "Completed" | "Suspended";
  beneficiaryCount?: number;
}

export interface ReportContract {
  reportTitle: string;
  reportingPeriod: string;
  summaryExecutive: string;
  keyMilestones: string[];
  financialTransparencyNotes: string;
  impactMetricsText: string;
  transparencyDeclaration: string;
}

export interface CommunicationContract {
  subject: string;
  preview: string;
  greeting: string;
  body: string;
  dua: string;
  cta: string;
  footer: string;
}

/**
 * Validates a payload against a schema type.
 */
export class ResponseContracts {
  static validateDonation(data: any): DonationContract {
    if (!data.id || typeof data.id !== "string") throw new Error("RC: Donation missing valid id");
    if (typeof data.amount !== "number" || isNaN(data.amount)) throw new Error("RC: Donation missing valid amount");
    if (!data.currency) throw new Error("RC: Donation missing currency");
    if (!data.donorName) throw new Error("RC: Donation missing donorName");
    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      date: data.date || new Date().toISOString().split("T")[0],
      status: data.status || "pending",
      donorName: data.donorName,
      refCode: data.refCode || "",
      allocatedAmount: data.allocatedAmount || 0,
      allocationStatus: data.allocationStatus || "pending",
    };
  }

  static validateDonor(data: any): DonorContract {
    if (!data.id) throw new Error("RC: Donor missing id");
    if (!data.name) throw new Error("RC: Donor missing name");
    if (!data.email) throw new Error("RC: Donor missing email");
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      totalAmountDonated: Number(data.totalAmountDonated || 0),
      totalDonations: Number(data.totalDonations || 0),
      status: data.status || "active",
    };
  }

  static validateProject(data: any): ProjectContract {
    if (!data.id) throw new Error("RC: Project missing id");
    if (!data.title) throw new Error("RC: Project missing title");
    if (typeof data.amountRequired !== "number") throw new Error("RC: Project missing amountRequired");
    return {
      id: data.id,
      title: data.title,
      amountRequired: data.amountRequired,
      amountCollected: Number(data.amountCollected || 0),
      progress: Number(data.progress || 0),
      status: data.status || "Ongoing",
      beneficiaryCount: data.beneficiaryCount ? Number(data.beneficiaryCount) : undefined,
    };
  }

  static validateReport(data: any): ReportContract {
    if (!data.reportTitle) throw new Error("RC: Report missing reportTitle");
    if (!data.reportingPeriod) throw new Error("RC: Report missing reportingPeriod");
    if (!data.summaryExecutive) throw new Error("RC: Report missing summaryExecutive");
    return {
      reportTitle: data.reportTitle,
      reportingPeriod: data.reportingPeriod,
      summaryExecutive: data.summaryExecutive,
      keyMilestones: Array.isArray(data.keyMilestones) ? data.keyMilestones : [],
      financialTransparencyNotes: data.financialTransparencyNotes || "",
      impactMetricsText: data.impactMetricsText || "",
      transparencyDeclaration: data.transparencyDeclaration || "",
    };
  }

  static validateCommunication(data: any): CommunicationContract {
    const required = ["subject", "preview", "greeting", "body", "dua", "cta", "footer"];
    for (const key of required) {
      if (!data[key] || typeof data[key] !== "string" || data[key].trim() === "") {
        throw new Error(`RC: Communication missing required field "${key}"`);
      }
    }
    return {
      subject: data.subject,
      preview: data.preview,
      greeting: data.greeting,
      body: data.body,
      dua: data.dua,
      cta: data.cta,
      footer: data.footer,
    };
  }

  // Enterprise Contracts
  static validateDonationSummary(data: any) {
    if (typeof data.totalDonations !== "number" || typeof data.transactionCount !== "number") {
      throw new Error("RC: DonationSummary missing totalDonations or transactionCount");
    }
    return {
      totalDonations: data.totalDonations,
      transactionCount: data.transactionCount,
      currencySplit: data.currencySplit || {},
      averageDonation: data.averageDonation || 0,
      largestDonation: data.largestDonation || 0,
    };
  }

  static validateDonorSummary(data: any) {
    if (typeof data.uniqueDonorsCount !== "number") {
      throw new Error("RC: DonorSummary missing uniqueDonorsCount");
    }
    return {
      uniqueDonorsCount: data.uniqueDonorsCount,
      repeatDonorsCount: data.repeatDonorsCount || 0,
      topDonorName: data.topDonorName || "",
      topDonorTotal: data.topDonorTotal || 0,
    };
  }

  static validateProjectSummary(data: any) {
    if (!data.projectId) throw new Error("RC: ProjectSummary missing projectId");
    return {
      projectId: data.projectId,
      amountCollected: Number(data.amountCollected || 0),
      amountRequired: Number(data.amountRequired || 0),
      progress: Number(data.progress || 0),
      remainingGap: Number(data.remainingGap || 0),
    };
  }

  static validateCampaignSummary(data: any) {
    if (!data.campaignName) throw new Error("RC: CampaignSummary missing campaignName");
    return {
      campaignName: data.campaignName,
      totalAmountCollected: Number(data.totalAmountCollected || 0),
      financialTransparencyNotes: data.financialTransparencyNotes || "",
    };
  }

  static validateExecutiveBrief(data: any) {
    if (!data.summaryExecutive) throw new Error("RC: ExecutiveBrief missing summaryExecutive");
    return {
      reportingPeriod: data.reportingPeriod || "All Time",
      summaryExecutive: data.summaryExecutive,
      impactMetricsText: data.impactMetricsText || "",
    };
  }

  static validateWorkflowPlanContract(data: any) {
    if (!data.workflowId || !data.actionType) throw new Error("RC: WorkflowPlan missing workflowId or actionType");
    return {
      workflowId: data.workflowId,
      actionType: data.actionType,
      steps: Array.isArray(data.steps) ? data.steps : [],
    };
  }

  static validateImpactAnalysisContract(data: any) {
    return {
      affectedDonorsCount: Number(data.affectedDonorsCount || 0),
      affectedBeneficiariesCount: Number(data.affectedBeneficiariesCount || 0),
      riskLevel: data.riskLevel || "low",
    };
  }

  static validateCommunicationDraft(data: any) {
    if (!data.subject || !data.body) throw new Error("RC: CommunicationDraft missing subject or body");
    return {
      subject: data.subject,
      greeting: data.greeting || "",
      body: data.body,
      dua: data.dua || "",
    };
  }
}
