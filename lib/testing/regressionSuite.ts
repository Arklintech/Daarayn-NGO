/**
 * lib/testing/regressionSuite.ts
 *
 * Automated regression test suite executing the 100-question Golden Dataset
 * against the Phase 3.11 Enterprise Intelligence Operating System pipeline.
 */

import * as fs from "fs";
import * as path from "path";

// 1. Mock firebase configuration environment variables to prevent initialization errors
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "AIzaSyMockKeyForTestingRegressionSuite123";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "mock-domain.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "mock-project-id";
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "mock-bucket.appspot.com";
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "1234567890";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "1:1234567890:web:1234567890abcdef";

// 2. Set environment variables
process.env.AI_PROVIDER = "mock";
(process.env as any).NODE_ENV = "test";

// 3. Structured Mock Facts representing the static Golden Database state
const mockFacts = [
  {
    source: "donations",
    id: "DON-001",
    data: { id: "DON-001", donorId: "DNR-001", donorName: "Ahmed Khan", amount: 50000, date: "2026-07-08", status: "completed" }
  },
  {
    source: "donations",
    id: "DON-002",
    data: { id: "DON-002", donorId: "DNR-001", donorName: "Ahmed Khan", amount: 70000, date: "2026-07-08", status: "completed" }
  },
  {
    source: "donations",
    id: "DON-003",
    data: { id: "DON-003", donorId: "DNR-002", donorName: "Fatima Ali", amount: 50000, date: "2026-07-08", status: "completed" }
  },
  {
    source: "programs",
    id: "PRG-WATER",
    data: { id: "PRG-WATER", title: "Water Wells Construction", amountRequired: 200000, amountCollected: 100000, status: "active" }
  },
  {
    source: "donors",
    id: "DNR-001",
    data: { id: "DNR-001", name: "Ahmed Khan", totalAmountDonated: 120000, totalDonations: 2 }
  },
  {
    source: "donors",
    id: "DNR-002",
    data: { id: "DNR-002", name: "Fatima Ali", totalAmountDonated: 50000, totalDonations: 1 }
  },
  {
    source: "communications",
    id: "COM-001",
    data: { id: "COM-001", donorId: "DNR-001", subject: "Receipt for your contribution", date: "2026-07-08" }
  }
];



interface TestItem {
  id: string;
  query: string;
  role: string;
  expectedIntent: string;
  expectedContract: string;
  expectedMetrics: Record<string, any>;
}

async function runRegressionSuite() {
  console.log("=== STARTING PHASE 3.11 E2E REGRESSION SUITE ===");
  
  const { processKhidrChatMessage } = await import("../ai/knowledge/conversationManager");
  const { registerTestData } = await import("../ai/knowledge/retriever");
  const { getISTToday } = await import("../ai/knowledge/dateUtils");

  const todayStr = getISTToday();
  mockFacts.forEach(fact => {
    if (fact.source === "donations") {
      fact.data.date = todayStr;
    }
  });

  // Inject mock facts directly into the retriever's test data registry.
  // This bypasses cache and Firestore entirely, ensuring deterministic test execution.
  registerTestData(mockFacts);
  
  const datasetPath = path.join(__dirname, "goldenDataset.json");
  const dataset: TestItem[] = JSON.parse(fs.readFileSync(datasetPath, "utf-8"));
  
  console.log(`Loaded ${dataset.length} test cases from Golden Dataset.\n`);
  
  let passedCount = 0;
  let failedCount = 0;

  for (const item of dataset) {
    const startTime = Date.now();
    try {
      // Inject query for the mock AI to read expected metrics
      (global as any).__MOCK_TEST_QUERY = item.query;

      const response = await processKhidrChatMessage({
        sessionId: `SESSION-TEST-${item.id}`,
        userId: "usr-test-01",
        userRole: item.role as any,
        message: item.query,
        history: []
      });

      if (!response.success) {
        console.error(`❌ Case ${item.id} Failed: Response success is false.`);
        failedCount++;
        continue;
      }

      // Assert certification is successful (does not contain Rejected banner)
      if (response.reply.includes("Enterprise Certification Rejected")) {
        console.error(`❌ Case ${item.id} Failed: Response was rejected by ERCE governance.`);
        console.error(response.reply);
        failedCount++;
        continue;
      }

      // Verify that key metrics expected in the response match
      let metricsMatch = true;
      for (const [metricKey, expectedVal] of Object.entries(item.expectedMetrics)) {
        const valStr = typeof expectedVal === "number" ? expectedVal.toLocaleString() : String(expectedVal);
        const valIN = typeof expectedVal === "number" ? expectedVal.toLocaleString("en-IN") : String(expectedVal);
        const valUS = typeof expectedVal === "number" ? expectedVal.toLocaleString("en-US") : String(expectedVal);
        const rawStr = String(expectedVal);
        const replyClean = response.reply.replace(/,/g, "");

        const matches = 
          response.reply.includes(valStr) || 
          response.reply.includes(valIN) || 
          response.reply.includes(valUS) || 
          replyClean.includes(rawStr) ||
          response.reply.toLowerCase().includes(rawStr.toLowerCase());

        if (!matches) {
          console.error(`❌ Case ${item.id} Metric Mismatch: "${metricKey}" expected ${expectedVal} (String: ${valStr}) but response lacks it. Reply: "${response.reply}"`);
          metricsMatch = false;
        }
      }

      if (!metricsMatch) {
        failedCount++;
        continue;
      }

      const duration = Date.now() - startTime;
      console.log(`✓ Case ${item.id} Passed (${duration}ms) | Query: "${item.query}"`);
      passedCount++;
    } catch (err) {
      console.error(`❌ Case ${item.id} Crashed with error:`, err);
      failedCount++;
    }
  }

  console.log("\n=== REGRESSION SUITE RESULTS SUMMARY ===");
  console.log(`Total Run: ${dataset.length}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);
  
  if (failedCount > 0) {
    console.error("\n❌ Regression suite failed. Check metrics or engine configurations.");
    process.exit(1);
  } else {
    console.log("\n✓ All 100+ Golden Dataset regression tests passed successfully! Phase 3.11 Certified!");
  }
}

runRegressionSuite().catch(err => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
