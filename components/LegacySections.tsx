'use client';
import Script from 'next/script';
import { useEffect } from 'react';

export default function LegacySections() {
  useEffect(() => {
    const handleProfileClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Open modal - optimized selector
      let card = target.closest('.clickable-profile-card');
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
        return;
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
        return;
      }

      // Close modal on background click
      if (target.classList.contains('modal-overlay')) {
        (target as HTMLElement).classList.remove('is-active');
        (target as HTMLElement).setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.modal-overlay.is-active');
        modals.forEach(modal => {
          modal.classList.remove('is-active');
          modal.setAttribute('aria-hidden', 'true');
        });
        document.body.style.overflow = '';
      }
    };

    document.addEventListener('click', handleProfileClick, { passive: true });
    document.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('click', handleProfileClick);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: `<!-- ================= TESTIMONIALS ================= -->
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
            <li>Verified update published</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= DONATE ================= -->
  <section id="donate" class="donate-section">
    <div class="container donate-container">
      <div class="donate-text" style="grid-column: 1 / -1;">
        <h2>Contribute via UPI</h2>
        <p class="lead">
          Open the contribution form, pay via UPI, and submit the form to generate a tracking entry for your contribution.
        </p>

        <ol class="donate-steps">
          <li>Open the contribution form and pay using PhonePe / GPay / Paytm etc.</li>
          <li>In remarks write: “Daarayn Aid — [Program Name]”.</li>
          <li>Submit the form with your name and payment screenshot.</li>
        </ol>

        <div class="actions-row">
          <a href="/pay" class="btn btn-ivory">
            Submit Contribution Form
          </a>
        </div>

        <p class="tiny-note">
          You’ll receive your <strong>tracking ID</strong> via WhatsApp/email within 24–48 hours.
        </p>
      </div>
    </div>
  </section>


  </body>

</html>` }} />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js" strategy="lazyOnload" async />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js" strategy="lazyOnload" async />
      <Script src="/script.js" strategy="lazyOnload" async />
    </>
  );
}