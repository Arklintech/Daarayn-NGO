"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, X, Save, Upload, ExternalLink, RefreshCw, Eye, EyeOff, ArrowUp, ArrowDown, Trash2, BarChart3 } from "lucide-react";
import AdminSelect from "@/components/admin/AdminSelect";
import ProgramDetailView from "@/components/programs/ProgramDetailView";
import "@/components/programs/programs.css";
import { validateImageFile, MAX_IMAGES_PER_PROGRAM, MAX_IMAGE_BYTES, type ProgramImageView } from "@/lib/catalog/programImagesSchema";
import { masjidHoldState, GENERAL_TEMPLATES, masjidUpdateState, MASJID_UPDATE_WINDOW_DAYS } from "@/lib/catalog/programDomains";
import { CATEGORY_LABEL, defaultCategoryFor, type ProgramCategory } from "@/lib/catalog/programContentSchema";
type ProgramDomain = ProgramCategory;
const DOMAIN_LABEL = CATEGORY_LABEL;
import { SECTION_TYPES, TEMPLATE_LABELS, PROGRAM_TEMPLATES, type ProgramTemplate } from "@/lib/catalog/programContentSchema";

const STATUSES = ["Draft", "Active", "Urgent", "Completed", "Inactive"] as const;
type Status = (typeof STATUSES)[number];
type Kind = "project" | "campaign" | "cause";
const KIND_LABEL: Record<Kind, string> = { project: "Program", campaign: "Campaign", cause: "Cause" };

const MEANING: Record<Status, { label: string; hint: string; color: string }> = {
  Draft: { label: "Draft", hint: "Saved, not public, cannot receive donations", color: "#9ca3af" },
  Active: { label: "Published", hint: "Public and open for donations", color: "#34d399" },
  Urgent: { label: "Published · Urgent", hint: "Public, highlighted, open for donations", color: "#f87171" },
  Completed: { label: "Completed", hint: "Closed: not public, no new donations; history is kept", color: "#60a5fa" },
  Inactive: { label: "Unpublished", hint: "Withdrawn: not public, no new donations; history is kept", color: "#fbbf24" },
};

interface RawSection {
  type: string;
  title: string;
  body: string;
  itemsText: string; // checklist/panel lines; needs "name | amount"; milestones "label | done|pending | note"
}

interface Form {
  id: string;
  kind: Kind;
  title: string;
  category: string;
  location: string;
  targetAmount: string;
  description: string;
  status: Status;
  imageUrl: string;
  template: ProgramTemplate;
  cardSummary: string;
  cardDetails: string;
  ctaText: string;
  sortOrder: string;
  lead: string;
  heroAlt: string;
  heroCaption: string;
  primaryCtaText: string;
  navLabel: string;
  sections: RawSection[];
  lastUpdateAt: string;
  updateNote: string;
  recordUpdate: boolean;
  holdClearedAt: string;
  programCategory: string;
}

