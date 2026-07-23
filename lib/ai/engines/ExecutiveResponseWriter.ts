/**
 * lib/ai/engines/ExecutiveResponseWriter.ts
 *
 * Conversation Experience Layer (CXL) — Executive Response Writer
 *
 * This engine is the final step of the KHIZR response pipeline.
 * It takes the ERCE-certified, Blueprint-enforced structured intelligence
 * and converts it into natural executive-quality conversation.
 *
 * RESPONSE LAWS (enforced here):
 *   LAW 1  — Answer the administrator's question immediately.
 *   LAW 2  — Speak naturally. Never like an API, database, or report generator.
 *   LAW 3  — Write in complete professional sentences.
 *   LAW 4  — Explain naturally. Do not dump raw metrics.
 *   LAW 5  — Recommendations must sound thoughtful.
 *   LAW 6  — Never expose ERCE, EIO, Bronze, Gold, pipeline, routing, diagnostics, Request IDs.
 *   LAW 7  — Evidence available but hidden (handled in UI layer).
 *   LAW 8  — Never overwhelm. Prioritize clarity.
 *   LAW 9  — Communicate with empathy and professionalism.
 *   LAW 10 — End with a meaningful operational next step. Never "Anything else?".
 *
 * The following are NEVER exposed in conversation output:
 *   ERCE · EIO · Bronze · Silver · Gold · Confidence · Governance · Certification
 *   Pipeline · Routing · Prompt · Backend · Diagnostics · Request IDs · JSON · Timestamps
 */

import type { CertificationResult } from "./EnterpriseResponseCertificationEngine";
import type { EnterpriseIntelligenceObject } from "./EnterpriseIntelligenceObject";

export interface CXLResult {
  conversationText: string;
  isRejection: boolean;
}

// Patterns that must NEVER appear in the conversation surface
const PROHIBITED_PATTERNS: RegExp[] = [
  /\bERCE\b/gi,
  /\bEIO\b/gi,
  /\bMKIE\b/gi,
  /\bBronze\b/gi,
  /\bSilver\b/gi,
  /\bGold\b/gi,
  /\bCertification Level\b/gi,
  /\bGovernance Status\b/gi,
  /\bConfidence Level\b/gi,
  /Request ID[:\s]+`?KHIZR-[A-Z0-9-]+`?/gi,
  /Timestamp[:\s]+[0-9T:.Z-]+/gi,
  /\bSelf-Healing Actions Applied\b/gi,
  /\bGovernance Advisories[^]*?(?=\n\n|\z)/gi,
  /\bCertified Reference Records\b/gi,
  /\bVerified Potential Actions\b/gi,
  /\bERCE Operations Certification Report\b/gi,
  /\bKHIZR ERCE Certified[^)]*\)/gi,
  /---\s*\n### ERCE Operations Certification Report[\s\S]*/,
  /\[object Object\]/g,
  /> \[!IMPORTANT\]\s*\n> \*\*KHIZR ERCE Certified[^\n]*\n/gi,
];

/**
 * Removes all prohibited internal patterns from text.
 */
