'use client';
import Navbar from './Navbar';
import QuickDonationRibbon from './QuickDonationRibbon';

export default function HeroSection() {
  return (
    <section className="cinematic-hero-scene">
      {/* Background layer */}
      <div className="daarayn-hero-bg">
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="daarayn-hero-video"
        >
          <source src="/background video.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        <div className="daarayn-hero-overlay-dark"></div>
        <div className="daarayn-hero-overlay-gradient"></div>
      </div>

      <Navbar />
      <QuickDonationRibbon />

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
                <div className="trust-card-number">5</div>
                <div className="trust-card-label">Cases<br/>Completed</div>
              </div>
              <div className="trust-card">
                <GraduationCapIcon />
                <div className="trust-card-number">10</div>
                <div className="trust-card-label">Students<br/>Sponsored</div>
              </div>
              <div className="trust-card">
                <MosqueIcon />
                <div className="trust-card-number">3</div>
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
