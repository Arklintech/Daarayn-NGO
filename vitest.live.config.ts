import { defineConfig } from "vitest/config";
import path from "path";

// LIVE integration tests: real Google Sheets, Google Drive and Gmail SMTP using the credentials in
// .env.local. They never touch the production spreadsheet: they create an isolated test spreadsheet
// (or use GOOGLE_TEST_SHEET_ID) and a temporary Drive subfolder, and clean up afterwards.
//   npm run test:live
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/live/**/*.live.test.ts"],
    setupFiles: ["tests/live/env.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
