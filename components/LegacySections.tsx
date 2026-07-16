'use client';
import Script from 'next/script';
import { useEffect } from 'react';

export default function LegacySections() {
  useEffect(() => {
    const handleProfileClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Open modal
      const card = target.closest('.clickable-profile-card');
      if (card) {
        const modalId = card.getAttribute('data-target-modal');
        if (modalId) {
          const modal = document.getElementById(modalId);
          if (modal) {
            modal.classList.add('is-active');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
          }
        }
      }

      // Close modal on button click
      const closeBtn = target.closest('.modal-close');
      if (closeBtn) {
        const modal = closeBtn.closest('.modal-overlay');
        if (modal) {
          modal.classList.remove('is-active');
          modal.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        }
      }

      // Close modal on background click
      if (target.classList.contains('modal-overlay')) {
        target.classList.remove('is-active');
        target.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.is-active').forEach(modal => {
          modal.classList.remove('is-active');
          modal.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        });
      }
    };

    document.addEventListener('click', handleProfileClick);
    document.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('click', handleProfileClick);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: `<!-- ================= PROGRAMS ================= -->
  <section id="programs" class="section">
    <div class="container">
      <h2 class="section-title">Programs</h2>
      <p class="section-subtitle">
        Institutional giving paths with measurable outcomes and verifiable delivery.
      </p>

      <div class="program-grid">
        <article class="program-card glass-panel">
          <h3>Family Relief Program</h3>
          <p>Emergency support for rent, ration, and school continuity — handled with verified documentation.</p>
          <ul>
            <li>Case ID + tracked milestones</li>
            <li>Proof of distribution</li>
            <li>Status: Pending → In Progress → Completed</li>
          </ul>
          <a href="#family" class="text-link">View Program →</a>
        </article>

        <article class="program-card glass-panel">
          <h3>Qur’an Memorization Endowment</h3>
          <p>Support a student’s Qur’an journey through an endowment-style monthly commitment.</p>
          <ul>
            <li>Monthly verification updates</li>
            <li>Recitation/audio milestones</li>
            <li>Clear cost breakdown</li>
          </ul>
          <a href="#quran" class="text-link">Explore Endowment →</a>
        </article>

        <article class="program-card glass-panel">
          <h3>Masjid Infrastructure Fund</h3>
          <p>Structured upgrades that improve daily worship—fans, carpets, water, lighting, and more.</p>
          <ul>
            <li>Needs + amounts listed</li>
            <li>Weekly caretaker updates</li>
            <li>Auto-hold if no updates</li>
          </ul>
          <a href="#masjid" class="text-link">Support a Project →</a>
        </article>
      </div>
    </div>
  </section>

  <!-- ================= FAMILY RELIEF ================= -->
  <section id="family" class="section-alt">
    <div class="container two-column">
      <div class="section-text">
        <h2>Family Relief Program</h2>
        <p class="lead">
          Example Case: A family facing overdue rent, school fee backlog, and food shortage.
        </p>

        <p class="muted">
          Your contribution funds a verified relief bundle and is logged in the public ledger with proof.
        </p>

        <ul class="list-check">
          <li>Rent support (one month)</li>
          <li>30-day ration kit</li>
          <li>School fee continuity</li>
        </ul>

        <div class="impact-box glass-panel">
          <p><strong>What you receive:</strong></p>
          <ul>
            <li>Unique case tracking ID (e.g., DA001)</li>
            <li>Proof photo/video (with consent)</li>
            <li>Completion update + receipt link</li>
          </ul>
        </div>

        <div class="status-pill">
          Status: <span class="status-label status-pending">⏳ Pending Verification</span>
        </div>

        <div class="actions-row">
          <a href="/pay?cause=Family%20Relief" class="btn btn-ivory">Fund This Case</a>
          <a href="#ledger" class="btn btn-outline">Verify In Ledger</a>
        </div>

        <p class="tiny-note">
          Ledger row example: <em>DA001 | Family Relief | ₹8,000 | Rent + Ration + Fees | ✅ Completed | Proof Link</em>
        </p>
      </div>

      <div class="section-media">
        <div class="image-card glass-panel clickable-profile-card" data-target-modal="familyReliefModal">
          <div class="image-wrapper">
            <img src="images/family_relief.png" alt="Family Relief Assistance Kit" class="profile-image" />
            <div class="hover-overlay">
              <span class="hover-text-badge">📂 Open Case File</span>
            </div>
          </div>
          <p class="image-caption">Documented distribution. Trackable impact. Repeatable model.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= QURAN ENDOWMENT ================= -->
  <section id="quran" class="section">
    <div class="container two-column reverse">
      <div class="section-text">
        <h2>Qur’an Memorization Endowment</h2>
        <p class="lead">
          Sponsor a student’s memorization journey through a structured monthly commitment.
        </p>

        <h3>Example Student: Arham (Age 12)</h3>
        <p class="muted">
          Monthly commitment: <strong class="ivory">₹1,500</strong> — meals, books, and teacher support with monthly
          verification.
        </p>

        <ul class="list-check">
          <li>Monthly progress milestone</li>
          <li>Recitation/audio update</li>
          <li>Term-based teacher verification</li>
        </ul>

        <div class="progress-wrapper">
          <span>Juz Memorized: <strong><span id="juz-progress-text">0</span> / 30</strong></span>
          <div class="progress-bar">
            <div class="progress-fill" id="juz-progress-fill" style="width: 0%;"></div>
          </div>
        </div>

        <div class="actions-row">
          <a href="/pay?amt=1500&cur=INR&cause=Quran%20Endowment" class="btn btn-ivory">Sponsor Monthly</a>
          <a href="#ledger" class="btn btn-outline">View Sponsorship Ledger</a>
        </div>
      </div>

      <div class="section-media">
        <div class="image-card glass-panel clickable-profile-card" data-target-modal="studentProfileModal">
          <div class="image-wrapper">
            <img src="images/student_profile.png" alt="Qur'an Memorization Student Profile" class="profile-image" />
            <div class="hover-overlay">
              <span class="hover-text-badge">📂 Open Student File</span>
            </div>
          </div>
          <p class="image-caption">Verified identity. Transparent funding. Documented progress.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= MASJID FUND ================= -->
  <section id="masjid" class="section-alt">
    <div class="container">
      <h2 class="section-title">Masjid Infrastructure Fund</h2>
      <p class="section-subtitle">
        Structured upgrades with weekly updates and verification rules.
      </p>

      <div class="masjid-grid">
        <div class="masjid-card glass-panel">
          <h3>Example Project: Local Masjid Upgrade</h3>
          <p class="muted">
            Projects are listed with needs, amounts, progress, and caretaker updates.
          </p>

          <h4>Needs</h4>
          <ul class="disc">
            <li>Fans — <strong class="ivory">₹3,000</strong></li>
            <li>Carpet — <strong class="ivory">₹5,000</strong></li>
          </ul>

          <div class="need-progress">
            <p>Fan Project — <span class="ivory">60%</span> funded</p>
            <div class="progress-bar small">
              <div class="progress-fill" style="width: 60%;"></div>
            </div>
          </div>

          <p class="tiny-note">
            If no update is posted within 7 days, the project is placed on hold until verification resumes.
          </p>

          <div class="actions-row">
            <a href="/pay?cause=Masjid%20Fund" class="btn btn-ivory">Fund a Need</a>
            <a href="#ledger" class="btn btn-outline">Verify In Ledger</a>
          </div>
        </div>

        <div class="masjid-card secondary glass-panel">
          <h3>Apply to List a Masjid</h3>
          <p>
            Committee members/caretakers may apply to list verified needs, along with update rules and proof standards.
          </p>
          <ul>
            <li>Verified details required</li>
            <li>Weekly photo/video update</li>
            <li>Clear needs + amounts</li>
          </ul>
          <a href="/pay" class="btn btn-outline-light">
            Apply
          </a>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= TESTIMONIALS ================= -->
  <section id="testimonials" class="section">
    <div class="container">
      <h2 class="section-title">Testimonials</h2>
      <p class="section-subtitle">
        Verified cases and documented outcomes (shared with consent).
      </p>

      <div class="testimonial-grid">
        <div class="testimonial-card glass-panel">
          <div class="quote-mark">“</div>
          <h3>Ayesha & Family</h3>
          <p class="muted">
            “We had no ration left and rent was overdue. Daarayn Aid helped us quickly. May Allah reward every
            contributor.”
          </p>
          <ul class="list-check">
            <li>30-day ration delivered</li>
            <li>Rent support completed</li>
            <li>Children returned to school</li>
          </ul>
          <a href="#ledger" class="text-link">View Case Proof →</a>
        </div>

        <div class="testimonial-card glass-panel">
          <div class="quote-mark">“</div>
          <h3>Masjid Project Update</h3>
          <p class="muted">
            “The fans installation improved comfort immediately. Weekly updates kept donors informed and confident.”
          </p>
          <ul class="list-check">
            <li>Project verification log</li>
            <li>Completion proof shared</li>
            <li>Ledger entry published</li>
          </ul>
          <a href="#ledger" class="text-link">Verify In Ledger →</a>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= PUBLIC LEDGER ================= -->
  <section id="ledger" class="section-alt">
    <div class="container">
      <h2 class="section-title">Public Contribution Ledger</h2>
      <p class="section-subtitle">
        Track every contribution: amount received, allocation, status, and proof links.
      </p>

      <div class="dashboard-grid">
        <div class="dashboard-info">
          <h3>How Tracking Works</h3>
          <ul class="list-check">
            <li><strong>ID</strong> — unique tracking code (e.g., DA001)</li>
            <li><strong>Category</strong> — family relief / endowment / masjid</li>
            <li><strong>Amount</strong> — received via UPI</li>
            <li><strong>Allocation</strong> — 90% direct / 10% operations</li>
            <li><strong>Status</strong> — Pending / In Progress / ✅ Completed</li>
            <li><strong>Proof</strong> — photo/video/receipt link</li>
          </ul>

          <div class="actions-row">
            <a href="#ledgerTable" class="btn btn-ivory" onclick="document.getElementById('ledgerSearch').focus(); return false;">
              Search Ledger Below
            </a>
            <a href="/pay" class="btn btn-outline">Contribute</a>
          </div>

          <p class="tiny-note">
            This links to your internal ledger dashboard.
          </p>
        </div>

        <div class="dashboard-embed"
          style="overflow-x: auto; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 12px; padding: 1.2rem; width: 100%;">
          <div style="display:flex; gap:0.5rem; margin-bottom:1.2rem; width: 100%;">
            <input type="text" id="ledgerSearch" placeholder="Search by ID, donor or cause..."
              style="flex-grow:1; background:rgba(0,0,0,0.45); border:1px solid var(--border); padding: 0.65rem; color:#fff; border-radius: 6px; outline:none; font-family: inherit; font-size:0.88rem;" />
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left;" id="ledgerTable">
            <thead>
              <tr style="border-bottom:1px solid var(--border); color:var(--ivory-light);">
                <th style="padding:0.75rem 0.5rem;">ID</th>
                <th style="padding:0.75rem 0.5rem;">Donor</th>
                <th style="padding:0.75rem 0.5rem;">Cause</th>
                <th style="padding:0.75rem 0.5rem;">Amount</th>
                <th style="padding:0.75rem 0.5rem;">Status</th>
                <th style="padding:0.75rem 0.5rem;">Proof</th>
              </tr>
            </thead>
            <tbody id="ledgerTableBody">
              <tr>
                <td colspan="6" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Loading contribution
                  records...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= DONATE ================= -->
  <section id="donate" class="donate-section">
    <div class="container donate-container">
      <div class="donate-text">
        <h2>Contribute via UPI</h2>
        <p class="lead">
          Scan the QR code and submit the form to generate a tracking entry for your contribution.
        </p>

        <ol class="donate-steps">
          <li>Scan the QR code using PhonePe / GPay / Paytm etc.</li>
          <li>In remarks write: “Daarayn Aid — [Program Name]”.</li>
          <li>Submit the form with your name and payment screenshot.</li>
        </ol>

        <div class="actions-row">
          <a href="/pay" class="btn btn-ivory">
            Submit Contribution Form
          </a>
          <a href="#ledger" class="btn btn-outline">Verify Ledger</a>
        </div>

        <p class="tiny-note">
          You’ll receive your <strong>tracking ID</strong> via WhatsApp/email within 24–48 hours.
        </p>
      </div>

      <div class="donate-qr">
        <img src="images/upi-qr.png" alt="UPI QR Code" />
        <p class="image-caption">Scan to contribute.</p>
      </div>
    </div>
  </section>


  <!-- ================= VERIFIED PROFILE MODALS ================= -->
  
  <!-- 1. Qur'an memorization student profile modal -->
  <div class="modal-overlay" id="studentProfileModal" aria-hidden="true" role="dialog">
    <div class="modal-container glass-panel">
      <button class="modal-close" aria-label="Close modal">&times;</button>
      <div class="modal-header">
        <div class="modal-badge">Amanah Verified Student Case</div>
        <h2 class="modal-title">Sheikh Arham (ID: DA-Q03)</h2>
      </div>
      <div class="modal-content-grid">
        <div class="modal-media-side">
          <img src="images/student_profile.png" alt="Student Profile Photo" class="modal-profile-img" />
          <div class="modal-quick-meta">
            <p><strong>Age:</strong> 12 Years Old</p>
            <p><strong>Monthly Need:</strong> ₹1,500</p>
          </div>
        </div>
        <div class="modal-info-side">
          <div class="modal-info-section">
            <h3>Academic Progress</h3>
            <div class="progress-wrapper">
              <span class="modal-progress-label">Juz Memorized: <strong>5 / 30</strong></span>
              <div class="progress-bar">
                <div class="progress-fill" style="width: 16.67%;"></div>
              </div>
            </div>
            <p class="modal-subtext">Sheikh Kamal reports excellent pronunciation and retention.</p>
          </div>
          <div class="modal-info-section">
            <h3>Audit and Verification</h3>
            <ul class="list-check modal-verification-list">
              <li>Identity & background check completed by trustees</li>
              <li>Attendance audit: <strong>96%</strong> (June 2026)</li>
              <li>Teacher verification: Shaikh Kamal (28/06/2026)</li>
              <li>Sadaqah Split: 90% direct support / 10% verification costs</li>
            </ul>
          </div>
          <div class="modal-actions">
            <a href="/pay?amt=1500&cur=INR" class="btn btn-ivory btn-full-width">Sponsor Monthly (₹1,500)</a>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 2. Family Relief Case profile modal -->
  <div class="modal-overlay" id="familyReliefModal" aria-hidden="true" role="dialog">
    <div class="modal-container glass-panel">
      <button class="modal-close" aria-label="Close modal">&times;</button>
      <div class="modal-header">
        <div class="modal-badge">Amanah Verified Relief Case</div>
        <h2 class="modal-title">Family Relief Bundle (ID: DA001)</h2>
      </div>
      <div class="modal-content-grid">
        <div class="modal-media-side">
          <img src="images/family_relief.png" alt="Family Relief Photo" class="modal-profile-img" />
          <div class="modal-quick-meta">
            <p><strong>Status:</strong> Active Case</p>
            <p><strong>Goal Amount:</strong> ₹8,000</p>
          </div>
        </div>
        <div class="modal-info-side">
          <div class="modal-info-section">
            <h3>Relief Package Details</h3>
            <p class="modal-subtext">This bundle covers essential needs for school continuity, emergency rent, and basic nutrition.</p>
            <ul class="list-check modal-verification-list">
              <li>Emergency Rent (1 Month) — ₹5,000</li>
              <li>30-Day Ration Kit (Dry Goods) — ₹1,800</li>
              <li>School Fees Continuity — ₹1,200</li>
            </ul>
          </div>
          <div class="modal-info-section">
            <h3>Trust Audits</h3>
            <ul class="list-check modal-verification-list">
              <li>On-site home assessment & landlord interview complete</li>
              <li>Landlord bank information verified & validated</li>
              <li>School outstanding bill validated & direct pay setup</li>
              <li>Sadaqah Split: 90% direct transfer / 10% validation & logistics</li>
            </ul>
          </div>
          <div class="modal-actions">
            <a href="/pay?amt=8000&cur=INR" class="btn btn-ivory btn-full-width">Fund This Case (₹8,000)</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>

</html>` }} />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js" strategy="lazyOnload" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js" strategy="lazyOnload" />
      <Script src="/script.js" strategy="lazyOnload" />
    </>
  );
}