"use client";

import React, { useCallback, useState } from "react";
import Link from "next/link";
import { useRealtimeRefresh } from "@/lib/realtime/useRealtime";
import { DONATION_DATA_EVENTS } from "@/lib/realtime/events";

interface Incomplete {
  id: string;
  status?: string;
  outstanding: string[];
}
interface Exception {
  type: string;
  severity: "error" | "warning" | "info";
  entityId: string;
  message: string;
}
interface Result {
  donationId: string;
  recovered: string[];
  remaining: string[];
}

const SEVERITY_STYLE: Record<Exception["severity"], string> = {
  error: "text-red-300",
  warning: "text-amber-300",
  info: "text-sky-300",
};

/** Where an administrator resolves each kind of exception. Unknown types fall back to the donation list. */
const fixLink = (e: Exception) => {
  if (/designation|cause|split/i.test(e.type)) return { href: "/admin/designations", label: "Designations" };
  if (/allocation/i.test(e.type)) return { href: "/admin/allocations", label: "Allocations" };
  if (/donor/i.test(e.type)) return { href: "/admin/donors", label: "Donors" };
  return { href: "/admin/donations", label: "Donations" };
};

/**
 * Reconciliation: integrity exceptions found in Sheets and donations whose follow-up steps (designation rows,
 * notification, audit) did not finish. Recovery is idempotent and runs on the server; this page reports what it actually
 * returned, including steps that are still outstanding.
 */
export default function ReconciliationPage() {
  const [incomplete, setIncomplete] = useState<Incomplete[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reconciliation", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setIncomplete(json.incomplete);
      setExceptions(json.exceptions);
      setReadAt(json.readAt);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useRealtimeRefresh(DONATION_DATA_EVENTS, load);
  React.useEffect(() => {
    load();
  }, [load]);

  const recover = async (ids?: string[]) => {
    const n = ids ? ids.length : incomplete.length;
    if (!window.confirm(`Finish the outstanding steps for ${n} donation${n === 1 ? "" : "s"}? Steps already done are skipped.`)) return;
    setRunning(true);
    setResults(null);
    try {
      const res = await fetch("/api/admin/reconciliation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ids ? { donationIds: ids } : {}) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setResults(json.results);
      setTruncated(Boolean(json.truncated));
      setError(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Reconciliation</h1>
          <p className="text-gray-400 mt-1 max-w-3xl">
            Records that do not agree with each other, and donations whose follow-up work was interrupted. Nothing here changes money; recovery only completes missing bookkeeping steps.
          </p>
          {readAt && <p className="text-gray-500 mt-1">Read from Google Sheets at {new Date(readAt).toLocaleTimeString()}.</p>}
        </div>
        <button onClick={load} className="px-3 py-1.5 rounded-lg border border-white/15 text-gray-200">Refresh</button>
      </div>

      {error && <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200" role="alert">{error}</div>}

      {results && (
        <div className="p-3 rounded-xl border border-white/10 bg-white/5 space-y-1" role="status">
          <p className="text-white font-semibold">Recovery outcome</p>
          {results.length === 0 && <p className="text-gray-300">Nothing needed recovery.</p>}
          {results.map((r) => (
            <p key={r.donationId} className={r.remaining.length ? "text-amber-300" : "text-emerald-300"}>
              <span className="font-mono">{r.donationId}</span>: {r.recovered.length ? `completed ${r.recovered.join(", ")}` : "nothing to do"}
              {r.remaining.length ? ` · still outstanding: ${r.remaining.join(", ")}` : ""}
            </p>
          ))}
          {truncated && <p className="text-amber-300">Only the first 25 were processed. Run recovery again for the rest.</p>}
        </div>
      )}

      <section className="rounded-2xl admin-glass border border-white/[0.06] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Interrupted donations ({incomplete.length})</h2>
          {incomplete.length > 0 && (
            <button onClick={() => recover()} disabled={running} className="px-4 py-2 rounded-lg bg-white text-black font-semibold disabled:opacity-40">
              {running ? "Recovering…" : "Recover all"}
            </button>
          )}
        </div>
        {loading && <p className="text-gray-400">Loading from Google Sheets…</p>}
        {!loading && incomplete.length === 0 && !error && <p className="text-emerald-300">Every donation has completed its follow-up steps.</p>}
        {incomplete.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3 border-t border-white/5 pt-2 text-gray-200">
            <span><span className="font-mono">{d.id}</span> · outstanding: {d.outstanding.join(", ")}</span>
            <button onClick={() => recover([d.id])} disabled={running} className="px-3 py-1.5 rounded-lg border border-white/15 disabled:opacity-40">Recover</button>
          </div>
        ))}
      </section>

      <section className="rounded-2xl admin-glass border border-white/[0.06] p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">Integrity exceptions ({exceptions.length})</h2>
        {!loading && exceptions.length === 0 && !error && <p className="text-emerald-300">No integrity exceptions found.</p>}
        {exceptions.map((e, i) => {
          const link = fixLink(e);
          return (
            <div key={`${e.type}-${e.entityId}-${i}`} className="border-t border-white/5 pt-2 text-gray-200 flex items-start justify-between gap-3">
              <div>
                <span className={`uppercase font-semibold mr-2 ${SEVERITY_STYLE[e.severity]}`}>{e.severity}</span>
                <span className="font-mono text-gray-400 mr-2">{e.entityId}</span>
                {e.message}
              </div>
              <Link href={link.href} className="underline whitespace-nowrap">{link.label}</Link>
            </div>
          );
        })}
      </section>
    </div>
  );
}
