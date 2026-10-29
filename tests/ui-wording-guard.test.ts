import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// D4-T4: guard against misleading or forbidden wording coming back into admin and donor-facing screens.
const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["app", "components"];

function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}
const sources = SCAN_DIRS.flatMap((d) => files(path.join(ROOT, d))).map((p) => ({ p: path.relative(ROOT, p).replace(/\\/g, "/"), s: fs.readFileSync(p, "utf8") }));
const hits = (re: RegExp, except: (p: string) => boolean = () => false) =>
  sources.filter(({ p, s }) => !except(p) && re.test(s)).map(({ p }) => p);

describe("screen wording", () => {
  it("no AI assistant branding (decommissioned): the template button says what it is", () => {
    expect(hits(/Generate with Khizr|Khizr service|Khizr Overwrite/i)).toEqual([]);
  });

  it("Field Agents are never called Volunteers in screens", () => {
    expect(hits(/Volunteer Manager|\['\/#about', 'Volunteer'\]/)).toEqual([]);
  });

  it("no unverifiable claims in generated donor documents or settings", () => {
    expect(hits(/blockchain\/ledger logs|90\/10 Amanah/, () => false)).toEqual([]);
    expect(hits(/asia-south1|Firestore Database/)).toEqual([]);
  });

  it("no hardcoded administrator accounts or fabricated delivery claims in the admin app", () => {
    expect(hits(/editor@daarayn\.org|"super_1"/)).toEqual([]);
    // "Delivered" as a status label is only acceptable where a real delivery signal exists; none does for e-mail.
    expect(hits(/>\s*Delivered\s*</, (p) => !p.startsWith("app/admin"))).toEqual([]);
  });

  it("the share-link and portal routes never log tokens or codes", () => {
    const risky = sources.filter(({ p }) => /app\/api\/(donor|files)\//.test(p) && /console\.(log|error|warn)\([^)]*(\bcode\b|token|challenge)\b/i.test(fs.readFileSync(path.join(ROOT, p), "utf8").replace(/"[^"\n]*"/g, '""')));
    expect(risky.map((r) => r.p)).toEqual([]);
  });

  it("the donor CRM has no controls that do nothing or pretend to be other reports", () => {
    expect(hits(/Generate Board Report|View Full Insights/)).toEqual([]);
  });

  it("the Quick Donation Ribbon hands the checkout the permanent cause id, not the title", () => {
    const src = fs.readFileSync(path.join(ROOT, "components/QuickDonationRibbon.tsx"), "utf8");
    expect(src.includes("causes.find((c) => c.name === cause)?.id")).toBe(true);
    expect(src.includes("cause=${encodeURIComponent(cause)}")).toBe(false);
  });
});
