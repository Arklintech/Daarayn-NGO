'use client';

import React, { useState, useEffect } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { motion } from "framer-motion";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();
  const { user, adminData, adminError, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading || !user) return;
    if (adminData) {
      router.push("/admin/dashboard");
    } else if (adminError) {
      // Signed in, but the server refused admin access — show why and end the session.
      setError(adminError);
      if (auth) signOut(auth);
    }
  }, [user, adminData, adminError, authLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!auth) {
      setError("Authentication is not configured. Contact the system administrator.");
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Redirect happens in the effect above once the server confirms admin access.
    } catch (err: any) {
      console.error("Auth error:", err);
      if (err.code === "auth/too-many-requests") {
        setError("Too many attempts. Please wait a few minutes and try again.");
      } else {
        setError("Invalid email or password.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#020704]">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-luxury-gold border-t-transparent mx-auto"></div>
          <p className="mt-4 text-sm text-gray-400 font-medium">Verifying login state...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-gradient-to-br from-[#06140D] via-[#020704] to-[#040D09] px-4 relative overflow-hidden">
      {/* Decorative Blur Spheres */}
      <div className="absolute top-10 left-10 w-72 h-72 rounded-full bg-emerald-950/20 blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-luxury-gold/5 blur-3xl pointer-events-none"></div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md p-8 rounded-3xl admin-glass border border-white/[0.08] relative z-10"
      >
        <div className="text-center mb-8">
          <img 
            className="w-16 h-16 mx-auto mb-4 object-contain rounded-2xl shadow-[0_0_15px_rgba(212,175,55,0.4)] border border-luxury-gold/30" 
            src="/admin-download-logo.png" 
            alt="Daarayn Admin Logo" 
          />
          <h1 className="text-2xl font-semibold tracking-[0.3em] text-white font-playfair uppercase">
            DAARAYN
          </h1>
          <p className="text-xs text-luxury-gold font-medium tracking-widest mt-1 uppercase">
            Secure Administrator Portal
          </p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-5 p-3.5 rounded-xl bg-red-950/40 border border-red-500/20 text-red-300 text-xs font-medium"
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Email Address</label>
            <input 
              type="email" 
              required
              placeholder="admin@daarayn.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white placeholder-gray-600 text-sm focus:outline-none focus:border-luxury-gold transition duration-200"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Password</label>
            <input 
              type="password" 
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white placeholder-gray-600 text-sm focus:outline-none focus:border-luxury-gold transition duration-200"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3.5 mt-2 rounded-xl bg-gradient-to-r from-luxury-gold to-luxury-gold-light hover:brightness-105 active:scale-[0.98] text-black font-semibold text-sm tracking-wide transition duration-200 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none shadow-[0_4px_20px_rgba(212,175,55,0.15)]"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent"></div>
            ) : (
              "SECURE AUTHORIZE"
            )}
          </button>
        </form>

      </motion.div>
    </div>
  );
}
