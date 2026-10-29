import Link from "next/link";
import React from "react";
import type { ProgramContent, ProgramSection } from "@/lib/catalog/programContentSchema";
import { masjidHoldState, masjidUpdateState, MASJID_UPDATE_WINDOW_DAYS } from "@/lib/catalog/programDomains";
import ProgramGallery, { type GalleryImage } from "@/components/programs/ProgramGallery";

/** The fields a detail page needs. The server page and the admin preview pass the same shape. */
export interface ProgramDetailData {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  category: string;
  location: string;
  kind: string;
  status: string;
  targetAmount: number;
  raisedAmount: number;
  supporters?: number;
  content: ProgramContent;
  /** Ordered gallery. When empty, the program's single legacy image (imageUrl) is shown if it has one. */
  images?: { id?: string; url: string; caption: string; alt: string }[];
}

const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function Section({ s }: { s: ProgramSection }) {
  switch (s.type) {
    case "text":
      return (
        <div className="pg-block">
          {s.title && <h3>{s.title}</h3>}
          <p>{s.body}</p>
        </div>
      );
    case "checklist":
      return (
        <div className="pg-block">
          {s.title && <h3>{s.title}</h3>}
          <ul className="pg-checks">
            {s.items.map((i, k) => (
              <li key={k}>{i}</li>
            ))}
          </ul>
        </div>
      );
    case "panel":
      return (
        <div className="impact-box glass-panel pg-block">
          <p>
            <strong>{s.title}</strong>
          </p>
          <ul>
            {s.items.map((i, k) => (
              <li key={k}>{i}</li>
            ))}
          </ul>
        </div>
      );
    case "needs":
      return (
        <div className="pg-block">
          {s.title && <h3>{s.title}</h3>}
          <div className="pg-needs">
            {s.needs.map((n, k) => (
              <div key={k} className="masjid-card glass-panel pg-need">
                <h4>{n.name}</h4>
                {n.amount !== undefined && <p>{money(n.amount)}</p>}
              </div>
            ))}
          </div>
        </div>
      );
    case "milestones":
      return (
        <div className="pg-block">
          {s.title && <h3>{s.title}</h3>}
          <ul className="pg-milestones">
            {s.items.map((m, k) => (
              <li key={k}>
                <span aria-hidden="true">{m.done ? "✓" : "○"}</span>
                <span>
                  <span className="sr-only">{m.done ? "Completed: " : "Pending: "}</span>
                  {m.label}
                  {m.note && <small>{m.note}</small>}
                </span>
              </li>
            ))}
          </ul>
          <p className="pg-note">Milestones are recorded by Daarayn Foundation.</p>
        </div>
      );
  }
}

/**
 * Infrastructure / project funding presentation (the "Masjid Infrastructure Fund" pattern): a main card with the project
 * description, a "Needs" list (name — amount), optional notes and the primary CTA, and, when the administrator provides a
 * highlighted panel, a second card beside it (for example eligibility or update rules). No application button is shown:
 * there is no application workflow. Nothing here is invented: amounts and text are administrator-entered, and the funding bar
 * is derived from verified designations.
 */
function MasjidUpdateNotice({ content }: { content: ProgramContent }) {
  const { lastUpdateAt, updateNote: note } = content;
  const { state, daysSince } = masjidUpdateState(lastUpdateAt);
  if (masjidHoldState(content).held)
    return (
      <p className="pg-note" role="status" data-update-state="overdue">
        On hold for review: no verified update has been recorded for more than {MASJID_UPDATE_WINDOW_DAYS} days. New contributions are paused until an administrator clears the hold.
      </p>
    );
  if (state === "none") return <p className="pg-note" data-update-state="none">No project update has been recorded yet, so this project is not yet shown as verified.</p>;
  if (state === "overdue")
    return (
      <p className="pg-note" role="status" data-update-state="overdue">
        On hold for review: no verified update has been recorded for more than {MASJID_UPDATE_WINDOW_DAYS} days (last update {daysSince} days ago).
      </p>
    );
  return (
    <p className="pg-note" data-update-state="current">
      Last project update recorded {daysSince === 0 ? "today" : `${daysSince} day${daysSince === 1 ? "" : "s"} ago`}.{note ? ` ${note}` : ""}
    </p>
  );
}

