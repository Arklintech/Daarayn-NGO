/**
 * Executive Intelligence Builder — deterministic executive-grade replies
 * synthesized from verified organizational data. Used when admins ask strategic,
 * analytical, or cross-domain questions that must not fall through to wrong
 * donor lookups or generic "insufficient data" responses.
 */

import type { ExtractedEntities } from "../engines/IntentClassificationEngine";
import type { RetrievedFact } from "../knowledge/retriever";
import { normalizeDateField } from "../knowledge/dateUtils";

type ProgramMetrics = {
  projectId: string;
  title: string;
  amountRequired: number;
  amountCollected: number;
  progress: number;
  remainingGap: number;
  status: string;
};

type OrgMetrics = {
  totalDonations: number;
  transactionCount: number;
  averageDonation: number;
  largestDonation: number;
  uniqueDonorsCount: number;
  repeatDonorsCount: number;
  topDonorName?: string;
  topDonorTotal?: number;
  programAnalytics: ProgramMetrics[];
};

function getDonations(facts: RetrievedFact[]) {
  return facts
    .filter((f) => f.source === "donations")
    .map((f) => ({
      ...f.data,
      donorName: f.data.donorName || f.data.donor || f.data.name || "Anonymous",
      amount: Number(f.data.amount) || 0,
      date: normalizeDateField(f.data.date || f.data.createdAt),
      cause: String(f.data.cause || f.data.programName || f.data.project || "").trim(),
    }));
}

function getPrograms(facts: RetrievedFact[]) {
  return facts.filter((f) => f.source === "programs").map((f) => f.data);
}

function matchProgramNeedle(needle: string, name: string, category: string): boolean {
  const n = needle.toLowerCase();
  const nm = name.toLowerCase();
  const cat = category.toLowerCase();
  return (
    nm.includes(n) ||
    cat.includes(n) ||
    n.includes(nm) ||
    (n.includes("orphan") && (nm.includes("orphan") || cat.includes("orphan") || nm.includes("care"))) ||
    (n.includes("orphanage") && (nm.includes("orphan") || cat.includes("orphan"))) ||
    (n.includes("masjid") && nm.includes("masjid")) ||
    (n.includes("family") && (nm.includes("family") || nm.includes("relief"))) ||
    (n.includes("quran") && (nm.includes("quran") || nm.includes("qur") || nm.includes("memor")))
  );
}

export function buildProgramDonationReply(entities: ExtractedEntities, facts: RetrievedFact[]): string {
  const donations = getDonations(facts);
  const programs = getPrograms(facts);
  const needle = (entities.programName || "orphan").toLowerCase();

  const matchedPrograms = programs.filter((p) =>
    matchProgramNeedle(needle, String(p.title || p.name || ""), String(p.category || p.type || p.cause || ""))
  );

  const programTitles = matchedPrograms.map((p) => String(p.title || p.name || "").toLowerCase());
  const filtered = donations.filter((d) => {
    const cause = d.cause.toLowerCase();
    if (!cause) return false;
    return (
      cause.includes(needle) ||
      matchProgramNeedle(needle, cause, cause) ||
      programTitles.some((t) => cause.includes(t) || t.includes(cause))
    );
  });

  const programLabel =
    matchedPrograms[0]?.title || matchedPrograms[0]?.name || entities.programName || "the specified program";
  const programCollected = matchedPrograms.reduce((s, p) => s + Number(p.amountCollected || p.raised || 0), 0);

  if (filtered.length === 0 && programCollected === 0) {
    return (
      `I found no verified donations explicitly tagged to **${programLabel}** in transaction records. ` +
      `The program shows **₹${programCollected.toLocaleString("en-IN")}** recorded in program funding totals. ` +
      `If donations were received without a cause tag, they may appear only in org-wide totals — consider tagging future entries to this cause.`
    );
  }

  const txnTotal = filtered.reduce((s, d) => s + d.amount, 0);
  const lines = [
    `**Donations for ${programLabel}:**`,
    `- Tagged transactions: **₹${txnTotal.toLocaleString("en-IN")}** across **${filtered.length}** gift${filtered.length === 1 ? "" : "s"}`,
  ];

  if (programCollected > 0) {
    lines.push(`- Program funding ledger: **₹${programCollected.toLocaleString("en-IN")}** collected toward this cause`);
  }

  lines.push("", "**Recent contributions:**");
  for (const d of filtered.slice(0, 8)) {
    lines.push(`- **${d.donorName}** — ₹${d.amount.toLocaleString("en-IN")} on ${d.date || "unknown date"}${d.cause ? ` (${d.cause})` : ""}`);
  }
  if (filtered.length > 8) {
    lines.push(`- …and ${filtered.length - 8} more transaction(s).`);
  }

  return lines.join("\n");
}

