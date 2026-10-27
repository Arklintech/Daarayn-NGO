"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  causes: Relation[];
}
interface Allocation {
  id: string;
  donationId: string;
  donorName: string;
  causeId?: string;
  designationId?: string;
  targetTitle: string;
  projectId?: string;
  allocatedAmount: number;
  allocationDate: string;
  adminEmail: string;
  status: "active" | "reversed";
  notes?: string;
  evidenceDriveFileIds?: string[];
  reversedReason?: string;
  reversedAt?: string;
  reversedBy?: string;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `alloc-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Allocation management. An allocation is a separate record from the donation and from the cause selection. The server
 * enforces: verified donation, recorded designation, total active allocations within the designated amount, evidence
 * stored before anything is recorded, idempotency by request key, and reversal instead of deletion. The figures shown
 * here are read from Sheets; the browser never decides what is allowed.
 */
export default function AllocationsPage() {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [donations, setDonations] = useState<DonationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "reversed">("all");
  const [selected, setSelected] = useState<Allocation | null>(null);

  const [donationId, setDonationId] = useState("");
  const [causeId, setCauseId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const requestKey = useRef(newKey());

  const load = useCallback(async () => {
    try {
      const [a, d] = await Promise.all([fetch("/api/admin/allocations", { cache: "no-store" }), fetch("/api/admin/donations", { cache: "no-store" })]);
      const aj = await a.json();
      const dj = await d.json();
      if (!a.ok || !aj.success) throw new Error(aj.error || `Allocations: HTTP ${a.status}`);
      if (!d.ok || !dj.success) throw new Error(dj.error || `Donations: HTTP ${d.status}`);
      setAllocations(aj.allocations);
      setDonations(dj.donations);
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

  // Only verified donations with a recorded designation can be allocated.
  const sources = useMemo(() => donations.filter((d) => d.status === "completed" && (d.causes || []).some((c) => c.designationStatus === "designated")), [donations]);
  const source = sources.find((d) => d.id === donationId);
  const relation = source?.causes.find((c) => c.causeId === causeId && c.designationStatus === "designated");
  const allocated = allocations.filter((a) => a.donationId === donationId && a.causeId === causeId && a.status === "active").reduce((s, a) => s + a.allocatedAmount, 0);
  const remaining = relation && relation.designatedAmount !== null ? Math.round((relation.designatedAmount - allocated) * 100) / 100 : 0;
  const shown = allocations.filter((a) => statusFilter === "all" || a.status === statusFilter).sort((x, y) => y.allocationDate.localeCompare(x.allocationDate));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const fd = new FormData();
      fd.set("donationId", donationId);
      fd.set("causeId", causeId);
      fd.set("amount", amount);
      fd.set("requestKey", requestKey.current);
      if (notes) fd.set("notes", notes);
      if (evidence) fd.set("evidence", evidence);
      const res = await fetch("/api/admin/allocations", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setNotice(json.duplicate ? `That request was already recorded as ${json.allocation.id}.` : `Allocation ${json.allocation.id} recorded${json.allocation.evidenceDriveFileIds?.length ? " with evidence" : ""}.`);
      requestKey.current = newKey(); // a NEW intent gets a new key; retries of a failed one keep the old key
      setAmount("");
      setNotes("");
      setEvidence(null);
      await load();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const reverse = async (a: Allocation) => {
    const reason = window.prompt(`Reason for reversing ${a.id} (${inr(a.allocatedAmount)})? The record is kept.`);
    if (!reason) return;
    try {
      const res = await fetch("/api/admin/allocations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, reason }) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setNotice(`Allocation ${a.id} reversed.`);
      setSelected(null);
      await load();
    } catch (err: any) {
      setNotice(null);
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6 text-xs">
      <div>
        <h1 className="text-xl font-semibold text-white">Allocation Records</h1>
        <p className="text-gray-400 mt-1 max-w-3xl">
          An allocation assigns part of a verified, designated donation to a cause. Allocated is not spent, and a cause is not complete until its completion evidence is attached. Reversals keep the record.
        </p>
      </div>

      {notice && <div className="p-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-200" role="status">{notice}</div>}
      {error && <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200" role="alert">{error}</div>}

      <form onSubmit={create} className="rounded-2xl p-5 admin-glass border border-white/[0.06] grid grid-cols-1 md:grid-cols-2 gap-4" aria-label="Create allocation">
        <h2 className="md:col-span-2 text-sm font-semibold text-white">New allocation</h2>
        <label className="space-y-1 text-gray-300">
          <span>Verified donation</span>
          <select value={donationId} onChange={(e) => { setDonationId(e.target.value); setCauseId(""); }} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white" required>
            <option value="">Select…</option>
            {sources.map((d) => (
              <option key={d.id} value={d.id}>{d.id} · {d.donor} · {inr(d.amount)}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-gray-300">
          <span>Cause (from its recorded designation)</span>
          <select value={causeId} onChange={(e) => setCauseId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white" required disabled={!source}>
            <option value="">Select…</option>
            {(source?.causes || []).filter((c) => c.designationStatus === "designated").map((c) => (
              <option key={c.causeId} value={c.causeId}>{c.title} · designated {inr(c.designatedAmount || 0)}</option>
            ))}
          </select>
          {source && source.causes.some((c) => c.designationStatus === "unresolved") && (
            <span className="block text-amber-300">Some causes are unresolved. <Link href="/admin/designations" className="underline">Record the split first</Link>.</span>
          )}
        </label>
        <label className="space-y-1 text-gray-300">
          <span>Amount {relation ? `(up to ${inr(remaining)})` : ""}</span>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white" required />
        </label>
        <label className="space-y-1 text-gray-300">
          <span>Supporting evidence (image or PDF, optional)</span>
          <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => setEvidence(e.target.files?.[0] || null)} className="w-full text-gray-300" />
        </label>
        <label className="md:col-span-2 space-y-1 text-gray-300">
          <span>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white" />
        </label>
        {formError && <p className="md:col-span-2 text-red-300" role="alert">{formError}</p>}
        <div className="md:col-span-2 flex justify-end">
          <button type="submit" disabled={saving || !relation || !(Number(amount) > 0) || Number(amount) > remaining} className="px-5 py-2 rounded-lg bg-white text-black font-semibold disabled:opacity-40">
            {saving ? "Recording…" : "Record allocation"}
          </button>
        </div>
      </form>

      <div className="flex gap-2">
        {(["all", "active", "reversed"] as const).map((f) => (
          <button key={f} onClick={() => setStatusFilter(f)} className={`px-3 py-1.5 rounded-lg border capitalize ${statusFilter === f ? "bg-white text-black border-white" : "border-white/15 text-gray-300"}`}>{f}</button>
        ))}
      </div>

      <div className="rounded-2xl admin-glass border border-white/[0.06] overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-gray-400">
            <tr>
              <th className="p-3">Allocation</th>
              <th className="p-3">Donation</th>
              <th className="p-3">Cause</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Evidence</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="text-gray-200">
            {loading && <tr><td className="p-4 text-gray-400" colSpan={7}>Loading from Google Sheets…</td></tr>}
            {!loading && shown.length === 0 && !error && <tr><td className="p-4 text-gray-400" colSpan={7}>No allocations recorded yet.</td></tr>}
            {shown.map((a) => (
              <tr key={a.id} className="border-t border-white/5">
                <td className="p-3 font-mono">{a.id}</td>
                <td className="p-3 font-mono">{a.donationId}</td>
                <td className="p-3">{a.targetTitle}</td>
                <td className="p-3 text-right">{inr(a.allocatedAmount)}</td>
                <td className={`p-3 capitalize ${a.status === "reversed" ? "text-amber-300" : "text-emerald-300"}`}>{a.status}</td>
                <td className="p-3">{(a.evidenceDriveFileIds || []).length ? (a.evidenceDriveFileIds || []).map((id, i) => <a key={id} href={`/api/media/${id}`} target="_blank" rel="noreferrer" className="underline mr-2">File {i + 1}</a>) : <span className="text-gray-500">none</span>}</td>
                <td className="p-3 text-right space-x-2">
                  <button onClick={() => setSelected(a)} className="px-3 py-1.5 rounded-lg border border-white/15 text-gray-200">Details</button>
                  {a.status === "active" && <button onClick={() => reverse(a)} className="px-3 py-1.5 rounded-lg border border-red-400/40 text-red-200">Reverse</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`Allocation ${selected.id}`}>
          <div className="w-full max-w-lg rounded-2xl p-6 bg-[#0d1628] border border-white/10 space-y-2 text-gray-200">
            <h2 className="text-base font-semibold text-white">{selected.id}</h2>
            <p>Source donation: <span className="font-mono">{selected.donationId}</span> ({selected.donorName})</p>
            <p>Cause: {selected.targetTitle} <span className="text-gray-500">({selected.causeId})</span></p>
            <p>Designation: <span className="font-mono">{selected.designationId || "—"}</span></p>
            <p>Amount: {inr(selected.allocatedAmount)} · recorded by {selected.adminEmail} on {new Date(selected.allocationDate).toLocaleString()}</p>
            {selected.notes && <p>Notes: {selected.notes}</p>}
            {selected.status === "reversed" && <p className="text-amber-300">Reversed by {selected.reversedBy} on {selected.reversedAt ? new Date(selected.reversedAt).toLocaleString() : "—"}: {selected.reversedReason}</p>}
            <div className="flex justify-end pt-2"><button onClick={() => setSelected(null)} className="px-4 py-2 rounded-lg border border-white/15">Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
