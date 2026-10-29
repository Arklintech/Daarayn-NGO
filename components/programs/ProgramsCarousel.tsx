"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ProgramView } from "@/lib/catalog/programs";

/**
 * Horizontal, scroll-snapping carousel of published programs. Three cards on desktop, two on tablet, one on mobile (CSS).
 * Arrows advance exactly one card; touch uses native swipe/scroll; the track is keyboard operable (ArrowLeft/ArrowRight,
 * Home/End) and every card link is reachable with Tab. No autoplay. The track scrolls inside its own viewport so the page
 * never overflows horizontally.
 */
export default function ProgramsCarousel({ programs, label = "Programs" }: { programs: ProgramView[]; label?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ first: 0, visible: 3, canPrev: false, canNext: programs.length > 3 });
  const total = programs.length;

  const measure = useCallback(() => {
    const el = track.current;
    if (!el || el.children.length === 0) return;
    const card = el.children[0] as HTMLElement;
    const step = card.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0");
    const visible = Math.max(1, Math.round((el.clientWidth + parseFloat(getComputedStyle(el).columnGap || "0")) / step));
    const first = Math.min(total - 1, Math.round(el.scrollLeft / step));
    const maxScroll = el.scrollWidth - el.clientWidth;
    setState({ first, visible, canPrev: el.scrollLeft > 2, canNext: el.scrollLeft < maxScroll - 2 });
  }, [total]);

  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const move = (dir: 1 | -1) => {
    const el = track.current;
    if (!el || el.children.length === 0) return;
    const card = el.children[0] as HTMLElement;
    const step = card.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * step, behavior: reduce ? "auto" : "smooth" });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      track.current?.scrollTo({ left: 0 });
    } else if (e.key === "End") {
      e.preventDefault();
      track.current?.scrollTo({ left: track.current.scrollWidth });
    }
  };

  const lastShown = Math.min(total, state.first + state.visible);
  const needsControls = total > state.visible || state.canNext || state.canPrev;

  return (
    <section className="pg-carousel" aria-roledescription="carousel" aria-label={label}>
      {needsControls && (
        <button type="button" className="pg-arrow pg-prev" aria-label={`Previous ${label}`} onClick={() => move(-1)} disabled={!state.canPrev}>
          ‹
        </button>
      )}
      <div className="pg-viewport">
        <div ref={track} className="pg-track" tabIndex={0} role="group" aria-label={`${label}, ${total} in total. Use the left and right arrow keys to browse.`} onKeyDown={onKeyDown}>
          {programs.map((p, i) => (
            <div key={p.id} className="pg-card-item" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${total}`}>
              <article className="program-card glass-panel">
                <div className="pg-card-body">
                  {p.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="pg-card-cover" src={p.coverUrl} alt={p.images.find((i) => i.isCover)?.alt || ""} loading={i < 3 ? "eager" : "lazy"} draggable={false} />
                  ) : null}
                  <h3>{p.title}</h3>
                  {(p.content.cardSummary || p.description) && <p>{p.content.cardSummary || p.description}</p>}
                  {p.content.cardDetails.length > 0 && (
                    <ul>
                      {p.content.cardDetails.map((d, k) => (
                        <li key={k}>{d}</li>
                      ))}
                    </ul>
                  )}
                  <Link href={`/programs/${encodeURIComponent(p.id)}`} className="text-link">
                    {p.content.ctaText || "View Program"} →
                  </Link>
                </div>
              </article>
            </div>
          ))}
        </div>
      </div>
      {needsControls && (
        <button type="button" className="pg-arrow pg-next" aria-label={`Next ${label}`} onClick={() => move(1)} disabled={!state.canNext}>
          ›
        </button>
      )}
      {total > 0 && (
        <p className="pg-position" aria-live="polite">
          {total > state.visible ? `${state.first + 1}–${lastShown} of ${total}` : `${total} ${total === 1 ? "program" : "programs"}`}
        </p>
      )}
    </section>
  );
}
