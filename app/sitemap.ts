import type { MetadataRoute } from "next";
import { getPublicPrograms } from "@/lib/catalog/programs";

// Built per request from the published programs (Google Sheets), never at build time: an unpublished program drops out and a
// newly published one appears as soon as the admin save refreshes this route (revalidatePath('/sitemap.xml')).
export const dynamic = "force-dynamic";

const baseUrl = "https://daaraynorg.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();
  const entries = new Map<string, MetadataRoute.Sitemap[number]>();
  const add = (path: string, changeFrequency: "weekly" | "monthly", priority: number, lastModified = now) => {
    const url = `${baseUrl}${path}`;
    if (!entries.has(url)) entries.set(url, { url, lastModified, changeFrequency, priority });
  };

  add("", "weekly", 1.0);
  add("/programs", "weekly", 0.9);
  add("/campaigns", "weekly", 0.7);
  add("/causes", "weekly", 0.7);
  add("/donor", "monthly", 0.6);
  add("/privacy", "monthly", 0.4);
  add("/masjid-projects", "weekly", 0.7);
  add("/quran-hifz", "weekly", 0.7);
  add("/general-causes", "weekly", 0.7);

  try {
    // Only OPEN entries (Active/Urgent) are public; Draft, Completed and Inactive are never listed. Canonical detail route: /programs/<id>.
    for (const p of await getPublicPrograms()) {
      const modified = p.content.updatedAt && !Number.isNaN(Date.parse(p.content.updatedAt)) ? new Date(p.content.updatedAt).toISOString() : now;
      add(`/programs/${encodeURIComponent(p.id)}`, "weekly", p.kind === "project" ? 0.8 : 0.6, modified);
    }
  } catch (err: any) {
    // If the catalog cannot be read, publish only the static URLs rather than guessing.
    console.error("[Sitemap] Program URLs unavailable:", err?.message);
  }
  return Array.from(entries.values());
}
