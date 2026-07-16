'use client';

import React from "react";
import { User, ShieldCheck, MapPin, Briefcase, FileText } from "lucide-react";

export default function ProfilePage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-wide" style={{ fontFamily: 'var(--font-cinzel)' }}>AGENT PROFILE</h1>
        <p className="text-sm text-gray-400 mt-1">
          Your official field agent details and verification statistics.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: ID Card */}
        <div className="admin-glass border border-white/10 rounded-3xl p-8 flex flex-col items-center text-center shadow-xl">
          <div className="relative mb-6">
            <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-3xl font-bold text-luxury-gold shadow-[0_0_20px_rgba(212,175,55,0.15)]">
              AR
            </div>
            <div className="absolute bottom-0 right-0 w-8 h-8 bg-green-500 rounded-full border-4 border-[#080e1f] flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-[#080e1f]" />
            </div>
          </div>
          
          <h2 className="text-xl font-bold text-white">Abdul Rahman</h2>
          <p className="text-sm text-gray-400 mt-1 mb-4 font-mono">FA-2026-001</p>
          
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
            Verified Field Agent
          </span>

          <div className="w-full mt-8 space-y-3 text-left">
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <MapPin className="w-4 h-4 text-luxury-gold" />
              <span>Hyderabad, India</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <Briefcase className="w-4 h-4 text-luxury-gold" />
              <span>Joined Jan 2026</span>
            </div>
          </div>
        </div>

        {/* Right Column: Stats & Docs */}
        <div className="md:col-span-2 space-y-6">
          <div className="admin-glass border border-white/10 rounded-3xl p-6 shadow-xl">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Performance Metrics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition">
                <p className="text-[10px] text-gray-500 mb-1 font-medium uppercase tracking-wider">Total Reports</p>
                <p className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-cinzel)' }}>12</p>
              </div>
              <div className="bg-green-500/5 border border-green-500/10 rounded-xl p-4 hover:bg-green-500/10 transition">
                <p className="text-[10px] text-green-500/80 mb-1 font-medium uppercase tracking-wider">Successfully Verified</p>
                <p className="text-2xl font-bold text-green-400" style={{ fontFamily: 'var(--font-cinzel)' }}>8</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition">
                <p className="text-[10px] text-gray-500 mb-1 font-medium uppercase tracking-wider">Causes Funded</p>
                <p className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-cinzel)' }}>5</p>
              </div>
              <div className="bg-luxury-gold/5 border border-luxury-gold/10 rounded-xl p-4 hover:bg-luxury-gold/10 transition">
                <p className="text-[10px] text-luxury-gold/80 mb-1 font-medium uppercase tracking-wider">Approval Rating</p>
                <p className="text-2xl font-bold text-luxury-gold" style={{ fontFamily: 'var(--font-cinzel)' }}>95%</p>
              </div>
            </div>
          </div>

          <div className="admin-glass border border-white/10 rounded-3xl p-6 shadow-xl">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Official Documents</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-300 font-medium">National ID Card</span>
                </div>
                <span className="text-xs font-bold text-green-400">Verified</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-300 font-medium">Daarayn NDA Agreement</span>
                </div>
                <span className="text-xs font-bold text-green-400">Signed</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
