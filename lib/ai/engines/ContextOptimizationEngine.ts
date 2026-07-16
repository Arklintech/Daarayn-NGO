/**
 * lib/ai/engines/ContextOptimizationEngine.ts
 *
 * Context Optimization Engine (COE) for Phase 3.
 * Prunes data context blocks to stay within token budgets and filter irrelevant documents.
 */

export interface OptimizedContext {
  contextText: string;
  tokenEstimate: number;
  filteredCount: number;
  originalCount: number;
}

export class ContextOptimizationEngine {
  /**
   * Constructs minimized, verified context from retrieved Firestore facts.
   * Strips out verbose properties, limits log arrays, and calculates approximate token usage.
   */
  static optimizeContext(facts: any[], maxTokens = 2000): OptimizedContext {
    if (!facts || facts.length === 0) {
      return {
        contextText: "No matching verified database records were retrieved.",
        tokenEstimate: 10,
        filteredCount: 0,
        originalCount: 0,
      };
    }

    const originalCount = facts.length;
    let filteredCount = 0;
    const lines: string[] = [];

    lines.push("=========================================");
    lines.push("OPTIMIZED VERIFIED DATABASE CONTEXT");
    lines.push("=========================================");
    lines.push("");

    // Grouping records
    const donations = facts.filter((f) => f.source === "donations" || f.source === "publicLedger");
    const donors = facts.filter((f) => f.source === "donors");
    const programs = facts.filter((f) => f.source === "programs");
    const communications = facts.filter((f) => f.source === "communications");

    // Helper: Approximate token count of a string (1 token ≈ 4 characters)
    const getTokens = (text: string) => Math.ceil(text.length / 4);

    let currentTokenCount = getTokens(lines.join("\n"));

    // 1. Group programs first (highly critical context)
    if (programs.length > 0) {
      lines.push("### COLLECTION: programs");
      programs.forEach((p) => {
        const item = p.data;
        const line = `- ID: ${item.id} | Title: ${item.title} | Goal: ₹${Number(item.amountRequired || 0).toLocaleString()} | Raised: ₹${Number(item.amountCollected || 0).toLocaleString()} | Progress: ${item.progress}% | Status: ${item.status || "Ongoing"}`;
        const lineTokens = getTokens(line);

        if (currentTokenCount + lineTokens < maxTokens) {
          lines.push(line);
          currentTokenCount += lineTokens;
          filteredCount++;

          // Limit milestones to the last 2 items for brevity
          if (Array.isArray(item.updates) && item.updates.length > 0) {
            lines.push("  * Caretaker Milestone Updates:");
            item.updates.slice(-2).forEach((u: any) => {
              lines.push(`    - [${u.date}] Title: ${u.title || "N/A"} | Progress: ${u.progress}% | Status: ${u.statement || ""}`);
            });
          }
        }
      });
      lines.push("");
    }

    // 2. Group donor information
    if (donors.length > 0) {
      lines.push("### COLLECTION: donors");
      donors.forEach((d) => {
        const item = d.data;
        // Don't leak private phones / sensitive auth configs
        const line = `- ID: ${item.id} | Name: ${item.name} | Total Donated: ₹${Number(item.totalAmountDonated || 0).toLocaleString()} | Count: ${item.totalDonations || 0} | Lang: ${item.preferredLanguage || "English"}`;
        const lineTokens = getTokens(line);

        if (currentTokenCount + lineTokens < maxTokens) {
          lines.push(line);
          currentTokenCount += lineTokens;
          filteredCount++;
        }
      });
      lines.push("");
    }

    // 3. Group donations (limit to recent 5 records to protect context token size)
    if (donations.length > 0) {
      lines.push("### COLLECTION: donations");
      // Sort to get newest donations first
      const sortedDonations = [...donations].sort((a, b) => {
        const d1 = new Date(a.data?.createdAt || a.data?.date || 0);
        const d2 = new Date(b.data?.createdAt || b.data?.date || 0);
        return d2.getTime() - d1.getTime();
      });

      sortedDonations.slice(0, 5).forEach((don) => {
        const item = don.data;
        const line = `- ID: ${item.id || don.id} | Date: ${item.date} | Donor: ${item.donor || item.donorName || "Anonymous"} | Amount: ${item.currency || "INR"} ${Number(item.amount || 0).toLocaleString()} | Status: ${item.status || "pending"} | Allocation: ${item.allocationStatus || "pending"}`;
        const lineTokens = getTokens(line);

        if (currentTokenCount + lineTokens < maxTokens) {
          lines.push(line);
          currentTokenCount += lineTokens;
          filteredCount++;
        }
      });
      lines.push("");
    }

    // 4. Group recent communication logs (limit to 3 logs)
    if (communications.length > 0) {
      lines.push("### COLLECTION: communications");
      communications.slice(0, 3).forEach((c) => {
        const item = c.data;
        const line = `- Date: ${item.sentDate || item.date} | Recipient: ${item.donorEmail} | Subject: ${item.subject} | Delivery: ${item.deliveryStatus}`;
        const lineTokens = getTokens(line);

        if (currentTokenCount + lineTokens < maxTokens) {
          lines.push(line);
          currentTokenCount += lineTokens;
          filteredCount++;
        }
      });
      lines.push("");
    }

    return {
      contextText: lines.join("\n"),
      tokenEstimate: currentTokenCount,
      filteredCount,
      originalCount,
    };
  }
}
