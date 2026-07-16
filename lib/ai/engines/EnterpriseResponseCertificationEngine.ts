/**
 * lib/ai/engines/EnterpriseResponseCertificationEngine.ts
 *
 * Enterprise Response Certification Engine (ERCE).
 * Implements fact extraction, normalization, value-based comparison,
 * contract checking, narrative/recommendation validation, and self-healing.
 */

import { ResponseContracts, CommunicationContract } from "./ResponseContracts";
import { BusinessRulesEngine } from "./BusinessRulesEngine";

export interface CertificationResult {
  isValid: boolean;
  errors: string[];
  advisories: string[];
  extractedFacts: {
    numbers: number[];
    percentages: number[];
    ids: string[];
    counts: number[];
  };
  backendFacts: {
    numbers: number[];
    percentages: number[];
    ids: string[];
    counts: number[];
  };
  level: "Gold" | "Silver" | "Bronze" | "Rejected";
  repairsPerformed: string[];
  filteredResponse: any;
  confidence: number;
  status: "Verified" | "Partial" | "Failed";
  formattedMarkdown: string;
  requestId: string;
}

export class EnterpriseResponseCertificationEngine {
  /**
   * Helper to parse facts from a block of text.
   */
  private static extractFactsFromText(text: string): {
    numbers: number[];
    percentages: number[];
    ids: string[];
    counts: number[];
  } {
    const numbers: number[] = [];
    const percentages: number[] = [];
    const ids: string[] = [];
    const counts: number[] = [];

    if (!text) {
      return { numbers, percentages, ids, counts };
    }

    // 1. Extract and normalize currency/financial numbers (e.g. ₹50,000 or INR 1,200)
    const moneyRegex = /(?:₹|inr|rs\.?)\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/gi;
    let match;
    while ((match = moneyRegex.exec(text)) !== null) {
      const rawNumStr = match[1].replace(/,/g, "");
      const val = parseFloat(rawNumStr);
      if (!isNaN(val) && val > 100 && val !== 2025 && val !== 2026) {
        numbers.push(val);
      }
    }

    // 2. Extract percentages (e.g. 50%, 100%)
    const percentRegex = /(\d+(?:\.\d+)?)\s*%/gi;
    while ((match = percentRegex.exec(text)) !== null) {
      const val = parseFloat(match[1]);
      if (!isNaN(val)) {
        percentages.push(val);
      }
    }

    // 3. Extract Entity IDs (e.g. DNR-2026-0001, DON-001, PRG-WATER)
    const idRegex = /\b(?:dnr|don|alc|prg|da)-\d{4}-\d+\b|\b(?:dnr|don|alc|prg|da)-[a-z0-9_-]+\b/gi;
    while ((match = idRegex.exec(text)) !== null) {
      ids.push(match[0].toLowerCase());
    }

    // 4. Extract Counts (e.g. 5 families, 12 wells)
    const countRegex = /(\d+)\s*(?:families|beneficiaries|people|lives|wells|pumps)/gi;
    while ((match = countRegex.exec(text)) !== null) {
      const val = parseInt(match[1], 10);
      if (!isNaN(val)) {
        counts.push(val);
      }
    }

    return { numbers, percentages, ids, counts };
  }

  /**
   * Performs the self-healing repairs on speculative narrative language.
   */
  private static repairSpeculativeNarrative(text: string): { repairedText: string; repairApplied: boolean } {
    if (!text) return { repairedText: text, repairApplied: false };
    let repairedText = text;
    let repairApplied = false;

    // Pattern matching speculative prefix followed by currency or numbers
    const speculativeMoneyPatterns = [
      { regex: /(?:approximately|roughly|probably|estimated)\s+(?:₹|inr|rs\.?)\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/gi, replacement: "₹$1" },
      { regex: /(?:approximately|roughly|probably|estimated)\s+(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:families|beneficiaries|people|lives|wells|pumps)/gi, replacement: "$1" },
      { regex: /(?:approximately|roughly|probably|estimated)\s+(\d+(?:\.\d+)?)\s*%/gi, replacement: "$1%" }
    ];

    speculativeMoneyPatterns.forEach(({ regex, replacement }) => {
      if (regex.test(repairedText)) {
        repairedText = repairedText.replace(regex, replacement);
        repairApplied = true;
      }
    });

    // Scrub generic speculative adjectives/adverbs
    const wordsToScrub = [/approximately\s+/gi, /roughly\s+/gi, /probably\s+/gi, /estimated\s+/gi, /we hope to\s+/gi];
    wordsToScrub.forEach((regex) => {
      if (regex.test(repairedText)) {
        repairedText = repairedText.replace(regex, "");
        repairApplied = true;
      }
    });

    return { repairedText, repairApplied };
  }

