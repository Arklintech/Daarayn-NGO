/**
 * lib/ai/knowledge/retriever.ts
 *
 * Retriever Engine for MOMIN Knowledge Intelligence Engine (MKIE).
 * Formulates narrow, targeted queries to Firestore collections instead of scanning full datasets.
 * Employs knowledge caching to reduce database read overhead.
 */

import { db } from "../../firebase";
import { collection, getDocs, query, where, limit, orderBy } from "firebase/firestore";
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
 * The retriever will return these facts directly, bypassing cache and Firestore.
 * This ensures deterministic, repeatable test execution.
 */
let _testDataRegistry: RetrievedFact[] | null = null;

export function registerTestData(facts: RetrievedFact[]): void {
  _testDataRegistry = facts;
  console.log(`[MKIE Retriever] Test data registered: ${facts.length} mock facts`);
}

export function clearTestData(): void {
  _testDataRegistry = null;
}

/** Load donations from both `donations` and `publicLedger` collections. */
async function fetchUnifiedDonations(max = 200): Promise<RetrievedFact[]> {
  const facts: RetrievedFact[] = [];
  const seen = new Set<string>();

  for (const collName of ["donations", "publicLedger"]) {
    try {
      const snap = await getDocs(query(collection(db, collName), limit(max)));
      snap.forEach((doc) => {
        const data = doc.data();
        const key = `${data.id || doc.id}-${data.amount}-${data.donorName || data.donor}`;
        if (seen.has(key)) return;
        seen.add(key);
        facts.push({
          source: "donations",
          id: data.id || doc.id,
          data: {
            ...data,
            id: data.id || doc.id,
            donorName: data.donorName || data.donor || data.name,
            amount: Number(data.amount) || 0,
            date: normalizeDateField(data.date || data.createdAt),
            cause: data.cause || data.programName || data.project,
          },
        });
      });
    } catch (e) {
      console.warn(`[Retriever] Could not load ${collName}:`, e);
    }
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
 * Main retrieval interface. Checks cache first, performs targeted queries, and updates cache.
 */
export async function retrieveTargetedData(
  intent: string,
  entities: any,
  allowedCollections: string[]
): Promise<RetrievedFact[]> {
  // 0. Test Environment Bypass: if test data is registered, return it directly
  if (_testDataRegistry !== null) {
    const filtered = _testDataRegistry.filter(f => allowedCollections.includes(f.source) || allowedCollections.length === 0);
    return filtered.length > 0 ? filtered : _testDataRegistry;
  }

  const cacheKey = `retrieval:${intent}:${JSON.stringify(entities)}:${allowedCollections.join(",")}`;
  
  // 1. Check cache first
  const cached = knowledgeCache.get<RetrievedFact[]>(cacheKey);
  if (cached) {
    console.log(`[MKIE Retriever] Cache hit for key: "${cacheKey}"`);
    return cached;
  }

  let facts: RetrievedFact[] = [];

  const todayStr = getISTToday();
  const yesterdayStr = getISTDateOffset(-1);

  try {
    if (intent === "donationSearch" || intent === "publicLedger" || intent === "financialIntelligence") {
      if (allowedCollections.includes("donations") || allowedCollections.includes("publicLedger")) {
        let allDonations = await fetchUnifiedDonations(200);
        if (entities.timeframe) {
          allDonations = filterDonationsByTimeframe(allDonations, entities.timeframe);
        } else if (entities.donationId) {
          allDonations = allDonations.filter((f) => f.id === entities.donationId || f.data.id === entities.donationId);
        } else if (!entities.listAllDonors) {
          allDonations = allDonations.slice(0, 50);
        }
        facts.push(...allDonations);
      }
    }

    else if (intent === "donorIntelligence") {
      if (allowedCollections.includes("donors")) {
        if (entities.donorId) {
          const q = query(collection(db, "donors"), where("id", "==", entities.donorId));
          const snap = await getDocs(q);
          snap.forEach(doc => {
            facts.push({ source: "donors", id: doc.id, data: doc.data() });
          });
        } else if (entities.donorName) {
          const qAll = query(collection(db, "donors"), limit(50));
          const snapAll = await getDocs(qAll);
          snapAll.forEach(doc => {
            const data = doc.data();
            const name = String(data.name || "").toLowerCase();
            const needle = entities.donorName!.toLowerCase();
            if (name.includes(needle) || needle.includes(name)) {
              facts.push({ source: "donors", id: doc.id, data });
            }
          });

          const donSnap = await fetchUnifiedDonations(100);
          donSnap.forEach((f) => {
            const name = String(f.data.donorName || "").toLowerCase();
            const needle = entities.donorName!.toLowerCase();
            if (name.includes(needle) || needle.includes(name)) {
              facts.push(f);
            }
          });
        } else if (entities.listAllDonors || entities.listRepeatDonors) {
          const snap = await getDocs(query(collection(db, "donors"), limit(100)));
          snap.forEach(doc => facts.push({ source: "donors", id: doc.id, data: doc.data() }));
          facts.push(...await fetchUnifiedDonations(150));
        } else {
          const snap = await getDocs(query(collection(db, "donors"), limit(50)));
          snap.forEach(doc => facts.push({ source: "donors", id: doc.id, data: doc.data() }));
          facts.push(...await fetchUnifiedDonations(80));
        }
      }
    }

    else if (intent === "projectIntelligence") {
      if (allowedCollections.includes("programs")) {
        const snap = await getDocs(collection(db, "programs"));
        let matchFound = false;

        snap.forEach(doc => {
          const data = doc.data();
          const nameLower = (data.name || data.title || "").toLowerCase();
          const categoryLower = String(data.category || data.type || data.cause || "").toLowerCase();

          if (entities.listAllCauses) {
            facts.push({ source: "programs", id: doc.id, data });
            matchFound = true;
          } else if (entities.programName) {
            const needle = entities.programName.toLowerCase();
            const matches =
              nameLower.includes(needle) ||
              categoryLower.includes(needle) ||
              needle.includes(nameLower) ||
              (needle === "education" && (nameLower.includes("school") || nameLower.includes("orphan") || categoryLower.includes("education")));
            if (matches) {
              facts.push({ source: "programs", id: doc.id, data });
              matchFound = true;
            }
          } else {
            facts.push({ source: "programs", id: doc.id, data });
            matchFound = true;
          }
        });

        // Entity Validation: Prevent dumping irrelevant projects if specific project not found
        if (entities.programName && !matchFound) {
          facts = [{ source: "SYSTEM_NOTE", id: "EntityValidation", data: { error: `The requested project '${entities.programName}' was NOT FOUND in the active database.` } }];
        }
      }
    }

    else if (intent === "communicationIntelligence") {
      if (allowedCollections.includes("communications")) {
        const snap = await getDocs(query(collection(db, "communications"), limit(50)));
        snap.forEach(doc => {
          const data = doc.data();
          if (entities.pendingOnly) {
            if (String(data.status || "").toLowerCase() === "pending") {
              facts.push({ source: "communications", id: doc.id, data });
            }
          } else if (entities.emailFailedOnly || entities.emailCountQuery) {
            facts.push({ source: "communications", id: doc.id, data });
          } else {
            facts.push({ source: "communications", id: doc.id, data });
          }
        });
      }
      if (entities.pendingOnly && allowedCollections.includes("donations")) {
        const snap = await getDocs(query(collection(db, "donations"), limit(50)));
        snap.forEach(doc => {
          const data = doc.data();
          const pending =
            String(data.acknowledgmentStatus || data.thankYouStatus || "").toLowerCase() === "pending" ||
            (data.status === "completed" && !data.thankYouSent);
          if (pending) {
            facts.push({ source: "donations", id: doc.id, data });
          }
        });
      }
    }

    else if (intent === "complianceIntelligence") {
      // Compliance check: fetch records to audit splits or missing receipts
      if (allowedCollections.includes("donations")) {
        const snap = await getDocs(query(collection(db, "donations"), limit(50)));
        snap.forEach(doc => {
          const data = doc.data();
          const isMissingReceipt = !data.receiptUrl;
          if (isMissingReceipt) {
            facts.push({ source: "donations", id: doc.id, data });
          }
        });
      }
    }

    else if (intent === "reportGenerator" || intent === "globalSearch") {
      // Fetch high-level ledger totals and programs to prepare summary brief
      if (allowedCollections.includes("donations")) {
        let q;
        if (entities.timeframe === "today") {
          q = query(collection(db, "donations"), where("date", "==", todayStr));
        } else if (entities.timeframe === "yesterday") {
          q = query(collection(db, "donations"), where("date", "==", yesterdayStr));
        } else if (entities.timeframe === "month") {
          const currentMonthPrefix = todayStr.substring(0, 7);
          q = query(
            collection(db, "donations"), 
            where("date", ">=", `${currentMonthPrefix}-01`),
            where("date", "<=", `${currentMonthPrefix}-31`)
          );
        } else {
          q = query(collection(db, "donations"), limit(30));
        }
        
        const snap = await getDocs(q);
        snap.forEach(doc => {
          facts.push({ source: "donations", id: doc.id, data: doc.data() });
        });
      }
      if (allowedCollections.includes("programs")) {
        const snap = await getDocs(query(collection(db, "programs"), limit(20)));
        snap.forEach(doc => {
          facts.push({ source: "programs", id: doc.id, data: doc.data() });
        });
      }
    }

    else if (intent === "knowledgeSearch") {
      if (allowedCollections.includes("settings")) {
        // Query Homepage CMS configuration (for FAQs)
        const snap = await getDocs(collection(db, "settings"));
        snap.forEach(doc => {
          if (doc.id === "homepageCMS") {
            facts.push({ source: "settings", id: doc.id, data: doc.data() });
          }
        });
      }
    }

    else if (intent === "volunteerIntelligence" || allowedCollections.includes("volunteers")) {
      if (allowedCollections.includes("volunteers") && (intent === "volunteerIntelligence" || facts.length === 0)) {
        try {
          const snap = await getDocs(query(collection(db, "volunteers"), limit(100)));
          snap.forEach((doc) => facts.push({ source: "volunteers", id: doc.id, data: doc.data() }));
        } catch (e) {
          console.warn("[Retriever] Could not load volunteers:", e);
        }
      }
    }

    else if (
      intent === "investigations" ||
      intent === "decisionSupport" ||
      intent === "strategicPlanning" ||
      intent === "executiveBriefing" ||
      intent === "operationalIntelligence"
    ) {
      if (allowedCollections.includes("donations")) facts.push(...(await fetchUnifiedDonations(200)));
      if (allowedCollections.includes("programs")) {
        const snap = await getDocs(collection(db, "programs"));
        snap.forEach((doc) => facts.push({ source: "programs", id: doc.id, data: doc.data() }));
      }
      if (allowedCollections.includes("donors")) {
        const snap = await getDocs(query(collection(db, "donors"), limit(100)));
        snap.forEach((doc) => facts.push({ source: "donors", id: doc.id, data: doc.data() }));
      }
      if (allowedCollections.includes("communications")) {
        const snap = await getDocs(query(collection(db, "communications"), limit(50)));
        snap.forEach((doc) => facts.push({ source: "communications", id: doc.id, data: doc.data() }));
      }
    }

    // 3. Fallback: retrieve baseline public collections if facts are empty and allowed
    if (facts.length === 0 && allowedCollections.includes("programs")) {
      const snap = await getDocs(query(collection(db, "programs"), limit(5)));
      snap.forEach(doc => {
        facts.push({ source: "programs", id: doc.id, data: doc.data() });
      });
    }

  } catch (error) {
    console.error(`[MKIE Retriever] Retrieval error for intent "${intent}":`, error);
  }

  // 4. Update Cache
  knowledgeCache.set(cacheKey, facts);
  return facts;
}