export function buildAllocationAuditReply(facts: RetrievedFact[]): string {
  const donations = getDonations(facts);
  const programs = getPrograms(facts);

  const causeTotals = new Map<string, number>();
  let untagged = 0;
  let untaggedAmount = 0;

  for (const d of donations) {
    const cause = d.cause;
    if (!cause) {
      untagged += 1;
      untaggedAmount += d.amount;
      continue;
    }
    const key = cause.toLowerCase();
    causeTotals.set(key, (causeTotals.get(key) || 0) + d.amount);
  }

  const lines = [
    "**Fund allocation review** — are donations being directed to the right causes?",
    "",
  ];

  if (programs.length > 0) {
    lines.push("**Active programs vs. tagged inflows:**");
    for (const p of programs) {
      const title = String(p.title || p.name || "Program");
      const collected = Number(p.amountCollected || p.raised || 0);
      const required = Number(p.amountRequired || p.target || 0);
      const progress = required > 0 ? Math.min(100, Math.round((collected / required) * 100)) : 0;

      const taggedIn = Array.from(causeTotals.entries())
        .filter(([c]) => matchProgramNeedle(title, c, c))
        .reduce((s, [, amt]) => s + amt, 0);

      const status =
        progress >= 100
          ? "Fully funded — consider closing or redirecting new gifts"
          : progress >= 75
            ? "On track — monitor final milestone delivery"
            : progress >= 40
              ? "Moderate gap — outreach recommended"
              : "Underfunded — priority for donor communication";

      lines.push(
        `- **${title}**: ₹${collected.toLocaleString("en-IN")} / ₹${required.toLocaleString("en-IN")} (${progress}%) · ${status}`
      );
      if (taggedIn > 0 && Math.abs(taggedIn - collected) > collected * 0.15) {
        lines.push(`  - Note: ₹${taggedIn.toLocaleString("en-IN")} in tagged transactions may not fully reconcile with program ledger.`);
      }
    }
  }

  if (untagged > 0) {
    lines.push(
      "",
      `**Attention:** **${untagged}** transaction(s) (₹${untaggedAmount.toLocaleString("en-IN")}) have no cause tag. These should be allocated to the correct program to maintain transparency.`
    );
  }

  const overfunded = programs.filter((p) => {
    const req = Number(p.amountRequired || 0);
    const col = Number(p.amountCollected || 0);
    return req > 0 && col > req * 1.05;
  });

  if (overfunded.length > 0) {
    lines.push("", "**Overfunded programs** (collected above target):");
    for (const p of overfunded) {
      lines.push(`- **${p.title || p.name}** — consider surplus reallocation per board policy`);
    }
  }

  lines.push(
    "",
    "**Recommendation:** Review untagged gifts first, then confirm surplus on fully funded causes is reallocated or held per trustee policy."
  );

  return lines.join("\n");
}

