document.addEventListener("DOMContentLoaded", () => {
  // ✅ Put your real UPI details here
  const UPI_ID = "mujju2028@okhdfcbank";         // e.g. daaraynaid@okaxis
  const PAYEE_NAME = "Daarayn Aid";          // shown in some UPI apps
  const NOTE = "Daarayn Aid Donation";       // remark
  const CURRENCY = "INR";

  // Read query params
  const params = new URLSearchParams(window.location.search);
  const amt = Math.max(1, parseInt(params.get("amt") || "0", 10));
  const cur = (params.get("cur") || "INR").toUpperCase();

  // UI refs
  const paySummary = document.getElementById("paySummary");
  const upiIdText = document.getElementById("upiIdText");
  const upiNoteText = document.getElementById("upiNoteText");
  const qrWrap = document.getElementById("qrWrap");
  const upiBox = document.getElementById("upiBox");
  const intlBox = document.getElementById("intlBox");

  upiIdText.textContent = UPI_ID;
  upiNoteText.textContent = NOTE;

  // Show summary
  paySummary.textContent = `Selected amount: ${cur} ${amt.toLocaleString("en-US")}`;

  // Build UPI intent (amount embedded)
  function buildUpiIntent(amount) {
    // upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...
    const u = new URL("upi://pay");
    u.searchParams.set("pa", UPI_ID);
    u.searchParams.set("pn", PAYEE_NAME);
    u.searchParams.set("am", String(amount));
    u.searchParams.set("cu", CURRENCY);
    u.searchParams.set("tn", NOTE);
    return u.toString();
  }

  const upiIntent = buildUpiIntent(amt);

  // If currency is INR -> generate QR; else highlight intl options
  if (cur === "INR") {
    upiBox.style.opacity = "1";
    intlBox.style.opacity = "0.92";

    // Generate QR
    QRCode.toCanvas(upiIntent, { margin: 1, width: 240 }, (err, canvas) => {
      if (err) {
        qrWrap.innerHTML = `<p class="muted">QR failed to generate.</p>`;
        return;
      }
      qrWrap.innerHTML = "";
      qrWrap.appendChild(canvas);
    });
  } else {
    // Not INR: still show QR but also tell them it's India-only
    upiBox.style.opacity = "0.75";
    intlBox.style.opacity = "1";

    QRCode.toCanvas(upiIntent, { margin: 1, width: 240 }, (err, canvas) => {
      qrWrap.innerHTML = "";
      if (!err) qrWrap.appendChild(canvas);
    });
  }

  // Copy buttons
  document.getElementById("copyUpi").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(UPI_ID);
      alert("UPI ID copied!");
    } catch {
      alert("Could not copy. Please copy manually.");
    }
  });

  document.getElementById("copyIntent").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(upiIntent);
      alert("UPI link copied!");
    } catch {
      alert("Could not copy. Please copy manually.");
    }
  });

  /* ====================================================
     REGISTER PROOF FORM VIA EXPRESS API
     ==================================================== */
  const proofForm = document.getElementById("proofForm");
  const formSection = document.getElementById("formSection");
  const successBox = document.getElementById("successBox");
  const assignedId = document.getElementById("assignedId");
  const successRef = document.getElementById("successRef");

  if (proofForm) {
    proofForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const formData = new FormData(proofForm);
      // Append amount and currency parameters from the URL
      formData.append("amount", String(amt));
      formData.append("currency", cur);
      formData.append("cause", "General Donation"); // Default general cause

      try {
        const response = await fetch("/api/donate", {
          method: "POST",
          body: formData
        });

        const result = await response.json();

        if (result.success) {
          // Hide Form & Show Success Panel
          formSection.style.display = "none";
          successBox.style.display = "block";
          
          assignedId.textContent = result.trackingId;
          successRef.textContent = document.getElementById("upiRef").value;
        } else {
          alert("Submission failed: " + (result.error || "Unknown server error."));
        }
      } catch (error) {
        console.error("Connection error:", error);
        alert("Failed to submit: Could not connect to the backend server.");
      }
    });
  }
});