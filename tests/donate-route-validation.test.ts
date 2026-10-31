import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetWorld } from "./helpers/mocks";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { POST } from "@/app/api/donate/route";

beforeEach(resetWorld);

const submit = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  const fields: Record<string, string> = { donorName: "Route Test", donorContact: "route@example.invalid", amount: "100", cause: "General", ...over };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  fd.set("screenshot", new File([new Uint8Array([137, 80, 78, 71])], "p.png", { type: "image/png" }));
  return POST(new NextRequest("http://t/api/donate", { method: "POST", body: fd, headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` } }));
};

// Regression (D3-F2): an unparseable selectedCauses used to be swallowed, silently turning the donor's selection into
// an unrestricted General donation that was then recorded.
describe("POST /api/donate: malformed cause selection", () => {
  it("rejects unparseable selectedCauses with 400 and records nothing", async () => {
    const res = await submit({ selectedCauses: "{not json" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toMatch(/cause/i);
    expect(await donationRepository.getAll(true)).toHaveLength(0);
  });

  it("rejects selectedCauses that is valid JSON but not a list", async () => {
    const res = await submit({ selectedCauses: JSON.stringify({ causeId: "x" }) });
    expect(res.status).toBe(400);
    expect(await donationRepository.getAll(true)).toHaveLength(0);
  });

  it("still accepts a donation with no selectedCauses at all (general donation)", async () => {
    const res = await submit();
    expect(res.status).toBe(200);
    expect(await donationRepository.getAll(true)).toHaveLength(1);
  });
});

// D36: one audit record per donation, written and awaited by the donation service (the route no longer adds a second, un-awaited one).
describe("POST /api/donate: audit records", () => {
  it("writes exactly one audit record for a donation, with every fact the removed duplicate carried", async () => {
    const { fakeSheets } = await import("./helpers/fakeSheets");
    const res = await submit({ upiRef: "UPI123456", amount: "250" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    await new Promise((r) => setTimeout(r, 50)); // a leftover fire-and-forget write would have landed by now
    const audit = fakeSheets.records("Audit_Log").filter((a: any) => a.entity_id === body.trackingId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "SUBMIT_DONATION", actor_role: "donor" });
    const after = JSON.parse(String(audit[0].after_state));
    expect(after).toMatchObject({ amount: 250, trackingId: body.trackingId, transactionReference: "UPI123456" });
    expect(after).toHaveProperty("proofDriveFileId");
    expect(after).toHaveProperty("cause");
  });
});
