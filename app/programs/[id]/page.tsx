import "../../redesign.css";
import "@/components/programs/programs.css";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import GlobalHeader from "@/components/GlobalHeader";
import Footer from "@/components/Footer";
import ProgramDetailView from "@/components/programs/ProgramDetailView";
import { fetchPublicPrograms } from "@/lib/catalog/publicClient";
import type { ProgramView } from "@/lib/catalog/programs";

export const dynamic = "force-dynamic";

async function load(id: string): Promise<{ program: ProgramView | null; failed: boolean }> {
  try {
    const found = await fetchPublicPrograms({ id: decodeURIComponent(id) });
    return { program: found[0] ?? null, failed: false };
  } catch {
    return { program: null, failed: true };
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { program } = await load((await params).id);
  return program ? { title: `${program.title} – Daarayn Foundation`, description: (program.content.cardSummary || program.description).slice(0, 160) } : { title: "Daarayn Foundation" };
}

/** Detail of one OPEN program, campaign or cause by its permanent id. Draft, Completed and Inactive entries are not public (404). */
export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { program, failed } = await load((await params).id);
  if (!failed && !program) notFound();
  return (
    <main className="main-home-container" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <GlobalHeader showRibbon={false} />
      <div style={{ flex: 1, paddingTop: 110 }}>
        {failed || !program ? (
          <p role="alert" className="pg-error">
            This page is temporarily unavailable. Please try again in a few minutes.
          </p>
        ) : (
          <ProgramDetailView program={program} />
        )}
      </div>
      <Footer />
    </main>
  );
}
