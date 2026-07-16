export interface EnterpriseIntelligenceObject {
  requestId: string; sessionId: string; userId: string; userRole: string; query: string;
  intent: any; objective: any; permissions: any; responsePlan: any; facts: any[];
  metrics: any; businessRules: any; diagnostics: any; responseStrategy: any; mibfDirectives: any; aiOutput?: any;
}
