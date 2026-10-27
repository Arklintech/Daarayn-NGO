import { describe, it, expect } from "vitest";
import { donationBadge, donationCauseLabel, communicationOutcome, supportedCauseCount } from "@/lib/donors/display";

// D3-F9: the donor profile showed every donation as "Verified", every message as "Delivered", the cause as "General
// Fund" (it read a field that no longer exists) and "Causes Supported: 0".
describe("donationBadge", () => {
  it("reflects the real status", () => {
    expect(donationBadge("completed")).toMatchObject({ label: "Verified", tone: "good" });
    expect(donationBadge("pending")).toMatchObject({ label: "Pending verification", tone: "wait" });
    expect(donationBadge("rejected")).toMatchObject({ label: "Rejected", tone: "bad" });
  });
  it("never invents 'Verified' for an unknown or empty status", () => {
    expect(donationBadge("").label).not.toBe("Verified");
    expect(donationBadge(undefined).label).not.toBe("Verified");
  });
});

describe("communicationOutcome", () => {
  it("SMTP acceptance is never presented as delivery", () => {
    const o = communicationOutcome("smtp_accepted");
    expect(o.label).toBe("Accepted by mail server");
    expect(`${o.label} ${o.note}`).not.toMatch(/delivered/i);
    expect(o.note).toMatch(/not .*inbox|inbox.*not/i);
  });
  it("shows failures, unknown outcomes and in-progress states as such", () => {
    expect(communicationOutcome("failed")).toMatchObject({ label: "Failed", tone: "bad" });
    expect(communicationOutcome("unresolved")).toMatchObject({ label: "Outcome unknown", tone: "wait" });
    expect(communicationOutcome("queued").tone).toBe("wait");
    expect(communicationOutcome("attempted").tone).toBe("wait");
  });
  it("an unrecognised or missing status is not shown as success", () => {
    expect(communicationOutcome(undefined).tone).not.toBe("good");
    expect(communicationOutcome("weird").tone).not.toBe("good");
  });
});

describe("donationCauseLabel", () => {
  it("names the designated cause", () => {
    expect(donationCauseLabel({ causes: [{ causeId: "EDU", title: "Education", designationStatus: "designated", designatedAmount: 100 }] })).toBe("Education");
  });
  it("lists several causes and flags an unresolved split", () => {
    const label = donationCauseLabel({ causes: [{ causeId: "A", title: "Education", designationStatus: "unresolved", designatedAmount: null }, { causeId: "B", title: "Food", designationStatus: "unresolved", designatedAmount: null }] });
    expect(label).toContain("Education");
    expect(label).toContain("Food");
    expect(label).toMatch(/split not recorded/i);
  });
  it("an unrestricted donation is labelled as such, not as a cause", () => {
    expect(donationCauseLabel({ causes: [] })).toBe("Unrestricted (where most needed)");
    expect(donationCauseLabel({})).toBe("Unrestricted (where most needed)");
  });
});

describe("supportedCauseCount", () => {
  it("counts distinct causes of verified donations only", () => {
    const d = (status: string, ids: string[]) => ({ status, causes: ids.map((causeId) => ({ causeId })) });
    expect(supportedCauseCount([d("completed", ["A", "B"]), d("completed", ["A"]), d("pending", ["C"]), d("rejected", ["D"])])).toBe(2);
    expect(supportedCauseCount([])).toBe(0);
  });
});
