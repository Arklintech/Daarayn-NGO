import { BaseRepository } from "../repositories/baseRepository";
import { PROGRAM_CATEGORIES, defaultCategoryFor, PROGRAM_TEMPLATES, type ProgramCategory, type ProgramContent, type ProgramSection, type ProgramTemplate } from "./programContentSchema";

export * from "./programContentSchema";

const HEADERS = ["id", "template", "programCategory", "cardSummary", "cardDetails", "ctaText", "sortOrder", "lead", "heroAlt", "heroCaption", "primaryCtaText", "navLabel", "sections", "lastUpdateAt", "updateNote", "holdClearedAt", "holdClearedBy", "updatedAt"];
const parseJson = <T,>(v: unknown, fallback: T): T => {
  try {
    const parsed = JSON.parse(String(v ?? ""));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

export class ProgramContentRepository extends BaseRepository<ProgramContent> {
  constructor() {
    super("Program_Content", HEADERS);
  }
  protected mapRowToEntity(row: Record<string, any>): ProgramContent {
    const template = String(row.template || "custom");
    return {
      id: String(row.id || ""),
      template: (PROGRAM_TEMPLATES as readonly string[]).includes(template) ? (template as ProgramTemplate) : "custom",
      programCategory: ((PROGRAM_CATEGORIES as readonly string[]).includes(String(row.programCategory)) ? row.programCategory : defaultCategoryFor(template)) as ProgramCategory,
      cardSummary: String(row.cardSummary || ""),
      cardDetails: parseJson<string[]>(row.cardDetails, []),
      ctaText: String(row.ctaText || "View Program"),
      sortOrder: Number(row.sortOrder ?? 100) || 0,
      lead: String(row.lead || ""),
      heroAlt: String(row.heroAlt || ""),
      heroCaption: String(row.heroCaption || ""),
      primaryCtaText: String(row.primaryCtaText || "Contribute"),
      navLabel: String(row.navLabel || ""),
      sections: parseJson<ProgramSection[]>(row.sections, []),
      lastUpdateAt: String(row.lastUpdateAt || ""),
      updateNote: String(row.updateNote || ""),
      holdClearedAt: String(row.holdClearedAt || ""),
      holdClearedBy: String(row.holdClearedBy || ""),
      updatedAt: String(row.updatedAt || ""),
    };
  }
  protected mapEntityToRow(c: ProgramContent): Record<string, any> {
    return {
      id: c.id,
      template: c.template,
      programCategory: c.programCategory,
      cardSummary: c.cardSummary,
      cardDetails: JSON.stringify(c.cardDetails),
      ctaText: c.ctaText,
      sortOrder: c.sortOrder,
      lead: c.lead,
      heroAlt: c.heroAlt,
      heroCaption: c.heroCaption,
      primaryCtaText: c.primaryCtaText,
      navLabel: c.navLabel,
      sections: JSON.stringify(c.sections),
      lastUpdateAt: c.lastUpdateAt,
      updateNote: c.updateNote,
      holdClearedAt: c.holdClearedAt,
      holdClearedBy: c.holdClearedBy,
      updatedAt: c.updatedAt,
    };
  }
}

export const programContentRepository = new ProgramContentRepository();
