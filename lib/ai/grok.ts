/**
 * lib/ai/grok.ts
 *
 * Grok/Groq API client implementation for Daarayn Trust Intelligence Engine.
 * Supports two modes:
 *   1. Structured JSON mode (generateWithGrok) — for email/certificate/report generation
 *   2. Raw text mode (generateRawWithGrok) — for MKIE conversational completions
 *
 * Dynamically resolves URL endpoints and models from environment variables.
 * Provides categorized error handling, structured logging, and health checks.
 */

import type { AIResponsePayload, AIProviderOptions } from "./providerManager";

// Default completions URL (falls back to xAI if env not set)
const DEFAULT_API_URL = "https://api.x.ai/v1/chat/completions";

/** Generate a unique Request ID for correlation */
function generateRequestId(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = String(now.getTime()).slice(-6);
  return `AI-${datePart}-${seq}`;
}

/** Resolve environment configuration once */
function resolveConfig(options?: AIProviderOptions) {
  const apiKey =
    process.env.GROK_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY;
  let url = process.env.GROK_API_URL || DEFAULT_API_URL;
  let model = options?.model || process.env.GROK_MODEL;

  if (!model) {
    if (url.includes("groq.com") || apiKey?.startsWith("gsk_")) {
      model = "llama-3.3-70b-versatile";
    } else if (url.includes("x.ai")) {
      model = "grok-2-1212";
    } else {
      model = "grok-2-1212";
    }
  }

  if (!process.env.GROK_API_KEY && !process.env.GROK_API_URL) {
    if (process.env.GEMINI_API_KEY) {
      url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
      model = options?.model || "gemini-1.5-flash";
    } else if (process.env.OPENAI_API_KEY) {
      url = "https://api.openai.com/v1/chat/completions";
      model = options?.model || "gpt-4o-mini";
    }
  }
  return {
    apiKey,
    url,
    model,
    temperature: options?.temperature ?? 0.1,
    maxTokens: options?.maxTokens ?? 600,
  };
}

/** Log pipeline stage */
function logStage(requestId: string, stage: string, status: "✓" | "✗", detail?: string, durationMs?: number) {
  const ts = new Date().toISOString();
  const dur = durationMs !== undefined ? ` (${durationMs}ms)` : "";
  const det = detail ? ` | ${detail}` : "";
  console.log(`[${requestId}] ${ts} ${status} ${stage}${dur}${det}`);
}

/**
 * Categorize and throw a structured error based on HTTP status code and response body.
 */
