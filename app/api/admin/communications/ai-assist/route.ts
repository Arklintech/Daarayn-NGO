import { NextRequest, NextResponse } from "next/server";

/**
 * AI Writing Assistant for Communications Composer
 * Helps improve and structure admin-written update notes
 * Non-operational: Composition aid only, does not affect data processing
 */

export async function POST(request: NextRequest) {
  try {
    const { notes, heading, type } = await request.json();

    if (!notes || notes.trim().length === 0) {
      return NextResponse.json(
        { error: "Notes cannot be empty" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI assistant not configured" },
        { status: 500 }
      );
    }

    // Call Claude API for writing assistance
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-1-20250805",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `You are a professional writing assistant for a charity organization's donor communications.

The admin is composing a "${type}" update.
Heading: "${heading}"

Current notes:
"${notes}"

Please provide:
1. **Improved Version**: A refined version with better clarity, grammar, and tone
2. **Key Points**: Extract 2-3 bullet points of the most important facts
3. **Suggestions**: 1-2 specific improvement recommendations

Format your response as JSON with keys: "improved", "keyPoints" (array), "suggestions" (array)

Keep the same length and factual accuracy - only improve clarity and professionalism.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[AI Assist] Claude API error:", error);
      return NextResponse.json(
        { error: "AI assistant failed to process request" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || "";

    try {
      const parsed = JSON.parse(content);
      return NextResponse.json({
        success: true,
        improved: parsed.improved,
        keyPoints: parsed.keyPoints || [],
        suggestions: parsed.suggestions || [],
      });
    } catch {
      // If response isn't valid JSON, return the raw text
      return NextResponse.json({
        success: true,
        improved: content,
        keyPoints: [],
        suggestions: ["Request processed by AI assistant"],
      });
    }
  } catch (error) {
    console.error("[AI Assist] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
