import "../../app/redesign.css";
import "@/components/programs/programs.css";
import Link from "next/link";
import GlobalHeader from "@/components/GlobalHeader";
import Footer from "@/components/Footer";
import { fetchPublicPrograms } from "@/lib/catalog/publicClient";
import type { ProgramView } from "@/lib/catalog/programs";
import { CATEGORY_LABEL, type ProgramCategory } from "@/lib/catalog/programContentSchema";

const BLURB: Record<ProgramCategory, string> = {
  masjid: "Every open Masjid infrastructure project, with its needs and latest verified update.",
  hifz: "Every open Qur'an Hifz program, with documented milestones and teacher verification.",
  general: "Every open cause: relief, education, food and medical assistance.",
};

/** Full published listing of one category (server-rendered from the same cached public data as the homepage carousels). */
export default async function CategoryListing({ category }: { category: ProgramCategory }) {
  let programs: ProgramView[] = [];
  let failed = false;
  try {
    programs = await fetchPublicPrograms({ category });
  } catch {
    failed = true;
  }
  return (
    <main className="main-home-container" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <GlobalHeader showRibbon={false} />
      <div className={category === "hifz" ? "section-alt" : "section"} style={{ flex: 1, paddingTop: 110 }}>
        <section className="pg-wrap">
          <div className="pg-container">
            <Link href="/#programs" className="pg-back">← All categories</Link>
            <h1 className="section-title">{CATEGORY_LABEL[category]}</h1>
            <p className="section-subtitle">{BLURB[category]}</p>
            {failed ? (
              <p role="alert" className="pg-error">These programs are temporarily unavailable. Please try again in a few minutes.</p>
            ) : programs.length === 0 ? (
              <p className="pg-empty">Nothing is open in this category right now. Please check back soon.</p>
            ) : (
              <ul className="pg-list">
                {programs.map((p) => (
                  <li key={p.id} className="pg-list-item">
                    <article className="program-card glass-panel">
                      <div className="pg-card-body">
                        {p.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="pg-card-cover" src={p.coverUrl} alt={p.images.find((i) => i.isCover)?.alt || ""} loading="lazy" />
                        ) : null}
                        <h3>{p.title}</h3>
                        {(p.content.cardSummary || p.description) && <p>{p.content.cardSummary || p.description}</p>}
                        <Link href={`/programs/${encodeURIComponent(p.id)}`} className="text-link">{p.content.ctaText || "View Program"} →</Link>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
      <Footer />
    </main>
  );
}
