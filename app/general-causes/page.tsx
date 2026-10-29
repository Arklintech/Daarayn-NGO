import type { Metadata } from "next";
import CategoryListing from "@/components/programs/CategoryListing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "General Causes – Daarayn Foundation", description: "All open General Causes programs." };

export default function Page() {
  return <CategoryListing category="general" />;
}
