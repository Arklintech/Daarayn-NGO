import "../../redesign.css";
import type { Metadata } from "next";
import GlobalHeader from "@/components/GlobalHeader";
import Footer from "@/components/Footer";
import IntakeStatus from "@/components/IntakeStatus";

export const metadata: Metadata = {
  title: "Check your submission – Daarayn Foundation",
  description: "Look up the status of a contribution you submitted, using the reference you were given.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/donate/status" },
};

export default function SubmissionStatusPage() {
  return (
    <main className="main-home-container" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <GlobalHeader showRibbon={false} />
      <div style={{ flex: 1, paddingTop: 110 }}>
        <IntakeStatus />
      </div>
      <Footer />
    </main>
  );
}
