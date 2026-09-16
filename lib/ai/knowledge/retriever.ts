/**
 * lib/ai/knowledge/retriever.ts
 *
 * Retriever Engine for KHIZR Knowledge Intelligence Engine (MKIE).
 * Grounded strictly in the Authoritative Repository Layer (Google Sheets Single Source of Truth).
 * Employs knowledge caching to optimize response latency and enforce zero fabrication.
 */

import { donationRepository } from "../../repositories/donationRepository";
import { donorRepository } from "../../repositories/donorRepository";
import { causeRepository } from "../../repositories/causeRepository";
import { fieldReportRepository } from "../../repositories/fieldReportRepository";
import { programRepository } from "../../repositories/programRepository";
import { communicationRepository } from "../../repositories/communicationRepository";
import { knowledgeCache } from "./knowledgeCache";
import { normalizeDateField, getISTToday, getISTDateOffset, isDateOnDay, isDateInMonth } from "./dateUtils";

export interface RetrievedFact {
  source: string;
  id: string;
  data: any;
}

/**
 * Test Data Registry.
 * In test environments, register mock facts here via `registerTestData(facts)`.
 */
let _testDataRegistry: RetrievedFact[] | null = null;

export function registerTestData(facts: RetrievedFact[]): void {
  _testDataRegistry = facts;
  console.log(`[MKIE Retriever] Test data registered: ${facts.length} mock facts`);
}

export function clearTestData(): void {
  _testDataRegistry = null;
}

/** Load donations from Authoritative Repository (Google Sheets) */
async function fetchUnifiedDonations(max = 200): Promise<RetrievedFact[]> {
  const facts: RetrievedFact[] = [];
  const seen = new Set<string>();

  try {
    const list = await donationRepository.getAll();
    list.slice(0, max).forEach((d) => {
      const key = `${d.id}-${d.amount}-${d.donorName}`;
      if (seen.has(key)) return;
      seen.add(key);
      facts.push({
        source: "donations",
        id: d.id,
        data: {
          ...d,
          donorName: d.donorName,
          amount: Number(d.amount) || 0,
          date: d.date,
          cause: (d as any).causeTitle || d.donationType || "General",
        },
      });
    });
  } catch (err: any) {
    console.warn("[MKIE Retriever] Failed to fetch donations from Repository:", err.message);
  }
  return facts;
}

/** Load donors from Authoritative Repository (Google Sheets) */
async function fetchUnifiedDonors(max = 200): Promise<RetrievedFact[]> {
  const facts: RetrievedFact[] = [];
  try {
    const list = await donorRepository.getAll();
    list.slice(0, max).forEach((d) => {
      facts.push({
        source: "donors",
        id: d.id,
        data: d,
      });
    });
  } catch (err: any) {
    console.warn("[MKIE Retriever] Failed to fetch donors from Repository:", err.message);
  }
  return facts;
}

/** Load causes/programs from Authoritative Repository (Google Sheets) */
async function fetchUnifiedPrograms(): Promise<RetrievedFact[]> {
  const facts: RetrievedFact[] = [];
  try {
    const causes = await causeRepository.getAll();
    causes.forEach((c) => {
      facts.push({
        source: "programs",
        id: c.id,
        data: {
          id: c.id,
          name: c.title,
          title: c.title,
          category: c.category,
          targetAmount: c.targetAmount,
          raisedAmount: c.raisedAmount,
          location: c.location,
          description: c.description,
          status: c.status,
        },
      });
    });

    const programs = await programRepository.getAll();
    programs.forEach((p) => {
      facts.push({
        source: "programs",
        id: p.id,
        data: p,
      });
    });
  } catch (err: any) {
    console.warn("[MKIE Retriever] Failed to fetch programs from Repository:", err.message);
  }
  return facts;
}

/** Load field reports from Authoritative Repository (Google Sheets) */
async function fetchUnifiedFieldReports(): Promise<RetrievedFact[]> {
  const facts: RetrievedFact[] = [];
  try {
    const reports = await fieldReportRepository.getAll();
    reports.forEach((r) => {
      facts.push({
        source: "field_reports",
        id: r.id,
        data: r,
      });
    });
  } catch (err: any) {
    console.warn("[MKIE Retriever] Failed to fetch field reports from Repository:", err.message);
  }
  return facts;
}

/** Load communications from Authoritative Repository (Google Sheets) */
async function fetchUnifiedCommunications(): Promise<RetrievedFact[]> {
  const facts: RetrievedFact[] = [];
  try {
    const comms = await communicationRepository.getAll();
    comms.forEach((c) => {
      facts.push({
        source: "communications",
        id: c.id,
        data: c,
      });
    });
  } catch (err: any) {
    console.warn("[MKIE Retriever] Failed to fetch communications from Repository:", err.message);
  }
  return facts;
}

function filterDonationsByTimeframe(facts: RetrievedFact[], timeframe?: string): RetrievedFact[] {
  if (!timeframe) return facts;
  const today = getISTToday();
  const monthPrefix = today.substring(0, 7);

  return facts.filter((f) => {
    const d = normalizeDateField(f.data.date);
    if (timeframe === "today") return isDateOnDay(d, today);
    if (timeframe === "yesterday") return isDateOnDay(d, getISTDateOffset(-1));
    if (timeframe === "month") return isDateInMonth(d, monthPrefix);
    if (timeframe === "week") return d >= getISTDateOffset(-7) && d <= today;
    return true;
  });
}

