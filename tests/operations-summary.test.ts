import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OperationsSummary from "@/components/admin/OperationsSummary";

// D8: the headline warning count must agree with what the screen shows or say how many are not shown.
const canonical = (warnings: number) => ({
  causes: [], unresolvedDistribution: { amount: 0, count: 0 }, unrestricted: { verified: 0, pending: 0 }, allocations: { activeAmount: 0, activeCount: 0, reversedCount: 0 },
  communications: { recipients: 0, smtpAccepted: 0, failed: 0, unresolved: 0 },
  integrity: { errors: 0, warnings, info: 0, exceptions: Array.from({ length: warnings }, (_, i) => ({ severity: "warning", entityId: `E${i + 1}`, message: `problem ${i + 1}` })) },
});
const html = (w: number) => renderToStaticMarkup(React.createElement(OperationsSummary, { canonical: canonical(w) }));

describe("integrity warning count vs details", () => {
  it("9 warnings: the headline says 9, five are listed and the rest are accounted for with a link to Reconciliation", () => {
    const out = html(9);
    expect(out).toContain("9 warning(s)");
    expect((out.match(/problem \d/g) || []).length).toBe(5);
    expect(out).toContain("and 4 more");
    expect(out).toContain('href="/admin/reconciliation"');
  });
  it("3 warnings: all listed, no 'more' line", () => {
    const out = html(3);
    expect((out.match(/problem \d/g) || []).length).toBe(3);
    expect(out).not.toContain("more.");
  });
  it("no warnings: no banner", () => {
    expect(html(0)).not.toContain("need attention");
  });
});
