import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ programs: [] as any[], fail: false }));
vi.mock("@/lib/catalog/publicClient", () => ({
  fetchPublicPrograms: async () => {
    if (state.fail) throw new Error("source down");
    return state.programs;
  },
}));
vi.mock("@/components/GlobalHeader", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: any) => React.createElement("a", { href, ...rest }, children) }));

const prog = (id: string) => ({ id, title: `Program ${id}`, description: "d", coverUrl: "", images: [], content: { cardSummary: "s", ctaText: "View Program", programCategory: "hifz", cardDetails: [] } });
const render = async () => {
  const { default: CategoryListing } = await import("@/components/programs/CategoryListing");
  return renderToStaticMarkup(await CategoryListing({ category: "hifz" }));
};

describe("category listing adapts to the number of published records", () => {
  it("renders exactly the published records (1, 2, 3, many) in one shared list, never dummy cards", async () => {
    for (const n of [1, 2, 3, 7]) {
      state.programs = Array.from({ length: n }, (_, i) => prog(`P-${i}`));
      const html = await render();
      expect((html.match(/class="pg-list-item"/g) || []).length).toBe(n);
    }
  });

  it("empty category: an intentional empty state and no list", async () => {
    state.programs = [];
    const html = await render();
    expect(html).toContain("pg-empty");
    expect(html).toContain("Nothing is open in this category right now");
    expect(html).not.toContain("pg-list-item");
  });

  it("source failure: an honest unavailable message, not an empty-category message", async () => {
    state.fail = true;
    const html = await render();
    state.fail = false;
    expect(html).toContain("temporarily unavailable");
    expect(html).not.toContain("Nothing is open");
  });
});

describe("alignment rules live in one shared stylesheet", () => {
  const css = fs.readFileSync("components/programs/programs.css", "utf8");
  it("the listing is a centred wrapping flex row (so 1 or 2 cards are centred), with the carousel's card width; the carousel track centres short collections", () => {
    const list = css.slice(css.indexOf(".pg-list {"), css.indexOf(".pg-list {") + 200);
    expect(list).toContain("display: flex");
    expect(list).toContain("flex-wrap: wrap");
    expect(list).toContain("justify-content: center");
    expect(css).toMatch(/\.pg-track \{ justify-content: safe center; \}/);
  });
  it("tablet shows two per row and mobile one, with no fixed pixel widths", () => {
    expect(css).toContain("flex-basis: calc((100% - 1.5rem) / 2)");
    expect(css).toMatch(/max-width: 680px\) \{\s*\.pg-list-item \{ flex-basis: 100%/);
  });
  it("all three category pages use the same component", () => {
    for (const d of ["masjid-projects", "quran-hifz", "general-causes"]) expect(fs.readFileSync(`app/${d}/page.tsx`, "utf8")).toContain("CategoryListing");
  });
});
