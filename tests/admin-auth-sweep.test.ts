import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { resetWorld, authState } from "./helpers/mocks";
import { fakeSheets } from "./helpers/fakeSheets";

// D8 acceptance: authorization is enforced SERVER-SIDE on every administrative API. Every handler of every route under
// app/api/admin (plus the other admin-only routes listed below) must refuse an anonymous caller BEFORE reading anything,
// and must never touch Google Sheets or Drive on behalf of an anonymous request.
const ROOT = path.resolve(__dirname, "..");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) routeFiles(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}

// Routes under app/api/admin that are intentionally NOT admin-gated.
const NOT_ADMIN_GATED = new Set<string>([
  "app/api/admin/session/route.ts", // reports whether the caller is an admin (answers 200 with isAdmin false / 401)
  "app/api/admin/google-drive/callback/route.ts", // Google's OAuth redirect: identity is the signed state cookie issued to an admin (tested below)
]);
// Admin-only routes outside app/api/admin.
const EXTRA_ADMIN = ["app/api/donors/route.ts", "app/api/ledger/route.ts"];

const files = [...routeFiles(path.join(ROOT, "app/api/admin")), ...EXTRA_ADMIN.map((f) => path.join(ROOT, f))]
  .map((p) => path.relative(ROOT, p).replace(/\\/g, "/"))
  .filter((p) => !NOT_ADMIN_GATED.has(p) && fs.existsSync(path.join(ROOT, p)))
  .sort();

const url = (rel: string) => `http://t/${rel.replace(/^app\//, "").replace(/\/route\.ts$/, "").replace(/\[(\w+)\]/g, "x")}`;
const paramsFor = (rel: string) => Object.fromEntries([...rel.matchAll(/\[(\w+)\]/g)].map((m) => [m[1], "x"]));

let ROLE: "none" | "agent" = "none";
beforeEach(async () => {
  await resetWorld();
  authState.role = ROLE;
});

for (const role of ["none", "agent"] as const) describe(`every administrative API refuses ${role === "none" ? "anonymous callers" : "a signed-in field agent"} on the server`, () => {
  beforeEach(() => { ROLE = role; authState.role = role; });
  it("covers a meaningful number of routes", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const rel of files) {
    it(`${rel}`, async () => {
      const mod: any = await import(/* @vite-ignore */ path.join(ROOT, rel).replace(/\\/g, "/"));
      const handlers = METHODS.filter((m) => typeof mod[m] === "function");
      expect(handlers.length).toBeGreaterThan(0);
      for (const method of handlers) {
        fakeSheets.tabs.clear();
        const init: any = method === "GET" ? {} : { method, headers: { "content-type": "application/json" }, body: "{}" };
        const req = new NextRequest(url(rel), { method, ...init });
        const res: Response = await mod[method](req, { params: Promise.resolve(paramsFor(rel)) });
        // 401/403 = refused; 410 = decommissioned stub. Anything else (200/400/500) would mean the handler ran for an anonymous caller.
        expect([401, 403, 410], `${method} ${rel} answered ${res.status} to an anonymous request`).toContain(res.status);
        expect(fakeSheets.tabs.size, `${method} ${rel} touched Sheets for an anonymous request`).toBe(0);
      }
    });
  }
});

describe("the Google Drive OAuth callback is authorised by its signed state, not by a session", () => {
  it("an anonymous or forged callback redirects with invalid_state and stores nothing", async () => {
    const { GET } = await import("@/app/api/admin/google-drive/callback/route");
    for (const qs of ["", "?code=abc&state=forged", "?error=access_denied"]) {
      const res = await GET(new NextRequest(`http://t/api/admin/google-drive/callback${qs}`));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toMatch(/\/admin\/settings\?drive=(invalid_state|denied)/);
    }
    expect(fakeSheets.tabs.size).toBe(0);
  });
});

describe("anonymous visitors still reach the intentionally public routes", () => {
  it("public donation catalog and programs answer without credentials", async () => {
    fakeSheets.seed("Causes", ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"], []);
    const causes = await import("@/app/api/causes/route");
    expect((await causes.GET(new NextRequest("http://t/api/causes?scope=public"))).status).toBe(200);
    const programs = await import("@/app/api/programs/route");
    expect((await programs.GET(new NextRequest("http://t/api/programs"))).status).toBe(200);
  });
});
