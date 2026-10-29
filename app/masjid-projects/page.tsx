import type { Metadata } from "next";
import CategoryListing from "@/components/programs/CategoryListing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Masjid Infrastructure – Daarayn Foundation", description: "All open Masjid Infrastructure programs." };

export default function Page() {
  return <CategoryListing category="masjid" />;
}
