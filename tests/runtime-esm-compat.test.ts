import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";

/**
 * D39 regression: the Vercel Node 24 function runtime does NOT allow require() of ES modules (the Node feature that makes it work on a developer machine is
 * off there). A CommonJS dependency that require()s an ESM-only package therefore loads fine locally and in the offline tests but fails in the deployed function with
 * ERR_REQUIRE_ESM, and every route that imports it answers 500. Found on the first Preview: firebase-admin -> jwks-rsa 4 -> jose 6 (ESM only), so every admin API route failed.
 * This loads each server-side CommonJS entry point exactly as the deployed runtime does (--no-experimental-require-module).
 */
const ENTRY_POINTS = ["firebase-admin/app", "firebase-admin/auth", "googleapis", "nodemailer", "jwks-rsa", "jose"];

describe("D39: server dependencies load without require(esm) (the Vercel function runtime)", () => {
  for (const mod of ENTRY_POINTS) {
    it(`require("${mod}") works with --no-experimental-require-module`, () => {
      const r = spawnSync(process.execPath, ["--no-experimental-require-module", "-e", `require(${JSON.stringify(mod)})`], { cwd: process.cwd(), encoding: "utf8" });
      expect({ module: mod, status: r.status, stderr: (r.stderr || "").split("\n").filter((l) => /Error|ERR_/.test(l)).slice(0, 2) }).toEqual({ module: mod, status: 0, stderr: [] });
    });
  }

  it("jwks-rsa still resolves a signing key from a real JWKS endpoint on the jose version it is pinned to", () => {
    // jwks-rsa 4 declares jose ^6 (ESM only); package.json overrides it to 5.10.0 (which has a CommonJS build). Only importJWK/exportSPKI/decode* are used, and this proves they work.
    const script = `
      const http = require("http"), crypto = require("crypto"), { JwksClient } = require("jwks-rsa");
      const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
      const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
      const srv = http.createServer((q, s) => { s.setHeader("content-type", "application/json"); s.end(JSON.stringify({ keys: [jwk] })); }).listen(0, async () => {
        try {
          const c = new JwksClient({ jwksUri: "http://127.0.0.1:" + srv.address().port + "/jwks" });
          const key = await c.getSigningKey("k1");
          const pem = key.getPublicKey();
          console.log(/BEGIN PUBLIC KEY/.test(pem) && key.kid === "k1" ? "OK" : "BAD");
        } catch (e) { console.log("ERR " + e.message); }
        srv.close();
      });`;
    const r = spawnSync(process.execPath, ["--no-experimental-require-module", "-e", script], { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 });
    expect({ status: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").split("\n").filter((l) => /Error|ERR_/.test(l)).slice(0, 2) }).toEqual({ status: 0, out: "OK", err: [] });
  });
});
