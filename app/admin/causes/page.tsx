import { redirect } from "next/navigation";

/** Causes are managed in Programs; each entry's donations/reports workspace is /admin/causes/<id>. */
export default function CausesRedirect() {
  redirect("/admin/programs");
}
