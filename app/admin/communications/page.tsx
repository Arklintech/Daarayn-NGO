"use client";

import React, { useState, useEffect, Suspense } from "react";
import { Send, Users, Activity, CheckCircle, ChevronDown, AlertTriangle, X, ArrowRight, Download, BarChart2, Target, Search, Check, Globe, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

function CommunicationsHubContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramDonorId = searchParams.get("donorId");

  const [loading, setLoading] = useState(true);
  const [causes, setCauses] = useState<any[]>([]);
  const [causesError, setCausesError] = useState("");
  const [selectedCauseIds, setSelectedCauseIds] = useState<string[]>([]);
  const [causeSearchQuery, setCauseSearchQuery] = useState("");
  
  // Phase 2 State Machine
  const [mode, setMode] = useState<"compose" | "summary" | "progress" | "success">("compose");
  const [broadcastId, setBroadcastId] = useState<string | null>(null);
  const [broadcastStats, setBroadcastStats] = useState<any>(null);

  const [donorCount, setDonorCount] = useState<number>(0);
  // Exact recipient list previewed by the server; only this list can be approved and sent.
  const [recipients, setRecipients] = useState<{ id: string; name: string; email: string; previouslyFailed?: boolean; lastError?: string }[]>([]);
  const [excluded, setExcluded] = useState<{ id: string; name: string; email: string; reason: string }[]>([]);
  const [ruleText, setRuleText] = useState("");
  const [retrying, setRetrying] = useState(false);
  // Approval issued by the server for exactly this message and recipient set.
  const [approvalToken, setApprovalToken] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [stats, setStats] = useState({ raised: 0, goalAmount: 0, percentage: 0 });
  const [type, setType] = useState("general_communication");
  const [heading, setHeading] = useState("");
  const [notes, setNotes] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: number; type: string; previewUrl: string; serverUrl?: string; uploaded: boolean }[]>([]);
  const [uploading, setUploading] = useState(false);

  // AI Writing Assistant State
  const [aiAssistLoading, setAiAssistLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{improved?: string; keyPoints?: string[]; suggestions?: string[]} | null>(null);
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);

  // Template draft state (a fixed, non-AI template; the AI assistant was decommissioned)
  const [generating, setGenerating] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [originalValues, setOriginalValues] = useState({ heading: "", notes: "" });
  const [resolutionError, setResolutionError] = useState("");

  useEffect(() => {
    async function fetchData() {
      // Causes come only from the Causes sheet. If they cannot be read, say so: never offer invented causes as audiences.
      try {
        const res = await fetch("/api/causes", { cache: "no-store" });
        const data = await res.json();
        const causesData = Array.isArray(data) ? data : data.success && Array.isArray(data.causes) ? data.causes : null;
        if (!res.ok || !causesData) throw new Error("Causes could not be loaded from Google Sheets.");
        setCauses(causesData);
        setCausesError("");
        setSelectedCauseIds(paramDonorId ? [paramDonorId] : causesData.map((c: any) => c.id));
      } catch (err: any) {
        setCauses([]);
        setSelectedCauseIds([]);
        setCausesError(err?.message || "Causes could not be loaded.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [paramDonorId]);


  useEffect(() => {
    if (selectedCauseIds.length === 0) {
      setDonorCount(0);
      setRecipients([]);
      setExcluded([]);
      setStats({ raised: 0, goalAmount: 0, percentage: 0 });
      return;
    }

    // A new selection invalidates the previous list immediately.
    setRecipients([]);
    setExcluded([]);
    setDonorCount(0);

    async function fetchResolution() {
      try {
        setResolutionError("");
        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch("/api/admin/communications/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ causeIds: selectedCauseIds, type }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success) {
          setDonorCount(data.count);
          setRecipients(data.recipients || []);
          setExcluded(data.excluded || []);
          setRuleText(data.rule || "");
          setStats(data.stats);
        } else {
          setResolutionError(data.error || "Failed to load recipient count");
          setRecipients([]);
          setExcluded([]);
          setDonorCount(0);
          setStats({ raised: 0, goalAmount: 0, percentage: 0 });
        }
      } catch (err: any) {
        // Recipients could not be established: show none (never a stale list from another selection)
        setRecipients([]);
        setExcluded([]);
        setDonorCount(0);
        setStats({ raised: 0, goalAmount: 0, percentage: 0 });
      }
    }

    // Add debounce to prevent rapid requests
    const timeoutId = setTimeout(fetchResolution, 300);
    return () => clearTimeout(timeoutId);
  }, [selectedCauseIds, type]);

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
      const formData = new FormData();
      for (const f of files) {
        formData.append("files", f);
      }
      const res = await fetch("/api/admin/communications/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.files)) {
        setUploadedFiles(prev => prev.map((f, i) => {
          const uploadedItem = data.files[i - startIndex];
          return uploadedItem ? { ...f, serverUrl: uploadedItem.url, uploaded: true } : f;
        }));
      } else {
        throw new Error(data.error || "Upload to Google Drive failed");
      }
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


  const currentMedia = () => uploadedFiles.filter((f) => f.serverUrl).map((f) => f.serverUrl!);

  // Review step: the SERVER recomputes the audience and signs an approval bound to this message and recipient set.
  const handlePreview = async () => {
    if (!heading || !notes) return alert("Heading and notes are required.");
    if (selectedCauseIds.length === 0) return alert("Please select at least one cause or donor.");
    setReviewing(true);
    try {
      const res = await fetch("/api/admin/communications/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ causeIds: selectedCauseIds, type, heading, notes, media: currentMedia() }),
      });
      const data = await res.json();
      if (!data.success) return alert("Could not prepare the review: " + (data.error || `HTTP ${res.status}`));
      setRecipients(data.recipients || []);
      setExcluded(data.excluded || []);
      setDonorCount(data.count || 0);
      setRuleText(data.rule || "");
      setWarnings(data.warnings || []);
      setApprovalToken(data.approvalToken || null);
      setMode("summary");
    } catch {
      alert("Could not prepare the review. Nothing was sent.");
    } finally {
      setReviewing(false);
    }
  };

  const handleDispatch = async () => {
    setMode("progress");
    // Optimistic broadcast ID for immediate UI update
    const optimisticBroadcastId = `BCAST-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    setBroadcastId(optimisticBroadcastId);
    setBroadcastStats({
      stats: { sent: 0, failed: 0, remaining: donorCount },
      status: "Queued",
      totalRecipients: donorCount
    });

    try {
      const response = await fetch("/api/admin/communications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          causeIds: selectedCauseIds, type, heading, notes,
          recipientIds: recipients.map((r) => r.id),
          approvalToken,
          media: currentMedia()
        })
      });
      const result = await response.json();
      if (result.broadcast) {
        // Update with actual server response
        setBroadcastId(result.broadcastId);
        setBroadcastStats(result.broadcast);
        setMode("success");
      } else {
        alert("Broadcast was not sent: " + (result.error || `HTTP ${response.status}`));
        setMode("compose");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while initiating broadcast.");
      setMode("compose");
    }
  };

  // Retry only failed recipients of the finished broadcast. The server re-checks eligibility and issues a fresh approval.
  const handleRetryFailed = async () => {
    if (!broadcastId) return;
    setRetrying(true);
    try {
      const review = await fetch("/api/admin/communications/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ causeIds: selectedCauseIds, type, heading, notes, media: currentMedia(), retryBroadcastId: broadcastId }),
      }).then((r) => r.json());
      if (!review.success || !review.approvalToken || !review.recipients?.length) {
        alert(review.error || "No failed recipients remain to retry.");
        return;
      }
      if (!window.confirm(`Retry ${review.recipients.length} failed recipient(s)? Recipients already accepted are never resent.`)) return;
      const response = await fetch("/api/admin/communications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ causeIds: selectedCauseIds, type, heading, notes, media: currentMedia(), recipientIds: review.recipients.map((r: any) => r.id), approvalToken: review.approvalToken, retryBroadcastId: broadcastId }),
      });
      const result = await response.json();
      if (result.broadcast) {
        setBroadcastId(result.broadcastId);
        setBroadcastStats(result.broadcast);
      } else {
        alert("Retry was not sent: " + (result.error || `HTTP ${response.status}`));
      }
    } catch {
      alert("Retry could not be started.");
    } finally {
      setRetrying(false);
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
      // Get cause data from already-loaded causes to avoid re-fetching
      const selectedCause = causes.find(c => c.id === selectedCauseIds[0]);
      const causeName = selectedCause?.name || selectedCause?.title || "Initiative";
      const category = selectedCause?.category || "Foundation Initiative";

      const response = await fetch("/api/admin/communications/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          causeId: selectedCauseIds[0],
          type,
          media: uploadedFiles.filter(f => f.uploaded),
          causeName,
          category
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
      setVerificationError("Could not create the template draft. Nothing was changed.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return (
    <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[50vh]">
      <Activity className="h-8 w-8 animate-spin text-[var(--color-luxury-gold)]" />
    </div>
  );

  const isAllDonorsSelected = selectedCauseIds.includes("all_donors") || selectedCauseIds.includes("all");
  const selectedCauses = causes.filter(c => selectedCauseIds.includes(c.id));
  const causeNamesText = isAllDonorsSelected 
    ? "All Registered Donors" 
    : (paramDonorId && selectedCauseIds.includes(paramDonorId) 
        ? `Direct to Donor (${paramDonorId})` 
        : (selectedCauses.map(c => c.name || c.title).join(', ') || '—'));

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
                      <h3 className="text-base font-bold text-white tracking-wide">Target Audience & Causes</h3>
                      <p className="text-xs text-gray-400">Select target campaigns or choose universal broadcast to all registered donors.</p>
                      {causesError && <p className="text-xs text-red-300 mt-1" role="alert">{causesError}</p>}
                    </div>
                  </div>

                  {/* Controls: Search, Counters & Actions */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Universal Broadcast Pill */}
                    <button
                      type="button"
                      onClick={() => {
                        if (isAllDonorsSelected) {
                          setSelectedCauseIds(causes.map(c => c.id));
                        } else {
                          setSelectedCauseIds(["all_donors"]);
                        }
                      }}
                      className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition flex items-center gap-1.5 ${
                        isAllDonorsSelected
                          ? 'bg-purple-600/30 text-purple-300 border-purple-500/50 shadow-sm ring-1 ring-purple-400/40'
                          : 'bg-white/5 text-gray-300 hover:text-white border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      All Donors (Universal)
                    </button>

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
                      {isAllDonorsSelected ? "All Donors" : `${selectedCauseIds.length} / ${causes.length} Causes`}
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
                          setSelectedCauseIds(prev => Array.from(new Set([...prev.filter(x => x !== 'all_donors'), ...filteredIds])));
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-gray-200 hover:text-white transition whitespace-nowrap active:scale-95"
                    >
                      {filteredCauses.length > 0 && filteredCauses.every(c => selectedCauseIds.includes(c.id)) ? "Deselect Filtered" : "Select All Causes"}
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

                {/* Vertical Stacked List of Cause Rows with Controlled Scroll Container */}
                {filteredCauses.length === 0 ? (
                  <div className="text-center py-8 px-4 rounded-xl border border-dashed border-white/10 bg-white/[0.01]">
                    <p className="text-xs text-gray-400">No causes found matching &quot;{causeSearchQuery}&quot;</p>
                    <button 
                      onClick={() => setCauseSearchQuery("")} 
                      className="mt-2 text-xs text-blue-400 underline hover:text-white"
                    >
                      Clear search filter
                    </button>
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto custom-scrollbar pr-1 space-y-2">
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
                            setSelectedCauseIds(prev => {
                              const cleaned = prev.filter(x => x !== 'all_donors');
                              return isSelected ? cleaned.filter(id => id !== c.id) : [...cleaned, c.id];
                            });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedCauseIds(prev => {
                                const cleaned = prev.filter(x => x !== 'all_donors');
                                return isSelected ? cleaned.filter(id => id !== c.id) : [...cleaned, c.id];
                              });
                            }
                          }}
                          className={`w-full p-3.5 md:p-4 rounded-xl border transition-all duration-200 cursor-pointer select-none active:scale-[0.99] flex items-center justify-between gap-4 ${
                            isSelected 
                              ? 'bg-gradient-to-r from-blue-600/90 via-blue-600/80 to-blue-700/80 border-blue-400/60 text-white font-semibold shadow-lg shadow-blue-900/30 ring-1 ring-blue-400/40' 
                              : 'bg-white/[0.03] border-white/[0.07] text-gray-200 hover:bg-white/[0.08] hover:border-white/20 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                              isSelected 
                                ? 'bg-white text-blue-700 font-bold shadow-sm' 
                                : 'bg-white/10 text-transparent border border-white/20'
                            }`}>
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                            <span className="text-sm md:text-base font-medium leading-snug truncate">
                              {causeName}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {c.category && (
                              <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-md border font-medium ${
                                isSelected 
                                  ? 'bg-white/20 border-white/30 text-white' 
                                  : 'bg-white/5 border-white/10 text-gray-400'
                              }`}>
                                {c.category}
                              </span>
                            )}
                            {isSelected && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/20 text-white hidden sm:inline-block">
                                Selected
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {selectedCauseIds.length > 0 && (
            <div className="space-y-6">
              {/* Error Alert */}
              {resolutionError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Unable to Load Recipients</p>
                    <p className="text-xs opacity-75 mt-1">{resolutionError}</p>
                  </div>
                </div>
              )}

              {/* Stats Row */}
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-3 px-5 py-3 rounded-xl flex-1 min-w-[200px]" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}>
                  <Users className="w-4 h-4 text-[var(--color-luxury-gold)]" />
                  <div>
                    <p className="text-[10px] text-[var(--color-luxury-gold)]/70 uppercase tracking-widest">Target Recipients</p>
                    <p className="text-lg font-bold text-white leading-none mt-0.5">{donorCount} Verified Donors</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-5 py-3 rounded-xl flex-1 min-w-[200px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <Activity className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">Campaign Progress</p>
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

                    {/* AI Suggestions Panel */}
                    {showAiSuggestions && aiSuggestions && (
                      <div className="mt-4 p-4 rounded-xl" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}>
                        <div className="flex items-start justify-between mb-3">
                          <h4 className="text-xs font-semibold text-[var(--color-luxury-gold)] uppercase tracking-widest">AI Suggestions</h4>
                          <button
                            type="button"
                            onClick={() => setShowAiSuggestions(false)}
                            className="text-gray-500 hover:text-gray-300"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {aiSuggestions.improved && (
                          <div className="mb-3">
                            <p className="text-xs text-gray-400 mb-2">Improved Version:</p>
                            <p className="text-xs text-white leading-relaxed bg-black/20 p-2 rounded">{aiSuggestions.improved}</p>
                            <button
                              type="button"
                              onClick={() => setNotes(aiSuggestions.improved!)}
                              className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                              style={{ background: 'rgba(212,175,55,0.2)', color: 'var(--color-luxury-gold)' }}
                            >
                              ✓ Accept Improved Version
                            </button>
                          </div>
                        )}

                        {aiSuggestions.keyPoints && aiSuggestions.keyPoints.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs text-gray-400 mb-2">Key Points:</p>
                            <ul className="space-y-1">
                              {aiSuggestions.keyPoints.map((point, i) => (
                                <li key={i} className="text-xs text-white/80 flex items-start gap-2">
                                  <span className="text-[var(--color-luxury-gold)] mt-0.5">•</span>
                                  <span>{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {aiSuggestions.suggestions && aiSuggestions.suggestions.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-400 mb-2">Recommendations:</p>
                            <ul className="space-y-1">
                              {aiSuggestions.suggestions.map((suggestion, i) => (
                                <li key={i} className="text-xs text-white/70 flex items-start gap-2">
                                  <span className="text-amber-400 mt-0.5">→</span>
                                  <span>{suggestion}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
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

                  <button
                    onClick={() => handleGenerate(false)}
                    disabled={generating || selectedCauseIds.length === 0}
                    className="w-full py-3.5 rounded-xl font-semibold text-sm tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-black hover:bg-gray-100 active:scale-[0.99] mb-3"
                    style={{ background: '#ffffff' }}
                  >
                    {generating ? <Activity className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> Insert template draft</>}
                  </button>

                  {verificationError && (
                    <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2 mb-3">{verificationError}</p>
                  )}

                  <button
                    onClick={handlePreview}
                    disabled={donorCount === 0 || !heading || !notes || reviewing}
                    className="w-full py-3.5 rounded-xl font-semibold text-sm tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-black hover:bg-gray-100 active:scale-[0.99]"
                    style={{ background: '#ffffff' }}
                  >
                    Preview & Resolve <ArrowRight className="w-4 h-4" />
                  </button>
                  {donorCount === 0 && (
                    <p className="text-xs text-amber-400/80 text-center mt-3">Select a cause or choose &quot;All Donors (Universal)&quot; above to include all registered supporters.</p>
                  )}
                </div>

                {/* Preview Draft */}
                <div className="w-full rounded-2xl p-3 sm:p-5 relative mt-6 lg:mt-0" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm sm:text-base font-semibold text-white">Preview Draft</h3>
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full text-white/60" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <CheckCircle className="w-3 h-3" /> Live Render
                    </span>
                  </div>
                  <div className="rounded-xl overflow-hidden shadow-2xl w-full max-w-full" style={{ backgroundColor: '#080e1f' }}>
                    <div className="px-4 sm:px-8 pt-6 sm:pt-10 pb-6 sm:pb-8 text-center">
                      <img src="/email logo/daarayn-emblem.png.png" alt="Daarayn" className="w-12 h-12 sm:w-14 sm:h-14 object-contain mx-auto mb-4 sm:mb-5" style={{ mixBlendMode: 'screen' }} />
                      <div style={{ fontFamily: "'Cinzel', Georgia, serif", fontSize: '20px', letterSpacing: '4px', color: '#ffffff', fontWeight: 700, marginBottom: '8px' }} className="sm:text-2xl sm:tracking-[5px]">DAARAYN</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                        <div style={{ flex: 1, maxWidth: '40px', height: '1px', background: 'rgba(255,255,255,0.5)' }} />
                        <span style={{ fontFamily: 'Georgia, serif', fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' }} className="sm:text-[9px] sm:tracking-[3px]">F O U N D A T I O N</span>
                        <div style={{ flex: 1, maxWidth: '40px', height: '1px', background: 'rgba(255,255,255,0.5)' }} />
                      </div>
                    </div>
                    <div className="px-4 sm:px-8 pb-6 sm:pb-8 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex justify-center pt-4 sm:pt-6">
                        <span className="px-3 sm:px-4 py-1 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/70 text-center" style={{ border: '1px solid rgba(255,255,255,0.25)' }}>
                          {typeLabels[type] || type}
                        </span>
                      </div>
                      <p className="text-white text-xs sm:text-sm font-semibold">Assalamu Alaikum, Valued Donor,</p>
                      {heading && <p className="text-amber-300 font-bold text-sm sm:text-base">{heading}</p>}
                      {notes && <p className="text-white/80 text-xs leading-relaxed break-words">{notes.substring(0, 150)}{notes.length > 150 ? '…' : ''}</p>}
                      <div className="rounded-lg p-3 sm:p-4 space-y-2 mt-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/60 mb-2 sm:mb-3">Contribution Summary</p>
                        <div className="flex justify-between items-center text-xs py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <span className="text-white/40 shrink-0 mr-2">Target Causes</span>
                          <span className="text-white font-semibold truncate text-right max-w-[60%]" title={causeNamesText}>{causeNamesText}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs py-1.5">
                          <span className="text-white/40">Status</span>
                          <span className="text-white font-semibold">Active Deployment</span>
                        </div>
                      </div>
                      <div className="text-center pt-2">
                        <span className="inline-block px-5 sm:px-6 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest rounded text-black" style={{ background: '#EFE5C9' }}>
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

          {warnings.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200 space-y-1">{warnings.map((w, i) => <p key={i}>{w}</p>)}</div>
          )}
          {ruleText && <p className="text-xs text-gray-400 mb-4"><span className="text-white font-semibold">Eligibility rule:</span> {ruleText}</p>}

          <div className="mb-6">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Recipients you are approving ({recipients.length})</p>
            <div className="max-h-56 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
              {recipients.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span className="text-white truncate">{r.name} <span className="text-gray-500 font-mono">{r.id}</span></span>
                  <span className="text-gray-400 truncate">{r.email}{r.previouslyFailed ? " · previously failed" : ""}</span>
                </div>
              ))}
              {recipients.length === 0 && <p className="px-3 py-3 text-xs text-amber-400">No eligible recipients for this cause and communication type.</p>}
            </div>
            {excluded.length > 0 && (
              <details className="mt-3 text-xs text-gray-400">
                <summary className="cursor-pointer">{excluded.length} donor(s) excluded — why</summary>
                <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                  {excluded.map((x) => (
                    <p key={x.id}><span className="text-gray-300">{x.name}</span> <span className="font-mono text-gray-500">{x.id}</span> — {x.reason}</p>
                  ))}
                </div>
              </details>
            )}
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
          
          {!broadcastStats ? (
            <div className="text-center text-gray-400 text-sm">
              Sending to {donorCount} recipient{donorCount === 1 ? "" : "s"}… keep this page open until the summary appears.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center text-sm font-semibold p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                <span className="text-gray-400">Sent: <strong className="text-white">{broadcastStats.stats?.sent || 0} / {broadcastStats.totalRecipients || 0}</strong></span>
                <span className="text-[var(--color-luxury-gold)] font-mono">{Math.round(((broadcastStats.stats?.sent || 0) / (broadcastStats.totalRecipients || 1)) * 100)}% Completed</span>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4 text-center border-t border-white/10">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Accepted by mail server</p>
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
          )}
        </div>
      )}

      {/* Final Broadcast Summary */}
      {mode === "success" && broadcastStats && (
        <div className="rounded-2xl p-6 md:p-10 max-w-3xl mx-auto" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${(broadcastStats.stats?.failed || 0) === 0 ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.35)'}` }}>
          <div className="text-center mb-8">
            {(broadcastStats.stats?.failed || 0) === 0 ? (
              <>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(74,222,128,0.1)' }}>
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-2xl font-bold text-white">Broadcast Completed — Accepted by the Mail Server</h2>
                <p className="text-xs text-gray-400 mt-2">Acceptance by the mail server is not confirmation that a message reached an inbox.</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(248,113,113,0.1)' }}>
                  <AlertTriangle className="w-8 h-8 text-red-400" />
                </div>
                <h2 className="text-2xl font-bold text-white">
                  {(broadcastStats.stats?.sent || 0) === 0 ? "Broadcast Failed — No Emails Accepted" : "Broadcast Completed With Failures"}
                </h2>
              </>
            )}
          </div>

          {Array.isArray(broadcastStats.errors) && broadcastStats.errors.length > 0 && (
            <div className="mb-8 p-5 rounded-xl text-sm space-y-2" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.25)' }}>
              <p className="text-red-300 font-semibold">Why emails failed</p>
              {broadcastStats.errors.map((e: { reason: string; count: number }, i: number) => (
                <p key={i} className="text-gray-300 break-words"><span className="text-red-400 font-mono mr-2">{e.count}×</span>{e.reason}</p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-3 p-5 rounded-xl bg-white/5 border border-white/10 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Target Cause(s)</span><span className="text-white font-semibold truncate ml-2 max-w-[150px]">{causeNamesText}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Broadcast ID</span><span className="text-white font-mono text-xs">{broadcastId}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Processing Time</span><span className="text-white">{((broadcastStats.processingDurationMs || 0) / 1000).toFixed(1)}s</span></div>
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
            {(broadcastStats.stats?.failed || 0) > 0 && (
              <button
                onClick={handleRetryFailed}
                disabled={retrying}
                className="py-3.5 px-6 rounded-xl font-semibold text-sm transition-all text-white border border-red-400/40 hover:bg-red-400/10 disabled:opacity-50"
              >
                {retrying ? "Retrying…" : "Retry failed recipients"}
              </button>
            )}
            <button
              onClick={() => router.push(`/admin/communications/history?id=${broadcastId}`)}
              className="py-3.5 px-6 rounded-xl font-semibold text-sm transition-all text-black bg-[var(--color-luxury-gold)] hover:bg-[var(--color-luxury-gold)]/90"
            >
              View Report →
            </button>
          </div>
        </div>
      )}

      {/* Template overwrite confirmation */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl p-6 md:p-8 max-w-md w-full" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <h3 className="text-lg font-bold text-white mb-3">Replace with the template draft?</h3>
            <p className="text-sm text-gray-300 mb-6">This replaces your current heading and notes with a standard template (not AI-written). Review and edit it before approving.</p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all text-white"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleGenerate(true)}
                className="flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all text-black"
                style={{ background: 'var(--color-luxury-gold)' }}
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CommunicationsHub() {
  return (
    <Suspense fallback={
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[50vh]">
        <Activity className="h-8 w-8 animate-spin text-[var(--color-luxury-gold)]" />
      </div>
    }>
      <CommunicationsHubContent />
    </Suspense>
  );
}
