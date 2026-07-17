'use client';

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { 
  FileText, Clock, CheckCircle, PlusCircle, ChevronRight, AlertCircle, MapPin
} from "lucide-react";
import Link from "next/link";
import { FieldReport } from "@/lib/db-field-ops";
import { useFieldAgentAuth } from "@/lib/FieldAgentAuthContext";
import { MosqueSilhouette } from "@/components/MosqueSilhouette";

export default function AgentDashboard() {
  const [reports, setReports] = useState<FieldReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const { agentData, loading: authLoading } = useFieldAgentAuth();

  useEffect(() => {
    const fetchMyReports = async () => {
      if (!agentData) return;
      try {
        const q = query(collection(db, "field_reports"), where("agentId", "==", agentData.id));
        const snap = await getDocs(q);
        const list: FieldReport[] = [];
        snap.forEach(d => list.push(d.data() as FieldReport));
        // Sort in JS to avoid requiring a composite Firestore index
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setReports(list.slice(0, 5));
      } catch (err) {
        console.error("Failed to fetch reports:", err);
      } finally {
        setLoadingReports(false);
      }
    };
    if (agentData) fetchMyReports();
  }, [agentData]);

  const stats = {
    pending: reports.filter(r => ['Pending Review', 'Under Review'].includes(r.status)).length,
    approved: reports.filter(r => r.status === 'Approved' || r.status === 'Converted').length,
    attention: reports.filter(r => r.status === 'Needs Info').length,
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center text-luxury-gold text-sm font-bold">Loading Workspace...</div>;
  if (!agentData) return <div className="min-h-screen flex items-center justify-center text-red-500 text-sm font-bold">Unauthorized. Please log in.</div>;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Greeting */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white font-playfair tracking-wide">Salaam, {agentData.name.split(" ")[0]}!</h1>
        <p className="text-sm text-gray-400 mt-1">{agentData.role} · {agentData.region}</p>
      </div>

      {/* Stats Grid — 2 cols on mobile, 4 on sm+ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="admin-glass border border-luxury-border rounded-2xl p-4 shadow-lg relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-14 h-14 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition duration-500" />
          <Clock className="w-5 h-5 text-amber-400 mb-2" />
          <h3 className="text-2xl font-bold text-white mb-0.5">{stats.pending}</h3>
          <p className="text-xs text-gray-400 font-medium">Pending Review</p>
        </div>
        
        <div className="admin-glass border border-luxury-border rounded-2xl p-4 shadow-lg relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-14 h-14 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition duration-500" />
          <CheckCircle className="w-5 h-5 text-emerald-400 mb-2" />
          <h3 className="text-2xl font-bold text-white mb-0.5">{stats.approved}</h3>
          <p className="text-xs text-gray-400 font-medium">Verified Needs</p>
        </div>

        <div className="admin-glass border border-luxury-border rounded-2xl p-4 shadow-lg relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-14 h-14 bg-red-500/10 rounded-full blur-xl group-hover:bg-red-500/20 transition duration-500" />
          <AlertCircle className="w-5 h-5 text-red-400 mb-2" />
          <h3 className="text-2xl font-bold text-white mb-0.5">{stats.attention}</h3>
          <p className="text-xs text-gray-400 font-medium">Needs Attention</p>
        </div>

        <div className="admin-glass border border-luxury-border rounded-2xl p-4 shadow-lg relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-14 h-14 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition duration-500" />
          <FileText className="w-5 h-5 text-purple-400 mb-2" />
          <h3 className="text-2xl font-bold text-white mb-0.5">{reports.length}</h3>
          <p className="text-xs text-gray-400 font-medium">Total Submitted</p>
        </div>
      </div>

      {/* Hero Action Card */}
      <div className="bg-[#073f24] rounded-3xl p-6 sm:p-8 relative overflow-hidden flex flex-col sm:flex-row items-center justify-between shadow-2xl min-h-[140px]">
        {/* Decorative gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#073f24] via-[#073f24] to-transparent z-10 pointer-events-none" style={{ right: '35%' }} />
        
        {/* Mosque illustration on right */}
        <MosqueSilhouette className="absolute bottom-0 right-0 w-64 sm:w-80 h-auto opacity-100 pointer-events-none z-0" />

        <div className="relative z-20 text-white max-w-md">
          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center mb-4 border border-white/20">
            <FileText className="w-5 h-5 text-emerald-300" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold mb-1.5 leading-snug">Have you found a need<br/>that requires help?</h2>
          <p className="text-emerald-100/80 text-sm mb-5">Submit a new report and our team will review it.</p>
          
          <Link href="/agent/reports/new" className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 text-white px-5 py-2.5 rounded-full font-semibold text-sm transition backdrop-blur-sm">
            <PlusCircle className="w-4 h-4" />
            Report a New Need
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Recent Reports */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Recent Reports</h2>
          <Link href="/agent/reports" className="text-xs text-luxury-gold font-medium hover:underline">View All</Link>
        </div>
        
        <div className="space-y-3">
          {loadingReports ? (
            <div className="admin-glass border border-luxury-border rounded-2xl p-8 text-center text-gray-500 text-sm">Loading...</div>
          ) : reports.length === 0 ? (
            <div className="admin-glass border border-luxury-border rounded-2xl p-8 text-center flex flex-col items-center">
              <FileText className="w-8 h-8 text-gray-600 mb-3" />
              <p className="text-sm text-gray-400">You haven't submitted any reports yet.</p>
              <Link href="/agent/reports/new" className="mt-4 text-xs font-bold text-luxury-gold bg-white/5 px-4 py-2 rounded-lg border border-luxury-border">
                Start First Report
              </Link>
            </div>
          ) : (
            reports.map((report) => (
              <Link key={report.id} href={`/agent/reports/${report.id}`} className="block admin-glass border border-luxury-border rounded-2xl p-4 hover:border-luxury-gold/30 transition group">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white mb-1 group-hover:text-luxury-gold transition">{report.title}</h3>
                    <div className="flex items-center gap-1 text-[10px] text-gray-400">
                      <MapPin className="w-3 h-3" />
                      <span>{report.location.village || report.location.district}, {report.location.state}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-luxury-gold transition" />
                </div>
                
                <div className="flex items-center justify-between mt-4">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                    report.status === 'Pending Review' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    report.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    report.status === 'Converted' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                    'bg-white/5 text-gray-400 border border-white/10'
                  }`}>
                    {report.status}
                  </span>
                  <span className="text-[9px] text-gray-500">
                    {new Date(report.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
