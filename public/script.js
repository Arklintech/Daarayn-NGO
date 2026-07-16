// Simple animation for counters in the hero section
function onDOMReady(cb) { if(document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', cb); } else { cb(); } }
onDOMReady(function () {
  const counters = document.querySelectorAll(".counter-number");

  const animateCounters = () => {
    counters.forEach((counter) => {
      const target = parseInt(counter.getAttribute("data-target"), 10);
      let current = 0;
      const increment = Math.max(1, Math.floor(target / 80));

      const update = () => {
        current += increment;
        if (current >= target) {
          counter.textContent = target;
        } else {
          counter.textContent = current;
          requestAnimationFrame(update);
        }
      };

      update();
    });
  };

  // Trigger when hero is in view
  const heroSection = document.querySelector(".hero");
  if ("IntersectionObserver" in window && heroSection) {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounters();
            obs.disconnect();
          }
        });
      },
      { threshold: 0.4 }
    );
    observer.observe(heroSection);
  } else {
    // Fallback
    animateCounters();
  }

  // Example: Set Hifdh progress (e.g., 5/30)
  const juzMemorized = 5; // change dynamically if needed
  const totalJuz = 30;
  const fill = document.getElementById("juz-progress-fill");
  const text = document.getElementById("juz-progress-text");

  if (fill && text) {
    const percentage = (juzMemorized / totalJuz) * 100;
    text.textContent = juzMemorized.toString();
    fill.style.width = percentage + "%";
  }

  // Smooth scroll for internal anchor links
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", function (e) {
      const targetId = this.getAttribute("href").substring(1);
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        e.preventDefault();
        window.scrollTo({
          top: targetEl.offsetTop - 70,
          behavior: "smooth",
        });
      }
    });
  });
});


onDOMReady(() => {

  const currencyBtns = document.querySelectorAll(".qd-curr-home");
  const fixedBtns = document.querySelectorAll(".qd-fixed");
  const customForm = document.getElementById("qdCustomFormHome");
  const amountInput = document.getElementById("qdAmountHome");
  const prefixEl = document.querySelector(".qd-prefix-home");

  if (!currencyBtns.length) return;

  const SYMBOL = {
    INR: "₹",
    GBP: "£",
    USD: "$",
    AED: "د.إ",
    SAR: "﷼"
  };

  let activeCurrency = "INR";

  /* ========================
     Redirect to pay.html
     ======================== */
  function goToPay(amount) {
    if (!amount || amount <= 0) return;
    window.location.href = `/pay?amt=${encodeURIComponent(amount)}&cur=${encodeURIComponent(activeCurrency)}`;
  }

  /* ========================
     Currency Switch
     ======================== */
  currencyBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      activeCurrency = btn.dataset.currency;

      currencyBtns.forEach(b => {
        b.classList.remove("is-active");
        b.setAttribute("aria-pressed", "false");
      });

      btn.classList.add("is-active");
      btn.setAttribute("aria-pressed", "true");

      prefixEl.textContent = SYMBOL[activeCurrency];
    });
  });

  /* ========================
     Fixed Buttons Click
     ======================== */
  fixedBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault(); // stop anchor behavior
      const amount = parseInt(btn.dataset.amount, 10);
      goToPay(amount);
    });
  });

  /* ========================
     Custom Amount Submit
     ======================== */
  customForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseInt(amountInput.value, 10);
    goToPay(amount);
  });

  /* ========================
     Dynamic Ledger Rendering
     ======================== */
  const ledgerTableBody = document.getElementById("ledgerTableBody");
  const ledgerSearch = document.getElementById("ledgerSearch");

  if (ledgerTableBody) {
    let ledgerCache = [];
    let currentAbort = null;

    const showSkeleton = () => {
      ledgerTableBody.innerHTML = [
        '<tr class="skeleton-row">',
        '<td><div class="skeleton-cell" style="width:50px"></div></td>',
        '<td><div class="skeleton-cell" style="width:120px"></div></td>',
        '<td><div class="skeleton-cell" style="width:90px"></div></td>',
        '<td><div class="skeleton-cell" style="width:60px"></div></td>',
        '<td><div class="skeleton-cell" style="width:80px"></div></td>',
        '<td><div class="skeleton-cell" style="width:70px"></div></td>',
        '</tr>'
      ].join('').repeat(3);
    };

    const fetchLedger = async () => {
      if (currentAbort) currentAbort.abort();
      currentAbort = new AbortController();
      showSkeleton();
      try {
        const response = await fetch("/api/ledger", { signal: currentAbort.signal });
        ledgerCache = await response.json();
        renderLedger(ledgerCache);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error("Ledger fetch error:", err);
        ledgerTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:rgba(255,255,255,0.55);">Failed to load contribution log.</td></tr>`;
      }
    };

    const renderLedger = (data) => {
      ledgerTableBody.innerHTML = "";
      if (data.length === 0) {
        ledgerTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:rgba(255,255,255,0.55);">No entries recorded.</td></tr>`;
        return;
      }

      data.forEach(item => {
        const row = document.createElement("tr");
        row.style.borderBottom = "1px solid var(--border)";
        
        let statusBadge = "⏳ Pending";
        if (item.status === "completed") statusBadge = "✅ Completed";
        if (item.status === "inprogress") statusBadge = "⚙️ In Progress";

        let proofCell = item.proof;
        if (item.proofUrl) {
          proofCell = `<a href="${item.proofUrl}" target="_blank" style="color:var(--gold-light); text-decoration:underline;">View Proof</a>`;
        }

        let causeDisplay = item.cause;
        if (item.selectedCauses && item.selectedCauses.length > 0) {
          causeDisplay = item.selectedCauses.map(c => 
            `<div style="font-size:0.8rem; margin-bottom:2px;"><span style="color:var(--gold-light)">₹${c.allocatedAmount}</span> - ${c.causeName}</div>`
          ).join('');
        }

        row.innerHTML = `
          <td style="padding:0.75rem 0.5rem; font-weight:600;">${item.id}</td>
          <td style="padding:0.75rem 0.5rem;">${item.donor}</td>
          <td style="padding:0.75rem 0.5rem;">${causeDisplay}</td>
          <td style="padding:0.75rem 0.5rem; font-weight:600;">₹${item.amount.toLocaleString()}</td>
          <td style="padding:0.75rem 0.5rem;">${statusBadge}</td>
          <td style="padding:0.75rem 0.5rem;">${proofCell}</td>
        `;
        ledgerTableBody.appendChild(row);
      });
    };

    // Filter by search query
    ledgerSearch.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = ledgerCache.filter(item => 
        item.id.toLowerCase().includes(q) ||
        item.donor.toLowerCase().includes(q) ||
        item.cause.toLowerCase().includes(q)
      );
      renderLedger(filtered);
    });

    fetchLedger();
  }

});