function sanitize(text: string): string {
  if (!text || typeof text !== "string") return "";
  let result = text;
  for (const pattern of PROHIBITED_PATTERNS) {
    result = result.replace(pattern, "");
  }
  // Clean up empty markdown artifacts
  result = result.replace(/^#+\s*$/gm, "").replace(/^-\s*$/gm, "").replace(/\n{3,}/g, "\n\n");
  return result.trim();
}

/**
 * Converts a raw "Label: Value" metric string into a natural sentence.
 */
function naturalizeMetric(finding: string): string {
  if (!finding || typeof finding !== "string") return "";
  if (!finding.includes(":") && finding.split(" ").length > 5) return finding;

  const colonIdx = finding.indexOf(":");
  if (colonIdx === -1) return finding;

  const label = finding.substring(0, colonIdx).trim();
  const value = finding.substring(colonIdx + 1).trim();

  const mappings: Record<string, string> = {
    "Total Donations": `Total donations received amount to ${value}`,
    "Total Transactions": `${value} transactions have been recorded to date`,
    "Unique Donors": `The trust currently has ${value} unique donors on record`,
    "Repeat Donors": `${value} of these donors have contributed on multiple occasions`,
    "Top Contributor": `The highest contributing donor is ${value}`,
    "Average Donation": `The average donation stands at ${value}`,
    "Largest Donation": `The largest single contribution received is ${value}`,
    "Smallest Donation": `The smallest recorded donation is ${value}`,
  };

  const mapped = mappings[label];
  return mapped ? mapped + "." : `${label}: ${value}.`;
}

/**
 * Builds the CXL natural prose from a certified AI response payload.
 */
function buildConversationText(
  filteredResponse: any,
  isCommunicationDraft: boolean,
  eio: EnterpriseIntelligenceObject
): string {
  // Communication drafts pass through with structured formatting (intentional)
  if (isCommunicationDraft) {
    const lines: string[] = [];
    if (filteredResponse.subject) lines.push(`**Subject:** ${filteredResponse.subject}`);
    if (filteredResponse.preview) lines.push(`*${filteredResponse.preview}*\n`);
    if (filteredResponse.greeting) lines.push(filteredResponse.greeting);
    if (filteredResponse.body) lines.push(`\n${filteredResponse.body}`);
    if (filteredResponse.dua) lines.push(`\n*${filteredResponse.dua}*`);
    if (filteredResponse.cta) lines.push(`\n${filteredResponse.cta}`);
    return lines.filter(Boolean).join("\n");
  }

  const parts: string[] = [];

  // ── LAW 1 & 3: Lead with the answer ──────────────────────────────────────
  const rawSummary: string =
    typeof filteredResponse?.executiveSummary === "string"
      ? filteredResponse.executiveSummary
      : typeof filteredResponse?.summaryExecutive === "string"
      ? filteredResponse.summaryExecutive
      : "";

  if (rawSummary) {
    parts.push(sanitize(rawSummary));
  }

  // Include conversational body generated by MCO
  if (typeof filteredResponse?.body === "string" && filteredResponse.body.trim().length > 0) {
    parts.push(sanitize(filteredResponse.body));
  }

  // ── LAW 4: Findings as natural supporting sentences ───────────────────────
  const findings: string[] = Array.isArray(filteredResponse?.verifiedFindings)
    ? filteredResponse.verifiedFindings
        .map((f: any) => (typeof f === "string" ? f : JSON.stringify(f)))
        .filter(Boolean)
    : [];

  if (findings.length > 0) {
    const naturalFindings = findings
      .map(naturalizeMetric)
      .map(sanitize)
      .filter((s) => s.length > 5);

    if (naturalFindings.length > 0) {
      parts.push(naturalFindings.join(" "));
    }
  }

  // ── LAW 9: Operational observations as contextual insight ─────────────────
  const observations: string[] = Array.isArray(filteredResponse?.operationalObservations)
    ? filteredResponse.operationalObservations
        .map((o: any) => (typeof o === "string" ? o : JSON.stringify(o)))
        .filter(Boolean)
    : [];

  if (observations.length > 0) {
    const naturalObs = observations.map(sanitize).filter((s) => s.length > 5);
    if (naturalObs.length > 0) {
      parts.push(naturalObs.join(" "));
    }
  }

  // ── LAW 5 & 10: Recommendations as thoughtful narrative ──────────────────
  const actions: string[] = Array.isArray(filteredResponse?.potentialActions)
    ? filteredResponse.potentialActions
        .map((a: any) => {
          if (typeof a === "string") return a;
          if (typeof a === "object" && a !== null) {
            // Extract the first string value from the object (e.g. { proactiveIntelligence: "..." })
            const vals = Object.values(a).filter(v => typeof v === "string");
            return vals.length > 0 ? (vals[0] as string) : null;
          }
          return null;
        })
        .filter(Boolean)
    : [];

  if (actions.length > 0) {
    const naturalActions = actions.map(sanitize).filter((s) => s.length > 5);
    if (naturalActions.length > 0) {
      parts.push(naturalActions.join(" "));
    }
  }

  const assembled = parts.filter(Boolean).join("\n\n");
  const sanitized = sanitize(assembled);
  return sanitized || buildFallbackText(eio);
}

/**
 * When the AI response is empty or all content was stripped, build a verified
 * fallback from pure EIO backend metrics — in natural prose.
 */
function buildFallbackText(eio: EnterpriseIntelligenceObject): string {
  const metrics = eio?.metrics;
  const lines: string[] = [];

  if (metrics?.totalDonations > 0) {
    lines.push(
      `Daarayn has received a total of ₹${metrics.totalDonations.toLocaleString()} across ` +
        `${metrics.transactionCount} transactions from ${metrics.uniqueDonorsCount} unique donors.`
    );

    if (metrics.repeatDonorsCount > 0) {
      lines.push(
        `${metrics.repeatDonorsCount} of these donors have contributed on multiple occasions, ` +
          `reflecting sustained trust in the organisation's mission.`
      );
    }

    if (metrics.topDonorName) {
      lines.push(
        `The highest contributing donor is ${metrics.topDonorName}, with a cumulative total of ` +
          `₹${metrics.topDonorTotal.toLocaleString()}.`
      );
    }
  }

  if (metrics?.programAnalytics && metrics.programAnalytics.length > 0) {
    const progSummary = metrics.programAnalytics
      .map(
        (p) =>
          `${p.title} is currently ${p.progress}% funded, having collected ` +
          `₹${p.amountCollected.toLocaleString()} of its ₹${p.amountRequired.toLocaleString()} target.`
      )
      .join(" ");
    lines.push(progSummary);
  }

  if (lines.length === 0) {
    const metrics = eio.metrics;
    if (metrics && (metrics.totalDonations > 0 || (metrics.programAnalytics && metrics.programAnalytics.length > 0))) {
      const parts: string[] = [];
      if (metrics.totalDonations > 0) {
        parts.push(
          `Based on verified records, Daarayn has received ₹${metrics.totalDonations.toLocaleString("en-IN")} across ${metrics.transactionCount} transactions from ${metrics.uniqueDonorsCount} unique donors.`
        );
      }
      if (metrics.programAnalytics?.length) {
        const prog = metrics.programAnalytics
          .slice(0, 3)
          .map((p) => `${p.title} is ${p.progress}% funded`)
          .join("; ");
        parts.push(`Active programs: ${prog}.`);
      }
      if (eio.objective?.decisionType === "INVESTIGATIVE_ANALYSIS" || eio.objective?.decisionType === "STRATEGIC_ASSESSMENT") {
        parts.push("I recommend reviewing underfunded programs and untagged donations as your next operational priority.");
      }
      if (parts.length > 0) return parts.join("\n\n");
    }
    return (
      "I have reviewed the available operational records, but the data is currently insufficient " +
      "to construct a complete executive response. Please try refining your query."
    );
  }

  return lines.join("\n\n");
}

export class ExecutiveResponseWriter {
  /**
   * Main CXL entry point.
   * Translates ERCE CertificationResult into executive-quality conversation prose.
   */
  static write(
    certResult: CertificationResult,
    eio: EnterpriseIntelligenceObject,
    responseStrategy: any
  ): CXLResult {
    if (certResult.level === "Rejected") {
      const cleanErrors = certResult.errors
        .slice(0, 2)
        .map((e) =>
          e
            .replace(/\[Verified Findings #\d+\]\s*/gi, "")
            .replace(/\[Operational Observations #\d+\]\s*/gi, "")
            .replace(/\[Potential Actions #\d+\]\s*/gi, "")
            .replace(/\[Executive Summary\]\s*/gi, "")
            .replace(/Factual contradiction[^.]*\.\s*/gi, "")
            .replace(/\d+(\.\d+)?\s+conflicts with[^.]*\.\s*/gi, "")
            .replace(/Layout Contract check failed[^.]*\.\s*/gi, "")
            .replace(/Security boundary[^.]*\.\s*/gi, "")
            .replace(/Value\s+[\d.]+\s+[^.]*\.\s*/gi, "")
            .trim()
        )
        .filter((e) => e.length > 5);

      const rejectionText = [
        "I was unable to complete this response because the information generated could not be " +
          "verified against the trust's authoritative records.",
        cleanErrors.length > 0
          ? `This may be due to: ${cleanErrors.join("; ")}.`
          : "This may be due to data availability or a conflict in the retrieved information.",
        "Please try rephrasing your query, or contact the system administrator if the issue persists.",
      ]
        .filter(Boolean)
        .join("\n\n");

      return { conversationText: rejectionText, isRejection: true };
    }


    // AUDIT mode — expose full governance data (intentional for compliance)
    if (responseStrategy?.mode === "AUDIT") {
      return {
        conversationText: certResult.formattedMarkdown || buildFallbackText(eio),
        isRejection: false,
      };
    }

    const isCommunicationDraft = !!(
      certResult.filteredResponse?.subject && certResult.filteredResponse?.body
    );

    const conversationText = buildConversationText(
      certResult.filteredResponse,
      isCommunicationDraft,
      eio
    );

    return { conversationText, isRejection: false };
  }

  /**
   * CXL-compliant fallback for when AI completions fail entirely.
   * Called from conversationManager before ERCE runs.
   */
  static buildAIFailureFallback(eio: EnterpriseIntelligenceObject): string {
    return buildFallbackText(eio);
  }
}