export function buildExecutiveDonorAnalysisReply(facts: RetrievedFact[]): string {
  const donations = getDonations(facts);
  const donorRecords = facts.filter((f) => f.source === "donors").map((f) => f.data);

  const totals = new Map<string, { name: string; total: number; count: number; email?: string; lastDate?: string }>();

  for (const d of donorRecords) {
    const name = d.name || d.donorName || "Unknown";
    totals.set(name.toLowerCase(), {
      name,
      total: Number(d.totalAmountDonated || d.totalDonated || 0),
      count: Number(d.totalDonations || 0),
      email: d.email,
    });
  }

  for (const d of donations) {
    const key = d.donorName.toLowerCase();
    const cur = totals.get(key) || { name: d.donorName, total: 0, count: 0, lastDate: undefined as string | undefined };
    cur.total += d.amount;
    cur.count += 1;
    if (d.date && (!cur.lastDate || d.date > cur.lastDate)) cur.lastDate = d.date;
    totals.set(key, cur);
  }

  const donors = Array.from(totals.values()).sort((a, b) => b.total - a.total);

  if (donors.length === 0) {
    return "No verified donor records are available for executive analysis.";
  }

  const lines = [
    `**Donor base executive analysis** — ${donors.length} contributor(s) on record`,
    "",
  ];

  const attention: Array<{ donor: typeof donors[0]; reason: string; action: string }> = [];

  for (const d of donors.slice(0, 10)) {
    if (d.total >= 50000) {
      attention.push({
        donor: d,
        reason: `High-value contributor (₹${d.total.toLocaleString("en-IN")}) — relationship stewardship is critical`,
        action: "Schedule a personal impact call or handwritten acknowledgement within 7 days",
      });
    } else if (d.count >= 3) {
      attention.push({
        donor: d,
        reason: `Repeat donor (${d.count} gifts) — strong retention signal worth nurturing`,
        action: "Send an exclusive program update and invite to a beneficiary story briefing",
      });
    } else if (d.total >= 10000 && d.count === 1) {
      attention.push({
        donor: d,
        reason: `Single large gift (₹${d.total.toLocaleString("en-IN")}) — conversion to recurring support is an opportunity`,
        action: "Follow up with a tailored proposal for monthly sponsorship",
      });
    }
  }

  if (attention.length === 0 && donors[0]) {
    attention.push({
      donor: donors[0],
      reason: "Top contributor by cumulative giving",
      action: "Maintain regular personalised acknowledgements",
    });
  }

  lines.push("**Donors requiring executive attention:**");
  attention.slice(0, 5).forEach((a, i) => {
    lines.push(
      `${i + 1}. **${a.donor.name}** — ₹${a.donor.total.toLocaleString("en-IN")} (${a.donor.count} gift${a.donor.count === 1 ? "" : "s"})`,
      `   - **Why:** ${a.reason}`,
      `   - **Follow-up:** ${a.action}${a.donor.email ? ` · ${a.donor.email}` : ""}`
    );
  });

  const repeatRate = donors.length > 0 ? Math.round((donors.filter((d) => d.count > 1).length / donors.length) * 100) : 0;
  lines.push(
    "",
    `**Portfolio snapshot:** ${donors.filter((d) => d.count > 1).length} repeat donor(s) · ${repeatRate}% repeat rate · Top donor: **${donors[0].name}** (₹${donors[0].total.toLocaleString("en-IN")})`
  );

  return lines.join("\n");
}

export function buildProactiveRiskBriefReply(facts: RetrievedFact[], metrics: OrgMetrics): string {
  const programs = getPrograms(facts);
  const donations = getDonations(facts);
  const risks: string[] = [];

  const untagged = donations.filter((d) => !d.cause).length;
  if (untagged > 0) {
    risks.push(
      `**Untagged donations:** ${untagged} transaction(s) lack a cause assignment — this weakens transparency and board reporting.`
    );
  }

  const overfunded = programs.filter((p) => {
    const req = Number(p.amountRequired || 0);
    const col = Number(p.amountCollected || 0);
    return req > 0 && col >= req;
  });
  if (overfunded.length > 0) {
    risks.push(
      `**Overfunded programs:** ${overfunded.map((p) => p.title || p.name).join(", ")} — surplus funds need a trustee decision on reallocation.`
    );
  }

  const underfunded = programs.filter((p) => {
    const req = Number(p.amountRequired || 0);
    const col = Number(p.amountCollected || 0);
    return req > 0 && col < req * 0.5;
  });
  if (underfunded.length > 0) {
    risks.push(
      `**Delivery risk:** ${underfunded.map((p) => p.title || p.name).join(", ")} below 50% funding — beneficiary commitments may slip.`
    );
  }

  if (metrics.repeatDonorsCount < Math.max(2, Math.floor(metrics.uniqueDonorsCount * 0.2))) {
    risks.push(
      "**Donor retention:** Repeat donor count is low relative to unique donors — acquisition may be outpacing stewardship."
    );
  }

  const failedComms = facts.filter(
    (f) =>
      f.source === "communications" &&
      ["failed", "error", "bounced"].includes(String(f.data.status || "").toLowerCase())
  );
  if (failedComms.length > 0) {
    risks.push(`**Communication failures:** ${failedComms.length} email(s) failed delivery — donor trust may be affected.`);
  }

  if (risks.length === 0) {
    return (
      "**Proactive executive alert:** No critical anomalies detected in verified records. " +
      `Organisation has received ₹${metrics.totalDonations.toLocaleString("en-IN")} across ${metrics.transactionCount} transactions with ${metrics.uniqueDonorsCount} unique donors. ` +
      "Continue monitoring program gaps and acknowledgement timeliness."
    );
  }

  return [
    "**Things you should know — proactive executive risks:**",
    "",
    ...risks.map((r, i) => `${i + 1}. ${r}`),
    "",
    "**Suggested priority:** Address untagged funds and underfunded programs before launching new campaigns.",
  ].join("\n");
}

