/**
 * lib/ai/fields/reportAgent.ts
 *
 * Report Agent for Daarayn AI-TOS.
 * Assembles project summaries and executive financial statements.
 */

import { generateAnnualReportDraft } from "../services/reportGenerator";

export class ReportAgent {
  public async compileReport(params: {
    year: number;
    totalRaised: number;
    projectsCount: number;
    beneficiariesCount: number;
  }) {
    return generateAnnualReportDraft(params);
  }
}
