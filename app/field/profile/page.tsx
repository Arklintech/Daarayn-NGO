'use client';

import React from "react";
import { User, MapPin, Phone, Mail, ShieldCheck, BarChart2, FileText, CheckCircle, Clock, LogOut } from "lucide-react";
import { useFieldAgentAuth } from "@/lib/FieldAgentAuthContext";

export default function ProfilePage() {
  const { agentData, logout } = useFieldAgentAuth();

  if (!agentData) {
    return <div className="min-h-[300px] flex items-center justify-center text-gray-400">Loading profile...</div>;
  }

  const initials = agentData.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white font-playfair tracking-wide">Profile</h1>
        <p className="text-sm text-gray-400 mt-1">Your field agent identity</p>
      </div>

      {/* Avatar Card */}
      <div className="admin-glass border border-luxury-border rounded-2xl p-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-luxury-gold/5 to-transparent pointer-events-none" />
        
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-luxury-gold to-[#b8860b] flex items-center justify-center text-2xl font-bold text-black mx-auto mb-4 shadow-[0_0_20px_rgba(212,175,55,0.3)]">
          {initials}
        </div>
        
        <h2 className="text-xl font-bold text-white font-playfair">{agentData.name}</h2>
        <p className="text-sm text-luxury-gold mt-1">{agentData.role}</p>
        
        <div className={`inline-flex items-center gap-2 mt-3 px-3 py-1 rounded-full border text-[11px] font-bold ${
          agentData.status === "Active"
            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
            : "text-red-400 bg-red-500/10 border-red-500/20"
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${agentData.status === "Active" ? "bg-emerald-400" : "bg-red-400"}`} />
          {agentData.status}
        </div>

        <p className="text-[10px] text-gray-500 mt-2">Agent ID: {agentData.id}</p>
      </div>

      {/* Contact Info */}
      <div className="admin-glass border border-luxury-border rounded-2xl p-5 space-y-4">
        <h3 className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Contact Details</h3>
        
        {[
          { icon: Mail, label: "Email", value: agentData.email },
          { icon: Phone, label: "Phone", value: agentData.phone },
          { icon: MapPin, label: "Location", value: [agentData.city, agentData.district, agentData.state].filter(Boolean).join(", ") },
          { icon: ShieldCheck, label: "Region", value: agentData.region },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/[0.03] border border-white/[0.06] rounded-lg flex items-center justify-center flex-shrink-0">
              <item.icon className="w-4 h-4 text-luxury-gold" />
            </div>
            <div>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider">{item.label}</p>
              <p className="text-sm text-white font-medium">{item.value || "—"}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="admin-glass border border-luxury-border rounded-2xl p-5">
        <h3 className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-4">My Statistics</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: FileText, label: "Total Reports", value: agentData.stats?.reportsSubmitted || 0, color: "text-gray-400" },
            { icon: CheckCircle, label: "Approved", value: agentData.stats?.reportsApproved || 0, color: "text-emerald-400" },
            { icon: Clock, label: "Pending", value: agentData.stats?.reportsPending || 0, color: "text-amber-400" },
            { icon: BarChart2, label: "Rejected", value: agentData.stats?.reportsRejected || 0, color: "text-red-400" },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
              <s.icon className={`w-4 h-4 ${s.color} mb-2`} />
              <p className="text-xl font-bold text-white">{s.value}</p>
              <p className="text-[9px] text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Permissions */}
      <div className="admin-glass border border-luxury-border rounded-2xl p-5">
        <h3 className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-3">Permissions</h3>
        <div className="space-y-2">
          {agentData.permissions && Object.entries(agentData.permissions).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs text-gray-300 capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${val ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10" : "text-gray-500 border-white/10 bg-white/5"}`}>
                {val ? "Enabled" : "Disabled"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        className="w-full flex items-center justify-center gap-2 p-4 border border-red-500/20 bg-red-500/5 text-red-400 rounded-2xl hover:bg-red-500/10 transition font-bold text-sm"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
    </div>
  );
}
