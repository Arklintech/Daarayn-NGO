'use client';

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
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
  ChevronRight
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

  // Fetch donations list from Firestore
  useEffect(() => {
    async function loadDonations() {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, "publicLedger"));
        const list: any[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort descending by date
        list.sort((a, b) => {
          const dateA = new Date(a.createdAt || a.date || 0).getTime();
          const dateB = new Date(b.createdAt || b.date || 0).getTime();
          return dateB - dateA;
        });
        setDonations(list);
        setFilteredDonations(list);
      } catch (err) {
        console.warn("Firestore ledger load error, rendering fallback offline mocks:", err);
        // Pre-fill premium lists for demonstration
        const fallbacks = [
          { id: "DA003", donor: "Sabir Test (UPI)", cause: "Qur’an Endowment", amount: 5000, status: "completed", date: "05/07/2026", refCode: "UPI9988776655", proof: "⏳ Proof Uploaded (Check)", proofUrl: "/images/student_profile.png" },
          { id: "DA002", donor: "Ahmad Malik (UPI)", cause: "Family Relief Bundle", amount: 8000, status: "pending", date: "04/07/2026", refCode: "UPI5544332211", proof: "⏳ Proof Uploaded (Check)", proofUrl: "/images/family_relief.png" },
          { id: "DA001", donor: "Anonymous (UPI)", cause: "General Support", amount: 1500, status: "completed", date: "02/07/2026", refCode: "UPI1122334455", proof: "⏳ Awaiting bank check", proofUrl: null }
        ];
        setDonations(fallbacks);
        setFilteredDonations(fallbacks);
      } finally {
        setLoading(false);
      }
    }
    loadDonations();
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
      result = result.filter(item => item.status === statusFilter);
    }

    if (causeFilter !== "all") {
      result = result.filter(item => item.cause === causeFilter);
    }

    setFilteredDonations(result);
  }, [searchQuery, statusFilter, causeFilter, donations]);

  // Verify/Approve donation
  const handleApprove = async (id: string) => {
    try {
      const docRef = doc(db, "publicLedger", id);
      await updateDoc(docRef, {
        status: "completed",
        proof: "✅ Verified & Checked"
      });
      // Update local state list
      setDonations(prev => prev.map(item => 
        item.id === id ? { ...item, status: "completed", proof: "✅ Verified & Checked" } : item
      ));
    } catch (err) {
      console.error("Error approving donation:", err);
    }
  };

  // Reject donation
  const handleReject = async (id: string) => {
    if (!window.confirm("Are you sure you want to reject this contribution entry?")) return;
    try {
      const docRef = doc(db, "publicLedger", id);
      await updateDoc(docRef, {
        status: "rejected",
        proof: "❌ Rejected / Refuted"
      });
      setDonations(prev => prev.map(item => 
        item.id === id ? { ...item, status: "rejected", proof: "❌ Rejected / Refuted" } : item
      ));
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
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory"
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
          <Download className="w-4 h-4 text-luxury-ivory" /> Export to CSV
        </button>
      </div>

      {/* Main donations table */}
      <div className="rounded-3xl admin-glass border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
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
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-luxury-ivory border-t-transparent mx-auto mb-2"></div>
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
                    <td className="p-4 font-bold text-luxury-ivory">₹{Number(item.amount).toLocaleString()}</td>
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
                          className="flex items-center gap-1 text-luxury-ivory hover:underline font-semibold"
                        >
                          <Eye className="w-3.5 h-3.5" /> View Proof
                        </button>
                      ) : (
                        <span className="text-gray-600 italic">No file</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {item.status === "pending" ? (
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => handleApprove(item.id)}
                            className="p-1.5 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-900/40 transition"
                            title="Verify and Approve"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleReject(item.id)}
                            className="p-1.5 rounded-lg bg-red-950/30 border border-red-500/20 text-red-400 hover:bg-red-900/40 transition"
                            title="Reject and Flag"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-600 font-medium italic pr-2">Archived</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
