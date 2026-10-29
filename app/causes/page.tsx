import "../redesign.css";
import type { Metadata } from "next";
import CatalogPage from "@/components/catalog/CatalogPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Causes – Daarayn Foundation", description: "Causes open for contributions, with verified funding progress." };

export default function CausesPage() {
  return (
    <CatalogPage
      kind="cause"
      title="Causes"
      subtitle="Causes open for contributions. Progress counts only verified donations designated to the cause."
      empty="There are no open causes right now. Please check back soon."
    />
  );
}
