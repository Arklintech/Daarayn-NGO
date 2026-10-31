"use client";

import React, { useCallback, useEffect, useState } from "react";

/**
 * Intake queue monitor (queued intake). Reads ONE Google Sheets row set per refresh (the sheet, not the queue, is the record). It shows whether every accepted
 * submission is moving, which rows need a person, and lets an administrator requeue a row or redispatch the wake-up. Every action is audited by the server
 * BEFORE it runs. Counters of queue publishing are those of the one server instance that answered, and are labelled so.
 */
interface Row { reference: string; state: string; retryCount: number; ageSec: number; category?: string }
interface Snapshot {
  success: boolean;
  readAt: string;
  mode: { queuedIntakeEnabled: boolean; cronSecretConfigured: boolean };
  publishing: { thisInstance: { published: number; failures: number; lastFailureAt: number | null; lastError: string | null } };
  alarm: "ok" | "backlog" | "review";
  depth: number;
  byState: Record<string, number>;
  oldestPendingAgeSec: number;
  retryTotal: number;
  needsReview: number;
  stale: number;
  lastCompletedAt: string;
  lastActivityAt: string;
  review: Row[];
  waiting: Row[];
}

const age = (s: number) => (s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const when = (iso: string) => (iso ? new Date(iso).toLocaleString() : "never");
const BANNER = {
  ok: { tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200", title: "Every accepted submission is moving", body: "Nothing is waiting longer than the alarm threshold and nothing needs review." },
  backlog: { tone: "border-amber-500/30 bg-amber-500/10 text-amber-200", title: "Submissions are waiting too long", body: "Redispatch the wake-up. If this repeats, the worker is not running: check the queue consumer and its deployment." },
  review: { tone: "border-red-500/30 bg-red-500/10 text-red-200", title: "Some submissions need a person", body: "These rows failed their retries or could not be trusted. Nothing was lost: the donor still holds a reference." },
} as const;

export default function IntakeQueuePage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/intake-queue", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000); // one Sheets read a minute while the page is open
    return () => clearInterval(t);
  }, [load]);

  const act = async (action: "requeue" | "redispatch", ref?: string) => {
    setBusy(ref || action);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/intake-queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ref }) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setNotice(action === "requeue" ? `${ref} was sent back to the queue.${json.wakeUpPublished ? "" : " The wake-up could not be published; use Redispatch."}` : json.redispatched ? "A wake-up was published." : "Nothing needed a wake-up.");
      await load();
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(null);
    }
  };

  const banner = data ? BANNER[data.alarm] : null;
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Intake queue</h1>
          <p className="text-gray-400 mt-1 max-w-3xl">Accepted submissions waiting to become recorded donations. The sheet is the record; this page only reads it.</p>
          {data && <p className="text-gray-500 mt-1 text-sm">Read from Google Sheets at {new Date(data.readAt).toLocaleTimeString()}. Each refresh costs one Sheets read.</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="px-3 py-2 min-h-[44px] rounded-lg border border-white/15 text-gray-200">Refresh</button>
          <button onClick={() => act("redispatch")} disabled={busy !== null || !data?.mode.queuedIntakeEnabled} className="px-4 py-2 min-h-[44px] rounded-lg bg-white text-black font-semibold disabled:opacity-40">
            {busy === "redispatch" ? "Working…" : "Redispatch wake-up"}
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200" role="alert">{error}</div>}
      {notice && <div className="p-3 rounded-xl border border-white/10 bg-white/5 text-gray-200" role="status">{notice}</div>}

      {data && banner && (
        <div className={`p-4 rounded-2xl border ${banner.tone}`} role="status">
          <p className="text-lg font-semibold">{banner.title}</p>
          <p className="text-sm opacity-90 mt-0.5">{banner.body}</p>
        </div>
      )}

      {data && !data.mode.queuedIntakeEnabled && (
        <div className="p-3 rounded-xl border border-white/10 bg-white/5 text-gray-300 text-sm">
          Queued intake is switched OFF (DONATION_INTAKE_MODE is not "queued"). The direct donation path is the only live path; this page shows the intake worksheet as it is.
        </div>
      )}

      {data && (
        <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr))]" aria-label="Queue numbers">
          {[
            { k: "Waiting", v: String(data.depth), hint: "received, assigned or retrying" },
            { k: "Oldest waiting", v: data.depth ? age(data.oldestPendingAgeSec) : "none", hint: `alarm after ${age(900)}` },
            { k: "Retrying", v: String(data.byState.RETRY_PENDING || 0), hint: `${data.retryTotal} retries so far` },
            { k: "Needs review", v: String(data.needsReview), hint: "failed or untrusted" },
            { k: "Last completed", v: data.lastCompletedAt ? new Date(data.lastCompletedAt).toLocaleTimeString() : "never", hint: data.lastCompletedAt ? new Date(data.lastCompletedAt).toLocaleDateString() : "no donation finished yet" },
            { k: "Last worker activity", v: data.lastActivityAt ? new Date(data.lastActivityAt).toLocaleTimeString() : "never", hint: "any pass that wrote a row" },
          ].map((m) => (
            <div key={m.k} className="rounded-2xl admin-glass border border-white/[0.06] p-4">
              <p className="text-xs uppercase tracking-wider text-gray-400">{m.k}</p>
              <p className="mt-1 text-2xl font-semibold text-white tabular-nums">{m.v}</p>
              <p className="mt-0.5 text-xs text-gray-500">{m.hint}</p>
            </div>
          ))}
        </section>
      )}

      {data && (
        <section className="rounded-2xl admin-glass border border-white/[0.06] p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">Needs review ({data.review.length})</h2>
          {data.review.length === 0 && <p className="text-emerald-300 text-sm">Nothing needs review.</p>}
          {data.review.map((r) => (
            <div key={r.reference} className="flex items-center justify-between gap-3 border-t border-white/5 pt-2 text-gray-200 flex-wrap">
              <span className="min-w-0"><span className="font-mono">{r.reference}</span> · {r.category || "unspecified"} · {r.retryCount} retries · {age(r.ageSec)} old</span>
              <button onClick={() => act("requeue", r.reference)} disabled={busy !== null || !data.mode.queuedIntakeEnabled} className="px-3 py-2 min-h-[44px] rounded-lg border border-white/15 disabled:opacity-40">
                {busy === r.reference ? "Working…" : "Requeue"}
              </button>
            </div>
          ))}
        </section>
      )}

      {data && (
        <section className="rounded-2xl admin-glass border border-white/[0.06] p-5 space-y-2">
          <h2 className="text-sm font-semibold text-white">Waiting, oldest first ({data.waiting.length}{data.depth > data.waiting.length ? ` of ${data.depth}` : ""})</h2>
          {data.waiting.length === 0 && <p className="text-emerald-300 text-sm">Nothing is waiting.</p>}
          {data.waiting.map((r) => (
            <p key={r.reference} className="border-t border-white/5 pt-2 text-gray-200 text-sm"><span className="font-mono">{r.reference}</span> · {r.state.replace("_", " ").toLowerCase()} · {age(r.ageSec)}{r.retryCount ? ` · ${r.retryCount} retries` : ""}</p>
          ))}
        </section>
      )}

      {data && (
        <section className="rounded-2xl admin-glass border border-white/[0.06] p-5 space-y-1 text-sm">
          <h2 className="text-sm font-semibold text-white">Wake-up publishing</h2>
          <p className="text-gray-300">Published by the server instance that answered this page: {data.publishing.thisInstance.published}; failures: {data.publishing.thisInstance.failures}{data.publishing.thisInstance.lastError ? ` (last: ${data.publishing.thisInstance.lastError})` : ""}.</p>
          <p className="text-gray-500">A serverless instance is short lived, so these counters are not a total. The durable evidence of a failed wake-up is a row that stays waiting.</p>
          <p className="text-gray-300">Daily safety-net job: {data.mode.cronSecretConfigured ? "its secret is configured" : "its secret is NOT configured, so the job is disabled"}.</p>
        </section>
      )}
    </div>
  );
}
