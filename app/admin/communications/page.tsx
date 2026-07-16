"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { Send, Users, Activity, CheckCircle, ChevronDown } from "lucide-react";
import { Donation } from "@/lib/db";

export default function CommunicationsHub() {
  const [loading, setLoading] = useState(true);
  const [causes, setCauses] = useState<any[]>([]);
  const [selectedCauseId, setSelectedCauseId] = useState<string>("");
  const [uniqueDonors, setUniqueDonors] = useState<any[]>([]);
  const [stats, setStats] = useState({ raised: 0, goalAmount: 0, percentage: 0 });
  const [type, setType] = useState("project_progress");
  const [heading, setHeading] = useState("");
  const [notes, setNotes] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: number; type: string; previewUrl: string; serverUrl?: string; uploaded: boolean }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const causesSnap = await getDocs(collection(db, "causes"));
        const causesData = causesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setCauses(causesData);
        if (causesData.length > 0) setSelectedCauseId(causesData[0].id);
      } catch (err) {
        console.error("Failed to load causes", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (!selectedCauseId) return;
    async function fetchCauseStats() {
      const cause = causes.find(c => c.id === selectedCauseId);
      if (!cause) return;
      const q = query(collection(db, "donations"), where("status", "in", ["completed", "pending"]));
      const snap = await getDocs(q);
      let totalRaised = 0;
      const uniqueMap = new Map<string, any>();
      snap.docs.forEach(doc => {
        const donation = doc.data() as Donation;
        if (donation.selectedCauses && Array.isArray(donation.selectedCauses)) {
          const matchedCause = donation.selectedCauses.find((c: any) => c.causeId === selectedCauseId);
          if (matchedCause && donation.status === "completed") {
            totalRaised += matchedCause.allocatedAmount;
            if (!uniqueMap.has(donation.donorId)) {
              uniqueMap.set(donation.donorId, { 
                id: donation.donorId, 
                name: donation.donorName || "Anonymous",
                email: donation.donorEmail // May be undefined
              });
            }
          }
        }
      });
      
      const safeGoal = cause.goalAmount || 1;
      const pct = Math.min(100, Math.round((totalRaised / safeGoal) * 100));
      setStats({ raised: totalRaised, goalAmount: cause.goalAmount || 0, percentage: pct });

      // Resolve missing emails from donors collection
      const donorsList = Array.from(uniqueMap.values());
      const resolvedDonors: any[] = [];
      for (const d of donorsList) {
        if (!d.email) {
          try {
            const donorSnap = await getDoc(doc(db, "donors", d.id));
            if (donorSnap.exists()) {
              d.email = donorSnap.data().email;
            }
          } catch (e) {
            console.error("Failed to fetch donor", d.id, e);
          }
        }
        if (d.email && d.email.includes('@')) {
          resolvedDonors.push(d);
        }
      }
      setUniqueDonors(resolvedDonors);
    }
    fetchCauseStats();
  }, [selectedCauseId, causes]);

  const handleFileUpload = async (files: File[]) => {
    // Add local previews immediately
    const newEntries = files.map(f => ({
      name: f.name,
      size: f.size,
      type: f.type,
      previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : '',
      uploaded: false
    }));
    setUploadedFiles(prev => [...prev, ...newEntries]);
    const startIndex = uploadedFiles.length;

    // Upload to server
    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));
      const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
      const result = await res.json();
      if (result.success && result.urls) {
        setUploadedFiles(prev => prev.map((f, i) =>
          i >= startIndex ? { ...f, serverUrl: result.urls[i - startIndex], uploaded: true } : f
        ));
      }
    } catch (e) {
      console.error('Upload failed', e);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!heading || !notes) return alert("Heading and notes are required.");
    const cause = causes.find(c => c.id === selectedCauseId);
    if (!cause) return;
    setSending(true);
    try {
      const response = await fetch("/api/admin/communications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          causeId: cause.id, causeName: cause.name, type, heading, notes,
          media: uploadedFiles.filter(f => f.serverUrl).map(f => f.serverUrl!),
          recipients: uniqueDonors,
          stats: { raised: stats.raised, goal: stats.goalAmount, percentage: stats.percentage }
        })
      });
      const result = await response.json();
      if (result.success) { setSent(true); setUploadedFiles([]); }
      else alert("Failed to send: " + result.error);
    } catch (err) {
      console.error(err);
      alert("An error occurred while sending.");
    } finally {
      setSending(false);
    }
  };

  if (loading) return (
    <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[50vh]">
      <Activity className="h-8 w-8 animate-spin text-[var(--gold)]" />
    </div>
  );

  const selectedCause = causes.find(c => c.id === selectedCauseId);

  const typeLabels: Record<string, string> = {
    contribution_confirmation: "Contribution Confirmation",
    project_progress: "Project Progress Update",
    allocation_confirmation: "Allocation Confirmation",
    completion_report: "Completion & Impact Report",
    general_communication: "General Communication",
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Donor Communications</h1>
        <p className="text-gray-500 text-sm">Dispatch verified institutional updates to all cause donors.</p>
      </div>

      {/* Cause Selector */}
      <div className="relative w-full lg:w-1/2">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Target Cause</label>
        <div className="relative">
          <select
            value={selectedCauseId}
            onChange={(e) => setSelectedCauseId(e.target.value)}
            className="w-full appearance-none pl-4 pr-10 py-3 rounded-xl text-white text-sm font-medium focus:outline-none focus:ring-1 focus:ring-[var(--gold)]/40 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {causes.map(c => <option key={c.id} value={c.id} style={{ background: '#0f1623' }}>{c.name}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {selectedCauseId && !sent && (
        <div className="space-y-6">
          {/* Stats Row */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-3 px-5 py-3 rounded-xl" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}>
              <Users className="w-4 h-4 text-[var(--gold)]" />
              <div>
                <p className="text-[10px] text-[var(--gold)]/70 uppercase tracking-widest">Recipients</p>
                <p className="text-lg font-bold text-white leading-none mt-0.5">{uniqueDonors.length} Donors</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Activity className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Progress</p>
                <p className="text-lg font-bold text-white leading-none mt-0.5">{stats.percentage}% Funded</p>
              </div>
            </div>
          </div>

          {/* Composer + Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            
            {/* Composer */}
            <div className="space-y-5 rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 className="text-base font-semibold text-white">Composer</h3>

              {/* Communication Type */}
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">Communication Type</label>
                <div className="relative">
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full appearance-none pl-4 pr-10 py-3 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-[var(--gold)]/40 cursor-pointer"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <option value="contribution_confirmation" style={{ background: '#0f1623' }}>Contribution Confirmation</option>
                    <option value="project_progress" style={{ background: '#0f1623' }}>Project Progress Update</option>
                    <option value="allocation_confirmation" style={{ background: '#0f1623' }}>Allocation Confirmation</option>
                    <option value="completion_report" style={{ background: '#0f1623' }}>Completion & Impact Report</option>
                    <option value="general_communication" style={{ background: '#0f1623' }}>General Communication</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Heading */}
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">Update Heading</label>
                <input
                  type="text"
                  placeholder="e.g. Phase 1 Foundation Laid Down"
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-[var(--gold)]/40"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">Verified Notes</label>
                <textarea
                  rows={4}
                  placeholder="Enter factual statements describing the progress..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-[var(--gold)]/40 resize-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>

              {/* Media Upload */}
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">
                  Media Proof <span className="normal-case text-gray-600">(images, PDFs, videos)</span>
                </label>

                {/* Drop Zone */}
                <label
                  className="flex flex-col items-center justify-center w-full rounded-xl cursor-pointer transition-all"
                  style={{
                    border: uploadedFiles.length > 0 ? '1px solid rgba(255,255,255,0.15)' : '1.5px dashed rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.02)',
                    padding: uploadedFiles.length > 0 ? '12px' : '24px 16px',
                    minHeight: '80px',
                  }}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const droppedFiles = Array.from(e.dataTransfer.files);
                    if (droppedFiles.length > 0) await handleFileUpload(droppedFiles);
                  }}
                >
                  {uploadedFiles.length === 0 ? (
                    <div className="flex flex-col items-center text-center pointer-events-none">
                      <svg className="w-6 h-6 mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <p className="text-xs text-gray-500">Drag & drop files or <span className="text-white underline">browse</span></p>
                      <p className="text-[10px] text-gray-600 mt-1">Images, PDFs, Videos — max 20MB each</p>
                    </div>
                  ) : (
                    <div className="w-full space-y-2">
                      {uploadedFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                          {f.type.startsWith('image/') ? (
                            <img src={f.previewUrl} alt={f.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white truncate">{f.name}</p>
                            <p className="text-[10px] text-gray-600">{(f.size / 1024).toFixed(1)} KB {f.uploaded ? <span className="text-green-400">✓ Uploaded</span> : uploading ? <span className="text-yellow-400">Uploading…</span> : ''}</p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); removeFile(i); }}
                            className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center justify-center pt-1">
                        <p className="text-[10px] text-gray-600">+ Drop more files or <span className="text-white underline">browse</span></p>
                      </div>
                    </div>
                  )}
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*,application/pdf"
                    className="hidden"
                    onChange={async (e) => {
                      const selectedFiles = Array.from(e.target.files || []);
                      if (selectedFiles.length > 0) await handleFileUpload(selectedFiles);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>

              {/* Send Button */}
              <button
                onClick={handleSend}
                disabled={sending || uniqueDonors.length === 0}
                className="w-full py-3.5 rounded-xl font-semibold text-sm tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-black hover:bg-gray-100 active:scale-[0.99]"
                style={{ background: '#ffffff' }}
              >
                {sending ? <Activity className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Dispatch to {uniqueDonors.length} Donors</>}
              </button>
              {uniqueDonors.length === 0 && (
                <p className="text-xs text-red-400/80 text-center -mt-3">No verified donors found for this cause.</p>
              )}
            </div>

            {/* Preview Draft */}
            <div className="hidden lg:block rounded-2xl p-5 relative" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-white">Preview Draft</h3>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full text-white/60" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <CheckCircle className="w-3 h-3" /> Live Render
                </span>
              </div>

              {/* Email Preview Shell */}
              <div className="rounded-xl overflow-hidden shadow-2xl" style={{ backgroundColor: '#080e1f' }}>
                {/* Header */}
                <div className="px-8 pt-10 pb-8 text-center">
                  <img
                    src="/email logo/daarayn-emblem.png.png"
                    alt="Daarayn"
                    className="w-14 h-14 object-contain mx-auto mb-5"
                    style={{ mixBlendMode: 'screen' }}
                  />
                  <div style={{ fontFamily: "'Cinzel', Georgia, serif", fontSize: '26px', letterSpacing: '5px', color: '#ffffff', fontWeight: 700, marginBottom: '10px' }}>
                    DAARAYN
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
                    <div style={{ flex: 1, maxWidth: '60px', height: '1px', background: 'rgba(255,255,255,0.5)' }} />
                    <span style={{ fontFamily: 'Georgia, serif', fontSize: '9px', letterSpacing: '3px', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' }}>F O U N D A T I O N</span>
                    <div style={{ flex: 1, maxWidth: '60px', height: '1px', background: 'rgba(255,255,255,0.5)' }} />
                  </div>
                </div>

                {/* Body */}
                <div className="px-8 pb-8 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {/* Type pill */}
                  <div className="flex justify-center pt-6">
                    <span className="px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-white/70" style={{ border: '1px solid rgba(255,255,255,0.25)' }}>
                      {typeLabels[type] || type}
                    </span>
                  </div>

                  <p className="text-white text-sm font-semibold">Assalamu Alaikum, Donor Name,</p>
                  {notes && <p className="text-white/50 text-xs leading-relaxed">{notes.substring(0, 120)}{notes.length > 120 ? '…' : ''}</p>}

                  {/* Summary */}
                  <div className="rounded-lg p-4 space-y-2 mt-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-3">Contribution Summary</p>
                    <div className="flex justify-between text-xs py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span className="text-white/40">Project / Cause</span>
                      <span className="text-white font-semibold">{selectedCause?.name || '—'}</span>
                    </div>
                    <div className="flex justify-between text-xs py-1.5">
                      <span className="text-white/40">Status</span>
                      <span className="text-white font-semibold">Active Deployment</span>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="text-center pt-2">
                    <span className="inline-block px-6 py-2 text-xs font-bold uppercase tracking-widest rounded text-black" style={{ background: '#EFE5C9' }}>
                      Track Your Impact
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {sent && (
        <div className="rounded-2xl p-12 text-center flex flex-col items-center" style={{ border: '1px solid rgba(74,222,128,0.15)', background: 'rgba(74,222,128,0.04)' }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(74,222,128,0.12)' }}>
            <CheckCircle className="w-7 h-7 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Communication Dispatched</h2>
          <p className="text-gray-500 text-sm max-w-md">
            Successfully sent to {uniqueDonors.length} verified donors. This is permanently recorded in the Audit Ledger.
          </p>
          <button
            onClick={() => { setSent(false); setHeading(""); setNotes(""); }}
            className="mt-6 px-6 py-2.5 rounded-xl text-white text-sm transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            Draft Another Communication
          </button>
        </div>
      )}
    </div>
  );
}
