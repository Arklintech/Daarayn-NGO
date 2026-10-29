import "../redesign.css";
import type { Metadata } from "next";
import GlobalHeader from "@/components/GlobalHeader";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy – Daarayn Foundation",
  description: "How Daarayn Foundation collects, uses, protects and retains information in support of its charitable work.",
  alternates: { canonical: "/privacy" },
};

// Static, public and separate from the private admin interface. The contact address is configurable so the owner can set the final one
// without a code change; it defaults to the organisation's own mailbox that the platform already sends from.
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "daaraynorg@gmail.com";
const UPDATED = "29 October 2026";

const h2 = { fontSize: "1.35rem", margin: "2.2rem 0 .6rem", color: "var(--ivory-light, #FFF9DD)" } as const;
const p = { margin: "0 0 .9rem", lineHeight: 1.75, color: "rgba(252,251,251,0.82)" } as const;
const li = { marginBottom: ".4rem", lineHeight: 1.7, color: "rgba(252,251,251,0.82)" } as const;

export default function PrivacyPage() {
  return (
    <main className="main-home-container" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <GlobalHeader showRibbon={false} />
      <div style={{ flex: 1, paddingTop: 110 }}>
        <article style={{ maxWidth: 820, margin: "0 auto", padding: "0 1.25rem 4rem" }}>
          <h1 className="section-title" style={{ textAlign: "left" }}>Privacy Policy</h1>
          <p style={{ ...p, fontSize: ".85rem", opacity: 0.8 }}>Last updated: {UPDATED}</p>

          <p style={p}>
            Daarayn Foundation (&ldquo;Daarayn&rdquo;, &ldquo;we&rdquo;) is a charitable organisation. This website lets visitors learn about our programs, record a
            contribution with proof of payment, and follow what happened to it. This page explains what information we handle, why, where it is kept and
            what choices you have.
          </p>

          <h2 style={h2}>1. What this website is</h2>
          <p style={p}>
            The public website presents Daarayn&rsquo;s programs and causes and accepts contribution records. A separate, private area is used only by Daarayn
            administrators and field agents to verify contributions, record how funds were used and communicate with donors. The private area is not open to
            the public and is not part of the information described as &ldquo;public&rdquo; here.
          </p>

          <h2 style={h2}>2. Information we collect</h2>
          <ul style={{ paddingLeft: "1.2rem", margin: "0 0 .9rem" }}>
            <li style={li}><strong>When you record a contribution:</strong> your name (optional), email address or phone number, the amount and currency, the cause you chose, an optional payment reference and the payment-proof image you upload.</li>
            <li style={li}><strong>When you sign in to the donor portal:</strong> the email or phone number you enter, used to send a one-time code. To limit abuse we store only irreversible hashes of the identifier and network address together with timestamps, not the raw values.</li>
            <li style={li}><strong>Communication history:</strong> a record that an update or confirmation was sent to you and its outcome.</li>
            <li style={li}><strong>Administrators and field agents:</strong> the sign-in email used to authenticate them, and an audit trail of the actions they perform.</li>
            <li style={li}>Donors and visitors are not asked to connect personal accounts, and we do not collect payment-card numbers or bank passwords on this website.</li>
          </ul>

          <h2 style={h2}>3. How we use it</h2>
          <ul style={{ paddingLeft: "1.2rem", margin: "0 0 .9rem" }}>
            <li style={li}>To record, verify and account for contributions and to attribute them to the cause you selected.</li>
            <li style={li}>To show you your own contribution history after you sign in with a one-time code.</li>
            <li style={li}>To send confirmations and, where you are an eligible donor, updates about the programs you supported.</li>
            <li style={li}>To keep the platform secure, prevent abuse and keep an audit trail of administrative actions.</li>
          </ul>
          <p style={p}>We do not sell personal information and we do not use it for advertising.</p>

          <h2 style={h2}>4. Information Handling and Protection</h2>
          <p style={p}>
            Daarayn collects and processes information necessary to administer its charitable activities, manage contributions, maintain program records, communicate with relevant individuals, and support organisational transparency and accountability.
          </p>
          <p style={p}>
            Information is handled only for legitimate organisational purposes. Access is restricted to authorised personnel and trusted service providers where necessary to operate the platform, meet legal obligations, and protect the integrity of the Trust&rsquo;s activities.
          </p>
          <p style={p}>
            Daarayn takes appropriate measures to protect information against unauthorised access, disclosure, alteration, or loss. Personal information is not sold or used for targeted advertising.
          </p>
          <p style={p}>
            Information is retained for as long as reasonably necessary to fulfil the purposes described in this policy, meet applicable legal obligations, and maintain appropriate financial and organisational records.
          </p>

          <h2 style={h2}>5. Authorised Account Access and Organisational Files</h2>
          <p style={p}>
            Certain organisational functions require an authorised representative to connect an external account so that Daarayn can manage organisational documents, photographs, supporting records, and program-related evidence.
          </p>
          <p style={p}>
            Access is used only for the operational purposes for which it has been authorised. Donors and public website visitors are not required to connect their personal accounts.
          </p>
          <p style={p}>
            Supporting records are restricted to authorised personnel with a legitimate operational need. Only materials specifically approved for publication by Daarayn may be displayed on the public website.
          </p>
          <p style={p}>
            Information obtained through authorised account connections is not sold, used for targeted advertising or credit decisions, or used to train general-purpose artificial intelligence or machine-learning models. It is handled in accordance with applicable privacy obligations and the restrictions governing the authorised access.
          </p>
          <p style={p}>
            An authorised representative may withdraw access through the relevant account&rsquo;s security settings. Functions that depend on that access may become temporarily unavailable until authorisation is restored.
          </p>

          <h2 style={h2}>6. Cookies</h2>
          <p style={p}>
            The website uses only the cookies it needs to work: a signed, HTTP-only session cookie after you sign in to the donor portal, and short-lived cookies
            used during administrator sign-in. We do not use advertising or cross-site tracking cookies.
          </p>

          <h2 style={h2}>7. How long we keep information</h2>
          <p style={p}>
            Contribution records are kept for as long as Daarayn needs them to account for funds, answer donors and meet legal and audit obligations. One-time
            sign-in codes expire after ten minutes. Abuse-prevention records are kept only as long as needed to enforce rate limits. Files that are replaced or
            removed from a program gallery are deleted from our file storage.
          </p>

          <h2 style={h2}>8. Security</h2>
          <p style={p}>
            Administrative actions require authentication and are checked on the server. Sign-in codes are single-use and rate-limited, secrets are kept on the
            server, and payment-proof files are not publicly accessible. No system is perfectly secure, so we cannot promise absolute security.
          </p>

          <h2 style={h2}>9. Your choices</h2>
          <p style={p}>
            You may ask us to tell you what we hold about you, to correct it, or to delete it where we are not required to keep it for accounting or legal
            reasons. You can also ask us to stop sending you updates. Write to us at the address below from the email address or phone number you used.
          </p>

          <h2 style={h2}>10. Changes to this policy</h2>
          <p style={p}>We will update this page and its &ldquo;last updated&rdquo; date when our practices change.</p>

          <h2 style={h2}>11. Contact</h2>
          <p style={p}>
            Daarayn Foundation &mdash;{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--ivory-light, #FFF9DD)", textDecoration: "underline" }}>{CONTACT_EMAIL}</a>
          </p>
        </article>
      </div>
      <Footer />
    </main>
  );
}
