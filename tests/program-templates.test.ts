import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ProgramDetailView from "@/components/programs/ProgramDetailView";
import { prepareProgramContent } from "@/lib/catalog/programContentSchema";

const program = (template: string, sections: any[], extra: any = {}) => ({
  id: "P1", title: "Masjid Infrastructure Fund", description: "d", imageUrl: "", category: "c", location: "", kind: "project", status: "Active", targetAmount: 1000, raisedAmount: 250,
  images: [], content: { ...prepareProgramContent("P1", { template, lead: "Structured upgrades with weekly updates and verification rules.", primaryCtaText: "Fund a Need", sections, ...extra }) },
});
const html = (p: any) => renderToStaticMarkup(React.createElement(ProgramDetailView, { program: p }));

describe("project / infrastructure template follows the reference layout", () => {
  const sections = [
    { type: "needs", title: "Example Project: Local Masjid Upgrade", needs: [{ name: "Fans", amount: 3000 }, { name: "Carpet", amount: 5000 }] },
    { type: "text", body: "If no update is posted within 7 days, the project is placed on hold until verification resumes." },
    { type: "panel", title: "Update rules", items: ["Weekly photo/video update", "Clear needs + amounts"] },
  ];

  it("centered heading and lead; main card with project title, Needs list 'name — ₹amount', note and CTA; second card from the panel", () => {
    const out = html(program("project", sections));
    expect(out).toContain("<h1");
    expect(out).toContain("Structured upgrades with weekly updates");
    expect(out).toContain("Example Project: Local Masjid Upgrade");
    expect(out).toContain("<h4>Needs</h4>");
    expect(out).toMatch(/Fans[^<]*—[^<]*<strong class="ivory">₹3,000<\/strong>/);
    expect(out).toContain("₹5,000");
    expect(out).toContain("tiny-note");
    expect(out).toContain("Fund a Need");
    expect(out).toContain("masjid-card secondary glass-panel");
    expect(out).toContain("Update rules");
    expect((out.match(/masjid-card/g) || []).length).toBe(2); // two cards (the second also carries the "secondary" modifier)
  });

  it("without a panel there is a single card; there is never an application button and no invented per-need percentage", () => {
    const out = html(program("project", sections.slice(0, 2)));
    expect(out).toContain("pg-project-single");
    expect(out).not.toContain("secondary");
    expect(out).not.toMatch(/>Apply</);
    expect(out).not.toMatch(/\d+% funded/);
    expect(out).not.toContain("progressbar"); // owner decision: no funding progress bar or percentage is shown
    expect(out).not.toContain("verified of");
  });

  it("other templates are unaffected (relief uses the shared two-column composition)", () => {
    expect(html(program("relief", [{ type: "checklist", items: ["Rent"] }]))).toContain("pg-std");
  });
});

describe("menu label", () => {
  it("is optional, trimmed and limited to 24 characters", () => {
    expect(prepareProgramContent("P", { template: "custom" }).navLabel).toBe("");
    expect(prepareProgramContent("P", { template: "custom", navLabel: "  Family   Relief " }).navLabel).toBe("Family Relief");
    expect(prepareProgramContent("P", { template: "custom", navLabel: "x".repeat(60) }).navLabel).toHaveLength(24);
  });
});