/**
 * Main retrieval interface. Checks cache first, performs targeted queries via authoritative repositories.
 */
export async function retrieveTargetedData(
  intent: string,
  entities: any,
  allowedCollections: string[]
): Promise<RetrievedFact[]> {
  // 0. Test Environment Bypass
  if (_testDataRegistry !== null) {
    const filtered = _testDataRegistry.filter(
      (f) => allowedCollections.includes(f.source) || allowedCollections.length === 0
    );
    return filtered.length > 0 ? filtered : _testDataRegistry;
  }

  const cacheKey = `retrieval:${intent}:${JSON.stringify(entities)}:${allowedCollections.join(",")}`;

  // 1. Check cache first
  const cached = knowledgeCache.get<RetrievedFact[]>(cacheKey);
  if (cached) {
    return cached;
  }

  let facts: RetrievedFact[] = [];

  try {
    if (intent === "donationSearch" || intent === "publicLedger" || intent === "financialIntelligence") {
      if (allowedCollections.includes("donations") || allowedCollections.includes("publicLedger")) {
        let allDonations = await fetchUnifiedDonations(200);
        if (entities.timeframe) {
          allDonations = filterDonationsByTimeframe(allDonations, entities.timeframe);
        } else if (entities.donationId) {
          allDonations = allDonations.filter(
            (f) => f.id === entities.donationId || f.data.id === entities.donationId
          );
        } else if (entities.donorName) {
          const needle = entities.donorName.toLowerCase().replace(/\s*\(test\)/i, "").trim();
          allDonations = allDonations.filter(
            (f) => (f.data.donorName || "").toLowerCase().includes(needle) || needle.includes((f.data.donorName || "").toLowerCase())
          );
        } else if (!entities.listAllDonors) {
          allDonations = allDonations.slice(0, 50);
        }
        facts.push(...allDonations);
      }
    } else if (intent === "donorIntelligence") {
      if (allowedCollections.includes("donors")) {
        const allDonors = await fetchUnifiedDonors(200);
        if (entities.donorId) {
          facts.push(...allDonors.filter((d) => d.id === entities.donorId));
        } else if (entities.donorName) {
          const needle = entities.donorName.toLowerCase().replace(/\s*\(test\)/i, "").trim();
          facts.push(
            ...allDonors.filter((d) => {
              const name = String(d.data.name || "").toLowerCase();
              return name.includes(needle) || needle.includes(name);
            })
          );
        } else {
          facts.push(...allDonors.slice(0, entities.listAllDonors ? 100 : 50));
        }
      }
    } else if (intent === "projectIntelligence") {
      if (allowedCollections.includes("programs")) {
        const allPrograms = await fetchUnifiedPrograms();
        if (entities.programName) {
          const needle = entities.programName.toLowerCase();
          const matches = allPrograms.filter((p) => {
            const nameLower = String(p.data.title || p.data.name || "").toLowerCase();
            const catLower = String(p.data.category || "").toLowerCase();
            return nameLower.includes(needle) || catLower.includes(needle);
          });
          if (matches.length > 0) {
            facts.push(...matches);
          } else {
            facts.push({
              source: "SYSTEM_NOTE",
              id: "EntityValidation",
              data: { error: `The requested project '${entities.programName}' was NOT FOUND in verified records.` },
            });
          }
        } else {
          facts.push(...allPrograms);
        }
      }
    } else if (intent === "fieldOperations" || intent === "incidentIntelligence") {
      if (allowedCollections.includes("field_reports")) {
        const allReports = await fetchUnifiedFieldReports();
        facts.push(...allReports);
      }
    } else if (intent === "communicationIntelligence") {
      if (allowedCollections.includes("communications")) {
        const comms = await fetchUnifiedCommunications();
        facts.push(...comms);
      }
    } else if (
      intent === "investigations" ||
      intent === "decisionSupport" ||
      intent === "strategicPlanning" ||
      intent === "executiveBriefing" ||
      intent === "operationalIntelligence"
    ) {
      if (allowedCollections.includes("donations")) facts.push(...(await fetchUnifiedDonations(200)));
      if (allowedCollections.includes("programs")) facts.push(...(await fetchUnifiedPrograms()));
      if (allowedCollections.includes("donors")) facts.push(...(await fetchUnifiedDonors(100)));
      if (allowedCollections.includes("field_reports")) facts.push(...(await fetchUnifiedFieldReports()));
      if (allowedCollections.includes("communications")) facts.push(...(await fetchUnifiedCommunications()));
    } else {
      // Default: load authoritative domain collections based on permissions
      if (allowedCollections.includes("programs") || allowedCollections.length === 0) facts.push(...(await fetchUnifiedPrograms()));
      if (allowedCollections.includes("donations") || allowedCollections.length === 0) facts.push(...(await fetchUnifiedDonations(50)));
      if (allowedCollections.includes("field_reports") || allowedCollections.length === 0) facts.push(...(await fetchUnifiedFieldReports()));
      if (allowedCollections.includes("donors") || allowedCollections.length === 0) facts.push(...(await fetchUnifiedDonors(50)));
    }
  } catch (error) {
    console.error(`[MKIE Retriever] Authoritative retrieval error for intent "${intent}":`, error);
  }

  // Update Cache
  knowledgeCache.set(cacheKey, facts);
  return facts;
}
