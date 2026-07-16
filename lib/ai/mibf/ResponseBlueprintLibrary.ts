/**
 * lib/ai/mibf/ResponseBlueprintLibrary.ts
 * 
 * Defines standard structural blueprints for every response mode.
 * Centralized source of truth for component visibility rules.
 */

export interface ResponseBlueprint {
  id: string;
  label: string;
  primarySections: string[];
  optionalSections: string[];
  hiddenSections: string[];
  allowCharts: boolean;
  allowTables: boolean;
  allowTimeline: boolean;
  allowMissionControl: boolean;
  allowExecutionDetails: boolean;
  allowRecommendations: boolean;
}

export const ResponseBlueprints: Record<string, ResponseBlueprint> = {
  DonationSummary: {
    id: "DonationSummary",
    label: "Donation Summary",
    primarySections: ["naturalAnswer"],
    optionalSections: ["analytics", "evidence", "actions"],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: false,
    allowTimeline: false,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: false,
  },
  DonorSearch: {
    id: "DonorSearch",
    label: "Donor Search",
    primarySections: ["naturalAnswer", "donorProfile"],
    optionalSections: ["donationHistory", "evidence"],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: true,
    allowTimeline: false,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: false,
  },
  DraftGeneration: {
    id: "DraftGeneration",
    label: "Draft Generation",
    primarySections: ["generatedDraft"],
    optionalSections: ["revisionActions", "complianceCheck"],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: false,
    allowTimeline: false,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: false,
  },
  Analytics: {
    id: "Analytics",
    label: "Analytics",
    primarySections: ["executiveSummary", "keyMetrics"],
    optionalSections: ["charts", "kpis", "export"],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: true,
    allowTables: true,
    allowTimeline: false,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: true,
  },
  ReportGeneration: {
    id: "ReportGeneration",
    label: "Report Generation",
    primarySections: ["reportSummary"],
    optionalSections: ["preview", "download", "approval"],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: true,
    allowTables: true,
    allowTimeline: true,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: true,
  },
  WorkflowExecution: {
    id: "WorkflowExecution",
    label: "Workflow Execution",
    primarySections: ["naturalAnswer", "workflowSteps"],
    optionalSections: ["executionDetails", "missionControl", "evidence"],
    hiddenSections: ["erceMetadata", "promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: false,
    allowTimeline: true,
    allowMissionControl: true,
    allowExecutionDetails: true,
    allowRecommendations: false,
  },
  ExecutiveBriefing: {
    id: "ExecutiveBriefing",
    label: "Executive Briefing",
    primarySections: ["executiveSummary"],
    optionalSections: ["analytics", "evidence", "recommendations"],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: false,
    allowTimeline: false,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: true,
  },
  ComplianceAudit: {
    id: "ComplianceAudit",
    label: "Compliance Audit",
    primarySections: ["naturalAnswer", "complianceStatus"],
    optionalSections: ["evidence", "timeline", "recommendations"],
    hiddenSections: ["promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: true,
    allowTimeline: true,
    allowMissionControl: true,
    allowExecutionDetails: true,
    allowRecommendations: true,
  },
  General: {
    id: "General",
    label: "General",
    primarySections: ["naturalAnswer"],
    optionalSections: ["evidence"],
    hiddenSections: ["erceMetadata", "executionTrace", "promptMetadata", "developerDiagnostics"],
    allowCharts: false,
    allowTables: false,
    allowTimeline: false,
    allowMissionControl: false,
    allowExecutionDetails: false,
    allowRecommendations: false,
  },
};

export class ResponseBlueprintLibrary {
  static getBlueprintContext(blueprintId: string): string {
    const blueprint = ResponseBlueprints[blueprintId] || ResponseBlueprints.General;
    
    return `
[RESPONSE BLUEPRINT: ${blueprint.label}]
Primary Sections (Must Render): ${blueprint.primarySections.join(", ")}
Optional Expandable Sections: ${blueprint.optionalSections.join(", ")}
Hidden Sections (Never Render unless AUDIT/DEV): ${blueprint.hiddenSections.join(", ")}
Allowed Components: Charts=${blueprint.allowCharts}, Tables=${blueprint.allowTables}, Timeline=${blueprint.allowTimeline}, MissionControl=${blueprint.allowMissionControl}, Recommendations=${blueprint.allowRecommendations}
    `.trim();
  }
}