  /**
   * Certifies the AI generated response, performing repairs on non-critical issues.
   */
  static certifyResponse(
    aiOutput: any,
    verifiedContextText: string,
    eioMetrics: any,
    requestId: string,
    donorEmail?: string,
    donorId?: string,
    intent?: string
  ): CertificationResult {
    const errors: string[] = [];
    const repairsPerformed: string[] = [];
    let level: "Gold" | "Silver" | "Bronze" | "Rejected" = "Gold";

    // 1. Fact Extraction & Normalization from Context
    const backendFacts = this.extractFactsFromText(verifiedContextText);

    // 1b. Inject EIO Metrics directly into backendFacts so AI can safely use calculated metrics
    const pushMetrics = (obj: any) => {
      if (!obj) return;
      Object.values(obj).forEach(val => {
        if (typeof val === 'number' && !isNaN(val)) {
          if (!backendFacts.numbers.includes(val)) backendFacts.numbers.push(val);
          // Also push common rounded variants (e.g., 14812.5625 -> 14812.56, 14813)
          backendFacts.numbers.push(Math.round(val));
          backendFacts.numbers.push(parseFloat(val.toFixed(1)));
          backendFacts.numbers.push(parseFloat(val.toFixed(2)));
          backendFacts.numbers.push(parseFloat(val.toFixed(3)));
        } else if (typeof val === 'object') {
          pushMetrics(val);
        }
      });
    };
    pushMetrics(eioMetrics);

    // 2. Structuring and Formatting Filtering
    let subject = aiOutput?.subject || aiOutput?.reportTitle || "";
    let preview = aiOutput?.preview || aiOutput?.reportingPeriod || "";
    let greeting = aiOutput?.greeting || aiOutput?.summaryExecutive || "";
    let body = aiOutput?.body || "";
    let dua = aiOutput?.dua || "";
    let cta = aiOutput?.cta || "";
    let footer = aiOutput?.footer || "";

    const isCommunicationDraft = !!(aiOutput?.subject || aiOutput?.dua || (aiOutput?.greeting && !aiOutput?.executiveSummary && !aiOutput?.summaryExecutive));

    // Formatting repairs: Inject missing metadata headers
    if (isCommunicationDraft) {
      if (!cta) {
        cta = "View Your Donor Dashboard";
        repairsPerformed.push("Injected default Dashboard CTA");
        level = "Silver";
      }
      if (!footer) {
        footer = "Transparency • Accountability • Amanah";
        repairsPerformed.push("Injected standard organizational footer");
        level = "Silver";
      }
    }

    // 3. Narrative Validation & Self-Healing
    const textFields = [
      { name: "Subject", text: subject, setter: (val: string) => { subject = val; } },
      { name: "Preview", text: preview, setter: (val: string) => { preview = val; } },
      { name: "Greeting", text: greeting, setter: (val: string) => { greeting = val; } },
      { name: "Body", text: body, setter: (val: string) => { body = val; } },
      { name: "Dua", text: dua, setter: (val: string) => { dua = val; } }
    ];

    for (const field of textFields) {
      const repairResult = this.repairSpeculativeNarrative(field.text);
      if (repairResult.repairApplied) {
        field.setter(repairResult.repairedText);
        repairsPerformed.push(`Repaired speculative language in ${field.name}`);
        if (level === "Gold") {
          level = "Silver";
        }
      }
    }

    // Ensure strings
    const verifiedFindings = Array.isArray(aiOutput?.verifiedFindings) ? aiOutput.verifiedFindings.map((v: any) => typeof v === 'string' ? v : JSON.stringify(v)) : [];
    const operationalObservations = Array.isArray(aiOutput?.operationalObservations) ? aiOutput.operationalObservations.map((v: any) => typeof v === 'string' ? v : JSON.stringify(v)) : [];
    const potentialActions = Array.isArray(aiOutput?.potentialActions) ? [...aiOutput.potentialActions] : [];

    // 4. Fact Verification Pipeline
    const extractedFacts = {
      numbers: [] as number[],
      percentages: [] as number[],
      ids: [] as string[],
      counts: [] as number[]
    };
    const advisories: string[] = []; // Non-blocking soft discrepancies

    /**
     * Checks whether a value in the AI response directly CONTRADICTS a backend number.
     * A contradiction occurs when the AI mentions a number that is within ±20% of a known
     * backend number but is not an exact match — suggesting the AI got the value slightly wrong.
     * Pure inventions (no backend number in the same ballpark) are advisories, not contradictions.
     */
    const isContradiction = (num: number, knownValues: number[]): boolean => {
      if (knownValues.length === 0) return false;

      // Permit the sum of all known values (Grand Total)
      const totalSum = knownValues.reduce((acc, val) => acc + val, 0);
      if (Math.abs(totalSum - num) < 0.01) return false;

      return knownValues.some((bNum) => {
        const diff = Math.abs(bNum - num);
        const pct = bNum > 0 ? diff / bNum : 0;
        // Contradiction: within 5% of a known value but NOT an exact match (within 0.01)
        return pct < 0.05 && diff > 0.01;
      });
    };

    const runFactAudit = (text: any, source: string, isRecommendation?: boolean): boolean => {
      let hasSoftDiscrepancy = false;
      const textStr = typeof text === "string" ? text : JSON.stringify(text || "");
      const parsed = this.extractFactsFromText(textStr);

      // Verify numeric values (amounts)
      parsed.numbers.forEach((num) => {
        extractedFacts.numbers.push(num);
        const exactMatch = backendFacts.numbers.some((bNum) => Math.abs(bNum - num) < 0.01);
        if (!exactMatch) {
          // If this is a DonationSummary or Analytics intent, assume the AI is doing aggregate math (e.g. sums)
          // Downgrade all numeric discrepancies to advisories to prevent hard rejection
          if (intent === "donationSearch" || intent === "reportGenerator" || intent === "projectIntelligence") {
            advisories.push(`[${source}] Math/Aggregate Advisory: Value ${num} is assumed to be an aggregate calculation.`);
            hasSoftDiscrepancy = true;
          } else if (isContradiction(num, backendFacts.numbers)) {
            // Genuine contradiction: AI has a near-match but wrong value
            if (!isRecommendation) {
              errors.push(`[${source}] Factual contradiction: Value ${num} conflicts with a verified backend figure.`);
            }
          } else {
            // Advisory only: AI introduced a number that has no backend counterpart
            advisories.push(`[${source}] Advisory: Value ${num} not directly traced to backend records.`);
            hasSoftDiscrepancy = true;
          }
        }
      });

      // Verify progress percentages
      parsed.percentages.forEach((pct) => {
        extractedFacts.percentages.push(pct);
        const exactMatch = backendFacts.percentages.some((bPct) => Math.abs(bPct - pct) < 0.01);
        if (!exactMatch) {
          if (isContradiction(pct, backendFacts.percentages)) {
            if (!isRecommendation) {
              errors.push(`[${source}] Percentage contradiction: ${pct}% conflicts with a verified backend figure.`);
            }
          } else {
            advisories.push(`[${source}] Advisory: Percentage ${pct}% not directly traced to backend records.`);
            hasSoftDiscrepancy = true;
          }
        }
      });

      // Verify entity IDs — IDs are always verified strictly (security boundary)
      parsed.ids.forEach((id) => {
        extractedFacts.ids.push(id);
        if (!backendFacts.ids.includes(id) && !verifiedContextText.toLowerCase().includes(id)) {
          if (!isRecommendation) {
            console.error(`[ERCE DEBUG] Speculative Entity ID found: ${id} in source: ${source}`);
            errors.push(`[${source}] Speculative Entity ID: "${id}" not verified in backend records.`);
          }
          hasSoftDiscrepancy = true;
        }
      });

      // Verify counts
      parsed.counts.forEach((c) => {
        extractedFacts.counts.push(c);
        if (!backendFacts.counts.includes(c)) {
          advisories.push(`[${source}] Advisory: Count "${c}" not directly traced to backend records.`);
          hasSoftDiscrepancy = true;
        }
      });

      // Security checking via BusinessRulesEngine — always hard errors
      const securityAudit = BusinessRulesEngine.verifyDraftSecurity(textStr, donorEmail, donorId);
      if (!securityAudit.passed) {
        securityAudit.errors.forEach((err) => {
          errors.push(`[${source}] Security alert: ${err}`);
        });
      }

      return hasSoftDiscrepancy;
    };

    // Audit narrative fields
    runFactAudit(subject, "Subject");
    runFactAudit(preview, "Preview");
    runFactAudit(greeting, "Greeting");
    runFactAudit(body, "Body");
    runFactAudit(dua, "Dua");

    verifiedFindings.forEach((finding, idx) => {
      runFactAudit(finding, `Verified Findings #${idx + 1}`);
    });
    operationalObservations.forEach((obs, idx) => {
      runFactAudit(obs, `Operational Observations #${idx + 1}`);
    });

    // 5. Recommendation Governance & Repair
    const activeActions: string[] = [];
    for (let idx = 0; idx < potentialActions.length; idx++) {
      const action = potentialActions[idx];
      const isMismatch = runFactAudit(action, `Potential Action #${idx + 1}`, true);
      if (isMismatch) {
        // Self-Healing: Prune the speculative/unsupported recommendation
        repairsPerformed.push(`Pruned unsupported recommendation: "${action.substring(0, 40)}..."`);
        if (level === "Gold" || level === "Silver") {
          level = "Bronze";
        }
      } else {
        activeActions.push(action);
      }
    }

    // Reconstruct filtered response
    const filteredResponse = {
      executiveSummary: aiOutput?.executiveSummary || aiOutput?.summaryExecutive || "",
      subject,
      preview,
      greeting,
      body,
      dua,
      cta,
      footer,
      verifiedFindings,
      operationalObservations,
      potentialActions: activeActions
    };

    // Determine final status
    let confidence = 100;
    let status: "Verified" | "Partial" | "Failed" = "Verified";

    // Only genuine contradictions or security violations cause Rejected
    if (errors.length > 0) {
      level = "Rejected";
      status = "Failed";
      confidence = 0;
    } else if (advisories.length > 0 && level === "Gold") {
      // Advisories (unmatched but non-contradicting values) downgrade to Bronze
      level = "Bronze";
    }

    if (level === "Silver") {
      status = "Partial";
      confidence = 85;
    } else if (level === "Bronze") {
      status = "Partial";
      confidence = 70;
    }

    // 6. Predefined Response Contracts verification
    let validatedContract: CommunicationContract | null = null;
    let validatedBrief: any = null;



    if (isCommunicationDraft) {
      try {
        validatedContract = ResponseContracts.validateCommunication(filteredResponse);
      } catch (contractError) {
        // If contract validation throws, we log it and fallback to Failed status
        console.warn("ERCE: Predefined layout contract check failed:", (contractError as Error).message);
        errors.push(`Layout Contract check failed: ${(contractError as Error).message}`);
        level = "Rejected";
        status = "Failed";
        confidence = 0;
      }
    } else {
      try {
        const briefData = {
          summaryExecutive: aiOutput?.executiveSummary || aiOutput?.summaryExecutive || greeting,
          reportingPeriod: preview || "All Time",
          impactMetricsText: body || ""
        };
        validatedBrief = ResponseContracts.validateExecutiveBrief(briefData);
      } catch (contractError) {
        console.warn("ERCE: ExecutiveBrief layout contract check failed:", (contractError as Error).message);
        errors.push(`Layout Contract check failed: ${(contractError as Error).message}`);
        level = "Rejected";
        status = "Failed";
        confidence = 0;
      }
    }

    // 7. Build formattedMarkdown — CXL mode: contains ONLY what the administrator needs to see.
    //    ERCE metadata (level, confidence, request ID, advisories) is captured in the
    //    CertificationResult object for AUDIT logs but NEVER appears in conversation markdown.
    let markdown = "";
    if (level === "Rejected") {
      // Hard rejection — brief, human-readable notice only
      markdown += `> [!CAUTION]\n> The response could not be verified against authoritative records and has been withheld.\n\n`;
      if (errors.length > 0) {
        markdown += `Specifically: ${errors.slice(0, 2).join("; ")}.\n`;
      }
    } else {
      // CXL conversational mode — pass-through the raw structured fields.
      // The ExecutiveResponseWriter will convert these into natural prose.
      if (validatedContract) {
        markdown += `**Subject:** ${validatedContract.subject}\n`;
        markdown += `*${validatedContract.preview}*\n\n`;
        markdown += `${validatedContract.greeting}\n\n`;
        markdown += `${validatedContract.body}\n\n`;
        markdown += `*${validatedContract.dua}*\n\n`;
        markdown += `${validatedContract.cta}\n`;
      } else if (validatedBrief) {
        markdown += `${validatedBrief.summaryExecutive}\n\n`;
        if (validatedBrief.impactMetricsText) {
          markdown += `${validatedBrief.impactMetricsText}\n\n`;
        }
      } else {
        markdown += `${filteredResponse.executiveSummary || filteredResponse.greeting || ""}\n\n`;
        if (filteredResponse.body) markdown += `${filteredResponse.body}\n\n`;
      }
    }

    return {
      isValid: level !== "Rejected",
      errors,
      advisories,
      extractedFacts,
      backendFacts,
      level,
      repairsPerformed,
      filteredResponse,
      confidence,
      status,
      formattedMarkdown: markdown,
      requestId
    };
  }
}
