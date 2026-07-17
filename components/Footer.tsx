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
        .footer-grid { display: grid; grid-template-columns: minmax(220px,1.7fr) 1fr 1fr 1fr; gap: 3rem; align-items: flex-start; }
        @media (max-width: 768px) {
          .footer-grid { grid-template-columns: 1fr; gap: 2rem; text-align: center; }
          .footer-grid > div { align-items: center; }
          .brand-logo-row { justify-content: center; }
        }
      `}</style>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '6rem 2rem 2.5rem' }}>

        {/* ── TOP GRID ── */}
        <div className="footer-grid">

          {/* Brand */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} className="footer-brand-col">
            {/* Logo row */}
            <div className="brand-logo-row" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <img
                src="/email logo/daarayn-emblem.png.png"
                alt="Daarayn Logo"
                style={{ width: '80px', height: '80px', objectFit: 'contain', mixBlendMode: 'screen', display: 'block', flexShrink: 0 }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-cinzel), "Cinzel", Georgia, serif', fontSize: '28px', fontWeight: 600, letterSpacing: '4px', color: '#fff', lineHeight: 1.1, textShadow: '0 2px 10px rgba(255,255,255,0.1)' }}>
                  DAARAYN
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <span style={{ display: 'block', width: '32px', height: '1px', background: 'rgba(255,249,221,0.5)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-cinzel), "Cinzel", Georgia, serif', fontSize: '11px', fontWeight: 300, letterSpacing: '3px', color: 'rgba(255, 249, 221, 0.9)', textTransform: 'uppercase' }}>
                    FOUNDATION
                  </span>
                  <span style={{ display: 'block', width: '32px', height: '1px', background: 'rgba(255,249,221,0.5)', flexShrink: 0 }} />
                </div>
              </div>
            </div>

            <p style={{
              fontFamily: 'Georgia, serif',
              fontSize: '0.82rem', fontStyle: 'italic',
              color: 'rgba(255,255,255,0.38)', lineHeight: '1.7',
              maxWidth: '230px', margin: 0,
            }}>
              Transparent. Accountable.<br />For the sake of Allah.
            </p>

            {/* Trust badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px',
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
              fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)',
              margin: '0 0 1.1rem 0',
            }}>Quick Links</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {[['/', 'Home'], ['/causes', 'Causes'], ['/programs', 'Programs'], ['/about', 'About Us']].map(([href, label]) => (
                <li key={href}><Link href={href} className="ft-link">{label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Get Involved */}
          <div>
            <p style={{
              fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)',
              margin: '0 0 1.1rem 0',
            }}>Get Involved</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {[['/donate', 'Donate Now'], ['/donor/dashboard', 'Donor Portal'], ['/volunteer', 'Volunteer'], ['/contact', 'Contact Us']].map(([href, label]) => (
                <li key={href}><Link href={href} className="ft-link">{label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p style={{
              fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.22em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)',
              margin: '0 0 1.1rem 0',
            }}>Contact</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <a href="mailto:info@daaraynaid.org" className="ft-link" style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <span style={{
                  width: '28px', height: '28px', borderRadius: '6px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="12" height="12" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </span>
                info@daaraynaid.org
              </a>
              <a href="tel:+91XXXXXXXXXX" className="ft-link" style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <span style={{
                  width: '28px', height: '28px', borderRadius: '6px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="12" height="12" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </span>
                +91-XXXX-XXX-XXX
              </a>
            </div>
          </div>
        </div>

        {/* ── DIVIDER ── */}
        <div style={{
          margin: '3.5rem 0 2.5rem',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.08) 80%, transparent)',
        }} />

        {/* ── HADITH QUOTE ── */}
        <div style={{ textAlign: 'center', marginBottom: '3rem', padding: '0 2rem' }}>
          <div style={{
            fontFamily: 'Georgia, serif', fontSize: '3rem', lineHeight: 0.5,
            color: 'rgba(255,249,221,0.12)', marginBottom: '1rem',
          }}>&ldquo;</div>
          <p style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: '0.9rem', fontStyle: 'italic', lineHeight: '1.85',
            color: 'rgba(255,255,255,0.42)',
            maxWidth: '540px', margin: '0 auto',
          }}>
            Whoever relieves a believer&apos;s distress, Allah will relieve his distress on the Day of Judgment.
          </p>
          <div style={{
            fontFamily: 'Georgia, serif', fontSize: '3rem', lineHeight: 0.5,
            color: 'rgba(255,249,221,0.12)', marginTop: '1rem',
          }}>&rdquo;</div>
          <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', marginTop: '0.75rem', letterSpacing: '0.05em' }}>
            — Sahih Muslim
          </p>
        </div>

        {/* ── BOTTOM BAR ── */}
        <div style={{
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07) 20%, rgba(255,255,255,0.07) 80%, transparent)',
          marginBottom: '1.75rem',
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
            <Link href="/privacy" className="ft-small-link">Privacy Policy</Link>
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.6rem' }}>◆</span>
            <Link href="/terms" className="ft-small-link">Terms of Service</Link>
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.6rem' }}>◆</span>
            <Link href="/transparency" className="ft-small-link">Transparency Ledger</Link>
          </div>
        </div>

      </div>
    </footer>
  );
}
