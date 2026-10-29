import { redirect } from "next/navigation";

/** Campaigns are managed in Programs (one module, one set of records). */
export default function CampaignsRedirect() {
  redirect("/admin/programs");
}
