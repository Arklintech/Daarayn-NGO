import { describe, it, expect } from "vitest";
import { toggleDonationCause } from "@/lib/donations/causeToggle";

// Regression: the public form preselects "general" and the toggle used to be purely additive, so a donor who picked one
// cause was shown "2 Selected Causes" while the server (which treats general + specific as the specific cause) stored one.
describe("toggleDonationCause (public form selection rules)", () => {
  it("choosing a specific cause replaces the preselected general donation", () => {
    expect(toggleDonationCause(["general"], "EDU")).toEqual(["EDU"]);
  });
  it("several specific causes can be combined", () => {
    expect(toggleDonationCause(["EDU"], "FOOD")).toEqual(["EDU", "FOOD"]);
  });
  it("choosing general clears every specific cause", () => {
    expect(toggleDonationCause(["EDU", "FOOD"], "general")).toEqual(["general"]);
  });
  it("removing the last specific cause falls back to general instead of an empty selection", () => {
    expect(toggleDonationCause(["EDU"], "EDU")).toEqual(["general"]);
  });
  it("deselecting one of several keeps the others", () => {
    expect(toggleDonationCause(["EDU", "FOOD"], "EDU")).toEqual(["FOOD"]);
  });
  it("general stays selected when it is clicked while it is the only choice", () => {
    expect(toggleDonationCause(["general"], "general")).toEqual(["general"]);
  });
});
