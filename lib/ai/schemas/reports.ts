/**
 * lib/ai/schemas/reports.ts
 *
 * Schema definitions for generated reports (Annual / Impact summaries).
 */

export interface ReportSchema {
  reportTitle: string;
  reportingPeriod: string;
  summaryExecutive: string;
  keyMilestones: string[];
  financialTransparencyNotes: string;
  impactMetricsText: string;
  transparencyDeclaration: string;
  confidenceScore: number;
}
