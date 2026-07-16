/**
 * lib/ai/knowledge/conversationManager.ts
 *
 * MOMIN Conversation Manager — Thin Dispatcher
 *
 * This file is now a thin entry point that:
 *   1. Accepts the raw administrator request
 *   2. Runs HCIE normalization (Phase 6.0)
 *   3. Hands off to the MOMIN Cognitive Orchestrator (MCO)
 *
 * All intelligence, reasoning, tool orchestration, governance, and response
 * generation lives inside the MCO pipeline. This file does not contain any
 * pipeline logic.
 */

import type { MominRole } from "./permissionEngine";
import { normalizeMominRole } from "../roleNormalizer";
import { MominSessionMemory } from "./memory";
import { AIReliabilityFramework } from "../engines/AIReliabilityFramework";
import { HumanCommunicationIntelligenceEngine } from "../hcie/HumanCommunicationIntelligenceEngine";
import { MominCognitiveOrchestrator } from "../mco/MominCognitiveOrchestrator";
import type { WorkflowPlan } from "../orchestrator/executionPlanner";
import type { ActionPlan } from "../planner";

export interface MominChatRequest {
  sessionId: string;
  userId: string;
  userRole: MominRole;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface MominChatResponse {
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
 * Main entry point for all MOMIN administrator interactions.
 * Delegates immediately to the MOMIN Cognitive Orchestrator (MCO)
 * after HCIE normalization.
 */
export async function processMominChatMessage(
  req: MominChatRequest
): Promise<MominChatResponse> {
  const { sessionId, userId, userRole, message, history } = req;

  // Generate correlation ID and pipeline clock
  const requestId = AIReliabilityFramework.generateRequestId();
  const pipelineStart = Date.now();
  const stages: Array<{ stage: string; status: string; durationMs: number; error?: string }> = [];

  const normalizedRole = normalizeMominRole(userRole);

  AIReliabilityFramework.logDiagnostic(
    requestId,
    "info",
    `MOMIN MCO Pipeline Started | Query: "${message}" | Session: ${sessionId} | Role: ${normalizedRole}`
  );

  // Build session history context
  const sessionMemory = new MominSessionMemory(
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
  return MominCognitiveOrchestrator.process(
    { ...req, userRole: normalizedRole },
    hcieAnalysis,
    historyText,
    requestId,
    pipelineStart,
    stages
  );
}
