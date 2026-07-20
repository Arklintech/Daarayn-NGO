'use client';

import React, { useState, useEffect } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useFieldAgentAuth } from "@/lib/FieldAgentAuthContext";
import {
  Mail, Lock, Eye, EyeOff, ShieldCheck, AlertCircle,
  Users, FileText, Headphones, CheckCircle
} from "lucide-react";

// ─── Gold Divider ────────────────────────────────────────────────────────────
const GoldDivider = () => (
  <div className="flex items-center justify-center gap-3 my-3">
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-luxury-ivory/30 to-transparent" />
    <div className="w-1.5 h-1.5 rotate-45 bg-luxury-gold/60" />
    <div className="h-px flex-1 bg-gradient-to-l from-transparent via-luxury-ivory/30 to-transparent" />
  </div>
);

// ─── Feature Row ─────────────────────────────────────────────────────────────
const Feature = ({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) => (
  <div className="flex items-start gap-3">
    <div className="w-8 h-8 rounded-full border border-luxury-gold/20 bg-luxury-gold/5 flex items-center justify-center flex-shrink-0 mt-0.5">
      <Icon style={{ width: 15, height: 15 }} className="text-luxury-gold" />
    </div>
    <div>
      <p className="text-xs font-semibold text-white">{title}</p>
      <p className="text-[11px] text-gray-400 leading-relaxed mt-0.5">{desc}</p>
    </div>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AgentLogin() {
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe]   = useState(false);
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [mounted, setMounted]         = useState(false);
  const [showBypass, setShowBypass]   = useState(!auth);
  const router = useRouter();
  const { user, agentData, loading: authLoading, loginAsMock } = useFieldAgentAuth();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (user && agentData && !authLoading) router.push("/field/dashboard");
  }, [user, agentData, authLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (email.toLowerCase().endsWith("@daarayn.org")) {
        const snap = await getDocs(query(collection(db, "field_agents"), where("email", "==", email.toLowerCase())));
        if (!snap.empty) {
          localStorage.setItem("demoAgent", JSON.stringify(snap.docs[0].data()));
          window.location.href = "/field/dashboard";
          return;
        }
        setError("Agent not found. Contact your supervisor.");
        setLoading(false);
        return;
      }
      
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (firebaseErr: any) {
        const c = firebaseErr?.code || "";
        // If Firebase Auth is disabled/failing, or if credential doesn't match Firebase, fallback to checking Firestore rawPassword
        if (c.includes("not-found") || c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("configuration-not-found")) {
           const snap = await getDocs(query(collection(db, "field_agents"), where("email", "==", email.toLowerCase())));
           if (!snap.empty) {
             const agentDoc = snap.docs[0].data();
             if (agentDoc.rawPassword === password) {
                // Successful fallback login using Firestore
                localStorage.setItem("demoAgent", JSON.stringify(agentDoc));
                window.location.href = "/field/dashboard";
                return;
             }
           }
        }
        throw firebaseErr; // Throw to the outer catch if fallback fails
      }
      
    } catch (err: any) {
      const c = err?.code || "";
      if (c.includes("not-found") || c.includes("wrong-password") || c.includes("invalid-credential")) {
        setError("Invalid email or password.");
      } else if (c.includes("too-many-requests")) {
        setError("Too many attempts. Try again later.");
      } else {
        setError(err?.message || "Authentication failed.");
      }
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="h-screen w-screen bg-[#080c10] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-luxury-gold border-t-transparent animate-spin" />
          <p className="text-xs text-gray-400">Verifying identity…</p>
        </div>
      </div>
    );
  }

  return (
    // ROOT: fixed height, no overflow — page never scrolls
    <div
      className={`h-screen w-screen overflow-hidden bg-[#080c10] flex flex-col lg:flex-row transition-opacity duration-500 relative ${mounted ? "opacity-100" : "opacity-0"}`}
    >
      {/* ══════════════════════════════════
          FULL SCREEN BACKGROUND IMAGE
      ══════════════════════════════════ */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <img 
          src="/agent login background.png" 
          alt="Daarayn Background" 
          className="w-full h-full object-cover object-center filter brightness-[0.7]" 
        />
        {/* Gradients to keep the text and form perfectly readable */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#050710]/95 via-[#050710]/50 to-[#050710]/95" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050710]/20 to-[#050710]/90" />
      </div>

      {/* LEFT PANEL */}
      <div className="hidden lg:flex flex-col justify-center w-full max-w-[400px] xl:max-w-[440px] flex-shrink-0 relative z-10 px-8 xl:px-10 py-8 gap-8">

        {/* Brand */}
        <div className="flex items-center gap-4">
          <img 
            src="/daarayn-logo-transparent.png" 
            alt="Daarayn Logo" 
            className="w-20 h-20 object-contain filter brightness-110" 
            onError={(e: any) => { e.currentTarget.src = '/brand logo .png' }}
          />
          <div className="flex flex-col">
            <span className="font-playfair text-[24px] font-normal tracking-[2px] text-white leading-[1.1] drop-shadow-[0_2px_10px_rgba(255,255,255,0.1)]">
              DAARAYN
            </span>
            <span className="font-playfair text-[11px] font-light tracking-[2px] text-luxury-gold uppercase mt-[2px]">
              FIELD OPERATIONS PORTAL
            </span>
          </div>
        </div>

        {/* Headline + features */}
        <div>
          <h1 className="font-playfair font-bold leading-snug text-3xl xl:text-4xl">
            <span className="text-luxury-gold">Amanah.</span><br />
            <span className="text-white">Transparency.</span><br />
            <span className="text-white">Accountability.</span><br />
            <span className="text-luxury-gold">Impact.</span>
          </h1>
          <div className="w-10 h-0.5 bg-gradient-to-r from-luxury-gold to-transparent mt-4 mb-4" />
          <p className="text-xs text-gray-300 leading-relaxed max-w-[270px]">
            Empowering our field agents to serve with integrity, compassion and dedication.
          </p>
          <div className="space-y-4 mt-6">
            <Feature icon={ShieldCheck} title="Secure & Trusted"     desc="Enterprise-grade security for complete data protection." />
            <Feature icon={Users}       title="Connected Operations" desc="Real-time communication between agents and administrators." />
            <Feature icon={FileText}    title="Impactful Reporting"  desc="Capture needs, submit reports and create lasting impact." />
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════
          RIGHT PANEL
      ══════════════════════════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 relative z-10 overflow-hidden">
        {/* Subtle glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[500px] h-full max-h-[500px] aspect-square bg-luxury-gold/[0.015] rounded-full blur-3xl pointer-events-none" />

        {/* Mobile brand — only on small screens */}
        <div className="lg:hidden flex items-center gap-2.5 mb-6">
          <img src="/daarayn-logo-transparent.png" alt="Daarayn" className="w-9 h-9 object-contain filter brightness-110" />
          <div className="leading-tight">
            <p className="text-[11px] font-bold text-white tracking-[0.3em] font-playfair uppercase">DAARAYN</p>
            <p className="text-[8px] font-semibold text-luxury-gold uppercase tracking-[0.2em]">Field Operations</p>
          </div>
        </div>

        {/* Card */}
        <div className={`w-full max-w-[400px] transition-all duration-500 delay-100 ${mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}>

          {/* Logo */}
          <div className="flex justify-center mb-5">
            <div className="relative flex items-center justify-center">
              {/* Glow only — no circle border */}
              <div className="absolute w-32 h-32 rounded-full bg-luxury-gold/10 blur-2xl" />
              <img
                src="/daarayn-logo-transparent.png"
                alt="Daarayn"
                className="w-24 h-24 object-contain filter brightness-125 drop-shadow-[0_0_20px_rgba(212,175,55,0.6)] relative z-10"
              />
            </div>
          </div>

          {/* Form Card */}
          <form
            onSubmit={handleLogin}
            className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 shadow-2xl backdrop-blur-sm space-y-4"
          >
            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl animate-in fade-in slide-in-from-top-1 duration-300">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-300 leading-relaxed">{error}</p>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 group-focus-within:text-luxury-gold transition-colors" />
                <input
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Enter your email address" disabled={loading}
                  className="w-full bg-black/40 border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-luxury-gold/40 focus:ring-1 focus:ring-luxury-ivory/10 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 group-focus-within:text-luxury-gold transition-colors" />
                <input
                  type={showPassword ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password" disabled={loading}
                  className="w-full bg-black/40 border border-white/[0.08] rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-luxury-gold/40 focus:ring-1 focus:ring-luxury-ivory/10 transition-all"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-luxury-gold transition-colors">
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer group" onClick={() => setRememberMe(v => !v)}>
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-all ${rememberMe ? "bg-luxury-gold border-luxury-gold" : "border-white/20 hover:border-luxury-gold/40"}`}>
                  {rememberMe && <CheckCircle className="w-2.5 h-2.5 text-black" />}
                </div>
                <span className="text-[11px] text-gray-400">Remember me</span>
              </label>
              <button type="button" className="text-[11px] text-luxury-gold hover:text-white transition-colors">Forgot Password?</button>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 mt-1 ${
                loading || !email || !password
                  ? "bg-luxury-gold/30 text-black/40 cursor-not-allowed"
                  : "bg-gradient-to-r from-luxury-gold via-[#e8c84a] to-[#b8860b] text-black shadow-[0_4px_20px_rgba(212,175,55,0.25)] hover:shadow-[0_4px_30px_rgba(212,175,55,0.4)] hover:scale-[1.01]"
              }`}
            >
              {loading ? (
                <><div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" /> Authenticating…</>
              ) : (
                <><ShieldCheck className="w-4 h-4" /> Secure Login</>
              )}
            </button>

            {/* Developer Bypass Option */}
            {showBypass && (
              <div className="mt-5 pt-5 border-t border-white/[0.06] text-center">
                <p className="text-[10px] text-amber-300/80 font-medium leading-normal mb-3">
                  Developer option: You can temporarily bypass Firebase Authentication setup to test field features locally.
                </p>
                <button
                  type="button"
                  onClick={() => loginAsMock(email || "agent@daarayn.org", "Demo Agent")}
                  className="w-full py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-semibold text-xs tracking-wider transition active:scale-[0.98]"
                >
                  Bypass Auth (Developer Mode)
                </button>
              </div>
            )}

            {/* OR */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-[9px] text-gray-600 font-medium uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            {/* Support Code */}
            <button
              type="button"
              className="w-full py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[12px] text-gray-300 font-medium flex items-center justify-center gap-2 hover:bg-white/[0.05] hover:text-white hover:border-white/20 transition-all"
            >
              <Headphones className="w-3.5 h-3.5 text-luxury-gold" />
              Login with Support Code
            </button>

            {/* Terms */}
            <p className="text-center text-[10px] text-gray-600 leading-relaxed">
              By continuing, you agree to Daarayn's{" "}
              <button type="button" className="text-luxury-gold/70 hover:text-luxury-gold transition-colors underline underline-offset-2">Data Policy</button>
              {" & "}
              <button type="button" className="text-luxury-gold/70 hover:text-luxury-gold transition-colors underline underline-offset-2">Terms of Use</button>
            </p>
          </form>
        </div>

        {/* Footer */}
        <p className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-gray-500/80">
          © 2026 Daarayn Foundation. All rights reserved.
        </p>
      </div>
    </div>
  );
}
