'use client';

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  BadgeIndianRupee, 
  Search, 
  Filter, 
  Download, 
  Check, 
  X, 
  Clock, 
  Eye, 
  ExternalLink,
  ChevronRight,
  ArrowLeft
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminDonations() {
  const [donations, setDonations] = useState<any[]>([]);
  const [filteredDonations, setFilteredDonations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [causeFilter, setCauseFilter] = useState("all");

  // Proof Viewer Drawer State
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);

  // Fetch donations list from Google Sheets API
  useEffect(() => {
    let isMounted = true;
    async function loadDonations() {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/donations");
        const data = await res.json();
        if (data.success && Array.isArray(data.donations)) {
          if (isMounted) {
            setDonations(data.donations);
            setFilteredDonations(data.donations);
          }
        } else {
          throw new Error(data.error || "Failed to load donations");
        }
      } catch (err) {
        console.warn("API donation load error, rendering fallback:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadDonations();

    // Listen to realtime stream
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/realtime/stream");
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "DONATION_CREATED" || payload.type === "DONATION_STATUS_UPDATED") {
            loadDonations();
          }
        } catch {}
      };
    } catch {}

    return () => {
      isMounted = false;
      if (eventSource) eventSource.close();
    };
  }, []);

  // Update lists based on query & selects
  useEffect(() => {
    let result = [...donations];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.id.toLowerCase().includes(q) ||
        (item.donor && item.donor.toLowerCase().includes(q)) ||
        (item.refCode && item.refCode.toLowerCase().includes(q)) ||
        (item.cause && item.cause.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== "all") {
      result = result.filter(item => item.status.toLowerCase() === statusFilter.toLowerCase());
    }

    if (causeFilter !== "all") {
      result = result.filter(item => item.cause === causeFilter);
    }

    setFilteredDonations(result);
  }, [searchQuery, statusFilter, causeFilter, donations]);

  // Verify/Approve donation
  const handleApprove = async (id: string) => {
    try {
      const res = await fetch("/api/admin/donations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "completed" })
      });
      if (res.ok) {
        setDonations(prev => prev.map(item => 
          item.id === id ? { ...item, status: "completed", proof: "✅ Verified & Checked" } : item
        ));
      }
    } catch (err) {
      console.error("Error approving donation:", err);
    }
  };

  // Reject donation
  const handleReject = async (id: string) => {
    if (!window.confirm("Are you sure you want to reject this contribution entry?")) return;
    try {
      const res = await fetch("/api/admin/donations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "rejected" })
      });
      if (res.ok) {
        setDonations(prev => prev.map(item => 
          item.id === id ? { ...item, status: "rejected", proof: "❌ Rejected / Refuted" } : item
        ));
      }
    } catch (err) {
      console.error("Error rejecting donation:", err);
    }
  };

  // Export Donation list as CSV
  const handleExportCSV = () => {
    const headers = ["Donation ID", "Donor Name", "Cause", "Amount (INR)", "Status", "Date", "UPI Reference", "Audit Statement"];
    const rows = filteredDonations.map(item => [
      item.id,
      item.donor || "Anonymous",
      item.cause || "General Support",
      item.amount,
      item.status,
      item.date,
      item.refCode || "",
      item.proof || ""
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `daarayn_donations_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // List unique causes for filter
  const causes = Array.from(new Set(donations.map(item => item.cause))).filter(Boolean);

  return (
    <div className="space-y-6 text-xs">
      {/* Executive Header with Back Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/dashboard"
            className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-gray-300 hover:text-white hover:bg-white/[0.08] transition-all flex items-center justify-center shrink-0 group shadow-sm"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform text-luxury-gold" />
          </Link>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-wide">Donations & Public Ledger</h1>
            <p className="text-[10px] sm:text-[11px] text-gray-400">View, audit, verify, and export all public contributions</p>
          </div>
        </div>

        <button 
          onClick={handleExportCSV}
          className="px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.1] hover:bg-white/[0.1] text-white font-semibold transition flex items-center gap-2 shrink-0 self-start sm:self-auto shadow-sm"
        >
          <Download className="w-4 h-4 text-luxury-gold" /> Export Ledger CSV
        </button>
      </div>

      {/* Filtering Toolbar */}
      <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center">
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          {/* Search bar */}
          <div className="relative flex-1 sm:flex-none min-w-[240px]">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search donor name, ID, or UPI ref..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-gold"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-white/[0.02] border border-white/[0.06] rounded-xl px-2">
            <Filter className="w-3.5 h-3.5 text-gray-500 ml-1" />
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent py-2.5 border-none focus:outline-none text-gray-400 font-semibold"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Cause Filter */}
          <div className="flex items-center gap-1 bg-white/[0.02] border border-white/[0.06] rounded-xl px-2">
            <select 
              value={causeFilter}
              onChange={(e) => setCauseFilter(e.target.value)}
              className="bg-transparent py-2.5 border-none focus:outline-none text-gray-400 font-semibold"
            >
              <option value="all">All Causes</option>
              {causes.map((c: any) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* CSV Export Button */}
        <button 
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4.5 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.08] font-bold text-white transition cursor-pointer w-full sm:w-auto justify-center"
        >
          <Download className="w-4 h-4 text-luxury-gold" /> Export to CSV
        </button>
      </div>

      {/* Main donations table */}
      <div className="rounded-3xl admin-glass border border-white/[0.06] overflow-hidden">
        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06] text-gray-500 font-semibold uppercase tracking-wider text-[10px]">
                <th className="p-4">Tracking ID</th>
                <th className="p-4">Donor Name</th>
                <th className="p-4">Program Cause</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Reference ID</th>
                <th className="p-4">Status</th>
                <th className="p-4">Screenshot</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03] text-gray-300">
              {loading && donations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-luxury-gold border-t-transparent mx-auto mb-2"></div>
                    Loading donations queue...
                  </td>
                </tr>
              ) : filteredDonations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    No contributions match the filters.
                  </td>
                </tr>
              ) : (
                filteredDonations.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="p-4 font-semibold text-white">{item.id}</td>
                    <td className="p-4 font-medium">{item.donor}</td>
                    <td className="p-4 text-gray-400">{item.cause}</td>
                    <td className="p-4 font-bold text-luxury-gold">₹{Number(item.amount).toLocaleString()}</td>
                    <td className="p-4 font-mono text-gray-500">{item.refCode || "—"}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-semibold border ${
                        item.status === "completed" 
                          ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/20"
                          : item.status === "rejected"
                          ? "bg-red-950/40 text-red-300 border-red-500/20"
                          : "bg-amber-950/40 text-amber-300 border-amber-500/20"
                      }`}>
                        {item.status === "completed" && <Check className="w-2.5 h-2.5" />}
                        {item.status === "rejected" && <X className="w-2.5 h-2.5" />}
                        {item.status === "pending" && <Clock className="w-2.5 h-2.5" />}
                        {item.status === "completed" ? "Verified" : item.status === "rejected" ? "Rejected" : "Pending"}
                      </span>
                    </td>
                    <td className="p-4">
                      {item.proofUrl ? (
                        <button 
                          onClick={() => setSelectedProofUrl(item.proofUrl)}
                          className="flex items-center gap-1 text-luxury-gold hover:underline font-semibold"
                        >
                          <Eye className="w-3.5 h-3.5" /> View Proof
                        </button>
                      ) : (
                        <span className="text-gray-600 italic">No file</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {item.status === "pending" && (
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleApprove(item.id)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold transition"
                          >
                            Verify
                          </button>
                          <button 
                            onClick={() => handleReject(item.id)}
                            className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="block md:hidden p-3 space-y-3">
          {loading && donations.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-luxury-gold border-t-transparent mx-auto mb-2"></div>
              Loading donations queue...
            </div>
          ) : filteredDonations.length === 0 ? (
            <div className="py-12 text-center text-gray-500">No contributions match the filters.</div>
          ) : (
            filteredDonations.map((item) => (
              <div key={item.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">{item.donor}</h4>
                    <span className="text-xs text-gray-400 block font-mono">{item.id}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-semibold border ${
                    item.status === "completed" 
                      ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/20"
                      : item.status === "rejected"
                      ? "bg-red-950/40 text-red-300 border-red-500/20"
                      : "bg-amber-950/40 text-amber-300 border-amber-500/20"
                  }`}>
                    {item.status === "completed" && <Check className="w-2.5 h-2.5" />}
                    {item.status === "rejected" && <X className="w-2.5 h-2.5" />}
                    {item.status === "pending" && <Clock className="w-2.5 h-2.5" />}
                    {item.status === "completed" ? "Verified" : item.status === "rejected" ? "Rejected" : "Pending"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-white/[0.06]">
                  <div>
                    <span className="text-[10px] text-gray-500 block">Amount</span>
                    <span className="font-bold text-luxury-gold text-base">₹{Number(item.amount).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block">Program Cause</span>
                    <span className="text-gray-300 truncate block">{item.cause}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block">Ref Code</span>
                    <span className="text-gray-400 font-mono text-[11px] block">{item.refCode || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block">Proof</span>
                    {item.proofUrl ? (
                      <button onClick={() => setSelectedProofUrl(item.proofUrl)} className="text-luxury-gold text-[11px] font-semibold underline flex items-center gap-1">
                        <Eye className="w-3 h-3" /> View Proof
                      </button>
                    ) : (
                      <span className="text-gray-600 italic text-[11px]">No file</span>
                    )}
                  </div>
                </div>

                {item.status === "pending" && (
                  <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                    <button 
                      onClick={() => handleApprove(item.id)}
                      className="flex-1 py-2 min-h-[44px] rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold transition"
                    >
                      Verify
                    </button>
                    <button 
                      onClick={() => handleReject(item.id)}
                      className="flex-1 py-2 min-h-[44px] rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Proof Image Modal Overlays */}
      <AnimatePresence>
        {selectedProofUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProofUrl(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl max-h-[85vh] p-4 bg-luxury-bg-deep rounded-3xl border border-white/[0.08] relative z-10 overflow-hidden flex flex-col items-center"
            >
              <button 
                onClick={() => setSelectedProofUrl(null)}
                className="absolute top-4 right-4 p-2 rounded-xl bg-black/60 border border-white/[0.08] text-gray-400 hover:text-white"
              >
                <X className="w-4.5 h-4.5" />
              </button>
              <img 
                src={selectedProofUrl} 
                alt="Donation reference screenshot proof uploader" 
                className="max-w-full max-h-[70vh] rounded-2xl object-contain mt-8 border border-white/[0.04]"
              />
              <p className="text-[10px] text-gray-500 mt-4 font-semibold tracking-wider uppercase">Verification document preview</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
