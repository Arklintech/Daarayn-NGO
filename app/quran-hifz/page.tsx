import type { Metadata } from "next";
import CategoryListing from "@/components/programs/CategoryListing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Qur'an Hifz – Daarayn Foundation", description: "All open Qur'an Hifz programs." };

export default function Page() {
  return <CategoryListing category="hifz" />;
}
