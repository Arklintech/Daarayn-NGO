'use client';
import Link from "next/link";

export default function Footer() {
  return (
    <footer style={{
      background: 'linear-gradient(180deg, #06101f 0%, #080e1f 100%)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle ambient glow */}
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '600px', height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(255,249,221,0.25), transparent)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '300px', height: '120px',
        background: 'radial-gradient(ellipse at top, rgba(255,249,221,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <style>{`
        .ft-link { color: rgba(255,255,255,0.5); text-decoration: none; font-size: 0.875rem; transition: color 0.2s; display: inline-block; }
        .ft-link:hover { color: rgba(255,249,221,0.9); }
        .ft-small-link { color: rgba(255,255,255,0.28); text-decoration: none; font-size: 0.72rem; letter-spacing: 0.03em; transition: color 0.2s; }
        .ft-small-link:hover { color: rgba(255,255,255,0.6); }
        .footer-grid { display: grid; grid-template-columns: minmax(220px,1.5fr) 1fr 1fr 1.2fr; gap: 2.5rem; align-items: flex-start; }
        @media (max-width: 768px) {
          .footer-grid { grid-template-columns: 1fr 1fr; gap: 2rem 1.25rem; text-align: left; }
          .footer-brand-col { grid-column: 1 / -1; align-items: flex-start !important; }
          .footer-contact-col { grid-column: 1 / -1; }
          .brand-logo-row { justify-content: flex-start !important; }
        }
      `}</style>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '3.5rem 1.5rem 2rem' }}>

        {/* ── TOP GRID ── */}
        <div className="footer-grid">

          {/* Brand */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="footer-brand-col">
            {/* Logo row */}
            <div className="brand-logo-row" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <img
                src="/email logo/daarayn-emblem.png.png"
                alt="Daarayn Logo"
                style={{ width: '64px', height: '64px', objectFit: 'contain', mixBlendMode: 'screen', display: 'block', flexShrink: 0 }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-cinzel), "Cinzel", Georgia, serif', fontSize: '24px', fontWeight: 600, letterSpacing: '10px', color: '#fff', lineHeight: 1.1, textShadow: '0 2px 10px rgba(255,255,255,0.1)' }}>
                  DAARAYN
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                  <span style={{ display: 'block', width: '24px', height: '1px', background: 'rgba(255,249,221,0.5)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-cinzel), "Cinzel", Georgia, serif', fontSize: '10px', fontWeight: 300, letterSpacing: '2.5px', color: 'rgba(255, 249, 221, 0.9)', textTransform: 'uppercase' }}>
                    FOUNDATION
                  </span>
                  <span style={{ display: 'block', width: '24px', height: '1px', background: 'rgba(255,249,221,0.5)', flexShrink: 0 }} />
                </div>
              </div>
            </div>

            <p style={{
              fontFamily: 'Georgia, serif',
              fontSize: '0.82rem', fontStyle: 'italic',
              color: 'rgba(255,255,255,0.38)', lineHeight: '1.6',
              maxWidth: '260px', margin: 0,
            }}>
              Transparent. Accountable.<br />For the sake of Allah.
            </p>

            {/* Trust badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '5px 10px',
              background: 'rgba(255,249,221,0.04)',
              border: '1px solid rgba(255,249,221,0.12)',
              borderRadius: '6px',
              width: 'fit-content',
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,249,221,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span style={{ fontSize: '0.68rem', letterSpacing: '0.1em', color: 'rgba(255,249,221,0.6)', textTransform: 'uppercase', fontWeight: 500 }}>
                100% Transparent
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <p style={{
              fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
              margin: '0 0 0.85rem 0',
            }}>Quick Links</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {[['/', 'Home'], ['/#programs', 'Causes'], ['/#programs', 'Programs'], ['/#about', 'About Us']].map(([href, label]) => (
                <li key={label}><Link href={href} className="ft-link">{label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Get Involved */}
          <div>
            <p style={{
              fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
              margin: '0 0 0.85rem 0',
            }}>Get Involved</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {[['/pay', 'Donate Now'], ['/donor/dashboard', 'Donor Portal'], ['/#about', 'Volunteer'], ['/#about', 'Contact Us']].map(([href, label]) => (
                <li key={label}><Link href={href} className="ft-link">{label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="footer-contact-col">
            <p style={{
              fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
              margin: '0 0 0.85rem 0',
            }}>Contact</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <a href="mailto:info@daarayn.org" className="ft-link" style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <span style={{
                  width: '26px', height: '26px', borderRadius: '6px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="12" height="12" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </span>
                info@daarayn.org
              </a>
              <a href="tel:+919876543210" className="ft-link" style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <span style={{
                  width: '26px', height: '26px', borderRadius: '6px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="12" height="12" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </span>
                +91-98765-43210
              </a>
            </div>
          </div>
        </div>

        {/* ── DIVIDER ── */}
        <div style={{
          margin: '2.25rem 0 1.75rem',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.08) 80%, transparent)',
        }} />

        {/* ── HADITH QUOTE ── */}
        <div style={{ textAlign: 'center', marginBottom: '2rem', padding: '0 1rem' }}>
          <div style={{
            fontFamily: 'Georgia, serif', fontSize: '2rem', lineHeight: 0.5,
            color: 'rgba(255,249,221,0.15)', marginBottom: '0.5rem',
          }}>&ldquo;</div>
          <p style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: '0.85rem', fontStyle: 'italic', lineHeight: '1.7',
            color: 'rgba(255,255,255,0.45)',
            maxWidth: '540px', margin: '0 auto',
          }}>
            Whoever relieves a believer&apos;s distress, Allah will relieve his distress on the Day of Judgment.
          </p>
          <div style={{
            fontFamily: 'Georgia, serif', fontSize: '2rem', lineHeight: 0.5,
            color: 'rgba(255,249,221,0.15)', marginTop: '0.5rem',
          }}>&rdquo;</div>
          <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.25)', marginTop: '0.5rem', letterSpacing: '0.05em' }}>
            — Sahih Muslim
          </p>
        </div>

        {/* ── BOTTOM BAR ── */}
        <div style={{
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07) 20%, rgba(255,255,255,0.07) 80%, transparent)',
          marginBottom: '1.25rem',
        }} />
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.22)', margin: 0, letterSpacing: '0.02em' }}>
            © {new Date().getFullYear()} Daarayn Foundation. All rights reserved.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link href="/#about" className="ft-small-link">Privacy Policy</Link>
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.6rem' }}>◆</span>
            <Link href="/#about" className="ft-small-link">Terms of Service</Link>
          </div>
        </div>

      </div>
    </footer>
  );
}
