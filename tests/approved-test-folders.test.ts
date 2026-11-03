import { describe, it, expect } from "vitest";
import { APPROVED_TEST_FOLDER_IDS, isApprovedTestFolder } from "@/lib/google/approvedTargets";
import { decideWriteTarget } from "@/lib/google/config";

/**
 * D40: the Drive test identity (a dedicated OAuth client in the test Google Cloud project, scope drive.file) created its own root folder through the application's
 * create-root endpoint. In drive.file mode the app can only reach folders it created itself, so that folder is the only one the Preview can ever use; the previously approved
 * folder id is not reachable by any available account. The write guard refuses any folder not on this committed list, so the new id is approved here, in a reviewed change.
 */
const PREVIEW_TEST_ROOT = "1LQs5xGUmtTjlrJmDri2DxzMCHWKhI99H";
const EARLIER_APPROVED = "1x9GnIWZ6GA-VjbH9KPCyKV8eupv6qllD";
const PRODUCTION_LIKE = "1pRoDuCtIoNeViDeNcEfOlDeR0000000a";
const VERCEL_PREVIEW = { VERCEL: "1", VERCEL_ENV: "preview", NODE_ENV: "production", GOOGLE_TARGET_ENV: "test" };

describe("approved test Drive folders", () => {
  it("the Preview test root folder created by the application is approved", () => {
    expect(APPROVED_TEST_FOLDER_IDS.has(PREVIEW_TEST_ROOT)).toBe(true);
    expect(isApprovedTestFolder(PREVIEW_TEST_ROOT)).toBe(true);
  });

  it("the earlier approved folder stays approved (nothing is removed from the list)", () => {
    expect(isApprovedTestFolder(EARLIER_APPROVED)).toBe(true);
  });

  it("only the committed ids are approved: a production-looking id, an empty id and a near-miss are refused", () => {
    expect(isApprovedTestFolder(PRODUCTION_LIKE)).toBe(false);
    expect(isApprovedTestFolder("")).toBe(false);
    expect(isApprovedTestFolder(PREVIEW_TEST_ROOT.slice(0, -1) + "A")).toBe(false);
    expect(APPROVED_TEST_FOLDER_IDS.size).toBe(2);
  });

  it("on a Vercel Preview with label=test the guard allows Drive writes only for an approved folder", () => {
    const ok = decideWriteTarget("drive", { ...VERCEL_PREVIEW, GOOGLE_DRIVE_ROOT_FOLDER_ID: PREVIEW_TEST_ROOT, GOOGLE_DRIVE_TEST_FOLDER_ID: PREVIEW_TEST_ROOT } as any);
    expect(ok.allowed).toBe(true);
    const prod = decideWriteTarget("drive", { ...VERCEL_PREVIEW, GOOGLE_DRIVE_ROOT_FOLDER_ID: PRODUCTION_LIKE, GOOGLE_DRIVE_TEST_FOLDER_ID: PRODUCTION_LIKE } as any);
    expect(prod.allowed).toBe(false);
    const mismatch = decideWriteTarget("drive", { ...VERCEL_PREVIEW, GOOGLE_DRIVE_ROOT_FOLDER_ID: PRODUCTION_LIKE, GOOGLE_DRIVE_TEST_FOLDER_ID: PREVIEW_TEST_ROOT } as any);
    expect(mismatch.allowed).toBe(false);
  });
});
