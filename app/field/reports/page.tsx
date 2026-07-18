'use client';

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { FileText, Clock, CheckCircle, MapPin, ChevronRight, AlertCircle, Filter } from "lucide-react";
import Link from "next/link";
import { FieldReport } from "@/lib/db-field-ops";
import { useFieldAgentAuth } from "@/lib/FieldAgentAuthContext";

const statusConfig: Record<string, { color: string; label: string }> = {
  "Pending Review": { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", label: "Pending Review" },
  "Under Review":  { color: "bg-blue-500/10 text-blue-400 border-blue-500/20",    label: "Under Review" },
  "Needs Info":    { color: "bg-orange-500/10 text-orange-400 border-orange-500/20", label: "Needs Info" },
  "Approved":      { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", label: "Approved" },
  "Converted":     { color: "bg-purple-500/10 text-purple-400 border-purple-500/20",  label: "Converted" },
  "Rejected":      { color: "bg-red-500/10 text-red-400 border-red-500/20",       label: "Rejected" },
};

export default function MyReportsPage() {
  const { agentData } = useFieldAgentAuth();
  const [reports, setReports] = useState<FieldReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("All");

  useEffect(() => {
    if (!agentData?.id) return;
    const fetchReports = async () => {
      try {
        const q = query(
          collection(db, "field_reports"),
          where("agentId", "==", agentData.id)
        );
        const snap = await getDocs(q);
        const list: FieldReport[] = [];
        snap.forEach(d => list.push(d.data() as FieldReport));
        // Sort in JS to avoid composite index requirement
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setReports(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, [agentData?.id]);

  const filterTabs = ["All", "Pending Review", "Approved", "Needs Info", "Converted"];
  const filtered = filter === "All" ? reports : reports.filter(r => r.status === filter);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white font-playfair tracking-wide">My Reports</h1>
        <p className="text-sm text-gray-400 mt-1">All your submitted field needs</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {filterTabs.map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border transition ${
              filter === tab
                ? "bg-luxury-gold text-black border-luxury-gold"
                : "border-white/10 text-gray-400 hover:text-white hover:border-white/20"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="admin-glass border border-luxury-border rounded-2xl p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="admin-glass border border-luxury-border rounded-2xl p-10 text-center flex flex-col items-center">
          <FileText className="w-10 h-10 text-gray-600 mb-3" />
          <p className="text-gray-300 font-semibold mb-1">No reports found</p>
          <p className="text-xs text-gray-500 mb-4">
            {filter === "All" ? "You haven't submitted any reports yet." : `No reports with status "${filter}".`}
          </p>
          <Link
            href="/field/reports/new"
            className="px-5 py-2 bg-gradient-to-r from-luxury-gold to-[#b8860b] text-black text-sm font-bold rounded-xl"
          >
            Submit First Report
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(report => {
            const cfg = statusConfig[report.status] || { color: "bg-white/5 text-gray-400 border-white/10", label: report.status };
            return (
              <Link
                key={report.id}
                href={`/field/reports/${report.id}`}
                className="block admin-glass border border-luxury-border rounded-2xl p-4 hover:border-luxury-gold/30 transition group"
              >
                <div className="flex items-start gap-4">
                  {report.media && report.media.length > 0 ? (
                    <img
                      src={report.media[0]}
                      alt={report.title}
                      className="w-16 h-16 rounded-xl object-cover border border-white/10 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-gray-600" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-white truncate group-hover:text-luxury-gold transition">{report.title}</h3>
                      <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5 group-hover:text-luxury-gold" />
                    </div>

                    <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-400">
                      <MapPin className="w-3 h-3" />
                      <span>{report.location.village || report.location.district}, {report.location.state}</span>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <span className="text-[9px] text-gray-500">
                        Submitted {new Date(report.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
