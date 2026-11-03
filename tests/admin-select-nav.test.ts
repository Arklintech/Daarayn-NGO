import { describe, it, expect } from "vitest";
import { moveIndex, typeahead, appendTypeahead } from "@/lib/admin/selectNav";

/**
 * Keyboard behaviour of the admin dropdown (components/admin/AdminSelect.tsx), kept in pure functions so it can be tested without a DOM.
 * The allocation form lists every verified donation in one dropdown, so long lists must be navigable without the mouse: arrows, Home/End, paging and type-to-jump.
 */
describe("moveIndex", () => {
  it("moves one step with the arrow keys and stops at the ends (no wrapping)", () => {
    expect(moveIndex(2, "ArrowDown", 5)).toBe(3);
    expect(moveIndex(2, "ArrowUp", 5)).toBe(1);
    expect(moveIndex(4, "ArrowDown", 5)).toBe(4);
    expect(moveIndex(0, "ArrowUp", 5)).toBe(0);
  });
  it("Home and End jump to the first and last option", () => {
    expect(moveIndex(3, "Home", 8)).toBe(0);
    expect(moveIndex(3, "End", 8)).toBe(7);
  });
  it("PageDown and PageUp move by a page (8) and clamp", () => {
    expect(moveIndex(1, "PageDown", 30)).toBe(9);
    expect(moveIndex(25, "PageDown", 30)).toBe(29);
    expect(moveIndex(10, "PageUp", 30)).toBe(2);
    expect(moveIndex(3, "PageUp", 30)).toBe(0);
  });
  it("an empty list stays at -1 and an unrelated key changes nothing", () => {
    expect(moveIndex(-1, "ArrowDown", 0)).toBe(-1);
    expect(moveIndex(2, "x", 5)).toBe(2);
  });
  it("from 'nothing active' (-1) ArrowDown lands on the first option", () => {
    expect(moveIndex(-1, "ArrowDown", 4)).toBe(0);
    expect(moveIndex(-1, "ArrowUp", 4)).toBe(0);
  });
});

describe("typeahead", () => {
  const labels = ["DA92635 · Alloc20", "DA92636 · Bilal", "DA92700 · Bilal Khan", "ZZ test donor", "Zakat fund"];
  it("jumps to the first option starting with what was typed, ignoring case", () => {
    expect(typeahead(labels, "da927", 0)).toBe(2);
    expect(typeahead(labels, "z", 0)).toBe(3);
    expect(typeahead(labels, "zak", 0)).toBe(4);
  });
  it("typing the same single letter again cycles to the next match", () => {
    expect(typeahead(labels, "z", 3)).toBe(4);
    expect(typeahead(labels, "z", 4)).toBe(3);
  });
  it("returns -1 when nothing matches or the query is empty", () => {
    expect(typeahead(labels, "q", 0)).toBe(-1);
    expect(typeahead(labels, "", 0)).toBe(-1);
  });
  it("a multi-letter query matches from the current option, so refining does not skip back", () => {
    expect(typeahead(labels, "da9263", 1)).toBe(1);
  });
});

describe("appendTypeahead", () => {
  it("keeps building the query while the keys come quickly, and starts over after a pause", () => {
    let s = appendTypeahead({ buffer: "", at: 0 }, "d", 1000);
    s = appendTypeahead(s, "a", 1200);
    expect(s.buffer).toBe("da");
    s = appendTypeahead(s, "9", 1900);
    expect(s.buffer).toBe("da9");
    s = appendTypeahead(s, "z", 3000);
    expect(s.buffer).toBe("z");
  });
  it("ignores non-printing keys", () => {
    expect(appendTypeahead({ buffer: "ab", at: 100 }, "Shift", 150).buffer).toBe("ab");
    expect(appendTypeahead({ buffer: "ab", at: 100 }, "ArrowDown", 150).buffer).toBe("ab");
    expect(appendTypeahead({ buffer: "ab", at: 100 }, " ", 150).buffer).toBe("ab");
  });
});
