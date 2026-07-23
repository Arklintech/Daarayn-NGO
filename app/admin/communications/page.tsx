"use client";

import React, { useState, useEffect } from "react";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, getDocs, doc, onSnapshot } from "firebase/firestore";
import { Send, Users, Activity, CheckCircle, ChevronDown, Sparkles, AlertTriangle, X, ArrowRight, Download, BarChart2, Target, Search, Check } from "lucide-react";
import { useRouter } from "next/navigation";

export default function CommunicationsHub() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [causes, setCauses] = useState<any[]>([]);
  const [selectedCauseIds, setSelectedCauseIds] = useState<string[]>([]);
  const [causeSearchQuery, setCauseSearchQuery] = useState("");
  
  // Phase 2 State Machine
  const [mode, setMode] = useState<"compose" | "summary" | "progress" | "success">("compose");
  const [broadcastId, setBroadcastId] = useState<string | null>(null);
  const [broadcastStats, setBroadcastStats] = useState<any>(null);

  const [donorCount, setDonorCount] = useState<number>(0);
  const [stats, setStats] = useState({ raised: 0, goalAmount: 0, percentage: 0 });
  const [type, setType] = useState("project_progress");
  const [heading, setHeading] = useState("");
  const [notes, setNotes] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: number; type: string; previewUrl: string; serverUrl?: string; uploaded: boolean }[]>([]);
  const [uploading, setUploading] = useState(false);
  
  const [generating, setGenerating] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [originalValues, setOriginalValues] = useState({ heading: "", notes: "" });

  useEffect(() => {
    async function fetchData() {
      try {
        const causesSnap = await getDocs(collection(db, "causes"));
        const causesData = causesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setCauses(causesData);
        if (causesData.length > 0) setSelectedCauseIds([causesData[0].id]);
      } catch (err) {
        console.error("Failed to load causes", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedCauseIds.length === 0) {
      setDonorCount(0);
      setStats({ raised: 0, goalAmount: 0, percentage: 0 });
      return;
    }

    async function fetchResolution() {
      try {
        const res = await fetch("/api/admin/communications/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ causeIds: selectedCauseIds, type })
        });
        const data = await res.json();
        if (data.success) {
          setDonorCount(data.count);
          setStats(data.stats);
        }
      } catch (err) {
        console.error("Failed to resolve recipients", err);
      }
    }
    fetchResolution();
  }, [selectedCauseIds, type]);

  // Phase 2: Live Progress Polling
  useEffect(() => {
    if ((mode === "progress" || mode === "success") && broadcastId) {
      const unsub = onSnapshot(doc(db, "broadcasts", broadcastId), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setBroadcastStats(data);
          if (data.status === "Completed" && mode !== "success") {
            setMode("success");
          }
        }
      });
      return () => unsub();
    }
  }, [mode, broadcastId]);

  const handleFileUpload = async (files: File[]) => {
    const newEntries = files.map(f => ({
      name: f.name,
      size: f.size,
      type: f.type,
      previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : '',
      uploaded: false
    }));
    setUploadedFiles(prev => [...prev, ...newEntries]);
    const startIndex = uploadedFiles.length;

    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of files) {
        const timestamp = Date.now();
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filename = `${timestamp}_${safeName}`;
        const storageRef = ref(storage, `campaigns/${filename}`);
        await uploadBytes(storageRef, f);
        const url = await getDownloadURL(storageRef);
        urls.push(url);
      }
      
      setUploadedFiles(prev => prev.map((f, i) =>
        i >= startIndex ? { ...f, serverUrl: urls[i - startIndex], uploaded: true } : f
      ));
    } catch (e) {
      console.error('Upload failed', e);
      alert('Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handlePreview = () => {
    if (!heading || !notes) return alert("Heading and notes are required.");
    if (selectedCauseIds.length === 0) return alert("Please select at least one cause.");
    setMode("summary");
  };

  const handleDispatch = async () => {
    setMode("progress");
    try {
      const response = await fetch("/api/admin/communications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          causeIds: selectedCauseIds, type, heading, notes,
          media: uploadedFiles.filter(f => f.serverUrl).map(f => f.serverUrl!)
        })
      });
      const result = await response.json();
      if (result.success) {
        setBroadcastId(result.broadcastId);
      } else {
        alert("Failed to start broadcast: " + result.error);
        setMode("compose");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while initiating broadcast.");
      setMode("compose");
    }
  };

  const handleGenerate = async (overwriteOverride?: boolean) => {
    const headingEdited = heading !== originalValues.heading;
    const notesEdited = notes !== originalValues.notes;
    
    if ((headingEdited || notesEdited) && !overwriteOverride && (heading || notes)) {
      setShowConfirmModal(true);
      return;
    }

    setGenerating(true);
    setVerificationError("");
    setShowConfirmModal(false);

    try {
      const response = await fetch("/api/admin/communications/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          causeId: selectedCauseIds[0],
          type,
          media: uploadedFiles.filter(f => f.uploaded)
        })
      });

      const result = await response.json();
      if (result.success) {
        setHeading(result.heading || "");
        setNotes(result.body || "");
        setOriginalValues({ heading: result.heading || "", notes: result.body || "" });
      } else {
        setVerificationError(result.error || "Generation failed.");
      }
    } catch (err) {
      setVerificationError("Failed to connect to Khizr service.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return (
    <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[50vh]">
      <Activity className="h-8 w-8 animate-spin text-[var(--color-luxury-gold)]" />
    </div>
  );

  const selectedCauses = causes.filter(c => selectedCauseIds.includes(c.id));
  const causeNamesText = selectedCauses.map(c => c.name).join(', ') || '—';

  const typeLabels: Record<string, string> = {
    contribution_confirmation: "Contribution Confirmation",
    project_progress: "Project Progress Update",
    allocation_confirmation: "Allocation Confirmation",
    completion_report: "Completion & Impact Report",
    general_communication: "General Communication",
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">Donor Communications</h1>
          <p className="text-gray-500 text-xs md:text-sm">Dispatch verified institutional updates via Enterprise Broadcast Engine.</p>
        </div>
        <button 
          onClick={() => router.push('/admin/communications/history')}
          className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition text-white w-full md:w-auto justify-center"
        >
          <BarChart2 className="w-4 h-4" /> View Broadcast History
        </button>
      </div>

      {mode === "compose" && (
        <>
          {/* Target Causes Selector */}
          {(() => {
            const filteredCauses = causes.filter(c => {
              const q = causeSearchQuery.toLowerCase().trim();
              if (!q) return true;
              const nameMatch = (c.name || c.title || "").toLowerCase().includes(q);
              const catMatch = (c.category || "").toLowerCase().includes(q);
              return nameMatch || catMatch;
            });

            return (
              <div className="w-full rounded-2xl p-5 md:p-6" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                  {/* Title & Icon */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)' }}>
                      <Target className="w-5 h-5 text-[var(--color-luxury-gold)]" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white tracking-wide">Target Causes</h3>
                      <p className="text-xs text-gray-400">Click anywhere on a cause card to select or deselect it.</p>
                    </div>
                  </div>

                  {/* Controls: Search, Counters & Actions */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Search Input */}
                    <div className="relative flex-1 sm:flex-none sm:w-60">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <input 
                        type="text" 
                        placeholder="Search causes..." 
                        value={causeSearchQuery}
                        onChange={(e) => setCauseSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-luxury-gold)]/60 transition"
                      />
                      {causeSearchQuery && (
                        <button 
                          type="button" 
                          onClick={() => setCauseSearchQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Selected Count Badge */}
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-[var(--color-luxury-gold)]/10 border border-[var(--color-luxury-gold)]/30 text-[var(--color-luxury-gold)] whitespace-nowrap">
                      {selectedCauseIds.length} / {causes.length} Selected
                    </span>

                    {/* Select All Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const filteredIds = filteredCauses.map(c => c.id);
                        const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedCauseIds.includes(id));
                        if (allSelected) {
                          setSelectedCauseIds(prev => prev.filter(id => !filteredIds.includes(id)));
                        } else {
                          setSelectedCauseIds(prev => Array.from(new Set([...prev, ...filteredIds])));
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-gray-200 hover:text-white transition whitespace-nowrap active:scale-95"
                    >
                      {filteredCauses.length > 0 && filteredCauses.every(c => selectedCauseIds.includes(c.id)) ? "Deselect Filtered" : "Select All"}
                    </button>

                    {/* Clear Selection Button */}
                    {selectedCauseIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedCauseIds([])}
                        className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs font-semibold text-red-400 transition whitespace-nowrap active:scale-95"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Grid of Cause Cards with Controlled Scroll Container */}
                {filteredCauses.length === 0 ? (
                  <div className="text-center py-8 px-4 rounded-xl border border-dashed border-white/10 bg-white/[0.01]">
                    <p className="text-xs text-gray-400">No causes found matching &quot;{causeSearchQuery}&quot;</p>
                    <button 
                      onClick={() => setCauseSearchQuery("")} 
                      className="mt-2 text-xs text-[var(--color-luxury-gold)] underline hover:text-white"
                    >
                      Clear search filter
                    </button>
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto custom-scrollbar pr-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {filteredCauses.map(c => {
                        const isSelected = selectedCauseIds.includes(c.id);
                        const causeName = c.name || c.title || "Unnamed Cause";
                        return (
                          <div
                            key={c.id}
                            role="checkbox"
                            aria-checked={isSelected}
                            aria-selected={isSelected}
                            tabIndex={0}
                            onClick={() => {
                              setSelectedCauseIds(prev => 
                                isSelected ? prev.filter(id => id !== c.id) : [...prev, c.id]
                              );
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedCauseIds(prev => 
                                  isSelected ? prev.filter(id => id !== c.id) : [...prev, c.id]
                                );
                              }
                            }}
                            className={`w-full p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none active:scale-[0.98] flex items-center justify-between gap-3 ${
                              isSelected 
                                ? 'bg-gradient-to-r from-[var(--color-luxury-gold)]/20 via-[var(--color-luxury-gold)]/10 to-white/[0.02] border-[var(--color-luxury-gold)]/60 text-white font-semibold shadow-[0_0_15px_rgba(212,175,55,0.12)]' 
                                : 'bg-white/[0.03] border-white/[0.07] text-gray-300 hover:bg-white/[0.08] hover:border-white/20 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                                isSelected 
                                  ? 'bg-[var(--color-luxury-gold)] text-black font-bold' 
                                  : 'bg-white/10 text-transparent border border-white/20'
                              }`}>
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </div>
                              <span className="text-xs md:text-sm font-medium leading-snug truncate">
                                {causeName}
                              </span>
                            </div>
                            {c.category && (
                              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400 shrink-0">
                                {c.category}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {selectedCauseIds.length > 0 && (
            <div className="space-y-6">
              {/* Stats Row */}
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-3 px-5 py-3 rounded-xl flex-1 min-w-[200px]" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}>
                  <Users className="w-4 h-4 text-[var(--color-luxury-gold)]" />
                  <div>
                    <p className="text-[10px] text-[var(--color-luxury-gold)]/70 uppercase tracking-widest">Recipients</p>
                    <p className="text-lg font-bold text-white leading-none mt-0.5">{donorCount} Donors</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-5 py-3 rounded-xl flex-1 min-w-[200px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <Activity className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">Progress</p>
                    <p className="text-lg font-bold text-white leading-none mt-0.5">{stats.percentage}% Funded</p>
                  </div>
                </div>
              </div>

              {/* Composer + Preview */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
                
                {/* Composer */}
                <div className="space-y-5 rounded-2xl p-4 md:p-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <h3 className="text-base font-semibold text-white">Composer</h3>

                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">Communication Type</label>
                    <div className="relative">
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        className="w-full appearance-none pl-4 pr-10 py-3 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-luxury-gold)]/40 cursor-pointer"
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

                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">Update Heading</label>
                    <input
                      type="text"
                      placeholder="e.g. Phase 1 Foundation Laid Down"
                      value={heading}
                      onChange={(e) => setHeading(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-[var(--color-luxury-gold)]/40"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">Verified Notes</label>
                    <textarea
                      rows={4}
                      placeholder="Enter factual statements describing the progress..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-[var(--color-luxury-gold)]/40 resize-none"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </div>

                  {/* Media Upload */}
                  <div>
                    <label className="block text-xs text-gray-500 uppercase tracking-widest mb-2">
                      Media Proof <span className="normal-case text-gray-600">(images, PDFs, videos)</span>
                    </label>
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
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
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

                  {verificationError && (
                    <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 text-red-200 text-xs leading-relaxed mb-3">
                      {verificationError}
                    </div>
                  )}

                  <button
                    onClick={() => handleGenerate(false)}
                    disabled={generating}
                    className="w-full py-3.5 rounded-xl font-semibold text-sm tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-black hover:bg-gray-100 active:scale-[0.99] mb-3"
                    style={{ background: '#ffffff' }}
                  >
                    {generating ? <Activity className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> Generate with Khizr</>}
                  </button>

                  <button
                    onClick={handlePreview}
                    disabled={donorCount === 0 || !heading || !notes}
                    className="w-full py-3.5 rounded-xl font-semibold text-sm tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-black hover:bg-gray-100 active:scale-[0.99]"
                    style={{ background: '#ffffff' }}
                  >
                    Preview & Resolve <ArrowRight className="w-4 h-4" />
                  </button>
                  {donorCount === 0 && (
                    <p className="text-xs text-red-400/80 text-center mt-3">No verified donors found for this cause.</p>
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
                  <div className="rounded-xl overflow-hidden shadow-2xl" style={{ backgroundColor: '#080e1f' }}>
                    <div className="px-8 pt-10 pb-8 text-center">
                      <img src="/email logo/daarayn-emblem.png.png" alt="Daarayn" className="w-14 h-14 object-contain mx-auto mb-5" style={{ mixBlendMode: 'screen' }} />
                      <div style={{ fontFamily: "'Cinzel', Georgia, serif", fontSize: '26px', letterSpacing: '5px', color: '#ffffff', fontWeight: 700, marginBottom: '10px' }}>DAARAYN</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
                        <div style={{ flex: 1, maxWidth: '60px', height: '1px', background: 'rgba(255,255,255,0.5)' }} />
                        <span style={{ fontFamily: 'Georgia, serif', fontSize: '9px', letterSpacing: '3px', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' }}>F O U N D A T I O N</span>
                        <div style={{ flex: 1, maxWidth: '60px', height: '1px', background: 'rgba(255,255,255,0.5)' }} />
                      </div>
                    </div>
                    <div className="px-8 pb-8 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex justify-center pt-6">
                        <span className="px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-white/70" style={{ border: '1px solid rgba(255,255,255,0.25)' }}>
                          {typeLabels[type] || type}
                        </span>
                      </div>
                      <p className="text-white text-sm font-semibold">Assalamu Alaikum, Donor Name,</p>
                      {notes && <p className="text-white/50 text-xs leading-relaxed">{notes.substring(0, 120)}{notes.length > 120 ? '…' : ''}</p>}
                      <div className="rounded-lg p-4 space-y-2 mt-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-3">Contribution Summary</p>
                        <div className="flex justify-between text-xs py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <span className="text-white/40 min-w-max mr-2">Target Causes</span>
                          <span className="text-white font-semibold line-clamp-1 text-right" title={causeNamesText}>{causeNamesText}</span>
                        </div>
                        <div className="flex justify-between text-xs py-1.5">
                          <span className="text-white/40">Status</span>
                          <span className="text-white font-semibold">Active Deployment</span>
                        </div>
                      </div>
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
        </>
      )}

      {/* Recipient Resolution Summary Modal */}
      {mode === "summary" && (
        <div className="rounded-2xl p-6 md:p-10 max-w-2xl mx-auto" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Preparing Broadcast</h2>
            <p className="text-sm text-gray-400">Resolving Eligible Donors...</p>
          </div>
          
          <div className="space-y-1 mb-8" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '20px 0' }}>
            <div className="flex justify-between py-2 text-sm">
              <span className="text-gray-400">Selected Causes</span>
              <span className="text-white font-semibold text-right max-w-[60%]">{causeNamesText}</span>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <span className="text-gray-400">Communication Type</span>
              <span className="text-white font-semibold">{typeLabels[type] || type}</span>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <span className="text-gray-400">Matching Donors</span>
              <span className="text-white font-semibold">{donorCount}</span>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <span className="text-gray-400">Valid Email Addresses</span>
              <span className="text-green-400 font-semibold">{donorCount}</span>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <span className="text-gray-400">Estimated Emails</span>
              <span className="text-white font-bold">{donorCount}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => setMode("compose")}
              className="flex-1 py-3.5 rounded-xl font-semibold text-sm transition-all text-white hover:bg-white/10"
              style={{ border: '1px solid rgba(255,255,255,0.2)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleDispatch}
              className="flex-1 py-3.5 rounded-xl font-semibold text-sm transition-all text-black hover:bg-[var(--color-luxury-gold)]/90"
              style={{ background: 'var(--color-luxury-gold)' }}
            >
              Proceed & Dispatch
            </button>
          </div>
        </div>
      )}

      {/* Live Progress Panel */}
      {mode === "progress" && (
        <div className="rounded-2xl p-6 md:p-10 max-w-3xl mx-auto" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-center mb-8 flex items-center justify-center gap-3">
            <Activity className="w-6 h-6 text-[var(--color-luxury-gold)] animate-pulse" />
            <h2 className="text-2xl font-bold text-white">Broadcast In Progress</h2>
          </div>
          
          {broadcastStats ? (
            <div className="space-y-6">
              <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                <div 
                  className="bg-[var(--color-luxury-gold)] h-4 transition-all duration-500 ease-out" 
                  style={{ width: `${(broadcastStats.stats?.sent / broadcastStats.totalRecipients) * 100 || 0}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-sm text-gray-400 font-semibold">
                <span>{broadcastStats.stats?.sent || 0} / {broadcastStats.totalRecipients || 0}</span>
                <span>{Math.round((broadcastStats.stats?.sent / broadcastStats.totalRecipients) * 100 || 0)}%</span>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4 text-center border-t border-white/10">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Emails Delivered</p>
                  <p className="text-xl font-bold text-green-400">{broadcastStats.stats?.sent || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Remaining</p>
                  <p className="text-xl font-bold text-white">{broadcastStats.stats?.remaining || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Failed</p>
                  <p className="text-xl font-bold text-red-400">{broadcastStats.stats?.failed || 0}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-400 text-sm">Initializing Queue...</div>
          )}
        </div>
      )}

      {/* Final Broadcast Summary */}
      {mode === "success" && broadcastStats && (
        <div className="rounded-2xl p-6 md:p-10 max-w-3xl mx-auto" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(74,222,128,0.3)' }}>
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(74,222,128,0.1)' }}>
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Broadcast Completed Successfully</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-3 p-5 rounded-xl bg-white/5 border border-white/10 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Target Cause(s)</span><span className="text-white font-semibold truncate ml-2 max-w-[150px]">{causeNamesText}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Broadcast ID</span><span className="text-white font-mono text-xs">{broadcastId}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Processing Time</span><span className="text-white">{(broadcastStats.processingDurationMs / 1000).toFixed(1)}s</span></div>
            </div>
            <div className="space-y-3 p-5 rounded-xl bg-white/5 border border-white/10 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Recipients Resolved</span><span className="text-white font-bold">{broadcastStats.totalRecipients}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Sent Successfully</span><span className="text-green-400 font-bold">{broadcastStats.stats?.sent}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Failed Deliveries</span><span className="text-red-400 font-bold">{broadcastStats.stats?.failed}</span></div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={() => { setMode("compose"); setHeading(""); setNotes(""); setUploadedFiles([]); }}
              className="py-3.5 px-6 rounded-xl font-semibold text-sm transition-all text-white border border-white/20 hover:bg-white/10"
            >
              Back to Communications
            </button>
            <button
              onClick={() => router.push(`/admin/communications/history/${broadcastId}`)}
              className="py-3.5 px-6 rounded-xl font-semibold text-sm transition-all text-black bg-[var(--color-luxury-gold)] hover:bg-[var(--color-luxury-gold)]/90"
            >
              View Report →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