const newId = (kind: Kind) => `${kind === "project" ? "PROGRAM" : kind.toUpperCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
const money = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const blank = (kind: Kind): Form => ({
  id: newId(kind), kind, title: "", category: "General", location: "", targetAmount: "", description: "", status: "Draft", imageUrl: "",
  template: kind === "project" ? "relief" : "custom", cardSummary: "", cardDetails: "", ctaText: "View Program", sortOrder: "100", lead: "",
  heroAlt: "", heroCaption: "", primaryCtaText: "Contribute", navLabel: "", sections: [], lastUpdateAt: "", updateNote: "", recordUpdate: false, holdClearedAt: "", programCategory: "general",
});

function sectionToRaw(s: any): RawSection {
  switch (s.type) {
    case "text": return { type: "text", title: s.title || "", body: s.body || "", itemsText: "" };
    case "checklist": case "panel": return { type: s.type, title: s.title || "", body: "", itemsText: (s.items || []).join("\n") };
    case "needs": return { type: "needs", title: s.title || "", body: "", itemsText: (s.needs || []).map((n: any) => (n.amount !== undefined ? `${n.name} | ${n.amount}` : n.name)).join("\n") };
    default: return { type: "milestones", title: s.title || "", body: "", itemsText: (s.items || []).map((m: any) => `${m.label} | ${m.done ? "done" : "pending"}${m.note ? ` | ${m.note}` : ""}`).join("\n") };
  }
}

function rawToSection(r: RawSection): any {
  const lines = r.itemsText.split("\n").map((l) => l.trim()).filter(Boolean);
  switch (r.type) {
    case "text": return { type: "text", title: r.title, body: r.body };
    case "checklist": return { type: "checklist", title: r.title, items: lines };
    case "panel": return { type: "panel", title: r.title, items: lines };
    case "needs": return { type: "needs", title: r.title, needs: lines.map((l) => { const [name, amount] = l.split("|").map((x) => x.trim()); return amount !== undefined && amount !== "" ? { name, amount: Number(amount) } : { name }; }) };
    default: return { type: "milestones", title: r.title, items: lines.map((l) => { const [label, state, ...note] = l.split("|").map((x) => x.trim()); return { label, done: /^done|yes|true$/i.test(state || ""), note: note.join(" | ") }; }) };
  }
}

function formFromItem(item: any): Form {
  const c = item.content || {};
  return {
    id: item.id, kind: (item.kind as Kind) || "project", title: item.title, category: item.category || "General", location: item.location || "",
    targetAmount: String(item.targetAmount || ""), description: item.description || "", status: (STATUSES as readonly string[]).includes(item.status) ? item.status : "Draft",
    imageUrl: item.imageUrl || "", template: (PROGRAM_TEMPLATES as readonly string[]).includes(c.template) ? c.template : "custom", cardSummary: c.cardSummary || "",
    cardDetails: (c.cardDetails || []).join("\n"), ctaText: c.ctaText || "View Program", sortOrder: String(c.sortOrder ?? 100), lead: c.lead || "", heroAlt: c.heroAlt || "",
    heroCaption: c.heroCaption || "", primaryCtaText: c.primaryCtaText || "Contribute", navLabel: c.navLabel || "", sections: (c.sections || []).map(sectionToRaw), lastUpdateAt: c.lastUpdateAt || "", updateNote: c.updateNote || "", recordUpdate: false, holdClearedAt: c.holdClearedAt || "", programCategory: c.programCategory || defaultCategoryFor(c.template || "custom"),
  };
}

function bodyFromForm(f: Form, status: Status) {
  return {
    id: f.id, kind: f.kind, title: f.title, category: f.category, location: f.location, targetAmount: Number(f.targetAmount || 0), description: f.description,
    imageUrl: f.imageUrl, status,
    content: {
      template: f.template, programCategory: f.template === "project" ? "masjid" : f.programCategory === "masjid" ? "general" : f.programCategory, cardSummary: f.cardSummary, cardDetails: f.cardDetails.split("\n"), ctaText: f.ctaText, sortOrder: Number(f.sortOrder),
      lead: f.lead, heroAlt: f.heroAlt, heroCaption: f.heroCaption, primaryCtaText: f.primaryCtaText, navLabel: f.navLabel, sections: f.sections.map(rawToSection), ...(f.template === "project" ? { updateNote: f.updateNote, recordUpdate: f.recordUpdate } : {}),
    },
  };
}

/**
 * The single management screen for programs, campaigns and causes (one Causes-tab row + one Program_Content row per permanent
 * id). Saves go to POST /api/admin/programs; the list is re-read from the server after every save, so what is shown is what was
 * persisted. Nothing is deleted: "Unpublish" and "Complete" keep every record and donation.
 */
function MasjidUpdatePanel({ form, setForm, onClearHold, clearing }: { form: Form; setForm: (f: Form) => void; onClearHold: () => void; clearing: boolean }) {
  const { state, daysSince } = masjidUpdateState(form.lastUpdateAt);
  const held = masjidHoldState({ template: "project", lastUpdateAt: form.lastUpdateAt, holdClearedAt: form.holdClearedAt }).held;
  const text = state === "none" ? "No update recorded yet." : held ? `ON HOLD: no update for more than ${MASJID_UPDATE_WINDOW_DAYS} days (last ${daysSince} days ago). New donations are blocked until you clear the hold.` : state === "overdue" ? "Hold was cleared; the window restarted at that time." : `Last update ${daysSince} day(s) ago. Within the ${MASJID_UPDATE_WINDOW_DAYS}-day window.`;
  return (
    <div className="p-3 rounded-xl border border-white/10 space-y-2" data-masjid-update={state}>
      <p className="text-sm text-gray-300">Masjid project updates: {text}</p>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={form.recordUpdate} onChange={(e) => setForm({ ...form, recordUpdate: e.target.checked })} />
        Record a verified update now (the date is taken from the server clock when you save)
      </label>
      {held && <button type="button" disabled={clearing} onClick={onClearHold} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-black" style={{ background: "#D4AF37" }}>{clearing ? "Clearing…" : "Clear hold…"}</button>}
      <input className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" maxLength={300} placeholder="Short public update note (optional)" value={form.updateNote} onChange={(e) => setForm({ ...form, updateNote: e.target.value })} />
    </div>
  );
}

export default function ProgramsManager() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<ProgramDomain>("general");
  const [form, setForm] = useState<Form | null>(null);
  const [isNew, setIsNew] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearingHold, setClearingHold] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "error" | "warn"; text: string } | null>(null);
  const submitting = useRef(false);
  const [images, setImages] = useState<ProgramImageView[]>([]);
  const [galleryDirty, setGalleryDirty] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [galleryNote, setGalleryNote] = useState<{ type: "ok" | "error" | "warn"; text: string } | null>(null);
  const [pending, setPending] = useState<{ key: string; file: File; preview: string; caption: string; alt: string; error?: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/programs", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(body)) throw new Error(body?.error || `HTTP ${res.status}`);
      setItems(body);
      setLoadError("");
    } catch (e: any) {
      setItems([]);
      setLoadError(`The programs could not be loaded from Google Sheets (${String(e?.message || e)}). Nothing is shown rather than showing stale or invented data.`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const clearHold = async () => {
    if (!form) return;
    const reason = window.prompt("Why is this project's hold being cleared? (recorded in the audit log)") || "";
    if (reason.trim().length < 5) { setNotice({ type: "error", text: "A reason of at least 5 characters is required to clear a hold." }); return; }
    setClearingHold(true);
    try {
      const res = await fetch("/api/admin/programs/hold", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ programId: form.id, reason }) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) throw new Error(body?.error || `HTTP ${res.status}`);
      setForm({ ...form, holdClearedAt: body.holdClearedAt });
      setNotice({ type: "ok", text: "Hold cleared. New donations are accepted again; the update window restarted." });
      load();
    } catch (e: any) {
      setNotice({ type: "error", text: `The hold was not cleared: ${String(e?.message || e)}` });
    } finally {
      setClearingHold(false);
    }
  };

  const domainOfItem = (i: any): ProgramDomain => (i?.content?.programCategory as ProgramDomain) || defaultCategoryFor(i?.content?.template || "custom");
  const counts = useMemo(() => ({ masjid: items.filter((i) => domainOfItem(i) === "masjid").length, hifz: items.filter((i) => domainOfItem(i) === "hifz").length, general: items.filter((i) => domainOfItem(i) === "general").length }), [items]);
  const shown = useMemo(() => items.filter((i) => domainOfItem(i) === tab), [items, tab]);

  const open = (item?: any) => {
    setNotice(null);
    setPreview(false);
    setIsNew(!item);
    setImages(item?.images || []);
    setGalleryDirty(false);
    setGalleryNote(null);
    setPending((p) => { p.forEach((x) => URL.revokeObjectURL(x.preview)); return []; });
    setForm(item ? formFromItem(item) : tab === "masjid" ? { ...blank("project"), template: "project", category: "Masjid Infrastructure", ctaText: "View Project" } : tab === "hifz" ? { ...blank("cause"), template: "endowment", category: "Qur'an Hifz", programCategory: "hifz", ctaText: "View Program" } : { ...blank("cause"), template: "relief", programCategory: "general" });
  };

  const persist = async (f: Form, status: Status, okText: (visible: boolean) => string): Promise<boolean> => {
    if (submitting.current) return false;
    submitting.current = true;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/programs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyFromForm(f, status)) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        const detail = String(body?.error || `the server answered HTTP ${res.status}`).replace(/\.+$/, "");
        setNotice({ type: "error", text: body?.partial ? `Partly saved: ${detail}. It was not reported as published.` : `Not saved: ${detail}. Nothing was published.` });
        return false;
      }
      await load();
      const visible = Boolean(body.publication?.publicVisible);
      if (visible && body.publication?.publicPagesRefreshed === false) {
        setNotice({ type: "warn", text: "Saved in Google Sheets. The public pages could not be refreshed right now, so visitors may see the previous version for up to a minute. Save again to retry the refresh." });
      } else {
        setNotice({ type: "ok", text: okText(visible) });
      }
      return true;
    } catch {
      setNotice({ type: "error", text: "Not saved: the server could not be reached. Nothing was published." });
      return false;
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const save = async (status: Status) => {
    if (!form) return;
    const ok = await persist(form, status, (v) => (v ? "Saved and published. It is now public." : status === "Draft" ? "Saved as a draft. It is not public." : `Saved as ${MEANING[status].label}. It is not public.`));
    if (ok) {
      if (isNew && status === "Draft") {
        setIsNew(false); // keep editing: the program now exists, so images can be added
        setForm({ ...form, status: "Draft" });
      } else {
        setForm(null);
      }
    }
  };

  const quickStatus = async (item: any, status: Status) => {
    await persist(formFromItem(item), status, (v) => (v ? `"${item.title}" is published.` : `"${item.title}" is now ${MEANING[status].label.toLowerCase()}. It is not public; its history is kept.`));
  };

  const upload = async (file: File) => {
    setUploading(true);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/catalog/upload", { method: "POST", body: fd });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) throw new Error(body?.error || `HTTP ${res.status}`);
      setForm((f) => (f ? { ...f, imageUrl: body.url } : f));
    } catch (e: any) {
      setNotice({ type: "error", text: `Image not uploaded: ${String(e?.message || e)}` });
    } finally {
      setUploading(false);
    }
  };

  const publicationWarning = (body: any) => (body?.publication?.publicPagesRefreshed === false ? " The public pages could not be refreshed right now; visitors may see the previous version for up to a minute." : "");

  const addPending = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, preview: URL.createObjectURL(file), caption: "", alt: "", error: validateImageFile(file) || undefined }));
    setPending((p) => [...p, ...next]);
  };

  const uploadPending = async () => {
    if (!form || galleryBusy) return;
    const valid = pending.filter((p) => !p.error);
    if (valid.length === 0) return;
    if (images.length + valid.length > MAX_IMAGES_PER_PROGRAM) {
      setGalleryNote({ type: "error", text: `A program can have at most ${MAX_IMAGES_PER_PROGRAM} images (it has ${images.length}).` });
      return;
    }
    setGalleryBusy(true);
    setGalleryNote(null);
    try {
      const fd = new FormData();
      fd.append("programId", form.id);
      valid.forEach((p) => fd.append("files", p.file));
      fd.append("meta", JSON.stringify(valid.map((p) => ({ caption: p.caption, alt: p.alt }))));
      const res = await fetch("/api/admin/programs/images", { method: "POST", body: fd });
      const body = await res.json().catch(() => null);
      if (!body?.results) throw new Error(body?.error || `HTTP ${res.status}`);
      const failedNames = new Set<string>();
      body.results.forEach((r: any, i: number) => { if (!r.ok) failedNames.add(valid[i].key + "|" + r.error); });
      const okKeys = new Set(valid.filter((_, i) => body.results[i]?.ok).map((p) => p.key));
      setPending((p) =>
        p.filter((x) => !okKeys.has(x.key)).map((x) => {
          const idx = valid.findIndex((v) => v.key === x.key);
          return idx >= 0 && !body.results[idx]?.ok ? { ...x, error: body.results[idx].error } : x;
        })
      );
      okKeys.forEach((k) => { const p = pending.find((x) => x.key === k); if (p) URL.revokeObjectURL(p.preview); });
      const g = await fetch(`/api/admin/programs/images?programId=${encodeURIComponent(form.id)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (g?.images) setImages(g.images);
      await load();
      const stored = body.stored as number, failed = body.failed as number;
      setGalleryNote({
        type: failed ? "warn" : "ok",
        text: failed ? `${stored} of ${stored + failed} images were added. The failed ones are still listed below with the reason; fix them and press Upload again (the added ones are not sent twice).${publicationWarning(body)}` : `${stored} image${stored === 1 ? "" : "s"} added and saved.${publicationWarning(body)}`,
      });
    } catch (e: any) {
      setGalleryNote({ type: "error", text: `Nothing was added: ${String(e?.message || e)}` });
    } finally {
      setGalleryBusy(false);
    }
  };

  const moveImage = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= images.length) return; const a = [...images]; [a[i], a[j]] = [a[j], a[i]]; setImages(a); setGalleryDirty(true); };
  const editImage = (i: number, patch: Partial<ProgramImageView>) => { setImages((a) => a.map((x, k) => (k === i ? { ...x, ...patch } : x))); setGalleryDirty(true); };
  // Selecting the current cover again removes it: the card then shows no picture (cards may be text-only).
  const setCover = (i: number) => { setImages((a) => a.map((x, k) => ({ ...x, isCover: k === i ? !x.isCover : false }))); setGalleryDirty(true); };

  const saveGallery = async () => {
    if (!form || galleryBusy) return;
    setGalleryBusy(true);
    setGalleryNote(null);
    try {
      const res = await fetch("/api/admin/programs/images", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: form.id, order: images.map((i) => i.id), coverId: images.find((i) => i.isCover)?.id ?? null, items: images.map((i) => ({ id: i.id, caption: i.caption, alt: i.alt })) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) throw new Error(body?.error || `HTTP ${res.status}`);
      setImages(body.images);
      setGalleryDirty(false);
      await load();
      setGalleryNote({ type: body.publication?.publicPagesRefreshed === false ? "warn" : "ok", text: `Gallery saved.${publicationWarning(body)}` });
    } catch (e: any) {
      setGalleryNote({ type: "error", text: `Gallery not saved: ${String(e?.message || e)}` });
    } finally {
      setGalleryBusy(false);
    }
  };

  const removeImageAt = async (i: number) => {
    if (!form || galleryBusy) return;
    if (!window.confirm("Remove this image from the program gallery? Its file is deleted from Google Drive.")) return;
    setGalleryBusy(true);
    setGalleryNote(null);
    try {
      const res = await fetch("/api/admin/programs/images", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ programId: form.id, id: images[i].id }) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) throw new Error(body?.error || `HTTP ${res.status}`);
      setImages(body.images);
      setGalleryDirty(false);
      await load();
      setGalleryNote({ type: body.publication?.publicPagesRefreshed === false ? "warn" : "ok", text: `Image removed.${publicationWarning(body)}` });
    } catch (e: any) {
      setGalleryNote({ type: "error", text: `Image not removed: ${String(e?.message || e)}` });
    } finally {
      setGalleryBusy(false);
    }
  };

  const replaceImageAt = async (i: number, file: File | undefined) => {
    if (!form || !file || galleryBusy) return;
    const problem = validateImageFile(file);
    if (problem) { setGalleryNote({ type: "error", text: problem }); return; }
    setGalleryBusy(true);
    setGalleryNote(null);
    try {
      const fd = new FormData();
      fd.append("programId", form.id);
      fd.append("replaceId", images[i].id);
      fd.append("files", file);
      const res = await fetch("/api/admin/programs/images", { method: "POST", body: fd });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) throw new Error(body?.results?.[0]?.error || body?.error || `HTTP ${res.status}`);
      const g = await fetch(`/api/admin/programs/images?programId=${encodeURIComponent(form.id)}`, { cache: "no-store" }).then((r) => r.json());
      setImages(g.images);
      await load();
      setGalleryNote({ type: body.publication?.publicPagesRefreshed === false ? "warn" : "ok", text: `Image replaced.${publicationWarning(body)}` });
    } catch (e: any) {
      setGalleryNote({ type: "error", text: `Image not replaced: ${String(e?.message || e)}` });
    } finally {
      setGalleryBusy(false);
    }
  };

  const setSection = (i: number, patch: Partial<RawSection>) => setForm((f) => (f ? { ...f, sections: f.sections.map((s, k) => (k === i ? { ...s, ...patch } : s)) } : f));
  const moveSection = (i: number, d: -1 | 1) => setForm((f) => { if (!f) return f; const a = [...f.sections]; const j = i + d; if (j < 0 || j >= a.length) return f; [a[i], a[j]] = [a[j], a[i]]; return { ...f, sections: a }; });

  const input = "w-full rounded-lg px-3 py-2.5 text-sm text-white bg-white/[0.04] border border-white/10 focus:outline-none focus:border-[var(--color-luxury-gold,#D4AF37)]/60";
  const label = "block text-xs text-gray-400 uppercase tracking-wider mb-1.5";
  const noticeStyle = notice?.type === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : notice?.type === "warn" ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-red-500/30 bg-red-500/10 text-red-200";

  const previewData = form && {
    id: form.id, title: form.title || "Untitled", description: form.description, imageUrl: form.imageUrl, category: form.category, location: form.location, kind: form.kind, status: form.status,
    images: images, targetAmount: Number(form.targetAmount || 0), raisedAmount: Number(items.find((i) => i.id === form.id)?.raisedAmount || 0), supporters: items.find((i) => i.id === form.id)?.supporters,
    content: (() => { try { return { ...bodyFromForm(form, form.status).content, id: form.id, updatedAt: "", cardDetails: form.cardDetails.split("\n").filter(Boolean), sections: form.sections.map(rawToSection).filter((s: any) => (s.type === "text" ? s.body : s.type === "needs" ? s.needs.length : s.items?.length)) } as any; } catch { return null; } })(),
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Management experience">
          {([["masjid", DOMAIN_LABEL.masjid], ["hifz", DOMAIN_LABEL.hifz], ["general", DOMAIN_LABEL.general]] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-sm border ${tab === k ? "text-black border-transparent" : "text-gray-300 border-white/10"}`} style={tab === k ? { background: "#D4AF37" } : undefined}>
              {l} <span className="opacity-70">({loadError ? "—" : counts[k]})</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 border border-white/10 hover:text-white">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button type="button" onClick={() => open()} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-black" style={{ background: "#D4AF37" }}>
            <Plus className="w-4 h-4" /> New
          </button>
        </div>
      </div>

      {notice && !form && <div role={notice.type === "error" ? "alert" : "status"} className={`p-3 rounded-xl border text-sm ${noticeStyle}`}>{notice.text}</div>}
      {loadError && <div role="alert" className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 text-sm">{loadError}</div>}
      {!loadError && !loading && shown.length === 0 && <p className="text-sm text-gray-500">Nothing here yet. Create the first one with “New”.</p>}

      <div className="grid gap-3">
        {shown.map((item) => {
          const st: Status = (STATUSES as readonly string[]).includes(item.status) ? item.status : "Draft";
          const meaning = MEANING[st];
          const published = st === "Active" || st === "Urgent";
          const kind = ((item.kind || "cause") as Kind);
          return (
            <div key={item.id} className="rounded-xl p-4 flex flex-wrap items-center gap-4 border border-white/[0.08] bg-white/[0.02]">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-white font-semibold truncate">{item.title}</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-gray-300 bg-white/[0.06]">{KIND_LABEL[kind]}</span>
                  <span title={meaning.hint} className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ color: meaning.color, background: "rgba(255,255,255,0.06)" }}>{meaning.label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1 font-mono">{item.id}</p>
                <p className="text-xs text-gray-400 mt-1">{item.category} · target {money(item.targetAmount)} · verified {money(item.raisedAmount)}{item.supporters !== undefined ? ` · ${item.supporters} contributors` : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {published && (
                  <Link href={`/programs/${encodeURIComponent(item.id)}`} target="_blank" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-300 border border-white/10 hover:text-white">
                    <ExternalLink className="w-3.5 h-3.5" /> View public page
                  </Link>
                )}
                <Link href={`/admin/causes/${encodeURIComponent(item.id)}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-300 border border-white/10 hover:text-white" title="Donations, reports and analytics for this entry">
                  <BarChart3 className="w-3.5 h-3.5" /> Workspace
                </Link>
                <button type="button" onClick={() => open(item)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-300 border border-white/10 hover:text-white"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                {st === "Draft" || st === "Inactive" ? (
                  <button type="button" disabled={saving} onClick={() => quickStatus(item, "Active")} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-black disabled:opacity-50" style={{ background: "#D4AF37" }}>Publish</button>
                ) : published ? (
                  <button type="button" disabled={saving} onClick={() => quickStatus(item, "Inactive")} className="px-3 py-1.5 rounded-lg text-xs text-amber-200 border border-amber-400/30 disabled:opacity-50">Unpublish</button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label={isNew ? "New entry" : "Edit entry"}>
          <div className="w-full max-w-3xl my-4 rounded-2xl p-6" style={{ background: "#0f1a16", border: "1px solid rgba(212,175,55,0.25)" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{isNew ? `New ${KIND_LABEL[form.kind].toLowerCase()}` : `Edit ${KIND_LABEL[form.kind].toLowerCase()}`}</h2>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setPreview((p) => !p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-300 border border-white/10 hover:text-white">
                  {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} {preview ? "Hide preview" : "Preview"}
                </button>
                <button type="button" onClick={() => setForm(null)} className="text-gray-400 hover:text-white" aria-label="Close"><X className="w-5 h-5" /></button>
              </div>
            </div>
            {notice && <div role={notice.type === "error" ? "alert" : "status"} className={`mb-4 p-3 rounded-xl border text-sm ${noticeStyle}`}>{notice.text}</div>}

            {preview && previewData?.content ? (
              <div className="mb-6 rounded-xl overflow-hidden border border-white/10 programs-preview" style={{ background: "#07111F" }}>
                <ProgramDetailView program={previewData as any} preview />
              </div>
            ) : null}

            <div className="space-y-5">
              <fieldset className="space-y-4">
                <legend className="text-sm font-semibold text-[#D4AF37] mb-2">Record</legend>
                {isNew && form.template !== "project" && (
                  <div>
                    <label className={label}>Type</label>
                    <AdminSelect ariaLabel="Type" value={form.kind} onChange={(v) => setForm({ ...form, kind: v as Kind, id: newId(v as Kind), template: v === "project" ? "relief" : "custom" })} options={(["project", "campaign", "cause"] as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
                  </div>
                )}
                <div><label className={label}>Title</label><input className={input} value={form.title} maxLength={160} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={label}>Category</label><input className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
                  <div><label className={label}>Target amount (₹)</label><input className={input} type="number" min={0} value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} /></div>
                </div>
                <div><label className={label}>Location</label><input className={input} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
                <div><label className={label}>Description (used when no card summary or lead is set)</label><textarea className={input} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                {!isNew && (
                  <div>
                    <label className={label}>Status</label>
                    <AdminSelect ariaLabel="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v as Status })} options={STATUSES.map((s) => ({ value: s, label: MEANING[s].label, hint: MEANING[s].hint }))} />
                  </div>
                )}
                <p className="text-[11px] text-gray-500 font-mono">Permanent id (also the donation cause id): {form.id}</p>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-[#D4AF37] mb-2">Images &amp; Gallery</legend>
                {isNew ? (
                  <p className="text-xs text-gray-400">Save the program as a draft first (the editor stays open), then add as many images as you need.</p>
                ) : (
                  <>
                    <p className="text-xs text-gray-400">PNG, JPEG or WebP, up to {MAX_IMAGE_BYTES / 1048576} MB each, up to {MAX_IMAGES_PER_PROGRAM} images. The cover is used on the program card; the order below is the order on the detail page.</p>
                    {galleryNote && <div role={galleryNote.type === "error" ? "alert" : "status"} className={`p-2.5 rounded-lg border text-xs ${galleryNote.type === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : galleryNote.type === "warn" ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-red-500/30 bg-red-500/10 text-red-200"}`}>{galleryNote.text}</div>}
                    {images.length === 0 && <p className="text-xs text-gray-500">No images yet.</p>}
                    <div className="space-y-2" data-testid="gallery-list">
                      {images.map((img, i) => (
                        <div key={img.id} className="flex gap-3 rounded-xl p-2.5 border border-white/10" data-image-id={img.id}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt="" className="w-24 h-16 rounded-lg object-cover border border-white/10 flex-shrink-0" />
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <input className={input} placeholder="Caption" value={img.caption} maxLength={200} onChange={(e) => editImage(i, { caption: e.target.value })} aria-label={`Caption of image ${i + 1}`} />
                            <input className={input} placeholder="Alternative text (describes the image)" value={img.alt} maxLength={200} onChange={(e) => editImage(i, { alt: e.target.value })} aria-label={`Alternative text of image ${i + 1}`} />
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <button type="button" onClick={() => setCover(i)} aria-pressed={img.isCover} className={`px-2.5 py-1 rounded-lg border ${img.isCover ? "text-black border-transparent" : "text-gray-300 border-white/10"}`} style={img.isCover ? { background: "#D4AF37" } : undefined}>{img.isCover ? "Card cover (click to remove)" : "Use as card cover"}</button>
                              <button type="button" aria-label="Move image earlier" onClick={() => moveImage(i, -1)} disabled={i === 0} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                              <button type="button" aria-label="Move image later" onClick={() => moveImage(i, 1)} disabled={i === images.length - 1} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                              <label className="px-2.5 py-1 rounded-lg border border-white/10 text-gray-300 cursor-pointer hover:text-white">Replace<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={galleryBusy} onChange={(e) => { replaceImageAt(i, e.target.files?.[0]); e.target.value = ""; }} /></label>
                              <button type="button" onClick={() => removeImageAt(i)} disabled={galleryBusy} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-500/30 text-red-300 hover:text-red-200"><Trash2 className="w-3.5 h-3.5" /> Remove</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {images.length > 0 && (
                      <button type="button" onClick={saveGallery} disabled={!galleryDirty || galleryBusy} className="px-4 py-2 rounded-lg text-xs font-semibold text-black disabled:opacity-40" style={{ background: "#D4AF37" }}>{galleryBusy ? "Working…" : galleryDirty ? "Save gallery changes" : "Gallery saved"}</button>
                    )}
                    <div className="rounded-xl border border-dashed border-white/15 p-3 space-y-2">
                      <label className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-300 border border-white/10 cursor-pointer hover:text-white w-fit"><Upload className="w-4 h-4" /> Add images<input type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { addPending(e.target.files); e.target.value = ""; }} /></label>
                      {pending.map((p) => (
                        <div key={p.key} className="flex gap-3 items-start" data-pending>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.preview} alt="" className="w-20 h-14 rounded-lg object-cover border border-white/10" />
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className="text-xs text-gray-300 truncate">{p.file.name}</p>
                            {p.error ? <p className="text-xs text-red-300">{p.error}</p> : (
                              <div className="grid grid-cols-2 gap-2">
                                <input className={input} placeholder="Caption" value={p.caption} onChange={(e) => setPending((a) => a.map((x) => (x.key === p.key ? { ...x, caption: e.target.value } : x)))} />
                                <input className={input} placeholder="Alternative text" value={p.alt} onChange={(e) => setPending((a) => a.map((x) => (x.key === p.key ? { ...x, alt: e.target.value } : x)))} />
                              </div>
                            )}
                          </div>
                          <button type="button" aria-label="Discard" onClick={() => { URL.revokeObjectURL(p.preview); setPending((a) => a.filter((x) => x.key !== p.key)); }} className="p-1.5 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
                        </div>
                      ))}
                      {pending.some((p) => !p.error) && <button type="button" onClick={uploadPending} disabled={galleryBusy} className="px-4 py-2 rounded-lg text-xs font-semibold text-black disabled:opacity-50" style={{ background: "#D4AF37" }}>{galleryBusy ? "Uploading…" : `Upload ${pending.filter((p) => !p.error).length} image${pending.filter((p) => !p.error).length === 1 ? "" : "s"}`}</button>}
                    </div>
                  </>
                )}
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="text-sm font-semibold text-[#D4AF37] mb-2">Public card and page</legend>
                {form.template === "project" ? (
                  <MasjidUpdatePanel form={form} setForm={setForm} clearing={clearingHold} onClearHold={clearHold} />
                ) : (
                  <div>
                    <label className={label}>Category</label>
                    <AdminSelect ariaLabel="Category" value={form.programCategory} onChange={(v) => setForm({ ...form, programCategory: v })} options={[{ value: "general", label: CATEGORY_LABEL.general }, { value: "hifz", label: CATEGORY_LABEL.hifz }]} />
                    <label className={label}>Detail page template</label>
                    <AdminSelect ariaLabel="Template" value={form.template} onChange={(v) => setForm({ ...form, template: v as ProgramTemplate })} options={GENERAL_TEMPLATES.map((t) => ({ value: t, label: TEMPLATE_LABELS[t] }))} />
                  </div>
                )}
                <div><label className={label}>Card summary</label><textarea className={input} rows={2} maxLength={300} value={form.cardSummary} onChange={(e) => setForm({ ...form, cardSummary: e.target.value })} /></div>
                <div><label className={label}>Card supporting lines (one per line, up to 4)</label><textarea className={input} rows={3} value={form.cardDetails} onChange={(e) => setForm({ ...form, cardDetails: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={label}>Card button text</label><input className={input} maxLength={40} value={form.ctaText} onChange={(e) => setForm({ ...form, ctaText: e.target.value })} /></div>
                  <div><label className={label}>Order in the carousel (0–9999)</label><input className={input} type="number" min={0} max={9999} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></div>
                </div>
                <div><label className={label}>Lead paragraph (detail page)</label><textarea className={input} rows={3} maxLength={600} value={form.lead} onChange={(e) => setForm({ ...form, lead: e.target.value })} /></div>
                <div><label className={label}>Menu label (optional: lists this program in the site menu, e.g. "Family Relief")</label><input className={input} maxLength={24} value={form.navLabel} onChange={(e) => setForm({ ...form, navLabel: e.target.value })} /></div>
                <div><label className={label}>Donate button text (detail page)</label><input className={input} maxLength={40} value={form.primaryCtaText} onChange={(e) => setForm({ ...form, primaryCtaText: e.target.value })} /></div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-[#D4AF37] mb-2">Content sections (shown in this order)</legend>
                {form.sections.map((s, i) => (
                  <div key={i} className="rounded-xl p-3 border border-white/10 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1"><AdminSelect ariaLabel={`Section ${i + 1} type`} value={s.type} onChange={(v) => setSection(i, { type: v })} options={SECTION_TYPES.map((t) => ({ value: t, label: { text: "Text", checklist: "Checklist", panel: "Highlighted panel (what you receive)", needs: "Needs with amounts", milestones: "Milestones (recorded by Daarayn)" }[t] }))} /></div>
                      <button type="button" aria-label="Move up" onClick={() => moveSection(i, -1)} className="p-2 text-gray-400 hover:text-white"><ArrowUp className="w-4 h-4" /></button>
                      <button type="button" aria-label="Move down" onClick={() => moveSection(i, 1)} className="p-2 text-gray-400 hover:text-white"><ArrowDown className="w-4 h-4" /></button>
                      <button type="button" aria-label="Remove section" onClick={() => setForm({ ...form, sections: form.sections.filter((_, k) => k !== i) })} className="p-2 text-red-300 hover:text-red-200"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <input className={input} placeholder="Section title" value={s.title} onChange={(e) => setSection(i, { title: e.target.value })} />
                    {s.type === "text" ? (
                      <textarea className={input} rows={4} placeholder="Text" value={s.body} onChange={(e) => setSection(i, { body: e.target.value })} />
                    ) : (
                      <textarea className={input} rows={4} value={s.itemsText} onChange={(e) => setSection(i, { itemsText: e.target.value })}
                        placeholder={s.type === "needs" ? "One need per line: Name | amount (amount optional)" : s.type === "milestones" ? "One per line: Label | done or pending | optional note" : "One item per line"} />
                    )}
                  </div>
                ))}
                <button type="button" disabled={form.sections.length >= 12} onClick={() => setForm({ ...form, sections: [...form.sections, { type: "text", title: "", body: "", itemsText: "" }] })} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-300 border border-white/10 hover:text-white disabled:opacity-40"><Plus className="w-4 h-4" /> Add section</button>
              </fieldset>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setForm(null)} className="px-4 py-2.5 rounded-lg text-sm text-gray-300 border border-white/10">Cancel</button>
              {isNew ? (
                <>
                  <button type="button" disabled={saving || uploading} onClick={() => save("Draft")} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-white border border-white/15 disabled:opacity-50"><Save className="w-4 h-4" /> Save as draft</button>
                  <button type="button" disabled={saving || uploading} onClick={() => save("Active")} className="px-5 py-2.5 rounded-lg text-sm font-semibold text-black disabled:opacity-50" style={{ background: "#D4AF37" }}>{saving ? "Saving…" : "Publish"}</button>
                </>
              ) : (
                <button type="button" disabled={saving || uploading} onClick={() => save(form.status)} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-black disabled:opacity-50" style={{ background: "#D4AF37" }}><Save className="w-4 h-4" /> {saving ? "Saving…" : "Save changes"}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
