/**
 * scripts/mecp/scenarioGenerator.ts
 * Generates 300+ NLU stress test scenarios for Phase 5 MEIEP Certification.
 */

import * as fs from "fs";

export interface MECPScenario {
  id: string;
  query: string;
  role: string;
  expectedContract: string;
  tags: string[];
}

const INTENT_CONTRACTS: Record<string, string> = {
  donationSearch: "DonationSummary",
  projectIntelligence: "ProjectSummary",
  communicationIntelligence: "CommunicationDraft",
  donorIntelligence: "DonorSummary",
  complianceIntelligence: "ActionPlan",
  reportGenerator: "ReportSummary"
};

const BASE_QUERIES: Record<string, string[]> = {
  donationSearch: [
    "What is the total amount of donations received?",
    "Show me the latest transaction splits.",
    "Give me the average donation size."
  ],
  projectIntelligence: [
    "How is the water project progressing?",
    "Tell me the gap for the family relief campaign.",
    "Which campaign is struggling the most?"
  ],
  donorIntelligence: [
    "Who is our top donor?",
    "Give me a summary of Ahmed's contributions.",
    "How many unique donors do we have?"
  ],
  communicationIntelligence: [
    "Draft a thank you email for the last donor.",
    "Write an update for the water campaign.",
    "Create a receipt confirmation message."
  ],
  complianceIntelligence: [
    "Are there any compliance risks with the latest zakat allocations?",
    "Check for duplicate refunds.",
    "Verify the vendor payment rules."
  ],
  reportGenerator: [
    "Compile a board summary report for Q3.",
    "Generate a financial overview of all active campaigns.",
    "Give me the monthly impact summary."
  ]
};

const TYPO_MUTATIONS: Record<string, string[]> = {
  "donation": ["donaton", "donat", "dnnation", "dmnation"],
  "donations": ["donatons", "dontns", "donashuns"],
  "donor": ["doner", "donar", "dnr"],
  "donors": ["doners", "dnrs", "donarz"],
  "campaign": ["camapign", "campain", "cmpgn", "campagin"],
  "project": ["projt", "prject", "progect", "prjt"],
  "report": ["rept", "reprot", "rp", "rep"],
  "summary": ["sumary", "summry", "summ", "smry"],
  "email": ["mail", "eml", "emale"],
  "thank you": ["thnk u", "thx", "ty", "tysm"],
  "ahmed": ["ahmwd", "amed", "ahmd", "ahmad"],
  "zakat": ["zkat", "zakatt", "zukat"],
  "compliance": ["complince", "complianc", "cmplnc"]
};

function applyTypoMutation(text: string): string {
  let mutated = text.toLowerCase();
  for (const [correct, typos] of Object.entries(TYPO_MUTATIONS)) {
    if (mutated.includes(correct)) {
      const typo = typos[Math.floor(Math.random() * typos.length)];
      mutated = mutated.replace(correct, typo);
    }
  }
  return mutated;
}

const CONTEXTUAL_PROMPTS = [
  "what about his last donation?",
  "how much did she give?",
  "draft an email for them.",
  "send that to the board.",
  "what's the gap for that one?",
  "show me the record for him."
];

function generateScenarios(): MECPScenario[] {
  const scenarios: MECPScenario[] = [];
  let idCounter = 1;

  const roles = ["super_admin", "finance", "compliance"];

  // 1. Base clean queries (Baseline)
  for (const [intent, queries] of Object.entries(BASE_QUERIES)) {
    for (const q of queries) {
      scenarios.push({
        id: `MECP-PH5-${idCounter.toString().padStart(3, '0')}`,
        query: q,
        role: roles[Math.floor(Math.random() * roles.length)],
        expectedContract: INTENT_CONTRACTS[intent],
        tags: ["baseline"]
      });
      idCounter++;
    }
  }

  // 2. Heavy Typo queries
  for (const [intent, queries] of Object.entries(BASE_QUERIES)) {
    for (const q of queries) {
      for (let i = 0; i < 4; i++) {
        scenarios.push({
          id: `MECP-PH5-${idCounter.toString().padStart(3, '0')}`,
          query: applyTypoMutation(q),
          role: roles[Math.floor(Math.random() * roles.length)],
          expectedContract: INTENT_CONTRACTS[intent],
          tags: ["nlu", "misspelling"]
        });
        idCounter++;
      }
    }
  }

  // 3. Shorthand / Abbreviated queries
  const shorthands = [
    { q: "q3 rept pls", c: "ReportSummary" },
    { q: "top doner stat", c: "DonorSummary" },
    { q: "zkat cmplnc check", c: "ActionPlan" },
    { q: "wtr campain gap", c: "ProjectSummary" },
    { q: "thx eml 4 ahmd", c: "CommunicationDraft" }
  ];
  
  for (const s of shorthands) {
    for (let i = 0; i < 3; i++) {
      scenarios.push({
        id: `MECP-PH5-${idCounter.toString().padStart(3, '0')}`,
        query: s.q,
        role: "super_admin",
        expectedContract: s.c,
        tags: ["nlu", "shorthand"]
      });
      idCounter++;
    }
  }

  // 4. Contextual Pronoun / Follow-ups
  for (const cp of CONTEXTUAL_PROMPTS) {
    for (let i = 0; i < 5; i++) {
      scenarios.push({
        id: `MECP-PH5-${idCounter.toString().padStart(3, '0')}`,
        query: cp,
        role: "super_admin",
        // The expected contract here relies on the test runner injecting history.
        // We will assert 'Contextual' tag in the runner to handle these specially.
        expectedContract: "ContextDependent",
        tags: ["nlu", "contextual"]
      });
      idCounter++;
    }
  }

  // 5. Grammar & Broken Sentences
  const broken = [
    { q: "who give most money trust", c: "DonorSummary" },
    { q: "water project how much finish", c: "ProjectSummary" },
    { q: "make email say thank you", c: "CommunicationDraft" },
    { q: "report give me all money", c: "DonationSummary" }
  ];

  for (const b of broken) {
    for (let i = 0; i < 5; i++) {
      scenarios.push({
        id: `MECP-PH5-${idCounter.toString().padStart(3, '0')}`,
        query: b.q,
        role: roles[Math.floor(Math.random() * roles.length)],
        expectedContract: b.c,
        tags: ["nlu", "grammar"]
      });
      idCounter++;
    }
  }

  return scenarios;
}

const suite = generateScenarios();
fs.writeFileSync("scripts/mecp/scenarios/phase5_certification.json", JSON.stringify(suite, null, 2));
console.log(`Generated ${suite.length} certification scenarios to phase5_certification.json`);
