import Link from "next/link";
import GlobalHeader from "@/components/GlobalHeader";
import Footer from "@/components/Footer";
import type { CatalogItem } from "@/lib/catalog/public";
import { fetchPublicCatalog } from "@/lib/catalog/publicClient";

const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function CatalogCard({ item }: { item: CatalogItem }) {
  return (
    <article className="rounded-2xl overflow-hidden flex flex-col" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(212,175,55,0.18)" }}>
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="w-full h-44 object-cover" loading="lazy" />
      ) : null}
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-widest">
          <span style={{ color: "#D4AF37" }}>{item.category}</span>
          {item.status === "Urgent" && (
            <span className="px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>
              Urgent
            </span>
          )}
        </div>
        <h3 className="text-xl font-semibold text-white">{item.title}</h3>
        {item.description && <p className="text-sm text-gray-300 leading-relaxed line-clamp-4">{item.description}</p>}
        {item.location && <p className="text-xs text-gray-400">{item.location}</p>}
        <div className="mt-auto flex gap-3 pt-2">
          <Link href={`/programs/${encodeURIComponent(item.id)}`} className="text-sm text-gray-200 underline underline-offset-4">
            Details
          </Link>
          <Link href={`/pay?cause=${encodeURIComponent(item.id)}`} className="text-sm font-semibold" style={{ color: "#D4AF37" }}>
            Donate →
          </Link>
        </div>
      </div>
    </article>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="main-home-container" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <GlobalHeader showRibbon={false} />
      <div style={{ flex: 1, paddingTop: 120 }}>
        <div className="mx-auto w-full px-4 pb-16" style={{ maxWidth: 1180 }}>
          {children}
        </div>
      </div>
      <Footer />
    </main>
  );
}

/** Lists the open entries of one kind. An unreadable catalog is reported, never replaced by invented content. */
export default async function CatalogPage({ kind, title, subtitle, empty }: { kind: "cause" | "project" | "campaign"; title: string; subtitle: string; empty: string }) {
  let items: CatalogItem[] = [];
  let failed = false;
  try {
    items = await fetchPublicCatalog(kind);
  } catch {
    failed = true;
  }
  return (
    <PublicShell>
      <h1 className="text-3xl md:text-4xl font-semibold text-white" style={{ fontFamily: "var(--font-cinzel, Georgia, serif)" }}>
        {title}
      </h1>
      <p className="mt-2 mb-8 text-gray-300 max-w-2xl">{subtitle}</p>
      {failed ? (
        <p role="alert" className="p-4 rounded-xl text-amber-200" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
          This list is temporarily unavailable. Please try again in a few minutes.
        </p>
      ) : items.length === 0 ? (
        <p className="text-gray-400">{empty}</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <CatalogCard key={i.id} item={i} />
          ))}
        </div>
      )}
    </PublicShell>
  );
}
