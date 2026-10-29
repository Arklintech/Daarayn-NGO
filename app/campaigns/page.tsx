import "../redesign.css";
import type { Metadata } from "next";
import CatalogPage from "@/components/catalog/CatalogPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Campaigns – Daarayn Foundation", description: "Open campaigns you can support, with verified funding progress." };

export default function CampaignsPage() {
  return (
    <CatalogPage
      kind="campaign"
      title="Campaigns"
      subtitle="Time-focused campaigns open for contributions. Progress counts only verified donations designated to the campaign."
      empty="There are no open campaigns right now. Please check back soon."
    />
  );
}
