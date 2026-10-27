"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRealtimeRefresh } from "@/lib/realtime/useRealtime";
import { DONATION_DATA_EVENTS } from "@/lib/realtime/events";

interface Relation {
  causeId: string;
  title: string;
  designatedAmount: number | null;
  designationStatus: "designated" | "unresolved";
}
interface DonationRow {
  id: string;
  donor: string;
  amount: number;
  status: string;
  date: string;
  causes: Relation[];
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const cents = (n: number) => Math.round(n * 100);

/**
 * Donation designations: which causes each donation supports and how its money is distributed. A multi-cause donation
 * stays "unresolved" until an authorised admin records an exact split here; the server rejects anything that does not
 * reconcile to the donation amount. Nothing is computed or assumed in the browser.
 */
export default function DesignationsPage() {
  const [rows, setRows] = useState<DonationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"unresolved" | "designated" | "all">("unresolved");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<DonationRow | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/donations", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setRows((json.donations as DonationRow[]).filter((d) => d.status !== "rejected" && (d.causes || []).length > 0));
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

  const unresolvedCount = (d: DonationRow) => d.causes.filter((c) => c.designationStatus === "unresolved").length;
  const shown = useMemo(
    () =>
      rows
        .filter((d) => (filter === "all" ? true : filter === "unresolved" ? unresolvedCount(d) > 0 : unresolvedCount(d) === 0))
        .filter((d) => !query || `${d.id} ${d.donor}`.toLowerCase().includes(query.toLowerCase())),
    [rows, filter, query]
  );

  const open = (d: DonationRow) => {
    setEditing(d);
    setFormError(null);
    setAmounts(Object.fromEntries(d.causes.map((c) => [c.causeId, c.designatedAmount === null ? "" : String(c.designatedAmount)])));
  };

  const total = editing ? editing.causes.reduce((s, c) => s + cents(Number(amounts[c.causeId] || 0)), 0) : 0;
  const remaining = editing ? cents(editing.amount) - total : 0;

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/admin/designations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ donationId: editing.id, split: editing.causes.map((c) => ({ causeId: c.causeId, amount: Number(amounts[c.causeId]) })) }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setNotice(`Distribution recorded for ${editing.id}.`);
      setEditing(null);
      await load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-xs">
      <div>
        <h1 className="text-xl font-semibold text-white">Donation Designations</h1>
        <p className="text-gray-400 mt-1 max-w-3xl">
          A cause selection is not an allocation. A donation related to several causes stays unresolved until you record how its amount is distributed; the total must match the donation exactly.
        </p>
      </div>

      {notice && <div className="p-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-200" role="status">{notice}</div>}
      {error && <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200" role="alert">Donations could not be loaded from Google Sheets: {error}</div>}

      <div className="flex flex-wrap gap-2 items-center">
        {(["unresolved", "designated", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg border ${filter === f ? "bg-white text-black border-white" : "border-white/15 text-gray-300"}`}>
            {f === "unresolved" ? "Needs a split" : f === "designated" ? "Recorded" : "All"}
          </button>
        ))}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search donation ID or donor" className="ml-auto px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white w-64" aria-label="Search donations" />
      </div>

      <div className="rounded-2xl admin-glass border border-white/[0.06] overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-gray-400">
            <tr>
              <th className="p-3">Donation</th>
              <th className="p-3">Donor</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Causes and designations</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="text-gray-200">
            {loading && <tr><td className="p-4 text-gray-400" colSpan={6}>Loading from Google Sheets…</td></tr>}
            {!loading && shown.length === 0 && !error && <tr><td className="p-4 text-gray-400" colSpan={6}>No donations match this view.</td></tr>}
            {shown.map((d) => (
              <tr key={d.id} className="border-t border-white/5 align-top">
                <td className="p-3 font-mono">{d.id}</td>
                <td className="p-3">{d.donor}</td>
                <td className="p-3 text-right">{inr(d.amount)}</td>
                <td className="p-3 capitalize">{d.status === "completed" ? "verified" : d.status}</td>
                <td className="p-3 space-y-1">
                  {d.causes.map((c) => (
                    <div key={c.causeId}>
                      {c.title}: {c.designationStatus === "designated" && c.designatedAmount !== null ? <span className="text-emerald-300">{inr(c.designatedAmount)}</span> : <span className="text-amber-300">unresolved</span>}
                    </div>
                  ))}
                </td>
                <td className="p-3 text-right">
                  {d.causes.length > 1 || unresolvedCount(d) > 0 ? (
                    <button onClick={() => open(d)} className="px-3 py-1.5 rounded-lg bg-white text-black font-semibold">
                      {unresolvedCount(d) > 0 ? "Record split" : "Edit split"}
                    </button>
                  ) : (
                    <span className="text-gray-500">Single cause</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`Record distribution for ${editing.id}`}>
          <div className="w-full max-w-lg rounded-2xl p-6 bg-[#0d1628] border border-white/10 space-y-4">
            <h2 className="text-base font-semibold text-white">Distribute {inr(editing.amount)} · {editing.id}</h2>
            {editing.causes.map((c) => (
              <label key={c.causeId} className="flex items-center justify-between gap-3 text-gray-200">
                <span>{c.title}</span>
                <input type="number" min="0" step="0.01" value={amounts[c.causeId] ?? ""} onChange={(e) => setAmounts({ ...amounts, [c.causeId]: e.target.value })} className="w-36 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-right" aria-label={`Amount for ${c.title}`} />
              </label>
            ))}
            <p className={remaining === 0 ? "text-emerald-300" : "text-amber-300"}>
              {remaining === 0 ? "Reconciles exactly." : remaining > 0 ? `${inr(remaining / 100)} not yet distributed.` : `${inr(-remaining / 100)} over the donation amount.`}
            </p>
            {formError && <p className="text-red-300" role="alert">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-white/15 text-gray-300">Cancel</button>
              <button onClick={save} disabled={saving || remaining !== 0 || editing.causes.some((c) => !(Number(amounts[c.causeId]) > 0))} className="px-4 py-2 rounded-lg bg-white text-black font-semibold disabled:opacity-40">
                {saving ? "Saving…" : "Save distribution"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