function categorizeAndThrow(requestId: string, status: number, statusText: string, errorBody: string, model: string): never {
  const bodyLower = errorBody.toLowerCase();

  if (status === 401) {
    logStage(requestId, "Error Classification", "✗", "Authentication Error (HTTP 401)");
    throw new Error(`[${requestId}] Authentication Error: The provided AI API Key is invalid or expired. (HTTP 401)`);
  }
  if (status === 429) {
    logStage(requestId, "Error Classification", "✗", "Rate Limit (HTTP 429)");
    throw new Error(`[${requestId}] Rate Limit Error: AI completions request rate limits exceeded. Please retry later. (HTTP 429)`);
  }
  if (status === 404 || status === 400) {
    if (bodyLower.includes("model")) {
      logStage(requestId, "Error Classification", "✗", `Model Access Error: "${model}" (HTTP ${status})`);
      throw new Error(`[${requestId}] Model Access Error: The model "${model}" is not available at this endpoint. (HTTP ${status}) | Detail: ${errorBody.substring(0, 200)}`);
    }
    if (bodyLower.includes("json") || bodyLower.includes("response_format")) {
      logStage(requestId, "Error Classification", "✗", `Invalid Payload: response_format incompatibility (HTTP ${status})`);
      throw new Error(`[${requestId}] Invalid Payload: The response_format parameter is incompatible with the prompt. (HTTP ${status}) | Detail: ${errorBody.substring(0, 200)}`);
    }
    logStage(requestId, "Error Classification", "✗", `Invalid Payload (HTTP ${status})`);
    throw new Error(`[${requestId}] Invalid Payload: The request sent to the AI service was rejected. (HTTP ${status}) | Detail: ${errorBody.substring(0, 200)}`);
  }
  if (status >= 500) {
    logStage(requestId, "Error Classification", "✗", `Server Error (HTTP ${status})`);
    throw new Error(`[${requestId}] Server Error: The AI service endpoint returned: ${statusText} (HTTP ${status})`);
  }
  logStage(requestId, "Error Classification", "✗", `Unknown Error (HTTP ${status})`);
  throw new Error(`[${requestId}] Unknown Error: ${statusText} (HTTP ${status}) | Detail: ${errorBody.substring(0, 200)}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODE 1: STRUCTURED JSON — for emails, certificates, reports, action plans
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateWithGrok(
  systemPrompt: string,
  userPrompt: string,
  options?: AIProviderOptions
): Promise<AIResponsePayload> {
  const requestId = generateRequestId();
  const startedAt = Date.now();
  const config = resolveConfig(options);

  console.log(`\n=== [AI-TOS] Structured JSON Request ${requestId} ===`);
  logStage(requestId, "Environment Load", "✓", `ENV=${process.env.NODE_ENV}`);
  logStage(requestId, "API Key Validation", config.apiKey ? "✓" : "✗", `Present=${!!config.apiKey}, Prefix=${config.apiKey?.substring(0, 4) || "N/A"}`);
  logStage(requestId, "Config Resolution", "✓", `URL=${config.url} | Model=${config.model} | Temp=${config.temperature} | MaxTokens=${config.maxTokens}`);

  if (!config.apiKey) {
    logStage(requestId, "Pipeline Info", "✓", "External AI model provider API key is not configured.");
    const fallbackText =
      "⚠️ **AI Model Provider Unavailable**\n\nExternal AI model provider credentials (GROK_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY) are currently not configured in environment variables. AI model inference cannot be performed at this time.\n\nPlease configure your AI API credentials in environment variables to enable live model reasoning.";
    if (options?.rawMode) {
      return fallbackText as any;
    }
    return {
      subject: "AI Provider Unavailable",
      preview: "Model API key not configured",
      greeting: "Assalamu Alaikum",
      body: fallbackText,
      dua: "May Allah grant us wisdom and clarity.",
      cta: "Configure API Key",
      footer: "Daarayn Foundation — Verified Intelligence",
      confidenceScore: 0,
      status: "model_unavailable",
    };
  }

  // Validate prompt integrity
  if (!systemPrompt || !userPrompt) {
    logStage(requestId, "Prompt Validation", "✗", `systemPrompt=${!!systemPrompt}, userPrompt=${!!userPrompt}`);
    throw new Error(`[${requestId}] Invalid Payload: System or user prompt is empty/undefined.`);
  }
  logStage(requestId, "Prompt Validation", "✓", `sysLen=${systemPrompt.length}, userLen=${userPrompt.length}`);

  // Build request
  const requestBody: any = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: config.temperature,
    max_tokens: config.maxTokens,
  };

  if (!options?.rawMode) {
    requestBody.response_format = { type: "json_object" };
  }

  logStage(requestId, "Request Build", "✓", `Messages=${requestBody.messages.length}, rawMode=${!!options?.rawMode}`);

  try {
    logStage(requestId, "Grok Request Started", "✓");
    const fetchStart = Date.now();
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
    const fetchDuration = Date.now() - fetchStart;

    logStage(requestId, "Grok Response Received", response.ok ? "✓" : "✗", `HTTP ${response.status} (${response.statusText})`, fetchDuration);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] API Error body: ${errorText}`);
      categorizeAndThrow(requestId, response.status, response.statusText, errorText, config.model);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      logStage(requestId, "Response Content Extraction", "✗", "Empty choices or missing content");
      throw new Error(`[${requestId}] Invalid Response: Empty response content from AI provider.`);
    }

    logStage(requestId, "Response Content Extraction", "✓", `ContentLength=${rawContent.length}`);
    logStage(requestId, "Pipeline Complete", "✓", undefined, Date.now() - startedAt);

    if (options?.rawMode) {
      return rawContent as any;
    }

    try {
      return JSON.parse(rawContent);
    } catch {
      return {
        subject: "Intelligence Notice",
        preview: rawContent.substring(0, 80),
        greeting: "Assalamu Alaikum",
        body: rawContent,
        dua: "May Allah accept all beneficial efforts.",
        cta: "Review Details",
        footer: "Daarayn Operations",
        confidenceScore: 90,
      };
    }
  } catch (error) {
    const err = error as Error;
    if (!err.message.startsWith(`[${requestId}]`)) {
      logStage(requestId, "Network Exception", "✗", `${err.name}: ${err.message}`);
      if (err.message.includes("fetch") || err.message.includes("DNS") || err.message.includes("ENOTFOUND") || err.message.includes("socket") || err.message.includes("ETIMEDOUT")) {
        throw new Error(`[${requestId}] Network Error: Connection to the AI provider failed. Detail: ${err.message}`);
      }
    }
    logStage(requestId, "Pipeline Failed", "✗", err.message, Date.now() - startedAt);
    throw err;
  }
}

