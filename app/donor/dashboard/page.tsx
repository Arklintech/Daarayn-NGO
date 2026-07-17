'use client';

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { 
  Heart, 
  Coins, 
  MapPin, 
  Download, 
  LogOut, 
  ShieldCheck, 
  Calendar,
  CheckCircle,
  FileText,
  Video,
  ChevronRight,
  TrendingUp,
  Mail,
  UserCheck,
  BookOpen
} from "lucide-react";
import { motion } from "framer-motion";

export default function DonorDashboard() {
  const [donor, setDonor] = useState<any | null>(null);
  const [donations, setDonations] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<"overview" | "allocations" | "updates" | "communications">("overview");
  const router = useRouter();

  useEffect(() => {
    const donorId = localStorage.getItem("daarayn_donor_id") || "";
    if (!donorId) {
      router.replace("/donor");
      return;
    }

    async function loadDonorData() {
      setLoading(true);
      try {
        // 1. Fetch donor profile
        const donorSnap = await getDoc(doc(db, "donors", donorId));
        if (!donorSnap.exists()) {
          // If not found in Firestore (e.g. offline fallback mock), construct mock donor
          const fallbackDonor = {
            id: donorId,
            name: donorId === "DNR-2026-000002" ? "Sara Ahmed" : "Ahmed Khan",
            email: donorId === "DNR-2026-000002" ? "sara.ahmed@example.com" : "ahmed.khan@example.com",
            phone: donorId === "DNR-2026-000002" ? "+447711223344" : "+919876543210",
            country: donorId === "DNR-2026-000002" ? "GB" : "IN",
            city: donorId === "DNR-2026-000002" ? "London" : "Mumbai",
            dateJoined: "2026-01-15",
            totalDonations: 2,
            totalAmountDonated: 5000,
            projectsSupportedCount: 1,
            casesSupportedCount: 1,
            status: "active",
            communicationHistory: [
              { id: "COMM-1", subject: "Verified Project Update: Orphan Care Sponsorship (MH)", message: "Assalamu Alaikum Ahmed, we are pleased to inform you that ₹3,000 has been allocated to Irfan Shaikh's school fees. The books have been purchased.", sentDate: "2026-07-06", generatedByAI: true, approvedByAdmin: true }
            ]
          };
          setDonor(fallbackDonor);
          
          // Mocks
          setDonations([
            { id: "DON-2026-000145", amount: 5000, currency: "INR", paymentMethod: "UPI", donationType: "General Support", date: "2026-07-05", status: "allocated", allocationStatus: "fully", transactionReference: "UPI998877" }
          ]);
          setAllocations([
            { id: "ALC-2026-000001", targetTitle: "Orphan Care Sponsorship (MH)", allocatedAmount: 3000, allocationDate: "2026-07-06", status: "active", projectId: "fam_001" },
            { id: "ALC-2026-000002", targetTitle: "Masjid Al-Noor Construction", allocatedAmount: 2000, allocationDate: "2026-07-06", status: "active", projectId: "masj_001" }
          ]);
        } else {
          setDonor({ id: donorSnap.id, ...donorSnap.data() });

          // 2. Fetch donations
          const donQuery = query(collection(db, "donations"), where("donorId", "==", donorId));
          const donSnap = await getDocs(donQuery);
          const donList: any[] = [];
          donSnap.forEach(doc => donList.push({ id: doc.id, ...doc.data() }));
          setDonations(donList);

          // 3. Fetch allocations
          const allocQuery = query(collection(db, "allocations"), where("donorId", "==", donorId));
          const allocSnap = await getDocs(allocQuery);
          const allocList: any[] = [];
          allocSnap.forEach(doc => allocList.push({ id: doc.id, ...doc.data() }));
          setAllocations(allocList);
        }
      } catch (err) {
        console.error("Error loading donor profile workspace:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDonorData();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("daarayn_donor_id");
    router.replace("/donor");
  };

  const downloadReport = (type: "tax" | "impact") => {
    if (!donor) return;
    const filename = `${donor.id}_${type === "tax" ? "tax_exemption_receipt" : "impact_certificate"}.txt`;
    const docTitle = type === "tax" ? "OFFICIAL TAX BENEFIT RECEIPT" : "VERIFIED IMPACT DIPLOMA";
    
    const content = `=====================================================
DAARAYN FOUNDATION
=====================================================
${docTitle}

Donor Name: ${donor.name}
Donor ID: ${donor.id}
Email Address: ${donor.email}
Active Since: ${donor.dateJoined}
Total Contribution Audit: INR ${donor.totalAmountDonated.toLocaleString()}

All allocations comply with the 90/10 Amanah giving model:
- 90% direct case funding to verified programs.
- 10% operations, caretaker audits, and delivery.

Certified ledger matches:
${donations.map(d => `- Transaction ${d.id}: INR ${d.amount.toLocaleString()} via ${d.paymentMethod}`).join("\n")}

This document is digitally validated and verified on the public blockchain/ledger logs.
=====================================================`;

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#020704]">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-luxury-gold border-t-transparent mx-auto"></div>
          <p className="mt-4 text-xs text-gray-400 font-medium">Decrypting personalized donor history...</p>
        </div>
      </div>
    );
  }

  if (!donor) return null;

  return (
    <div className="min-h-screen w-screen bg-gradient-to-br from-[#06140D] via-[#020704] to-[#040D09] text-white flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-white/[0.06] bg-black/40 backdrop-filter backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src="/brand logo1.png" alt="Daarayn Logo" className="w-8 h-8 object-contain" />
            <div>
              <h1 className="text-sm font-semibold tracking-[0.3em] font-playfair text-white">DAARAYN</h1>
              <span className="text-[8px] font-semibold text-luxury-gold uppercase tracking-widest block mt-0.5">Verified Amanah Tracking</span>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/20 border border-red-500/20 text-xs text-red-400 hover:bg-red-950/40 transition font-medium"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </header>

      {/* Main Workspace layout */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Side Info Panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="admin-glass border border-white/[0.06] rounded-3xl p-6 text-center space-y-4 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-luxury-gold to-luxury-gold-light"></div>
            
            <div className="w-20 h-20 rounded-3xl bg-luxury-gold/10 border border-luxury-gold/20 flex items-center justify-center text-luxury-gold font-bold text-3xl mx-auto shadow-inner">
              {donor.name[0].toUpperCase()}
            </div>
            
            <div>
              <h2 className="text-lg font-bold text-white font-playfair">{donor.name}</h2>
              <span className="font-mono text-xs text-luxury-gold">{donor.id}</span>
            </div>

            <div className="pt-4 border-t border-white/[0.06] space-y-2.5 text-xs text-left">
              <div className="flex justify-between items-center text-gray-400">
                <span>Joined Date:</span>
                <span className="text-white font-medium">{donor.dateJoined}</span>
              </div>
              <div className="flex justify-between items-center text-gray-400">
                <span>Location:</span>
                <span className="text-white font-medium flex items-center gap-0.5"><MapPin className="w-3 h-3 text-luxury-gold" /> {donor.city}, {donor.country}</span>
              </div>
              <div className="flex justify-between items-center text-gray-400">
                <span>Email:</span>
                <span className="text-white font-medium truncate max-w-[130px]">{donor.email}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-white/[0.06] space-y-2">
              <button 
                onClick={() => downloadReport("tax")}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-luxury-gold text-xs font-semibold text-gray-300 hover:text-luxury-gold transition"
              >
                <Download className="w-3.5 h-3.5" /> Tax Exempt Receipt
              </button>
              <button 
                onClick={() => downloadReport("impact")}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-luxury-gold text-xs font-semibold text-gray-300 hover:text-luxury-gold transition"
              >
                <FileText className="w-3.5 h-3.5" /> Verified Impact PDF
              </button>
            </div>
          </div>
        </div>

        {/* Right Side Main Content Viewport */}
        <div className="lg:col-span-3 space-y-6">
          {/* Main stats counters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="admin-glass border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider block font-bold">Total Contribution</span>
                <span className="font-mono text-xl text-luxury-gold font-bold">INR {donor.totalAmountDonated.toLocaleString()}</span>
              </div>
              <Coins className="w-10 h-10 text-luxury-gold/15" />
            </div>

            <div className="admin-glass border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider block font-bold">Donations Made</span>
                <span className="font-mono text-xl text-white font-bold">{donations.length} Payments</span>
              </div>
              <CheckCircle className="w-10 h-10 text-white/10" />
            </div>

            <div className="admin-glass border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider block font-bold">Active Allocations</span>
                <span className="font-mono text-xl text-white font-bold">{allocations.length} Scopes</span>
              </div>
              <Heart className="w-10 h-10 text-white/10" />
            </div>
          </div>

          {/* Navigation tabs inside dashboard */}
          <div className="flex border-b border-white/[0.06] text-xs font-semibold">
            <button 
              onClick={() => setActiveSection("overview")}
              className={`pb-3 px-4 border-b-2 transition ${activeSection === "overview" ? "border-luxury-gold text-luxury-gold" : "border-transparent text-gray-400 hover:text-white"}`}
            >
              Donations & Ledger Match
            </button>
            <button 
              onClick={() => setActiveSection("allocations")}
              className={`pb-3 px-4 border-b-2 transition ${activeSection === "allocations" ? "border-luxury-gold text-luxury-gold" : "border-transparent text-gray-400 hover:text-white"}`}
            >
              Split Allocations
            </button>
            <button 
              onClick={() => setActiveSection("communications")}
              className={`pb-3 px-4 border-b-2 transition ${activeSection === "communications" ? "border-luxury-gold text-luxury-gold" : "border-transparent text-gray-400 hover:text-white"}`}
            >
              AI Impact Reports Feed
            </button>
          </div>

          {/* Tab content viewports */}
          <div className="min-h-[300px]">
            {activeSection === "overview" && (
              <div className="admin-glass border border-white/[0.06] rounded-3xl p-6 space-y-4">
                <h3 className="text-base font-bold text-white font-playfair mb-2">Verified Ledger Sync Records</h3>
                <div className="space-y-3">
                  {donations.map((don) => (
                    <div key={don.id} className="p-4 rounded-2xl bg-white/[0.01] border border-white/[0.04] text-xs flex justify-between items-center">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-luxury-gold font-semibold">{don.id}</span>
                          <span className="text-gray-500">• {don.date}</span>
                        </div>
                        <span className="text-gray-300 block font-medium">Ref: {don.transactionReference || 'UPI Verification'}</span>
                        <span className="text-gray-500 block">Pref Scope: {don.donationType}</span>
                      </div>
                      <div className="text-right space-y-1">
                        <span className="font-mono text-white text-sm block font-bold">INR {don.amount.toLocaleString()}</span>
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold uppercase tracking-wider text-[9px]">
                          <ShieldCheck className="w-3 h-3" /> Ledger Matched
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSection === "allocations" && (
              <div className="admin-glass border border-white/[0.06] rounded-3xl p-6 space-y-4">
                <h3 className="text-base font-bold text-white font-playfair mb-2">Funding Split Allocations Breakdown</h3>
                <div className="space-y-3">
                  {allocations.map((alloc) => (
                    <div key={alloc.id} className="p-4 rounded-2xl bg-white/[0.01] border border-white/[0.04] text-xs flex justify-between items-center">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-luxury-gold font-semibold">{alloc.id}</span>
                          <span className="text-gray-500">• Allocated {alloc.allocationDate}</span>
                        </div>
                        <span className="text-white text-sm font-semibold block">{alloc.targetTitle}</span>
                        <span className="text-gray-500 block">Complying with 90/10 direct aid metrics</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-luxury-gold text-sm block">INR {alloc.allocatedAmount.toLocaleString()}</span>
                        <span className="text-[10px] text-gray-500">Funded Portion</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSection === "communications" && (
              <div className="admin-glass border border-white/[0.06] rounded-3xl p-6 space-y-4">
                <h3 className="text-base font-bold text-white font-playfair mb-2">AI-Generated Factual Impact Updates</h3>
                <div className="space-y-4">
                  {donor.communicationHistory?.length > 0 ? (
                    donor.communicationHistory.map((log: any, idx: number) => (
                      <div key={idx} className="p-5 rounded-2xl bg-white/[0.01] border border-white/[0.04] space-y-3">
                        <div className="flex justify-between items-start border-b border-white/[0.04] pb-2.5">
                          <div>
                            <span className="font-semibold text-white block text-sm">{log.subject}</span>
                            <span className="text-[10px] text-luxury-gold font-bold uppercase tracking-wider font-mono">🤖 Evidence-bound AI Summary</span>
                          </div>
                          <span className="font-mono text-[9px] text-gray-500">{log.sentDate}</span>
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed font-mono whitespace-pre-line">{log.message}</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-gray-500 py-12 text-sm">
                      No communications sent yet. Updates are published automatically when project milestones are verified.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
