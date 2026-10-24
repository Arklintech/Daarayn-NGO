import { defineConfig } from "vitest/config";
import path from "path";

// Regression tests run against an in-memory Google Sheets fake (tests/helpers/fakeSheets.ts).
// They never read credentials, never call Google, SMTP or Firebase, and cannot touch real data.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    environment: "node",
    testTimeout: 30_000,
    env: { ADMIN_EMAILS: "admin@test.local", EMAIL_PROVIDER: "gmail" },
  },
});
