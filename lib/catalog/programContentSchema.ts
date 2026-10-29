/**
 * lib/catalog/programContentSchema.ts (pure: safe to import from client code)
 *
 * Public page content of a PROGRAM. A program is a Causes-tab row with kind "project" (its permanent id, title, status,
 * target, image and fundraising identity live there); this module adds only the presentation content, keyed by the SAME id in
 * the Program_Content tab. There is no second catalog: the lifecycle status is read from the cause row, never copied.
 *
 * Content is validated server-side against a controlled set of templates and block types. Nothing here invents copy,
 * amounts, progress, testimonials or evidence: every value is administrator-entered, and funding progress is derived from
 * verified designations elsewhere.
 */
import { CatalogError } from "./errors";

export const PROGRAM_TEMPLATES = ["relief", "endowment", "project", "custom"] as const;
export type ProgramTemplate = (typeof PROGRAM_TEMPLATES)[number];

/** Category = which management experience and public listing a program belongs to. It is separate from the page template. */
export const PROGRAM_CATEGORIES = ["masjid", "hifz", "general"] as const;
export type ProgramCategory = (typeof PROGRAM_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<ProgramCategory, string> = { masjid: "Masjid Infrastructure", hifz: "Qur'an Hifz", general: "General Causes" };
/** Legacy rows have no stored category: the template decides (project = Masjid, endowment = Hifz, everything else = General). */
export const defaultCategoryFor = (template: string): ProgramCategory => (template === "project" ? "masjid" : template === "endowment" ? "hifz" : "general");
export const TEMPLATE_LABELS: Record<ProgramTemplate, string> = {
  relief: "Relief and assistance",
  endowment: "Endowment or sponsorship",
  project: "Infrastructure or project funding",
  custom: "Custom (content blocks only)",
};

export type ProgramSection =
  | { type: "text"; title?: string; body: string }
  | { type: "checklist"; title?: string; items: string[] }
  | { type: "panel"; title: string; items: string[] }
  | { type: "needs"; title?: string; needs: { name: string; amount?: number }[] }
  | { type: "milestones"; title?: string; items: { label: string; done: boolean; note?: string }[] };

export const SECTION_TYPES = ["text", "checklist", "panel", "needs", "milestones"] as const;

export interface ProgramContent {
  id: string;
  template: ProgramTemplate;
  programCategory: ProgramCategory;
  cardSummary: string;
  cardDetails: string[];
  ctaText: string;
  sortOrder: number;
  lead: string;
  heroAlt: string;
  heroCaption: string;
  primaryCtaText: string;
  /** Optional short label: when set, the program is listed in the site menu and links to its homepage section. */
  navLabel: string;
  sections: ProgramSection[];
  /** Masjid Infrastructure only: when an administrator last recorded a verified project update (server time, never client-supplied). */
  lastUpdateAt: string;
  updateNote: string;
  /** When an administrator last explicitly cleared an update-overdue hold (server time), and who. */
  holdClearedAt: string;
  holdClearedBy: string;
  updatedAt: string;
}

export const DEFAULT_CONTENT = (id: string): ProgramContent => ({
  id,
  template: "custom",
  programCategory: "general",
  cardSummary: "",
  cardDetails: [],
  ctaText: "View Program",
  sortOrder: 100,
  lead: "",
  heroAlt: "",
  heroCaption: "",
  primaryCtaText: "Contribute",
  navLabel: "",
  lastUpdateAt: "",
  updateNote: "",
  holdClearedAt: "",
  holdClearedBy: "",
  sections: [],
  updatedAt: "",
});

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const cleanBlock = (v: unknown, max: number) => String(v ?? "").replace(/\r/g, "").trim().slice(0, max);
const lines = (v: unknown, maxItems: number, maxLen: number): string[] =>
  (Array.isArray(v) ? v : String(v ?? "").split("\n")).map((x) => clean(x, maxLen)).filter(Boolean).slice(0, maxItems);

export interface ProgramContentInput {
  template?: string;
  programCategory?: string;
  cardSummary?: string;
  cardDetails?: unknown;
  ctaText?: string;
  sortOrder?: unknown;
  lead?: string;
  heroAlt?: string;
  heroCaption?: string;
  primaryCtaText?: string;
  navLabel?: string;
  sections?: unknown;
  /** Masjid Infrastructure: true stamps lastUpdateAt with the server clock. */
  recordUpdate?: boolean;
  updateNote?: string;
}

/** Pure validation and normalisation. Throws CatalogError (400) naming the problem; nothing is stored here. */
export function prepareProgramContent(id: string, input: ProgramContentInput | undefined | null): ProgramContent {
  const src = input || {};
  const template = String(src.template ?? "custom") as ProgramTemplate;
  if (!(PROGRAM_TEMPLATES as readonly string[]).includes(template)) throw new CatalogError(`Unknown template "${src.template}". Use one of: ${PROGRAM_TEMPLATES.join(", ")}.`);

  const category = (src.programCategory === undefined || src.programCategory === "" ? defaultCategoryFor(template) : String(src.programCategory)) as ProgramCategory;
  if (!(PROGRAM_CATEGORIES as readonly string[]).includes(category)) throw new CatalogError(`Unknown category "${src.programCategory}". Use one of: ${PROGRAM_CATEGORIES.join(", ")}.`);
  // Masjid-only rules (verified-update hold, needs list) belong to the infrastructure template, so the two always go together.
  if ((category === "masjid") !== (template === "project")) throw new CatalogError("The Masjid Infrastructure category uses the infrastructure/project template, and that template belongs only to that category.");

  const sortOrder = Number(src.sortOrder ?? 100);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) throw new CatalogError("The order must be a whole number from 0 to 9999.");

  const rawSections = Array.isArray(src.sections) ? src.sections : [];
  if (rawSections.length > 12) throw new CatalogError("A program page can have at most 12 content sections.");
  const sections: ProgramSection[] = rawSections.map((s: any, i: number) => {
    const type = String(s?.type ?? "");
    const where = `Section ${i + 1}`;
    const title = clean(s?.title, 120);
    switch (type) {
      case "text": {
        const body = cleanBlock(s?.body, 2000);
        if (!body) throw new CatalogError(`${where} (text) needs some text.`);
        return { type, title: title || undefined, body };
      }
      case "checklist": {
        const items = lines(s?.items, 12, 160);
        if (!items.length) throw new CatalogError(`${where} (checklist) needs at least one item.`);
        return { type, title: title || undefined, items };
      }
      case "panel": {
        const items = lines(s?.items, 12, 160);
        if (!title) throw new CatalogError(`${where} (panel) needs a title.`);
        if (!items.length) throw new CatalogError(`${where} (panel) needs at least one line.`);
        return { type, title, items };
      }
      case "needs": {
        const needs = (Array.isArray(s?.needs) ? s.needs : []).slice(0, 20).map((n: any) => {
          const name = clean(n?.name, 120);
          if (!name) throw new CatalogError(`${where}: every need needs a name.`);
          const hasAmount = n?.amount !== undefined && n?.amount !== null && String(n.amount) !== "";
          const amount = hasAmount ? Number(n.amount) : undefined;
          if (hasAmount && (!Number.isFinite(amount) || (amount as number) < 0)) throw new CatalogError(`${where}: the amount of "${name}" must be zero or a positive number.`);
          return { name, ...(hasAmount ? { amount } : {}) };
        });
        if (!needs.length) throw new CatalogError(`${where} (needs) needs at least one need.`);
        return { type, title: title || undefined, needs };
      }
      case "milestones": {
        const items = (Array.isArray(s?.items) ? s.items : []).slice(0, 20).map((m: any) => {
          const label = clean(m?.label, 160);
          if (!label) throw new CatalogError(`${where}: every milestone needs a label.`);
          const note = clean(m?.note, 300);
          return { label, done: Boolean(m?.done), ...(note ? { note } : {}) };
        });
        if (!items.length) throw new CatalogError(`${where} (milestones) needs at least one milestone.`);
        return { type, title: title || undefined, items };
      }
      default:
        throw new CatalogError(`${where} has an unknown type "${type}". Use one of: ${SECTION_TYPES.join(", ")}.`);
    }
  });

  return {
    id,
    template,
    programCategory: category,
    cardSummary: clean(src.cardSummary, 300),
    cardDetails: lines(src.cardDetails, 4, 120),
    ctaText: clean(src.ctaText, 40) || "View Program",
    sortOrder,
    lead: cleanBlock(src.lead, 600),
    heroAlt: clean(src.heroAlt, 200),
    heroCaption: clean(src.heroCaption, 200),
    primaryCtaText: clean(src.primaryCtaText, 40) || "Contribute",
    navLabel: clean(src.navLabel, 24),
    sections,
    lastUpdateAt: "",
    updateNote: clean(src.updateNote, 300),
    holdClearedAt: "",
    holdClearedBy: "",
    updatedAt: new Date().toISOString(),
  };
}

