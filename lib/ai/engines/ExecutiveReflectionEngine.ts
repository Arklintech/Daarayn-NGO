/**
 * lib/ai/engines/ExecutiveReflectionEngine.ts
 * 
 * Executive Reflection Loop (ERL) for KHIDR Executive Intelligence & Experience Program (MEIEP).
 * This engine runs asynchronously after the main response is delivered to the administrator.
 * It evaluates the interaction against 6 core executive questions and extracts organizational lessons.
 */

import { generateRawWithGrok } from "../grok";
import type { EnterpriseIntelligenceObject } from "./EnterpriseIntelligenceObject";
import type { KnowledgeEvolutionRecord } from "../mibf/EnterpriseKnowledgeRegistry";
import { db } from "../../firebase";
import { doc, setDoc } from "firebase/firestore";

export class ExecutiveReflectionEngine {
  /**
   * Executes the Executive Reflection Loop asynchronously.
   * Does NOT block the user request.
   */
  static runReflectionAsync(eio: EnterpriseIntelligenceObject, finalResponseText: string) {
    // Run asynchronously without waiting
    setTimeout(async () => {
      try {
        const requestId = eio.requestId || `ERL-${Date.now()}`;
        console.log(`[ERL] Starting Executive Reflection Loop for request: ${requestId}`);

        const systemPrompt = `
You are the Executive Reflection Engine for Daarayn's AI Operating System.
Your job is to analyze the recent interaction between the Administrator and KHIDR.

Evaluate the interaction against these 6 questions:
1. Did KHIDR understand what the administrator really wanted?
2. Was the answer grounded in verified Daarayn records?
3. Could the answer have been explained more clearly?
4. Did KHIDR recommend the most useful next action?
5. If a human Executive Director had answered this, would they have said it differently?
6. What organizational lesson can be captured from this interaction?

Output MUST be a valid JSON object matching this schema exactly:
{
  "domain": "String (e.g. Donor Intelligence, Campaign Intelligence, Finance Intelligence)",
  "analysis": "Brief 2-sentence critical analysis",
  "operationalLesson": "A single-sentence operational lesson that should be permanently learned",
  "actionableInitiative": {
    "title": "Title of the proposed initiative (e.g. 'Draft Update to Top 5 Donors')",
    "draftContent": "The actual draft content, email body, or policy proposal ready for review",
    "targetAudience": "Who is this for?"
  },
  "scores": {
    "novelty": number (1-10),
    "evidenceStrength": number (1-10),
    "executiveValue": number (1-10),
    "operationalImpact": number (1-10),
    "confidence": number (1-10),
    "reusability": number (1-10)
  }
}
        `.trim();

        const userPrompt = `
[Query]
${eio.query}

[Verified Data Context Provided to KHIDR]
${JSON.stringify(eio.metrics)}

[KHIDR's Final Response]
${finalResponseText}
        `.trim();

        const reflectionOutput = await generateRawWithGrok(systemPrompt, userPrompt, {
          temperature: 0.1,
          maxTokens: 800,
          rawMode: true
        });

        // Parse JSON output
        let parsed: any = null;
        try {
          const jsonStr = reflectionOutput.substring(
            reflectionOutput.indexOf("{"),
            reflectionOutput.lastIndexOf("}") + 1
          );
          parsed = JSON.parse(jsonStr);
        } catch (parseErr) {
          console.error(`[ERL] Failed to parse reflection JSON:`, reflectionOutput);
          return;
        }

        const evolutionRecord: KnowledgeEvolutionRecord = {
          id: `EVOL-${Date.now()}`,
          timestamp: new Date().toISOString(),
          intent: eio.intent.intent,
          query: eio.query,
          responseId: requestId,
          domain: parsed.domain || "General Intelligence",
          administratorFeedback: "pending_review",
          operationalLesson: parsed.operationalLesson,
          status: "pending_review",
          scores: parsed.scores || {
            novelty: 5,
            evidenceStrength: 5,
            executiveValue: 5,
            operationalImpact: 5,
            confidence: 5,
            reusability: 5
          }
        };

        // Persist to Firestore: khidr_evolution
        if (process.env.NODE_ENV !== "test") {
          try {
            await setDoc(doc(db, "khidr_evolution", evolutionRecord.id), evolutionRecord);
            console.log(`[ERL] Saved evolution record to Firestore: ${evolutionRecord.id}`);
            
            if (parsed.actionableInitiative && parsed.actionableInitiative.title) {
              const initiativeRecord = {
                id: `INIT-${Date.now()}`,
                evolutionId: evolutionRecord.id,
                timestamp: new Date().toISOString(),
                domain: evolutionRecord.domain,
                title: parsed.actionableInitiative.title,
                draftContent: parsed.actionableInitiative.draftContent,
                targetAudience: parsed.actionableInitiative.targetAudience,
                status: "pending_review"
              };
              await setDoc(doc(db, "khidr_initiatives", initiativeRecord.id), initiativeRecord);
              console.log(`[ERL] Saved proactive initiative draft to Firestore: ${initiativeRecord.id}`);
            }
          } catch (dbErr) {
            console.error(`[ERL] Failed to persist evolution or initiative record:`, dbErr);
          }
        }

        console.log(`\n==================================================`);
        console.log(`[EXECUTIVE REFLECTION LOOP COMPLETE]`);
        console.log(`RequestId: ${requestId} | Domain: ${evolutionRecord.domain}`);
        console.log(`Lesson: ${evolutionRecord.operationalLesson}`);
        console.log(`Scores: ${JSON.stringify(evolutionRecord.scores)}`);
        console.log(`==================================================\n`);

      } catch (error) {
        console.error(`[ERL] Executive Reflection Loop failed:`, error);
      }
    }, 0); // Execute in next tick
  }
}