export async function generateRawWithGrok(
  systemPrompt: string,
  userPrompt: string,
  options?: AIProviderOptions
): Promise<string> {
  const result = await generateWithGrok(systemPrompt, userPrompt, { ...options, rawMode: true });
  return typeof result === "string" ? result : (result.body || JSON.stringify(result));
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

export interface AIHealthReport {
  status: "Healthy" | "Degraded" | "Offline";
  details: string;
  timestamp: string;
  requestId: string;
  durationMs: number;
  config: {
    provider: string;
    endpoint: string;
    model: string;
    keyPresent: boolean;
  };
  stages: Array<{ stage: string; status: "✓" | "✗"; detail?: string }>;
}

/**
 * Internal Health Check function.
 * Verifies environment, API key, endpoint reachability, and model accessibility.
 */
export async function checkAIHealth(): Promise<AIHealthReport> {
  const requestId = generateRequestId();
  const startedAt = Date.now();
  const apiKey = process.env.GROK_API_KEY;
  const endpoint = process.env.GROK_API_URL || DEFAULT_API_URL;
  const model = process.env.GROK_MODEL || "grok-2-1212";
  const stages: AIHealthReport["stages"] = [];

  const result: AIHealthReport = {
    status: "Offline",
    details: "",
    timestamp: new Date().toISOString(),
    requestId,
    durationMs: 0,
    config: {
      provider: process.env.AI_PROVIDER || "grok",
      endpoint,
      model,
      keyPresent: !!apiKey,
    },
    stages,
  };

  // Stage 1: Environment
  stages.push({ stage: "Environment Variables", status: "✓", detail: `AI_PROVIDER=${process.env.AI_PROVIDER || "grok"}` });

  // Stage 2: API Key
  if (!apiKey) {
    stages.push({ stage: "API Key Validation", status: "✗", detail: "GROK_API_KEY is not defined" });
    result.details = "Configuration issue: GROK_API_KEY is not defined in environment variables.";
    result.durationMs = Date.now() - startedAt;
    return result;
  }
  stages.push({ stage: "API Key Validation", status: "✓", detail: `Length=${apiKey.length}, Prefix=${apiKey.substring(0, 4)}` });

  // Stage 3: Endpoint Reachability & Model Access
  try {
    const fetchStart = Date.now();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
    });
    const fetchDuration = Date.now() - fetchStart;

    if (response.ok) {
      stages.push({ stage: "Endpoint Reachability", status: "✓", detail: `HTTP 200 (${fetchDuration}ms)` });
      stages.push({ stage: "Model Accessibility", status: "✓", detail: `Model "${model}" resolved` });
      result.status = "Healthy";
      result.details = "All systems operational. AI provider responded successfully.";
    } else {
      const text = await response.text();
      stages.push({ stage: "Endpoint Reachability", status: "✓", detail: `Connected but HTTP ${response.status} (${fetchDuration}ms)` });
      stages.push({ stage: "Model Accessibility", status: "✗", detail: text.substring(0, 150) });
      result.status = "Degraded";
      result.details = `Endpoint responded with status ${response.status}: ${text.substring(0, 150)}`;
    }
  } catch (err) {
    stages.push({ stage: "Endpoint Reachability", status: "✗", detail: (err as Error).message });
    result.status = "Offline";
    result.details = `Connection failed: ${(err as Error).message}`;
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}