export function buildStrategicActionsReply(facts: RetrievedFact[], metrics: OrgMetrics): string {
  const programs = metrics.programAnalytics;
  const underfunded = [...programs].filter((p) => p.progress < 75).sort((a, b) => a.progress - b.progress);
  const overfunded = programs.filter((p) => p.progress >= 100);

  const actions: string[] = [];

  if (underfunded.length > 0) {
    const target = underfunded[0];
    actions.push(
      `**1. Close the funding gap on ${target.title}** — at ${target.progress}% (₹${target.remainingGap.toLocaleString("en-IN")} remaining), launch a 30-day completion campaign targeting repeat donors and local corporates.`
    );
  } else {
    actions.push(
      "**1. Consolidate delivery on fully funded programs** — shift leadership focus from fundraising to milestone execution and beneficiary reporting."
    );
  }

  if (metrics.repeatDonorsCount > 0) {
    actions.push(
      `**2. Activate repeat donor stewardship** — ${metrics.repeatDonorsCount} repeat contributor(s) represent your most reliable pipeline; send personalised impact updates without an explicit ask this month.`
    );
  } else {
    actions.push(
      "**2. Build a repeat-giving pathway** — introduce monthly sponsorship tiers on your two highest-impact programs."
    );
  }

  if (overfunded.length > 0) {
    actions.push(
      `**3. Trustee review of surplus funds** — ${overfunded.map((p) => p.title).join(", ")} exceed targets; document reallocation decisions for board transparency.`
    );
  } else {
    actions.push(
      "**3. Operational readiness audit** — verify volunteer capacity, compliance document expiry dates, and acknowledgement backlog before the next fundraising push."
    );
  }

  return [
    "**Top 3 strategic actions for the next 30 days** (based on verified Daarayn data):",
    "",
    ...actions,
    "",
    `**Context:** ₹${metrics.totalDonations.toLocaleString("en-IN")} raised · ${metrics.uniqueDonorsCount} donors · ${programs.length} active program(s).`,
  ].join("\n");
}

