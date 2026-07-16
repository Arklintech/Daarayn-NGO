/**
 * lib/ai/mco/TargetedResponseBuilder.ts
 *
 * Builds precise deterministic replies for entity-specific queries.
 * Used when aggregate templates would be irrelevant.
 */

import type { ExtractedEntities } from "../engines/IntentClassificationEngine";
import type { RetrievedFact } from "../knowledge/retriever";
import { getISTToday, isDateInMonth, isDateOnDay, normalizeDateField } from "../knowledge/dateUtils";

function normalizeDonation(data: any) {
  return {
    ...data,
    donorName: data.donorName || data.donor || data.name || "Anonymous",
    amount: Number(data.amount) || 0,
    date: normalizeDateField(data.date || data.createdAt),
  };
}

function getDonations(facts: RetrievedFact[]) {
  return facts.filter((f) => f.source === "donations").map((f) => normalizeDonation(f.data));
}

function matchDonorName(recordName: string, target: string): boolean {
  const a = String(recordName || "").toLowerCase().trim();
  const b = target.toLowerCase().trim();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function buildDonorSpecificReply(
  donorName: string,
  facts: RetrievedFact[]
): string | null {
  const donations = facts
    .filter((f) => f.source === "donations")
    .map((f) => f.data)
    .filter((d) => matchDonorName(d.donorName || d.name || "", donorName));

  const donorRecords = facts
    .filter((f) => f.source === "donors")
    .map((f) => f.data)
    .filter((d) => matchDonorName(d.name || "", donorName));

  if (donations.length === 0 && donorRecords.length === 0) {
    return `I reviewed verified Daarayn records but found no donations or donor profile linked to **${donorName}**. If this donor used a different spelling or email, please share it and I will search again.`;
  }

  const total = donations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const lines: string[] = [];

  if (donations.length > 0) {
    lines.push(
      `**${donorName}** has contributed **₹${total.toLocaleString("en-IN")}** across **${donations.length}** verified transaction${donations.length === 1 ? "" : "s"}.`
    );
    const recent = donations.slice(0, 5);
    for (const d of recent) {
      const amt = Number(d.amount) || 0;
      const date = d.date || "date not recorded";
      const status = d.status || "completed";
      lines.push(`- ₹${amt.toLocaleString("en-IN")} on ${date} (${status})`);
    }
    if (donations.length > 5) {
      lines.push(`- …and ${donations.length - 5} earlier transaction(s) on record.`);
    }
  }

  if (donorRecords.length > 0) {
    const profile = donorRecords[0];
    if (profile.email) lines.push(`\nContact on file: ${profile.email}`);
    if (profile.phone) lines.push(`Phone: ${profile.phone}`);
  }

  return lines.join("\n");
}

export function buildPendingDonorsReply(facts: RetrievedFact[]): string {
  const pendingComms = facts
    .filter((f) => f.source === "communications")
    .map((f) => f.data)
    .filter((c) => String(c.status || "").toLowerCase() === "pending");

  const pendingDonations = facts
    .filter((f) => f.source === "donations")
    .map((f) => f.data)
    .filter(
      (d) =>
        String(d.acknowledgmentStatus || d.thankYouStatus || "").toLowerCase() === "pending" ||
        (d.status === "completed" && !d.receiptSent && !d.thankYouSent)
    );

  const lines: string[] = [];

  if (pendingComms.length === 0 && pendingDonations.length === 0) {
    return "All verified donor acknowledgements are up to date. No pending thank-you messages or donor follow-ups were found in the communications queue.";
  }

  lines.push("The following donor follow-ups are **pending** in verified records:\n");

  const seen = new Set<string>();
  for (const c of pendingComms.slice(0, 10)) {
    const name = c.donorName || c.recipientName || c.donorId || "Unknown donor";
    if (seen.has(name)) continue;
    seen.add(name);
    lines.push(`- **${name}** — ${c.subject || c.type || "acknowledgement"} (${c.date || "queued"})`);
  }

  for (const d of pendingDonations.slice(0, 10)) {
    const name = d.donorName || "Anonymous";
    if (seen.has(name)) continue;
    seen.add(name);
    const amt = Number(d.amount) || 0;
    lines.push(`- **${name}** — ₹${amt.toLocaleString("en-IN")} donation awaiting acknowledgement (${d.date || "recent"})`);
  }

  return lines.join("\n");
}

export function buildProgramSpecificReply(
  entities: ExtractedEntities,
  facts: RetrievedFact[]
): string | null {
  const programs = facts.filter((f) => f.source === "programs").map((f) => f.data);
  if (programs.length === 0) {
    return "I could not locate verified program records matching your request. Please specify the project name or ID.";
  }

  let matched = programs;
  if (entities.programName) {
    const needle = entities.programName.toLowerCase();
    matched = programs.filter((p) => {
      const name = String(p.name || p.title || "").toLowerCase();
      const category = String(p.category || p.type || p.cause || "").toLowerCase();
      return (
        name.includes(needle) ||
        category.includes(needle) ||
        needle.includes(name) ||
        (needle === "education" && (name.includes("school") || name.includes("orphan") || category.includes("education")))
      );
    });
  }

  if (matched.length === 0 && programs.length > 0 && entities.programName) {
    matched = programs.slice(0, 3);
  }

  if (matched.length === 0) {
    return `The requested program **${entities.programName}** was not found in active Daarayn records.`;
  }

  return matched
    .map((p) => {
      const title = p.title || p.name || "Program";
      const required = Number(p.amountRequired || p.target || 0);
      const collected = Number(p.amountCollected || p.raised || 0);
      const progress = required > 0 ? Math.min(100, Math.round((collected / required) * 100)) : 0;
      const gap = Math.max(0, required - collected);
      return `**${title}** is **${progress}%** funded — ₹${collected.toLocaleString("en-IN")} of ₹${required.toLocaleString("en-IN")} target (gap: ₹${gap.toLocaleString("en-IN")}). Status: ${p.status || "active"}.`;
    })
    .join("\n\n");
}

export function buildDonationTimeframeReply(
  entities: ExtractedEntities,
  facts: RetrievedFact[]
): string {
  const donations = getDonations(facts);
  const today = getISTToday();
  const monthPrefix = today.substring(0, 7);

  let filtered = donations;
  let label = "all time";

  if (entities.timeframe === "today") {
    filtered = donations.filter((d) => isDateOnDay(d.date, today));
    label = "today";
  } else if (entities.timeframe === "yesterday") {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = normalizeDateField(yesterday);
    filtered = donations.filter((d) => isDateOnDay(d.date, yStr));
    label = "yesterday";
  } else if (entities.timeframe === "month") {
    filtered = donations.filter((d) => isDateInMonth(d.date, monthPrefix));
    label = "this month";
  } else if (entities.timeframe === "week") {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const start = normalizeDateField(weekAgo);
    filtered = donations.filter((d) => d.date >= start && d.date <= today);
    label = "the past 7 days";
  }

  const total = filtered.reduce((s, d) => s + d.amount, 0);

  if (filtered.length === 0) {
    return `No verified donations were recorded for **${label}** (${today} IST). If you expected activity today, confirm entries exist in the Donations or Public Ledger modules.`;
  }

  const lines = [
    `**Donations for ${label}:** ₹${total.toLocaleString("en-IN")} across **${filtered.length}** transaction${filtered.length === 1 ? "" : "s"}.`,
    "",
  ];

  for (const d of filtered.slice(0, 15)) {
    lines.push(`- **${d.donorName}** — ₹${d.amount.toLocaleString("en-IN")} on ${d.date || "unknown date"}${d.cause ? ` (${d.cause})` : ""}`);
  }
  if (filtered.length > 15) {
    lines.push(`- …and ${filtered.length - 15} more transaction(s).`);
  }

  return lines.join("\n");
}

export function buildDonorListReply(facts: RetrievedFact[]): string {
  const donorRecords = facts.filter((f) => f.source === "donors").map((f) => f.data);
  const donations = getDonations(facts);

  const donorMap = new Map<string, { name: string; total: number; count: number; email?: string }>();

  for (const d of donorRecords) {
    const name = d.name || d.donorName || "Unknown";
    donorMap.set(name.toLowerCase(), {
      name,
      total: Number(d.totalAmountDonated || d.totalDonated || 0),
      count: Number(d.totalDonations || 0),
      email: d.email,
    });
  }

  for (const d of donations) {
    const name = d.donorName;
    const key = name.toLowerCase();
    const existing = donorMap.get(key) || { name, total: 0, count: 0 };
    existing.total += d.amount;
    existing.count += 1;
    donorMap.set(key, existing);
  }

  const donors = Array.from(donorMap.values()).sort((a, b) => b.total - a.total);

  if (donors.length === 0) {
    return "No donor records were found in verified Daarayn data.";
  }

  const lines = [`**Donor directory** — ${donors.length} contributor(s) on record:\n`];
  donors.forEach((d, i) => {
    lines.push(`${i + 1}. **${d.name}** — ₹${d.total.toLocaleString("en-IN")} (${d.count} gift${d.count === 1 ? "" : "s"})${d.email ? ` · ${d.email}` : ""}`);
  });
  return lines.join("\n");
}

export function buildRepeatDonorsReply(facts: RetrievedFact[], count = 3): string {
  const donations = getDonations(facts);
  const totals = new Map<string, { name: string; total: number; count: number }>();

  for (const d of donations) {
    const key = d.donorName.toLowerCase();
    const cur = totals.get(key) || { name: d.donorName, total: 0, count: 0 };
    cur.total += d.amount;
    cur.count += 1;
    totals.set(key, cur);
  }

  const repeat = Array.from(totals.values())
    .filter((d) => d.count > 1)
    .sort((a, b) => b.total - a.total);

  if (repeat.length === 0) {
    return "No repeat donors were found in verified transaction records.";
  }

  const show = repeat.slice(0, count);
  const lines = [`**Repeat contributors** (${show.length} of ${repeat.length} total):\n`];
  show.forEach((d, i) => {
    lines.push(`${i + 1}. **${d.name}** — ₹${d.total.toLocaleString("en-IN")} across ${d.count} donations`);
  });
  return lines.join("\n");
}

export function buildAllCausesReply(facts: RetrievedFact[]): string {
  const programs = facts.filter((f) => f.source === "programs").map((f) => f.data);
  if (programs.length === 0) {
    return "No active causes or programs were found in verified records.";
  }

  const lines = [`**Daarayn causes & programs** (${programs.length} active):\n`];
  programs.forEach((p, i) => {
    const title = p.title || p.name || "Unnamed Cause";
    const required = Number(p.amountRequired || p.target || 0);
    const collected = Number(p.amountCollected || p.raised || 0);
    const progress = required > 0 ? Math.min(100, Math.round((collected / required) * 100)) : 0;
    const desc = p.description || p.summary || "";
    lines.push(
      `### ${i + 1}. ${title}`,
      `- **Funding:** ₹${collected.toLocaleString("en-IN")} / ₹${required.toLocaleString("en-IN")} (${progress}%)`,
      `- **Status:** ${p.status || "Active"}`,
      desc ? `- **About:** ${desc.substring(0, 200)}${desc.length > 200 ? "…" : ""}` : "",
      ""
    );
  });
  return lines.join("\n").trim();
}

export function buildEmailStatsReply(facts: RetrievedFact[], failedOnly = false): string {
  const emails = facts.filter((f) => f.source === "communications").map((f) => f.data);

  if (emails.length === 0) {
    return "No email communication records were found in the system.";
  }

  const failed = emails.filter((e) => ["failed", "error", "bounced"].includes(String(e.status || "").toLowerCase()));
  const sent = emails.filter((e) => {
    const s = String(e.status || "").toLowerCase();
    return ["sent", "delivered", "completed", "success", "ok"].includes(s) || !e.status;
  });
  const pending = emails.filter((e) => String(e.status || "").toLowerCase() === "pending");

  if (failedOnly) {
    if (failed.length === 0) {
      return "There are **no failed emails** in verified communication records. All logged sends completed successfully.";
    }
    const lines = [`**Failed emails:** ${failed.length}\n`];
    failed.slice(0, 10).forEach((e) => {
      lines.push(`- ${e.subject || e.type || "Email"} → ${e.recipient || e.donorName || "unknown"} (${e.date || "no date"})`);
    });
    return lines.join("\n");
  }

  const lines = [
    `**Email communications summary:**`,
    `- Total logged: **${emails.length}**`,
    `- Successfully sent: **${sent.length}**`,
    `- Pending: **${pending.length}**`,
    `- Failed: **${failed.length}**`,
  ];

  if (sent.length > 0) {
    lines.push("", "**Recent sends:**");
    sent.slice(0, 5).forEach((e) => {
      lines.push(`- ${e.subject || "Message"} → ${e.recipient || e.donorName || "recipient"} (${e.date || ""})`);
    });
  }

  return lines.join("\n");
}

export function buildProjectAdviceReply(entities: ExtractedEntities, facts: RetrievedFact[]): string {
  const programs = facts.filter((f) => f.source === "programs").map((f) => f.data);
  let target = programs[0];
  if (entities.programName) {
    const needle = entities.programName.toLowerCase();
    target = programs.find((p) => String(p.title || p.name || "").toLowerCase().includes(needle)) || target;
  }

  if (!target) {
    return "I need a specific project name to recommend completion strategies. Which cause should we focus on?";
  }

  const title = target.title || target.name || "this project";
  const required = Number(target.amountRequired || target.target || 0);
  const collected = Number(target.amountCollected || target.raised || 0);
  const gap = Math.max(0, required - collected);
  const progress = required > 0 ? Math.min(100, Math.round((collected / required) * 100)) : 0;

  return [
    `**Strategic recommendations to complete ${title}** (currently ${progress}% funded, ₹${gap.toLocaleString("en-IN")} gap):`,
    "",
    "1. **Targeted donor outreach** — Share a progress update with top recurring donors who have supported similar causes.",
    "2. **Milestone campaign** — Launch a 30-day completion push highlighting the remaining ₹" + gap.toLocaleString("en-IN") + " needed and specific beneficiary impact.",
    "3. **Transparency update** — Publish a ledger-linked progress report to build trust and encourage social sharing.",
    "4. **Corporate matching** — Approach 2–3 local business sponsors for a matching gift during the final funding phase.",
    "",
    `Would you like me to draft a donor update email for **${title}**?`,
  ].join("\n");
}

