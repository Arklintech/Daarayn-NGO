'use client';

import { useEffect, useRef, useState } from 'react';

type Stats = { casesCompleted: number; masjidProjects: number; studentsSponsored: number | null };
const REFRESH_MS = 60_000;

/** Live public aggregates. While loading it shows an ellipsis; if the source is unavailable it shows a dash, never a made-up zero. */
function useStats() {
  const [state, setState] = useState<{ status: 'loading' | 'ok' | 'unavailable'; stats?: Stats }>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/public/stats', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const stats = (await res.json()) as Stats;
        if (!cancelled) setState({ status: 'ok', stats });
      } catch {
        if (!cancelled) setState((s) => (s.status === 'ok' ? s : { status: 'unavailable' }));
      }
    };
    void load();
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = setInterval(onVisible, REFRESH_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return state;
}

const show = (state: { status: string; stats?: Stats }, pick: (s: Stats) => number | null | undefined) => {
  if (state.status === 'loading') return '…';
  const v = state.status === 'ok' && state.stats ? pick(state.stats) : null;
  return v === null || v === undefined ? '—' : String(v);
};

/**
 * The hero video source. The 2.4 MB "fast" file (about 1.3 Mbit/s) looks soft and blocky, so the full-quality 1080p master is the default; the small file
 * is used only when the visitor asks to save data or is on a slow connection. A 4K file (public/hero-video-4k.mp4) is used on large or high-density screens
 * when it exists in the project. No 4K master exists in the repository today: the 1080p master is the highest quality available.
 */
function pickHeroSource(has4k: boolean): string {
  const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const slow = Boolean(conn?.saveData) || /^(slow-2g|2g|3g)$/.test(conn?.effectiveType || '');
  if (slow) return '/hero-video-fast.mp4';
  const pixels = Math.max(window.screen.width, window.screen.height) * (window.devicePixelRatio || 1);
  return has4k && pixels >= 2560 ? '/hero-video-4k.mp4' : '/background%20video.mp4';
}

export default function HeroSection({ has4k = false }: { has4k?: boolean }) {
  const stats = useStats();
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.src = pickHeroSource(has4k);
    v.load();
    void v.play().catch(() => undefined); // autoplay can be refused (battery saver); the poster stays visible then
  }, [has4k]);
  return (
    <section className="cinematic-hero-scene">
      {/* Background layer */}
      <div className="daarayn-hero-bg">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          poster="/hero-poster.jpg"
          className="daarayn-hero-video"
        />
        <div className="daarayn-hero-overlay-dark"></div>
        <div className="daarayn-hero-overlay-gradient"></div>
      </div>

      {/* Spacer: Desktop only — clears fixed navbar (86px) + fixed ribbon (52px) + gap (20px) = 158px */}
      {/* Mobile: NO spacer needed — GlobalHeader ribbon is in-flow, providing natural clearance */}
      <div style={{ height: '158px', flexShrink: 0 }} className="hidden md:block"></div>

      <div className="daarayn-hero-content">
        {/* Left Column */}
        <div className="daarayn-hero-left">
          <p className="daarayn-hero-kicker">
            Track Your Donation
          </p>
          <h1 className="daarayn-hero-title">
            Structured Charity.<br />
            Documented Impact.<br />
            <span className="ivory-text">Enduring Barakah.</span>
          </h1>
          <p className="daarayn-hero-subtitle">
            A trust-first giving model built on <span className="ivory-italic">amanah</span> and verification.<br/>
            Every contribution is logged, every distribution is documented, and every life we touch is valued.
          </p>
          <div className="daarayn-hero-actions">
            <a href="#programs" className="daarayn-btn-primary">
              Explore Programs <ArrowRightIcon />
            </a>
            <a href="#impact" className="daarayn-btn-secondary">
              View Our Impact
            </a>
          </div>
        </div>

        {/* Right Column: Trust Allocation Panel */}
        <div className="daarayn-hero-right">
          <div className="daarayn-trust-panel">
            <h2 className="trust-panel-title">Trust Allocation Model</h2>
            
            <p className="trust-panel-stat">
              <span className="ivory-text-bold">90%</span> distributed to beneficiaries & projects.
            </p>
            <p className="trust-panel-stat">
              <span className="ivory-text-bold">10%</span> supports delivery, verification, and operations.
            </p>

            <div className="trust-panel-divider"></div>

            <div className="trust-cards-grid">
              <div className="trust-card">
                <ClipboardIcon />
                <div className="trust-card-number" data-stat="casesCompleted">{show(stats, (s) => s.casesCompleted)}</div>
                <div className="trust-card-label">Cases<br/>Completed</div>
              </div>
              <div className="trust-card">
                <GraduationCapIcon />
                <div className="trust-card-number" data-stat="studentsSponsored">{show(stats, (s) => s.studentsSponsored)}</div>
                <div className="trust-card-label">Students<br/>Sponsored</div>
              </div>
              <div className="trust-card">
                <MosqueIcon />
                <div className="trust-card-number" data-stat="masjidProjects">{show(stats, (s) => s.masjidProjects)}</div>
                <div className="trust-card-label">Masjid<br/>Projects</div>
              </div>
            </div>

            <p className="trust-panel-note">
              Every entry is linked to a tracking ID and proof<br/>(photo/video/receipt).
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft: '4px'}}>
      <line x1="5" y1="12" x2="19" y2="12"></line>
      <polyline points="12 5 19 12 12 19"></polyline>
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF9DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="trust-card-icon">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
      <path d="M9 14l2 2 4-4"></path>
    </svg>
  );
}

function GraduationCapIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF9DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="trust-card-icon">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
      <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
    </svg>
  );
}

function MosqueIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFF9DD" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="trust-card-icon">
      <path d="M12 2v20"></path>
      <path d="M8 22v-6a4 4 0 0 1 8 0v6"></path>
      <path d="M2 22h20"></path>
      <path d="M5 22v-8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8"></path>
      <path d="M12 2l-2 4h4z"></path>
    </svg>
  );
}
