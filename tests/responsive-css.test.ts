import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * D22 regression guards for two clipping defects found by measuring the rendered preview (hero action buttons at 280/320 px and the
 * quick-donation ribbon at 820 px). These check that the responsive rules exist; the rendered result is evidenced by the screenshots in
 * docs/audit/evidence-d22. They do not replace a visual check.
 */
const css = fs.readFileSync(path.join(process.cwd(), "app/redesign.css"), "utf8").replace(/\r\n/g, "\n");
const block = (query: string) => {
  const i = css.indexOf(query);
  expect(i, `missing ${query}`).toBeGreaterThan(-1);
  let depth = 0;
  for (let j = css.indexOf("{", i); j < css.length; j++) {
    if (css[j] === "{") depth++;
    if (css[j] === "}" && --depth === 0) return css.slice(i, j + 1);
  }
  return "";
};

describe("responsive rules for the hero actions and the quick-donation ribbon", () => {
  it("hero actions wrap and fill the width at 360 px and below (View Our Impact stays inside 280/320 px screens)", () => {
    const b = block("/* D22: narrow phones");
    expect(b).toMatch(/@media \(max-width: 360px\)/);
    expect(b).toMatch(/\.daarayn-hero-actions\s*{[^}]*flex-wrap: wrap/);
    expect(b).toMatch(/\.daarayn-hero-actions > a\s*{[^}]*flex: 1 1 100%/);
  });

  it("the ribbon wraps onto a second row between 769 and 920 px (Quick Donate no longer overflows at 820 px) and the hero content makes room", () => {
    const b = block("/* D22: tablet widths");
    expect(b).toMatch(/@media \(min-width: 769px\) and \(max-width: 920px\)/);
    expect(b).toMatch(/\.daarayn-quick-donation-ribbon\s*{[^}]*flex-wrap: wrap[^}]*}/);
    expect(b).toMatch(/\.daarayn-hero-content\s*{[^}]*padding-top: 56px/);
  });

  it("at 300 px and below the CTA moves to its own row so the cause name stays readable", () => {
    const b = block("/* D22: at 300 px");
    expect(b).toMatch(/@media \(max-width: 300px\)/);
    expect(b).toMatch(/\.daarayn-ribbon-action-row\s*{[^}]*flex-wrap: wrap/);
  });

  it("the hero video is hidden for reduced motion (poster background remains)", () => {
    expect(block("@media (prefers-reduced-motion: reduce)")).toMatch(/\.daarayn-hero-video\s*{[^}]*display: none/);
  });

  it("D24: the hero overlays are light enough for the video to show (dark overlay at most 0.2) and mobile crops to the lit part of the frame", () => {
    expect(block(".daarayn-hero-overlay-dark")).toMatch(/rgba\(2, 6, 13, 0\.(0\d*|1\d*)\)/);
    expect(css).toMatch(/\.daarayn-hero-video\s*{[^}]*object-position: 72% center/);
  });

  it("D24: each View All page uses the same section class as its home section (Hifz alternates)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "components/programs/CategoryListing.tsx"), "utf8");
    const home = fs.readFileSync(path.join(process.cwd(), "components/programs/HomePrograms.tsx"), "utf8");
    expect(src).toContain('category === "hifz" ? "section-alt" : "section"');
    expect(home).toContain('i % 2 === 0 ? "section" : "section-alt"'); // masjid, hifz, general -> section, section-alt, section
  });
});