export function buildFinancialInvestigationReply(facts: RetrievedFact[], metrics: OrgMetrics): string {
  const donations = getDonations(facts);
  const findings: Array<{ finding: string; why: string; confidence: string; action: string }> = [];

  const amounts = donations.map((d) => d.amount).filter((a) => a > 0);
  const avg = amounts.length ? amounts.reduce((s, a) => s + a, 0) / amounts.length : 0;
  const largeThreshold = Math.max(avg * 5, 50000);
  const largeGifts = donations.filter((d) => d.amount >= largeThreshold);

  if (largeGifts.length > 0 && largeGifts.length <= 3) {
    findings.push({
      finding: `${largeGifts.length} unusually large gift(s) above ₹${largeThreshold.toLocaleString("en-IN")}`,
      why: "Concentration risk — a small number of gifts may skew monthly totals",
      confidence: "High — verified transaction amounts",
      action: "Confirm each large gift is receipted, acknowledged, and cause-tagged",
    });
  }

  const donorCounts = new Map<string, number>();
  for (const d of donations) {
    const k = d.donorName.toLowerCase();
    donorCounts.set(k, (donorCounts.get(k) || 0) + 1);
  }
  const rapidRepeat = Array.from(donorCounts.entries()).filter(([, c]) => c >= 5);
  if (rapidRepeat.length > 0) {
    findings.push({
      finding: `${rapidRepeat.length} donor(s) with 5+ transactions in the dataset`,
      why: "Could indicate testing entries, duplicate logging, or exceptional engagement",
      confidence: "Medium — pattern detected in records",
      action: "Spot-check ledger entries for duplicates",
    });
  }

  const untagged = donations.filter((d) => !d.cause);
  if (untagged.length >= 3) {
    findings.push({
      finding: `${untagged.length} donations without cause tags (₹${untagged.reduce((s, d) => s + d.amount, 0).toLocaleString("en-IN")})`,
      why: "Allocation opacity — funds cannot be traced to programs",
      confidence: "High — missing cause field",
      action: "Assign causes this week; update data entry SOP",
    });
  }

  const nameVariants = new Map<string, Set<string>>();
  for (const d of donations) {
    const base = d.donorName.toLowerCase().replace(/\s*\(.*\)/, "").trim();
    if (!nameVariants.has(base)) nameVariants.set(base, new Set());
    nameVariants.get(base)!.add(d.donorName);
  }
  const duplicates = Array.from(nameVariants.values()).filter((s) => s.size > 1);
  if (duplicates.length > 0) {
    findings.push({
      finding: `Possible duplicate donor identities (e.g. name spelling variants)`,
      why: "CRM fragmentation reduces stewardship accuracy",
      confidence: "Medium — heuristic on donor name variants",
      action: "Merge donor profiles in the Donor Management module",
    });
  }

  if (findings.length === 0) {
    return (
      "**Financial & operational pattern review:** No unusual patterns requiring immediate executive action were detected in verified records. " +
      `Totals: ₹${metrics.totalDonations.toLocaleString("en-IN")} across ${metrics.transactionCount} transactions. Confidence: **High** for aggregate figures; continue routine monthly reconciliation.`
    );
  }

  const lines = ["**Investigation summary** — patterns that deserve your attention:", ""];
  findings.forEach((f, i) => {
    lines.push(
      `### ${i + 1}. ${f.finding}`,
      `- **Why it matters:** ${f.why}`,
      `- **Confidence:** ${f.confidence}`,
      `- **Action:** ${f.action}`,
      ""
    );
  });

  return lines.join("\n").trim();
}

export function buildVolunteerSummaryReply(facts: RetrievedFact[]): string {
  const volunteers = facts.filter((f) => f.source === "volunteers").map((f) => f.data);

  if (volunteers.length === 0) {
    return "No volunteer records were found in verified Daarayn data. Check the Volunteer Management module for registrations.";
  }

  const active = volunteers.filter((v) => {
    const s = String(v.status || v.availability || "").toLowerCase();
    return s === "active" || s === "engaged" || v.isActive === true || v.active === true;
  });

  const assigned = volunteers.filter(
    (v) => v.assignedProject || v.projectId || (Array.isArray(v.projects) && v.projects.length > 0)
  );

  const lines = [
    `**Volunteer capacity:** **${volunteers.length}** registered · **${active.length || assigned.length}** actively engaged · **${volunteers.length - (active.length || assigned.length)}** unassigned or on leave`,
  ];

  if (assigned.length > 0) {
    lines.push("", "**Assigned volunteers:**");
    assigned.slice(0, 8).forEach((v) => {
      const name = v.name || v.fullName || "Volunteer";
      const project = v.assignedProject || v.projectName || v.projects?.[0] || "project";
      lines.push(`- **${name}** → ${project}`);
    });
  }

  lines.push("", "**Recommendation:** Review unassigned volunteers for onboarding to underfunded programs this week.");

  return lines.join("\n");
}

export function buildGeneralExecutiveReply(metrics: OrgMetrics): string {
  const progLines =
    metrics.programAnalytics.length > 0
      ? metrics.programAnalytics
          .slice(0, 4)
          .map((p) => `- **${p.title}:** ${p.progress}% funded (₹${p.amountCollected.toLocaleString("en-IN")} / ₹${p.amountRequired.toLocaleString("en-IN")})`)
          .join("\n")
      : "- No active program records loaded";

  return [
    "**Organizational snapshot** (verified records):",
    `- **Donations:** ₹${metrics.totalDonations.toLocaleString("en-IN")} across ${metrics.transactionCount} transactions`,
    `- **Donors:** ${metrics.uniqueDonorsCount} unique · ${metrics.repeatDonorsCount} repeat`,
    metrics.topDonorName ? `- **Top donor:** ${metrics.topDonorName} (₹${(metrics.topDonorTotal || 0).toLocaleString("en-IN")})` : "",
    "",
    "**Programs:**",
    progLines,
    "",
    "Ask me for a specific donor, cause, date range, or executive briefing for deeper analysis.",
  ]
    .filter(Boolean)
    .join("\n");
}
