import { describe, it, expect } from "vitest";
import fs from "fs";

describe("public footer and privacy page", () => {
  const footer = fs.readFileSync("components/Footer.tsx", "utf8");
  const privacy = fs.readFileSync("app/privacy/page.tsx", "utf8");
  it("the footer has no Get Involved section and no Donate Now / Donor Portal / Field Agents links; Privacy Policy points at /privacy", () => {
    expect(footer).not.toMatch(/Get Involved|Donate Now|Donor Portal|Field Agents/);
    expect(footer).toContain('href="/privacy"');
    expect(footer).not.toMatch(/9876543210|98765-43210|Terms of Service|daarayn\.org/); // placeholders removed, no invented contact details
  });
  it("the privacy page carries the owner's sections 4 and 5 and names no technology provider", () => {
    expect(privacy).toContain("4. Information Handling and Protection");
    expect(privacy).toContain("5. Authorised Account Access and Organisational Files");
    expect(privacy).toContain("Donors and public website visitors are not required to connect their personal accounts.");
    expect(privacy).toContain("train general-purpose artificial intelligence or machine-learning models");
    expect(privacy.replace(/[\w.+-]+@[\w.-]+/g, "")).not.toMatch(/Google|Firebase|Gmail|SMTP|Sheets|Drive|Vercel|Next\.js|OAuth/i);
  });
});

describe("no funding percentage bar anywhere (owner decision)", () => {
  it("the public detail page, the catalog cards and the admin cause workspace have no progress bar or percentage text", () => {
    for (const f of ["components/programs/ProgramDetailView.tsx", "components/catalog/CatalogPage.tsx", "app/admin/causes/[causeId]/page.tsx"]) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/role="progressbar"|% Funded|\}%\)|width: `\$\{pct\}%`/);
    }
  });
});
