"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

export interface GalleryImage {
  id?: string;
  url: string;
  caption: string;
  alt: string;
}

/**
 * Framed media panel with an ordered, browsable image set. One image at a time (native scroll-snap, so touch swipe works),
 * previous/next arrows, "n of N", caption and alt text that follow the current image, keyboard (Arrow keys, Home, End) and no
 * autoplay. With a single image no controls are shown. The frame keeps the existing look (glass-panel, rounded corners, caption below).
 */
export default function ProgramGallery({ images, title }: { images: GalleryImage[]; title: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const total = images.length;

  const measure = useCallback(() => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.min(total - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
  }, [total]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // When the set changes (preview while editing) keep the position valid.
  useEffect(() => {
    if (index > total - 1) setIndex(Math.max(0, total - 1));
  }, [total, index]);

  const go = (to: number) => {
    const el = track.current;
    if (!el) return;
    const target = Math.min(total - 1, Math.max(0, to));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: target * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
    setIndex(target);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (total < 2) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(total - 1); }
  };

  if (total === 0) return null;
  const current = images[Math.min(index, total - 1)];

  return (
    <figure className="glass-panel pg-frame pg-gallery" style={{ margin: 0 }} aria-roledescription={total > 1 ? "carousel" : undefined} aria-label={total > 1 ? `${title} images` : undefined}>
      <div className="pg-gallery-view">
        <div ref={track} className="pg-gallery-track" tabIndex={total > 1 ? 0 : -1} onKeyDown={onKeyDown} role={total > 1 ? "group" : undefined} aria-label={total > 1 ? `${title} images, ${total} in total. Use the left and right arrow keys to browse.` : undefined}>
          {images.map((img, i) => (
            <div key={img.id ?? img.url + i} className="pg-gallery-slide" role={total > 1 ? "group" : undefined} aria-roledescription={total > 1 ? "slide" : undefined} aria-label={total > 1 ? `${i + 1} of ${total}` : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt || img.caption || title} loading={i === 0 ? "eager" : "lazy"} draggable={false} />
            </div>
          ))}
        </div>
        {total > 1 && (
          <>
            <button type="button" className="pg-gallery-arrow pg-gallery-prev" aria-label="Previous image" onClick={() => go(index - 1)} disabled={index === 0}>‹</button>
            <button type="button" className="pg-gallery-arrow pg-gallery-next" aria-label="Next image" onClick={() => go(index + 1)} disabled={index === total - 1}>›</button>
          </>
        )}
      </div>
      <figcaption className="image-caption">
        {total > 1 && <span className="pg-gallery-pos" aria-live="polite">{index + 1} of {total}</span>}
        {current.caption && <span className="pg-gallery-caption">{current.caption}</span>}
      </figcaption>
    </figure>
  );
}
