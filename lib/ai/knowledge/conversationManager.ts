/**
 * lib/ai/knowledge/conversationManager.ts
 *
 * KHIDR Conversation Manager — Thin Dispatcher
 *
 * This file is now a thin entry point that:
 *   1. Accepts the raw administrator request
 *   2. Runs HCIE normalization (Phase 6.0)
 *   3. Hands off to the KHIDR Cognitive Orchestrator (MCO)
 *
 * All intelligence, reasoning, tool orchestration, governance, and response
 * generation lives inside the MCO pipeline. This file does not contain any
 * pipeline logic.
 */

import type { KhidrRole } from "./permissionEngine";
import { normalizeKhidrRole } from "../roleNormalizer";
import { KhidrSessionMemory } from "./memory";
import { AIReliabilityFramework } from "../engines/AIReliabilityFramework";
import { HumanCommunicationIntelligenceEngine } from "../hcie/HumanCommunicationIntelligenceEngine";
import { KhidrCognitiveOrchestrator } from "../mco/KhidrCognitiveOrchestrator";
import type { WorkflowPlan } from "../orchestrator/executionPlanner";
import type { ActionPlan } from "../planner";

export interface KhidrChatRequest {
  sessionId: string;
  userId: string;
  userRole: KhidrRole;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface KhidrChatResponse {
  success: boolean;
  reply: string;
  actionPlan: ActionPlan | null;
  workflowPlan: WorkflowPlan | null;
  references: Array<{ source: string; content: string }>;
  metadata: {
    department: string;
    contextSummary: string;
    collections: string[];
    role: string;
    requestId?: string;
    pipelineStages?: Array<{ stage: string; status: string; durationMs: number; error?: string }>;
    certification?: string;
    status?: string;
    confidence?: number;
    repairsPerformed?: string[];
    errors?: string[];
    developerDiagnostics?: any;
    responseMode?: string;
    responseDepth?: string;
    allowedComponents?: string[];
    blueprint?: string;
    suppressAnalytics?: boolean;
    mcoObjective?: string;
    mcoDecisionType?: string;
  };
}

/**
 * Main entry point for all KHIDR administrator interactions.
 * Delegates immediately to the KHIDR Cognitive Orchestrator (MCO)
 * after HCIE normalization.
 */
export async function processKhidrChatMessage(
  req: KhidrChatRequest
): Promise<KhidrChatResponse> {
  const { sessionId, userId, userRole, message, history } = req;

  // Generate correlation ID and pipeline clock
  const requestId = AIReliabilityFramework.generateRequestId();
  const pipelineStart = Date.now();
  const stages: Array<{ stage: string; status: string; durationMs: number; error?: string }> = [];

  const normalizedRole = normalizeKhidrRole(userRole);

  AIReliabilityFramework.logDiagnostic(
    requestId,
    "info",
    `KHIDR MCO Pipeline Started | Query: "${message}" | Session: ${sessionId} | Role: ${normalizedRole}`
  );

  // Build session history context
  const sessionMemory = new KhidrSessionMemory(
    history.map(h => ({ role: h.role, content: h.content, timestamp: new Date().toISOString() }))
  );
  const historyText = sessionMemory.formatHistory();

  // Phase 6.0 — HCIE: Normalize messy human communication
  let stageStart = Date.now();
  const hcieAnalysis = await HumanCommunicationIntelligenceEngine.process(message, userId);
  const hcieDuration = Date.now() - stageStart;
  stages.push({ stage: "Human Communication Intelligence Engine", status: "✓", durationMs: hcieDuration });
  AIReliabilityFramework.logDiagnostic(requestId, "info", `HCIE: "${message}" → "${hcieAnalysis.normalizedMessage}" (${hcieDuration}ms)`);

  // Delegate entirely to MCO — the cognitive mind
  return KhidrCognitiveOrchestrator.process(
    { ...req, userRole: normalizedRole },
    hcieAnalysis,
    historyText,
    requestId,
    pipelineStart,
    stages
  );
}
