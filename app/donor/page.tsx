'use client';

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { motion } from "framer-motion";
import { ShieldCheck, ArrowRight, UserCheck, Heart } from "lucide-react";

export default function DonorAccessGate() {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mockDonors, setMockDonors] = useState<any[]>([]);
  const router = useRouter();

  // Load current donor emails/phone numbers to present as quick-launch options during dev
  useEffect(() => {
    async function fetchDonors() {
      try {
        const snap = await getDocs(collection(db, "donors"));
        const list: any[] = [];
        snap.forEach(doc => {
          list.push({ id: doc.id, ...doc.data() });
        });
        
        if (list.length > 0) {
          setMockDonors(list);
        } else {
          // Pre-populate if Firestore is empty
          setMockDonors([
            { id: "DNR-2026-000001", name: "Ahmed Khan", email: "ahmed.khan@example.com" },
            { id: "DNR-2026-000002", name: "Sara Ahmed", email: "sara.ahmed@example.com" }
          ]);
        }
      } catch (err) {
        console.warn("Firestore count load failed, fallback offline list:", err);
        setMockDonors([
          { id: "DNR-2026-000001", name: "Ahmed Khan", email: "ahmed.khan@example.com" },
          { id: "DNR-2026-000002", name: "Sara Ahmed", email: "sara.ahmed@example.com" }
        ]);
      }
    }
    fetchDonors();
  }, []);

  const handleAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!identifier.trim()) {
      setError("Please enter your registered email or phone number.");
      return;
    }

    setLoading(true);
    try {
      const q = identifier.trim().toLowerCase();
      const donorsRef = collection(db, "donors");
      
      // Search by email
      const qEmail = query(donorsRef, where("email", "==", q));
      const emailSnap = await getDocs(qEmail);
      
      if (!emailSnap.empty) {
        const dDoc = emailSnap.docs[0];
        localStorage.setItem("daarayn_donor_id", dDoc.id);
        router.push("/donor/dashboard");
        return;
      }

      // Search by phone
      const qPhone = query(donorsRef, where("phone", "==", q));
      const phoneSnap = await getDocs(qPhone);
      
      if (!phoneSnap.empty) {
        const dDoc = phoneSnap.docs[0];
        localStorage.setItem("daarayn_donor_id", dDoc.id);
        router.push("/donor/dashboard");
        return;
      }

      // Search by Donor ID directly
      const qId = query(donorsRef, where("id", "==", identifier.trim()));
      const idSnap = await getDocs(qId);
      if (!idSnap.empty) {
        localStorage.setItem("daarayn_donor_id", identifier.trim());
        router.push("/donor/dashboard");
        return;
      }

      // If not found in live Firestore, check mock donors fallback list for easy test
      const matchedMock = mockDonors.find(d => d.email.toLowerCase() === q || d.id === identifier.trim());
      if (matchedMock) {
        localStorage.setItem("daarayn_donor_id", matchedMock.id);
        router.push("/donor/dashboard");
        return;
      }

      setError("No registered donor profile found with this identifier. Please verify with Daarayn trustees.");
    } catch (err) {
      console.error("Donor portal access error:", err);
      setError("Authentication network failure. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchMock = (id: string) => {
    localStorage.setItem("daarayn_donor_id", id);
    router.push("/donor/dashboard");
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-gradient-to-br from-[#06140D] via-[#020704] to-[#040D09] px-4 relative overflow-hidden">
      {/* Decorative Blur Spheres */}
      <div className="absolute top-10 left-10 w-72 h-72 rounded-full bg-emerald-950/20 blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-luxury-ivory/5 blur-3xl pointer-events-none"></div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md p-8 rounded-3xl admin-glass border border-white/[0.08] relative z-10 text-center"
      >
        {/* Brand Header */}
        <div className="mb-8">
          <img 
            className="w-16 h-16 mx-auto mb-4 object-contain brightness-110 drop-shadow-[0_0_8px_rgba(212,175,55,0.3)]" 
            src="/brand logo1.png" 
            alt="Daarayn Aid Logo" 
          />
          <h1 className="text-2xl font-semibold tracking-[0.3em] text-white font-playfair uppercase">
            DAARAYN
          </h1>
          <p className="text-xs text-luxury-ivory font-medium tracking-widest mt-1 uppercase">
            Transparent Impact & Giving History
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-red-950/40 border border-red-500/20 text-red-300 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleAccess} className="space-y-4">
          <div className="text-left">
            <label className="block text-[10px] font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Email or Phone Number</label>
            <input 
              type="text" 
              required
              placeholder="e.g. ahmed.khan@example.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white placeholder-gray-600 text-sm focus:outline-none focus:border-luxury-ivory transition duration-200"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3.5 mt-2 rounded-xl bg-gradient-to-r from-luxury-ivory to-white hover:brightness-105 active:scale-[0.98] text-black font-semibold text-sm tracking-wide transition duration-200 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none shadow-[0_4px_20px_rgba(212,175,55,0.15)] font-mono"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent"></div>
            ) : (
              <span className="flex items-center gap-1.5">
                SECURE ACCESS <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </button>
        </form>

        {/* Developer Sandbox Bypass Box */}
        <div className="mt-8 pt-6 border-t border-white/[0.06] text-left">
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-amber-300">
            <ShieldCheck className="w-4 h-4" />
            <span>Developer Sandbox Quick Access</span>
          </div>
          <p className="text-[10px] text-gray-400 leading-normal mb-4">
            Click any active donor profile below to bypass verification and preview their transparent dashboard workspace.
          </p>
          <div className="space-y-2.5">
            {mockDonors.map(donor => (
              <button 
                key={donor.id}
                type="button"
                onClick={() => handleLaunchMock(donor.id)}
                className="w-full p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-luxury-ivory/5 hover:border-luxury-ivory flex justify-between items-center text-xs text-gray-300 font-medium transition"
              >
                <div>
                  <span className="text-white block font-semibold">{donor.name}</span>
                  <span className="font-mono text-[9px] text-gray-500">{donor.id}</span>
                </div>
                <span className="flex items-center gap-1 text-[10px] text-luxury-ivory font-bold font-mono">
                  PREVIEW <UserCheck className="w-3.5 h-3.5" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
