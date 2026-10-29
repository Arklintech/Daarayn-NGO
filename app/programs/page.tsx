import "../redesign.css";
import "@/components/programs/programs.css";
import type { Metadata } from "next";
import GlobalHeader from "@/components/GlobalHeader";
import Footer from "@/components/Footer";
import ProgramsCarousel from "@/components/programs/ProgramsCarousel";
import { fetchPublicPrograms } from "@/lib/catalog/publicClient";
import type { ProgramView } from "@/lib/catalog/programs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Programs – Daarayn Foundation", description: "Institutional giving paths with measurable outcomes and verifiable delivery." };

export default async function ProgramsPage() {
  let programs: ProgramView[] = [];
  let failed = false;
  try {
    programs = await fetchPublicPrograms({ kind: "project" });
  } catch {
    failed = true;
  }
  return (
    <main className="main-home-container" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <GlobalHeader showRibbon={false} />
      <div style={{ flex: 1, paddingTop: 110 }}>
        <section className="pg-wrap">
          <div className="pg-container">
            <h1 className="section-title">Programs</h1>
            <p className="section-subtitle">Institutional giving paths with measurable outcomes and verifiable delivery.</p>
            {failed ? (
              <p role="alert" className="pg-error">
                The programs are temporarily unavailable. Please try again in a few minutes.
              </p>
            ) : programs.length === 0 ? (
              <p className="pg-empty">There are no open programs right now. Please check back soon.</p>
            ) : (
              <ProgramsCarousel programs={programs} />
            )}
          </div>
        </section>
      </div>
      <Footer />
    </main>
  );
}
