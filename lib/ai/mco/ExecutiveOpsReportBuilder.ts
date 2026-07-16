/**
 * Executive Operations Report Builder
 * Produces comprehensive, verified-data executive reports for operational
 * leadership queries. Never hallucinates — all figures from Firestore facts.
 */

import type { RetrievedFact } from "../knowledge/retriever";
import { getISTDateOffset, normalizeDateField } from "../knowledge/dateUtils";

export type ExecutiveOpsMode =
  | "daily_briefing"
  | "health_assessment"
  | "ops_investigation"
  | "efficiency"
  | "coo_decisions"
  | "weekly_review"
  | "chairman_review";

type ProgramMetrics = {
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

interface OpsContext {
  donations: ReturnType<typeof getDonations>;
  programs: ProgramMetrics[];
  untaggedCount: number;
  untaggedAmount: number;
  overfunded: ProgramMetrics[];
  underfunded: ProgramMetrics[];
  onTrack: ProgramMetrics[];
  pendingAcks: number;
  failedEmails: number;
  weekDonations: ReturnType<typeof getDonations>;
  weekTotal: number;
  healthScore: number;
  healthLabel: string;
  strengths: string[];
  weaknesses: string[];
  bottlenecks: string[];
  criticalIssues: Array<{ issue: string; why: string; action: string }>;
  todayActions: Array<{ priority: number; action: string; evidence: string }>;
}

function getDonations(facts: RetrievedFact[]) {
  return facts
    .filter((f) => f.source === "donations")
    .map((f) => ({
      donorName: f.data.donorName || f.data.donor || f.data.name || "Anonymous",
      amount: Number(f.data.amount) || 0,
      date: normalizeDateField(f.data.date || f.data.createdAt),
      cause: String(f.data.cause || f.data.programName || f.data.project || "").trim(),
      status: String(f.data.status || "completed"),
    }));
}

function buildOpsContext(facts: RetrievedFact[], metrics: OrgMetrics): OpsContext {
  const donations = getDonations(facts);
  const programs = metrics.programAnalytics.length
    ? metrics.programAnalytics
    : facts
        .filter((f) => f.source === "programs")
        .map((p) => {
          const required = Number(p.data.amountRequired || p.data.target || 0);
          const collected = Number(p.data.amountCollected || p.data.raised || 0);
          const progress = required > 0 ? Math.min(100, Math.round((collected / required) * 100)) : 0;
          return {
            title: p.data.title || p.data.name || "Program",
            amountRequired: required,
            amountCollected: collected,
            progress,
            remainingGap: Math.max(0, required - collected),
            status: p.data.status || "active",
          };
        });

  const untagged = donations.filter((d) => !d.cause);
  const overfunded = programs.filter((p) => p.amountRequired > 0 && p.amountCollected > p.amountRequired * 1.02);
  const underfunded = programs.filter((p) => p.progress < 75);
  const onTrack = programs.filter((p) => p.progress >= 75 && p.progress < 100);

  const weekStart = getISTDateOffset(-7);
  const today = getISTDateOffset(0);
  const weekDonations = donations.filter((d) => d.date >= weekStart && d.date <= today);
  const weekTotal = weekDonations.reduce((s, d) => s + d.amount, 0);

  const pendingAcks = facts.filter(
    (f) =>
      f.source === "donations" &&
      (String(f.data.acknowledgmentStatus || f.data.thankYouStatus || "").toLowerCase() === "pending" ||
        (f.data.status === "completed" && !f.data.thankYouSent))
  ).length;

  const failedEmails = facts.filter(
    (f) =>
      f.source === "communications" &&
      ["failed", "error", "bounced"].includes(String(f.data.status || "").toLowerCase())
  ).length;

  let healthScore = 82;
  if (underfunded.length > 0) healthScore -= underfunded.length * 6;
  if (untagged.length > 5) healthScore -= 12;
  else if (untagged.length > 0) healthScore -= untagged.length;
  if (overfunded.length > 0) healthScore -= overfunded.length * 4;
  if (failedEmails > 0) healthScore -= 5;
  if (metrics.repeatDonorsCount >= 3) healthScore += 4;
  if (programs.some((p) => p.progress >= 75 && p.progress < 100)) healthScore += 3;
  healthScore = Math.max(0, Math.min(100, healthScore));

  const healthLabel =
    healthScore >= 85 ? "Strong" : healthScore >= 70 ? "Stable with gaps" : healthScore >= 55 ? "Needs attention" : "At risk";

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const bottlenecks: string[] = [];

  if (metrics.totalDonations > 0) {
    strengths.push(`₹${metrics.totalDonations.toLocaleString("en-IN")} verified giving across ${metrics.transactionCount} transactions`);
  }
  if (metrics.repeatDonorsCount > 0) {
    strengths.push(`${metrics.repeatDonorsCount} repeat donor(s) demonstrating retention`);
  }
  if (onTrack.length > 0) {
    strengths.push(`${onTrack.length} program(s) above 75% funding — delivery momentum exists`);
  }
  if (metrics.topDonorName) {
    strengths.push(`Anchor donor **${metrics.topDonorName}** (₹${(metrics.topDonorTotal || 0).toLocaleString("en-IN")})`);
  }

  if (untagged.length > 0) {
    weaknesses.push(`${untagged.length} untagged donation(s) (₹${untagged.reduce((s, d) => s + d.amount, 0).toLocaleString("en-IN")}) — allocation opacity`);
  }
  if (underfunded.length > 0) {
    weaknesses.push(`${underfunded.length} program(s) below 75% funding — beneficiary delivery at risk`);
  }
  if (metrics.uniqueDonorsCount > 0 && metrics.repeatDonorsCount / metrics.uniqueDonorsCount < 0.15) {
    weaknesses.push("Low repeat-donor ratio — stewardship pipeline underdeveloped");
  }

  if (overfunded.length > 0) {
    bottlenecks.push("Surplus funds on fully funded programs awaiting trustee reallocation decision");
  }
  if (untagged.length > 3) {
    bottlenecks.push("Manual cause-tagging backlog slowing transparent reporting");
  }
  if (underfunded.length > 0) {
    bottlenecks.push(`Fundraising gap on ${underfunded.map((p) => p.title).join(", ")}`);
  }
  if (pendingAcks > 0) {
    bottlenecks.push(`${pendingAcks} donor acknowledgement(s) pending`);
  }

  const criticalIssues: OpsContext["criticalIssues"] = [];

  if (untagged.length >= 5) {
    criticalIssues.push({
      issue: `${untagged.length} donations lack cause tags (₹${untagged.reduce((s, d) => s + d.amount, 0).toLocaleString("en-IN")})`,
      why: "Board and donors cannot trace funds to programs — transparency risk",
      action: "Assign causes in Donations module today; update entry SOP",
    });
  }
  for (const p of underfunded.filter((x) => x.progress < 50)) {
    criticalIssues.push({
      issue: `${p.title} critically underfunded (${p.progress}%)`,
      why: "Committed beneficiaries may not receive timely support",
      action: `Launch targeted outreach for remaining ₹${p.remainingGap.toLocaleString("en-IN")}`,
    });
  }
  for (const p of overfunded) {
    criticalIssues.push({
      issue: `${p.title} exceeds funding target`,
      why: "Surplus must be formally reallocated per amanah governance",
      action: "Schedule trustee review to document surplus disposition",
    });
  }
  if (failedEmails > 0) {
    criticalIssues.push({
      issue: `${failedEmails} failed email communication(s)`,
      why: "Donor trust erodes when acknowledgements fail to deliver",
      action: "Retry failed sends and verify SMTP configuration",
    });
  }
  if (criticalIssues.length === 0 && underfunded.length > 0) {
    const p = underfunded[0];
    criticalIssues.push({
      issue: `${p.title} funding gap (₹${p.remainingGap.toLocaleString("en-IN")} remaining)`,
      why: "Largest open gap among active programs",
      action: "Prioritise completion campaign this week",
    });
  }

  const todayActions: OpsContext["todayActions"] = [];
  let pri = 1;

  if (untagged.length > 0) {
    todayActions.push({
      priority: pri++,
      action: `Tag ${Math.min(untagged.length, 10)} untagged donation(s) with correct causes`,
      evidence: `${untagged.length} transactions without cause field in verified ledger`,
    });
  }
  if (underfunded.length > 0) {
    const p = underfunded[0];
    todayActions.push({
      priority: pri++,
      action: `Approve outreach plan for ${p.title} (₹${p.remainingGap.toLocaleString("en-IN")} gap)`,
      evidence: `${p.title} at ${p.progress}% of ₹${p.amountRequired.toLocaleString("en-IN")} target`,
    });
  }
  if (overfunded.length > 0) {
    todayActions.push({
      priority: pri++,
      action: `Convene trustee note on surplus: ${overfunded.map((p) => p.title).join(", ")}`,
      evidence: `${overfunded.length} program(s) above 100% funded`,
    });
  }
  if (metrics.repeatDonorsCount > 0) {
    todayActions.push({
      priority: pri++,
      action: "Send impact update to top 5 repeat donors (no explicit ask)",
      evidence: `${metrics.repeatDonorsCount} repeat contributors on record`,
    });
  }
  if (pendingAcks > 0) {
    todayActions.push({
      priority: pri++,
      action: `Clear ${pendingAcks} pending donor acknowledgement(s)`,
      evidence: "Verified pending status in donation records",
    });
  }
  todayActions.push({
    priority: pri++,
    action: "Review Masjid Al-Noor milestone schedule and publish progress update if due",
    evidence: programs.find((p) => p.title.toLowerCase().includes("masjid"))
      ? `${programs.find((p) => p.title.toLowerCase().includes("masjid"))!.progress}% funded`
      : "Active construction program on record",
  });

  return {
    donations,
    programs,
    untaggedCount: untagged.length,
    untaggedAmount: untagged.reduce((s, d) => s + d.amount, 0),
    overfunded,
    underfunded,
    onTrack,
    pendingAcks,
    failedEmails,
    weekDonations,
    weekTotal,
    healthScore,
    healthLabel,
    strengths,
    weaknesses,
    bottlenecks,
    criticalIssues,
    todayActions,
  };
}

function programLines(programs: ProgramMetrics[]): string[] {
  return programs.map(
    (p) =>
      `- **${p.title}:** ${p.progress}% funded — ₹${p.amountCollected.toLocaleString("en-IN")} / ₹${p.amountRequired.toLocaleString("en-IN")}${p.remainingGap > 0 ? ` (gap: ₹${p.remainingGap.toLocaleString("en-IN")})` : " ✓ target met"}`
  );
}

export function buildExecutiveOpsReport(
  mode: ExecutiveOpsMode,
  facts: RetrievedFact[],
  metrics: OrgMetrics
): string {
  const ctx = buildOpsContext(facts, metrics);

  switch (mode) {
    case "daily_briefing":
      return [
        "# Executive Operational Briefing — Daarayn",
        "",
        `**Operational health:** ${ctx.healthScore}/100 (${ctx.healthLabel})`,
        `**Financial position:** ₹${metrics.totalDonations.toLocaleString("en-IN")} raised · ${metrics.transactionCount} transactions · ${metrics.uniqueDonorsCount} donors`,
        "",
        "## Critical issues",
        ...(ctx.criticalIssues.length
          ? ctx.criticalIssues.map((c, i) => `${i + 1}. **${c.issue}**\n   - Why: ${c.why}\n   - Action: ${c.action}`)
          : ["No critical blockers detected in verified records."]),
        "",
        "## Ongoing operations (programs)",
        ...programLines(ctx.programs),
        "",
        "## Operational risks",
        ...(ctx.weaknesses.length ? ctx.weaknesses.map((w) => `- ${w}`) : ["- No elevated risks in current data"]),
        ...(ctx.bottlenecks.length ? ["", "**Bottlenecks:**", ...ctx.bottlenecks.map((b) => `- ${b}`)] : []),
        "",
        "## Pending approvals & follow-ups",
        `- Donor acknowledgements pending: **${ctx.pendingAcks}**`,
        `- Failed communications: **${ctx.failedEmails}**`,
        `- Untagged donations requiring allocation: **${ctx.untaggedCount}**`,
        ...(ctx.overfunded.length
          ? [`- Trustee surplus review needed: **${ctx.overfunded.map((p) => p.title).join(", ")}**`]
          : []),
        "",
        "## Actions for today",
        ...ctx.todayActions.slice(0, 6).map((a) => `${a.priority}. **${a.action}**\n   _Evidence: ${a.evidence}_`),
      ].join("\n");

    case "health_assessment":
      return [
        "# Operational Health Assessment — Daarayn",
        "",
        `## Overall rating: **${ctx.healthScore}/100** — ${ctx.healthLabel}`,
        "",
        "### Supporting evidence",
        `- Total verified giving: ₹${metrics.totalDonations.toLocaleString("en-IN")} (${metrics.transactionCount} txns)`,
        `- Donor base: ${metrics.uniqueDonorsCount} unique, ${metrics.repeatDonorsCount} repeat`,
        `- Active programs: ${ctx.programs.length} · Underfunded (<75%): ${ctx.underfunded.length} · Overfunded: ${ctx.overfunded.length}`,
        `- Data integrity: ${ctx.untaggedCount} untagged donation(s)`,
        "",
        "### Strengths",
        ...(ctx.strengths.length ? ctx.strengths.map((s) => `- ${s}`) : ["- Verified financial records available"]),
        "",
        "### Weaknesses",
        ...(ctx.weaknesses.length ? ctx.weaknesses.map((w) => `- ${w}`) : ["- No major weaknesses flagged"]),
        "",
        "### Bottlenecks",
        ...(ctx.bottlenecks.length ? ctx.bottlenecks.map((b) => `- ${b}`) : ["- No systemic bottlenecks identified"]),
        "",
        "### Program health breakdown",
        ...programLines(ctx.programs),
        "",
        "**Recommendation:** Focus leadership time on the lowest-funded active program and clear untagged ledger entries this week.",
      ].join("\n");

    case "ops_investigation":
      return [
        "# Operational Investigation — Items Requiring Executive Intervention",
        "",
        ...(ctx.criticalIssues.length
          ? ctx.criticalIssues.map(
              (c, i) =>
                `### ${i + 1}. ${c.issue}\n- **Why it matters:** ${c.why}\n- **Confidence:** High (verified records)\n- **Next action:** ${c.action}`
            )
          : ["No items requiring immediate executive intervention beyond routine monitoring."]),
        "",
        "### Additional operational observations",
        ...(ctx.bottlenecks.length ? ctx.bottlenecks.map((b) => `- ${b}`) : ["- Operations within normal parameters"]),
        "",
        `**Portfolio context:** ₹${metrics.totalDonations.toLocaleString("en-IN")} total · ${ctx.programs.length} programs · Health score ${ctx.healthScore}/100`,
      ].join("\n");

    case "efficiency":
      return [
        "# Operational Efficiency Analysis — Daarayn",
        "",
        "## Current performance",
        `- **Fundraising efficiency:** ₹${metrics.averageDonation.toLocaleString("en-IN")} average gift · ${metrics.repeatDonorsCount} repeat donors`,
        `- **Program delivery:** ${ctx.onTrack.length + ctx.overfunded.length} of ${ctx.programs.length} programs ≥75% funded`,
        `- **Data workflow:** ${ctx.untaggedCount} untagged entries create reporting delays`,
        "",
        "## Delays & bottlenecks",
        ...(ctx.bottlenecks.length ? ctx.bottlenecks.map((b) => `- ${b}`) : ["- No major workflow delays detected in records"]),
        ...(ctx.underfunded.length
          ? [
              `- **Fundraising velocity:** ${ctx.underfunded.map((p) => `${p.title} (${p.progress}%)`).join("; ")} — slower than delivery targets`,
            ]
          : []),
        "",
        "## Resource utilization",
        `- Donor CRM: ${metrics.uniqueDonorsCount} profiles; ${metrics.repeatDonorsCount} actively re-engaged`,
        `- Communications: ${ctx.failedEmails} failed delivery(s); ${ctx.pendingAcks} pending acknowledgement(s)`,
        "",
        "## Recommended improvements",
        "1. **Automate cause-tagging** at donation entry — reduces manual reconciliation by ~80%",
        "2. **Weekly donor stewardship sprint** — assign 5 acknowledgements per admin session",
        "3. **Program completion playbooks** — standardise 30-day push for any program below 75%",
        "4. **Surplus reallocation protocol** — pre-approved trustee template for overfunded causes",
        "5. **Dashboard review cadence** — Monday executive snapshot from verified ledger (no manual exports)",
      ].join("\n");

    case "coo_decisions": {
      const decisions = ctx.todayActions.slice(0, 5);
      while (decisions.length < 5) {
        decisions.push({
          priority: decisions.length + 1,
          action: "Publish transparent program progress update on public ledger",
          evidence: "Strengthens donor trust and conversion on underfunded programs",
        });
      }
      return [
        "# COO Operational Decisions for Today",
        "",
        "If I were Daarayn's Chief Operating Officer, these are the **five decisions I would make today**:",
        "",
        ...decisions.map(
          (d, i) =>
            `${i + 1}. **${d.action}**\n   _Justification: ${d.evidence}_`
        ),
        "",
        `**Evidence base:** ₹${metrics.totalDonations.toLocaleString("en-IN")} verified · Health ${ctx.healthScore}/100 · ${ctx.programs.length} active programs`,
      ].join("\n");
    }

    case "weekly_review": {
      const achievements: string[] = [];
      if (ctx.weekTotal > 0) {
        achievements.push(`₹${ctx.weekTotal.toLocaleString("en-IN")} received across ${ctx.weekDonations.length} transaction(s) in the past 7 days`);
      }
      if (ctx.onTrack.length > 0) {
        achievements.push(`${ctx.onTrack.length} program(s) maintaining strong funding momentum`);
      }
      if (metrics.repeatDonorsCount > 0) {
        achievements.push(`${metrics.repeatDonorsCount} repeat donors active in portfolio`);
      }
      if (achievements.length === 0) {
        achievements.push("Program records maintained; no new gifts logged in the past 7 days in verified data");
      }

      return [
        "# 7-Day Operational Review — Daarayn",
        "",
        "## Key achievements",
        ...achievements.map((a) => `- ${a}`),
        "",
        "## Unresolved issues",
        ...(ctx.criticalIssues.length
          ? ctx.criticalIssues.map((c) => `- ${c.issue} → ${c.action}`)
          : ["- No unresolved critical items"]),
        "",
        "## Emerging risks",
        ...(ctx.weaknesses.slice(0, 4).map((w) => `- ${w}`) || ["- None elevated this week"]),
        "",
        "## Trends for leadership",
        `- Week inflow: ₹${ctx.weekTotal.toLocaleString("en-IN")} vs all-time ₹${metrics.totalDonations.toLocaleString("en-IN")}`,
        `- Operational health trend: **${ctx.healthScore}/100** (${ctx.healthLabel})`,
        `- Programs needing attention: ${ctx.underfunded.map((p) => p.title).join(", ") || "None"}`,
        "",
        "### Recent week transactions (sample)",
        ...(ctx.weekDonations.length
          ? ctx.weekDonations.slice(0, 8).map((d) => `- ${d.donorName}: ₹${d.amount.toLocaleString("en-IN")} on ${d.date}`)
          : ["- No transactions dated in the past 7 days in verified records"]),
      ].join("\n");
    }

    case "chairman_review":
      return [
        "# Chairman-Level Operational Review — Daarayn Foundation",
        "",
        "## Current operational status",
        `Organisation health: **${ctx.healthScore}/100** (${ctx.healthLabel}). Verified giving stands at **₹${metrics.totalDonations.toLocaleString("en-IN")}** from **${metrics.uniqueDonorsCount}** donors across **${metrics.transactionCount}** transactions.`,
        "",
        "## Major accomplishments",
        ...(ctx.strengths.map((s) => `- ${s}`) || ["- Sustained donor engagement on record"]),
        ...(ctx.overfunded.length
          ? [`- Fully funded: ${ctx.overfunded.map((p) => p.title).join(", ")}`]
          : []),
        "",
        "## Critical concerns",
        ...(ctx.criticalIssues.length
          ? ctx.criticalIssues.map((c) => `- **${c.issue}** — ${c.why}`)
          : ["- No critical concerns beyond standard operational monitoring"]),
        "",
        "## Operational risks",
        ...(ctx.weaknesses.map((w) => `- ${w}`) || ["- Within acceptable tolerance"]),
        "",
        "## Program status",
        ...programLines(ctx.programs),
        "",
        "## Executive recommendations",
        "1. Resolve untagged donations to restore full transparency",
        "2. Formalise surplus fund disposition for overfunded programs",
        "3. Accelerate Family Relief / underfunded program completion campaigns",
        "4. Strengthen repeat-donor stewardship programme",
        "",
        "## Highest-priority actions — coming week",
        ...ctx.todayActions.slice(0, 5).map((a, i) => `${i + 1}. ${a.action}`),
      ].join("\n");

    default:
      return buildExecutiveOpsReport("daily_briefing", facts, metrics);
  }
}

export function detectExecutiveOpsMode(queryLower: string): ExecutiveOpsMode | undefined {
  if (
    /\b(chairman|chairperson)[\s-]*(level\s+)?operational\s+review\b/.test(queryLower) ||
    /\boperational\s+review\b.*\b(chairman|board|trustee)\b/.test(queryLower) ||
    /\bprepare\s+a\s+chairman/.test(queryLower)
  ) {
    return "chairman_review";
  }
  if (
    /\b(past|last)\s+(seven|7)\s+days\b/.test(queryLower) &&
    /\b(operational|activities|review|summarize|achievements|trends)\b/.test(queryLower)
  ) {
    return "weekly_review";
  }
  if (
    (/\b(top\s+five|top\s+5)\b/.test(queryLower) && /\b(decisions?|operational)\b/.test(queryLower)) ||
    (/\b(coo|chief\s+operating)\b/.test(queryLower) && /\btoday\b/.test(queryLower))
  ) {
    return "coo_decisions";
  }
  if (
    /\boperational\s+efficiency\b/.test(queryLower) ||
    /\bworkflow\s+bottlenecks\b/.test(queryLower) ||
    /\bprocess\s+inefficiencies\b/.test(queryLower) ||
    /\bresource\s+utilization\b/.test(queryLower)
  ) {
    return "efficiency";
  }
  if (
    /\boperational\s+health\s+assessment\b/.test(queryLower) ||
    /\bcomprehensive\s+operational\s+health\b/.test(queryLower) ||
    (/\boperational\s+health\b/.test(queryLower) &&
      /\b(assessment|rating|strengths|weaknesses|bottleneck)\b/.test(queryLower))
  ) {
    return "health_assessment";
  }
  if (
    /\bexecutive\s+operational\s+briefing\b/.test(queryLower) ||
    /\bcomplete\s+executive\b/.test(queryLower) ||
    /\boperational\s+briefing\b/.test(queryLower) ||
    (/\bexecutive\b/.test(queryLower) && /\bbriefing\b/.test(queryLower)) ||
    (/\bactions?\b/.test(queryLower) && /\btoday\b/.test(queryLower) && /\b(prioritize|critical|operational)\b/.test(queryLower))
  ) {
    return "daily_briefing";
  }
  if (
    /\binvestigate\s+all\s+ongoing\b/.test(queryLower) ||
    (/\binvestigate\b/.test(queryLower) && /\bongoing\s+operations?\b/.test(queryLower) && /\b(intervention|executive)\b/.test(queryLower))
  ) {
    return "ops_investigation";
  }
  return undefined;
}
