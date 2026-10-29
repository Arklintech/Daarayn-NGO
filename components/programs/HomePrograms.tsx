import Link from "next/link";
import "@/components/programs/programs.css";
import ProgramsCarousel from "@/components/programs/ProgramsCarousel";
import { fetchPublicPrograms } from "@/lib/catalog/publicClient";
import type { ProgramView } from "@/lib/catalog/programs";
import { CATEGORY_LABEL, type ProgramCategory } from "@/lib/catalog/programContentSchema";

const MAX_PER_CAROUSEL = 12;
export const CATEGORY_ROUTE: Record<ProgramCategory, string> = { masjid: "/masjid-projects", hifz: "/quran-hifz", general: "/general-causes" };
const SECTIONS: { category: ProgramCategory; id: string; subtitle: string; viewAll: string; empty: string; carouselLabel: string }[] = [
  { category: "masjid", id: "masjid-projects", subtitle: "Infrastructure projects with itemised needs and verified progress updates.", viewAll: "View All Masjid Projects", empty: "No Masjid project is open right now.", carouselLabel: "Masjid projects" },
  { category: "hifz", id: "quran-hifz", subtitle: "Sponsor a student's memorization journey with regular verification.", viewAll: "View All Qur'an Hifz Programs", empty: "No Qur'an Hifz program is open right now.", carouselLabel: "Qur'an Hifz programs" },
  { category: "general", id: "general-causes", subtitle: "Relief, education, food and medical assistance with documented delivery.", viewAll: "View All Causes", empty: "No cause is open right now.", carouselLabel: "General causes" },
];

/**
 * Homepage discovery: one carousel per category, all from the persisted Programs data (Google Sheets, through the cached public API).
 * Nothing is hardcoded or invented: an empty category says so, an unreadable source says so. Arrow clicks only scroll already-loaded cards.
 */
export default async function HomePrograms() {
  let programs: ProgramView[] = [];
  let failed = false;
  try {
    programs = await fetchPublicPrograms();
  } catch {
    failed = true;
  }
  return (
    <div id="programs">
      {SECTIONS.map((s, i) => {
        const all = programs.filter((p) => p.content.programCategory === s.category);
        const list = all.slice(0, MAX_PER_CAROUSEL); // the carousel previews the first cards in the administrator's order; "View All" lists everything
        return (
          <section key={s.category} id={s.id} className={i % 2 === 0 ? "section" : "section-alt"} aria-labelledby={`${s.id}-title`}>
            <div className="container">
              <h2 id={`${s.id}-title`} className="section-title">{CATEGORY_LABEL[s.category]}</h2>
              <p className="section-subtitle">{s.subtitle}</p>
              {failed ? (
                <p role="alert" className="pg-error">These programs are temporarily unavailable. Please try again in a few minutes.</p>
              ) : list.length === 0 ? (
                <p className="pg-empty">{s.empty}</p>
              ) : (
                <ProgramsCarousel programs={list} label={s.carouselLabel} />
              )}
              <p className="pg-viewall">
                <Link href={CATEGORY_ROUTE[s.category]} className="text-link">{s.viewAll} →</Link>
              </p>
            </div>
          </section>
        );
      })}
    </div>
  );
}