onDOMReady(() => {
  // Navbar scroll effect
  const navbar = document.querySelector('.site-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  if (typeof gsap !== 'undefined') {
    // GSAP Animations
    gsap.registerPlugin(ScrollTrigger);

    // Hero Animations
    const heroTl = gsap.timeline();
    heroTl.from(".kicker", { opacity: 0, y: 20, duration: 0.8, ease: "power3.out" })
          .from(".hero-text h1", { opacity: 0, y: 30, duration: 0.8, ease: "power3.out" }, "-=0.6")
          .from(".hero-sub", { opacity: 0, y: 20, duration: 0.8, ease: "power3.out" }, "-=0.6")
          .from(".hero-actions", { opacity: 0, y: 20, duration: 0.8, ease: "power3.out" }, "-=0.6")
          .from(".hero-side-card", { opacity: 0, x: 30, duration: 1, ease: "power3.out" }, "-=0.8")
          .from(".pillar-card", { opacity: 0, y: 20, duration: 0.6, stagger: 0.15, ease: "power3.out" }, "-=0.6");

    // Subtle Parallax for hero video
    gsap.to(".hero-video-bg", {
      yPercent: 15,
      ease: "none",
      scrollTrigger: {
        trigger: ".hero",
        start: "top top", 
        end: "bottom top",
        scrub: true
      }
    });

    // Fade up sections
    const sections = gsap.utils.toArray('.section, .section-alt, .donate-section');
    sections.forEach(sec => {
      gsap.from(sec.querySelectorAll('.section-title, .section-subtitle, .lead, .program-card, .masjid-card, .testimonial-card, .glass-panel'), {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "power3.out",
        scrollTrigger: {
          trigger: sec,
          start: "top 85%",
        }
      });
    });
  }
});

/* ================= VERIFIED PROFILE MODALS INTERACTION ================= */
onDOMReady(() => {
  const profileCards = document.querySelectorAll(".clickable-profile-card");
  const modalOverlays = document.querySelectorAll(".modal-overlay");

  // Function to open modal
  const openModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add("is-active");
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden"; // Prevent background scrolling
    }
  };

  // Function to close modal
  const closeModal = (modal) => {
    modal.classList.remove("is-active");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = ""; // Re-enable background scrolling
  };

  // Open modal on card click
  profileCards.forEach(card => {
    card.addEventListener("click", () => {
      const targetModalId = card.getAttribute("data-target-modal");
      openModal(targetModalId);
    });
  });

  // Close buttons and overlay clicks
  modalOverlays.forEach(overlay => {
    const closeBtn = overlay.querySelector(".modal-close");
    
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeModal(overlay);
      });
    }

    // Close when clicking background overlay
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        closeModal(overlay);
      }
    });
  });

  // Escape key to close modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      modalOverlays.forEach(overlay => {
        if (overlay.classList.contains("is-active")) {
          closeModal(overlay);
        }
      });
    }
  });
});

