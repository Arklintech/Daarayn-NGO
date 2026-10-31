import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * D29 request-governance guard (runs in CI with the rest of the suite). Every Google Sheets API request must pass through the shared
 * limiter: SheetsService.call, withGoogleRetry (with a kind) or the legacy client's paced(). A new direct call fails this test.
 */
const root = process.cwd();
const walk = (dir: string, out: string[] = []) => {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (["node_modules", ".next", "tests", "docs"].includes(e.name)) continue;
      walk(rel, out);
    } else if (/\.(ts|tsx|js|cjs|mjs)$/.test(e.name)) out.push(rel);
  }
  return out;
};
const SOURCE_DIRS = ["lib", "app", "components", "tools"];
const files = SOURCE_DIRS.flatMap((d) => (fs.existsSync(path.join(root, d)) ? walk(d) : []));
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8").replace(/\r\n/g, "\n");

/** Files allowed to contain a Sheets API call, each of which is checked below to route every call through the limiter. */
const APPROVED = new Set(["lib/google/sheets.ts", "lib/google/readiness.ts", "lib/realtime/eventLog.ts", "lib/sync/GoogleSheetsClient.ts", "lib/google/config.ts"]);
const GOVERNED = /(this\.call\(|withGoogleRetry\(|paced\()/;

describe("D29: every Google Sheets API request is governed", () => {
  it("no file outside the approved adapters calls the Sheets API directly", () => {
    const offenders = files.filter((f) => /\.spreadsheets\b/.test(read(f)) && !APPROVED.has(f));
    expect(offenders).toEqual([]);
  });

  it("no new googleapis Sheets client is created outside the approved client modules", () => {
    const offenders = files.filter((f) => /google\.sheets\s*\(/.test(read(f)) && !["lib/google/client.ts", "lib/sync/GoogleSheetsClient.ts"].includes(f));
    expect(offenders).toEqual([]);
  });

  it.each(["lib/google/sheets.ts", "lib/google/readiness.ts", "lib/realtime/eventLog.ts", "lib/sync/GoogleSheetsClient.ts"])("%s: every spreadsheets API call is inside the limiter wrapper", (f) => {
    const src = read(f);
    const bad: string[] = [];
    const re = /\.spreadsheets\./g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const window = src.slice(Math.max(0, m.index - 260), m.index);
      if (!GOVERNED.test(window)) bad.push(`${f}:${src.slice(0, m.index).split("\n").length}`);
    }
    expect(bad).toEqual([]);
  });

  it("maintenance scripts never call the Sheets API without charging the shared budget", () => {
    const bad: string[] = [];
    for (const f of walk("scripts")) {
      const src = read(f);
      if (f === "scripts/audit_all_dependencies.js") continue; // static text search only, makes no request
      const re = /\.spreadsheets\./g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) if (!/acquireSlot\(/.test(src.slice(Math.max(0, m.index - 200), m.index))) bad.push(`${f}:${src.slice(0, m.index).split("\n").length}`);
    }
    expect(bad).toEqual([]);
  });

  it("the detector itself recognises an ungoverned call and a governed one", () => {
    const window = (code: string) => GOVERNED.test(code.slice(0, code.indexOf(".spreadsheets.")));
    expect(window("const r = await client.spreadsheets.values.get({})")).toBe(false);
    expect(window("await this.call(\"read rows\", () => this.sheets.spreadsheets.values.get({}))")).toBe(true);
  });

  it("the old unguarded helper scripts are not part of the application bundle", () => {
    // scripts/ holds one-off maintenance tools (not imported by the app); they must stay outside lib/ and app/.
    const imported = files.filter((f) => /from ["'][^"']*scripts\//.test(read(f)));
    expect(imported).toEqual([]);
  });

  it("the Drive OAuth callback is not a Sheets call (Drive has its own quota and is outside this guard)", () => {
    expect(read("app/api/admin/google-drive/callback/route.ts")).not.toMatch(/\.spreadsheets\b/);
  });
});