function ProjectCards({ sections, progress, cta }: { sections: ProgramSection[]; progress: React.ReactNode; cta: React.ReactNode }) {
  const sidePanelIndex = sections.findIndex((s) => s.type === "panel");
  const side = sidePanelIndex >= 0 ? (sections[sidePanelIndex] as Extract<ProgramSection, { type: "panel" }>) : null;
  const main = sections.filter((_, i) => i !== sidePanelIndex);
  return (
    <div className={`pg-project-grid ${side ? "" : "pg-project-single"}`}>
      <div className="masjid-card glass-panel pg-project-card">
        {main.map((s, i) => {
          switch (s.type) {
            case "needs":
              return (
                <div key={i}>
                  {s.title && s.title.trim().toLowerCase() !== "needs" && <h3>{s.title}</h3>}
                  <h4>Needs</h4>
                  <ul className="disc">
                    {s.needs.map((n, k) => (
                      <li key={k}>
                        {n.name}
                        {n.amount !== undefined && (
                          <>
                            {" — "}
                            <strong className="ivory">{money(n.amount)}</strong>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            case "text":
              return (
                <div key={i}>
                  {s.title && <h3>{s.title}</h3>}
                  <p className={s.body.length < 130 && i > 0 ? "tiny-note" : "muted"}>{s.body}</p>
                </div>
              );
            default:
              return <Section key={i} s={s} />;
          }
        })}
        {progress}
        <div className="pg-cta">{cta}</div>
      </div>
      {side && (
        <div className="masjid-card secondary glass-panel pg-project-card">
          <h3>{side.title}</h3>
          <ul className="pg-plain">
            {side.items.map((it, k) => (
              <li key={k}>{it}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * One detail page, four presentation templates. Every word comes from administrator-entered content or from the program
 * record; the funding bar is derived from verified donations designated to the program's cause. Nothing is invented: a
 * missing field simply does not render.
 */
export default function ProgramDetailView({ program, preview = false, variant = "page", alt = true }: { program: ProgramDetailData; preview?: boolean; variant?: "page" | "section"; alt?: boolean }) {
  const asSection = variant === "section";
  const Heading = asSection ? "h2" : "h1";
  const { content } = program;
  const lead = content.lead || program.description;
  const onHold = !preview && masjidHoldState(content).held;
  const cta = onHold ? (
    <span className="btn btn-ivory" aria-disabled="true" title="Contributions are paused while this project is reviewed">Contributions paused</span>
  ) : preview ? (
    <span className="btn btn-ivory" aria-disabled="true">{content.primaryCtaText}</span>
  ) : (
    <Link href={`/pay?cause=${encodeURIComponent(program.id)}`} className="btn btn-ivory">
      {content.primaryCtaText}
    </Link>
  );

  // No funding progress bar or percentage is shown (owner decision): the slot stays so layouts are unchanged.
  const progress: React.ReactNode = null;

  const gallery: GalleryImage[] = program.images && program.images.length > 0 ? program.images : program.imageUrl ? [{ url: program.imageUrl, caption: content.heroCaption, alt: content.heroAlt }] : [];
  const hero = gallery.length > 0 ? <ProgramGallery images={gallery} title={program.title} /> : null;

  const sections = content.sections.map((s, i) => <Section key={i} s={s} />);
  const urgent = program.status === "Urgent" ? <p className="pg-note" style={{ textAlign: "center" }}>Urgent</p> : null;

  return (
    <div id={asSection ? `program-${program.id}` : undefined} className={`pg-detail ${asSection && !alt ? "section" : "section-alt"}`}>
      <div className="pg-container">
        {!preview && !asSection && (
          <Link href="/programs" className="pg-back">
            ← Programs
          </Link>
        )}
        <Heading className="pg-title">{program.title}</Heading>
        {urgent}

        {content.template === "project" ? (
          <div className="pg-project">
            <div className={`pg-std ${hero ? "" : "pg-std-nohero"}`}>
              {lead && <div className="pg-std-lead"><p className="lead">{lead}</p></div>}
              {hero && <div className="pg-std-hero">{hero}</div>}
            </div>
            <MasjidUpdateNotice content={content} />
            <ProjectCards sections={content.sections} progress={progress} cta={cta} />
          </div>
        ) : (
          // ONE canonical composition for every other template (relief, endowment, custom and anything added later): desktop = copy on the
          // left (introduction, content sections, CTA), image card on the right; mobile/tablet = introduction, image, sections, CTA stacked.
          <div className={`pg-std ${hero ? "" : "pg-std-nohero"}`}>
            {lead && <div className="pg-std-lead"><p className="lead">{lead}</p></div>}
            {hero && <div className="pg-std-hero">{hero}</div>}
            <div className="pg-std-body">
              {sections}
              {progress}
              <div className="pg-cta">{cta}</div>
              {content.template === "endowment" && <p className="pg-note">Contributions are one-time. Recurring monthly commitments are not supported yet.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
