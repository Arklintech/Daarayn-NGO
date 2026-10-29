import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** One detail page for every entry: programs, campaigns and causes all render at /programs/<permanent id>. */
export default async function CauseDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/programs/${id}`);
}
