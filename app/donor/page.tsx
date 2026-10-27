'use client';

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export default function DonorAccessGate() {
  const [identifier, setIdentifier] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { res, data: await res.json().catch(() => ({})) };
  };

  // Step 1: ask for a one-time code. The answer never says whether a profile exists.
  const handleAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!identifier.trim()) {
      setError("Please enter your registered email or phone number.");
      return;
    }

    setLoading(true);
    try {
      const { res, data } = await post("/api/donor/lookup", { identifier: identifier.trim() });
      if (res.ok && data.success && data.challenge) {
        setChallenge(data.challenge);
        setNotice(data.message || "");
        return;
      }
      setError(data.error || "We could not start sign-in. Please try again.");
    } catch (err) {
      console.error("Donor portal access error:", err);
      setError("Authentication network failure. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: exchange the emailed code for a session.
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { res, data } = await post("/api/donor/verify", { challenge, code: code.trim() });
      if (res.ok && data.success) {
        router.push("/donor/dashboard");
        return;
      }
      setError(data.error || "That code is not valid or has expired.");
    } catch (err) {
      console.error("Donor portal verify error:", err);
      setError("Authentication network failure. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-gradient-to-br from-[#06140D] via-[#020704] to-[#040D09] px-4 relative overflow-hidden">
      {/* Decorative Blur Spheres */}
      <div className="absolute top-10 left-10 w-72 h-72 rounded-full bg-emerald-950/20 blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-luxury-gold/5 blur-3xl pointer-events-none"></div>

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
          <p className="text-xs text-luxury-gold font-medium tracking-widest mt-1 uppercase">
            Transparent Impact & Giving History
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-red-950/40 border border-red-500/20 text-red-300 text-xs font-medium">
            {error}
          </div>
        )}

        {!challenge ? (
        <form onSubmit={handleAccess} className="space-y-4">
          <div className="text-left">
            <label className="block text-[10px] font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Email or Phone Number</label>
            <input
              type="text"
              required
              placeholder="e.g. ahmed.khan@example.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white placeholder-gray-600 text-sm focus:outline-none focus:border-luxury-gold transition duration-200"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 mt-2 rounded-xl bg-gradient-to-r from-luxury-gold to-luxury-gold-light hover:brightness-105 active:scale-[0.98] text-black font-semibold text-sm tracking-wide transition duration-200 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none shadow-[0_4px_20px_rgba(212,175,55,0.15)] font-mono"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent"></div>
            ) : (
              <span className="flex items-center gap-1.5">
                SEND ME A CODE <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </button>
        </form>
        ) : (
        <form onSubmit={handleVerify} className="space-y-4">
          {notice && <p className="text-xs text-gray-300 text-left">{notice}</p>}
          <div className="text-left">
            <label className="block text-[10px] font-medium text-gray-400 mb-1.5 uppercase tracking-wider">One-time code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white placeholder-gray-600 text-sm tracking-[0.4em] focus:outline-none focus:border-luxury-gold transition duration-200"
            />
          </div>
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full py-3.5 mt-2 rounded-xl bg-gradient-to-r from-luxury-gold to-luxury-gold-light hover:brightness-105 active:scale-[0.98] text-black font-semibold text-sm tracking-wide transition duration-200 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none shadow-[0_4px_20px_rgba(212,175,55,0.15)] font-mono"
          >
            {loading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent"></div> : <span className="flex items-center gap-1.5">SECURE ACCESS <ArrowRight className="w-4 h-4" /></span>}
          </button>
          <button type="button" onClick={() => { setChallenge(""); setCode(""); setNotice(""); setError(""); }} className="text-xs text-gray-400 underline">
            Use a different email or phone number
          </button>
        </form>
        )}

      </motion.div>
    </div>
  );
}
