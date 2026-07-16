'use client';

import React, { useState, useEffect } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { motion } from "framer-motion";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false); // Enable easy registration of first admin
  const [showBypass, setShowBypass] = useState(false);

  const router = useRouter();
  const { user, loading: authLoading, loginAsMock } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      router.push("/admin/dashboard");
    }
  }, [user, authLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setShowBypass(false);

    try {
      if (isRegisterMode) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.push("/admin/dashboard");
    } catch (err: any) {
      console.error("Auth error:", err);
      let errMsg = "Invalid email or password.";
      if (err.code === "auth/email-already-in-use") {
        errMsg = "This email is already registered.";
      } else if (err.code === "auth/weak-password") {
        errMsg = "Password should be at least 6 characters.";
      } else if (err.code === "auth/invalid-credential") {
        errMsg = "Invalid credentials. Please verify.";
      } else if (err.code === "auth/configuration-not-found" || err.message?.includes("configuration-not-found")) {
        errMsg = "Firebase Authentication error: Email/Password provider is not enabled in the Firebase Console. You can temporarily bypass this using the developer option below.";
        setShowBypass(true);
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#020704]">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-luxury-ivory border-t-transparent mx-auto"></div>
          <p className="mt-4 text-sm text-gray-400 font-medium">Verifying login state...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-gradient-to-br from-[#06140D] via-[#020704] to-[#040D09] px-4 relative overflow-hidden">
      {/* Decorative Blur Spheres */}
      <div className="absolute top-10 left-10 w-72 h-72 rounded-full bg-emerald-950/20 blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-luxury-ivory/5 blur-3xl pointer-events-none"></div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md p-8 rounded-3xl admin-glass border border-white/[0.08] relative z-10"
      >
        <div className="text-center mb-8">
          <img 
            className="w-16 h-16 mx-auto mb-4 object-contain brightness-110 drop-shadow-[0_0_8px_rgba(212,175,55,0.3)]" 
            src="/brand logo1.png" 
            alt="Daarayn Aid Logo" 
          />
          <h1 className="text-2xl font-semibold tracking-[0.3em] text-white font-playfair uppercase">
            DAARAYN
          </h1>
          <p className="text-xs text-luxury-ivory font-medium tracking-widest mt-1 uppercase">
            {isRegisterMode ? "Register First Admin Account" : "Secure Administrator Portal"}
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
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white placeholder-gray-600 text-sm focus:outline-none focus:border-luxury-ivory transition duration-200"
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
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white placeholder-gray-600 text-sm focus:outline-none focus:border-luxury-ivory transition duration-200"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3.5 mt-2 rounded-xl bg-gradient-to-r from-luxury-ivory to-white hover:brightness-105 active:scale-[0.98] text-black font-semibold text-sm tracking-wide transition duration-200 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none shadow-[0_4px_20px_rgba(212,175,55,0.15)]"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent"></div>
            ) : (
              isRegisterMode ? "REGISTER & SIGN IN" : "SECURE AUTHORIZE"
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            type="button"
            onClick={() => {
              setIsRegisterMode(!isRegisterMode);
              setError("");
              setShowBypass(false);
            }}
            className="text-[11px] text-gray-400 hover:text-luxury-ivory transition font-medium tracking-wide uppercase"
          >
            {isRegisterMode ? "Back to secure administrator login" : "No admin user? Register initial account"}
          </button>
        </div>

        {showBypass && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 pt-5 border-t border-white/[0.06] text-center"
          >
            <p className="text-[10px] text-amber-300/80 font-medium leading-normal mb-3">
              Developer option: You can temporarily bypass Firebase Authentication setup to test all dashboard features locally.
            </p>
            <button
              type="button"
              onClick={() => loginAsMock(email || "admin@daarayn.org", "Developer Admin", "Super Admin")}
              className="w-full py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-semibold text-xs tracking-wider transition active:scale-[0.98]"
            >
              Bypass Auth (Developer Mode)
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
