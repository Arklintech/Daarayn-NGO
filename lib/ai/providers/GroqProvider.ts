/**
 * lib/ai/providers/GroqProvider.ts
 *
 * Concrete provider implementation for a single Groq API key slot.
 * Implements IProvider — stateless HTTP executor.
 *
 * This class is responsible ONLY for making the HTTP request to Groq's completions
 * endpoint and returning a NormalizedResponse. It has NO knowledge of:
 *  - Health state (managed by CircuitBreaker)
 *  - Failover (managed by ProviderSelector)
 *  - Retry (managed by RetryPolicy)
 *  - MCO cognition
 */

import type { IProvider, ProviderRequest, NormalizedResponse } from "./ProviderTypes";
import { ResponseNormalizer } from "./ResponseNormalizer";
import { EIPMLogger } from "./EIPMLogger";

const GROQ_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";

export class GroqProvider implements IProvider {
  readonly slotId: string;
  readonly priority: number;
  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(slotId: string, priority: number, apiKey: string, defaultModel: string) {
    this.slotId = slotId;
    this.priority = priority;
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async generate(req: ProviderRequest): Promise<NormalizedResponse> {
    const model = req.model ?? this.defaultModel;
    const temperature = req.temperature ?? 0.15;
    const maxTokens = req.maxTokens ?? 1200;
    const correlationId = req.correlationId ?? `EIPM-${Date.now()}`;

    EIPMLogger.logRequest(correlationId, this.slotId, req.mode, {
      sys: req.systemPrompt.length,
      user: req.userPrompt.length,
    });

    const body: Record<string, any> = {
      model,
      messages: [
        { role: "system", content: req.mode === "json"
            ? this.ensureJsonHint(req.systemPrompt)
            : req.systemPrompt
        },
        { role: "user", content: req.userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    };

    if (req.mode === "json") {
      body.response_format = { type: "json_object" };
    }

    const fetchStart = Date.now();
    const response = await fetch(GROQ_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const latencyMs = Date.now() - fetchStart;

    if (!response.ok) {
      const errorText = await response.text();
      // Attach raw error body so CircuitBreaker can parse cooldown from it
      const err = new Error(`[EIPM][${this.slotId}] HTTP ${response.status}: ${errorText.substring(0, 300)}`);
      (err as any).statusCode = response.status;
      (err as any).errorBody = errorText;
      throw err;
    }

    const data = await response.json();
    const rawContent: string = data.choices?.[0]?.message?.content ?? "";
    if (!rawContent) {
      throw new Error(`[EIPM][${this.slotId}] Empty content in provider response`);
    }

    const tokensUsed: number | undefined = data.usage?.total_tokens;

    EIPMLogger.log({
      type: "REQUEST_COMPLETE",
      slotId: this.slotId,
      timestamp: new Date().toISOString(),
      message: `HTTP 200 — ${rawContent.length} chars`,
      latencyMs,
      tokensUsed,
      correlationId,
    });

    return ResponseNormalizer.normalize(rawContent, req.mode, this.slotId, latencyMs, tokensUsed);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(GROQ_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.defaultModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 3,
        }),
      });
      // 200 or even a 400 (model mismatch) means the key/connection is alive
      return response.status !== 401 && response.status !== 403;
    } catch {
      return false;
    }
  }

  private ensureJsonHint(systemPrompt: string): string {
    if (systemPrompt.toLowerCase().includes("json")) return systemPrompt;
    return systemPrompt + "\\n\\nYou MUST respond in valid JSON format only.";
  }
}
