'use client';

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { useParams } from "next/navigation";
import { ArrowLeft, MapPin, Users, FileText, Clock, CheckCircle, XCircle, AlertCircle, MessageSquare, ChevronRight } from "lucide-react";
import Link from "next/link";
import { FieldReport } from "@/lib/db-field-ops";
import { useFieldAgentAuth } from "@/lib/FieldAgentAuthContext";

const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
  "Pending Review": { color: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: Clock, label: "Pending Review" },
  "Under Review":  { color: "text-blue-400 bg-blue-500/10 border-blue-500/20", icon: Clock, label: "Under Review" },
  "Needs Info":    { color: "text-orange-400 bg-orange-500/10 border-orange-500/20", icon: AlertCircle, label: "Needs Info" },
  "Approved":      { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle, label: "Approved" },
  "Converted":     { color: "text-purple-400 bg-purple-500/10 border-purple-500/20", icon: CheckCircle, label: "Converted to Cause" },
  "Rejected":      { color: "text-red-400 bg-red-500/10 border-red-500/20", icon: XCircle, label: "Rejected" },
};

export default function ReportDetailPage() {
  const { agentData } = useFieldAgentAuth();
  const params = useParams();
  const reportId = params?.id as string;
  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reportId) return;
    // Real-time listener — admin timeline updates reflect instantly
    const unsub = onSnapshot(doc(db, "field_reports", reportId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setReport({ id: snap.id, ...data });
        
        // Clear unread flag if it was set by admin updates
        if (data.hasAgentUnreadUpdate) {
          updateDoc(doc(db, "field_reports", reportId), { hasAgentUnreadUpdate: false }).catch(console.error);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, [reportId]);

  if (loading) {
    return <div className="min-h-[300px] flex items-center justify-center text-gray-400 text-sm">Loading report...</div>;
  }
  if (!report) {
    return (
      <div className="text-center py-20">
        <FileText className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">Report not found.</p>
        <Link href="/agent/reports" className="text-luxury-ivory text-sm mt-2 inline-block hover:underline">← Back to Reports</Link>
      </div>
    );
  }

  const statusCfg = statusConfig[report.status] || { color: "text-gray-400 bg-white/5 border-white/10", icon: FileText, label: report.status };
  const StatusIcon = statusCfg.icon;

  const TIMELINE_STAGE_KEYS = [
    "Submitted",
    "Assigned to Reviewer",
    "Under Review",
    "Verification Visit",
    "Approval",
    "Published on Website",
  ];

  const savedStages: Record<string, string> = report.timelineStages || {};

  const timelineSteps = TIMELINE_STAGE_KEYS.map((label, i) => {
    const isSubmitted = label === "Submitted";
    const completedAt = isSubmitted ? report.createdAt : savedStages[label];
    return { label, done: !!completedAt, date: completedAt };
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Back Button */}
      <Link href="/agent/reports" className="flex items-center gap-2 text-sm text-gray-400 hover:text-luxury-ivory transition group">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Back to My Reports
      </Link>

      {/* Hero Image */}
      {report.media && report.media.length > 0 && (
        <div className="relative rounded-2xl overflow-hidden h-48">
          <img src={report.media[0]} alt={report.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold ${statusCfg.color}`}>
              <StatusIcon className="w-3 h-3" />
              {statusCfg.label}
            </span>
          </div>
        </div>
      )}

      {/* Title */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-bold text-white font-playfair leading-tight">{report.title}</h1>
          {!report.media?.length && (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-bold ${statusCfg.color} flex-shrink-0`}>
              <StatusIcon className="w-3 h-3" />
              {statusCfg.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 text-sm text-gray-400">
          <MapPin className="w-4 h-4 text-luxury-ivory" />
          <span>{[report.location.village, report.location.district, report.location.state].filter(Boolean).join(", ")}</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">{report.id} · {new Date(report.createdAt).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      {/* Key Details — 1 col mobile, 2 col sm+ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="admin-glass border border-luxury-border rounded-xl p-3">
          <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Category</p>
          <p className="text-sm font-bold text-white">{report.category}</p>
        </div>
        <div className="admin-glass border border-luxury-border rounded-xl p-3">
          <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Urgency</p>
          <p className={`text-sm font-bold ${report.urgency === "High" ? "text-red-400" : report.urgency === "Medium" ? "text-amber-400" : "text-emerald-400"}`}>{report.urgency}</p>
        </div>
        <div className="admin-glass border border-luxury-border rounded-xl p-3">
          <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Est. Budget</p>
          <p className="text-sm font-bold text-white">{report.estimatedBudget || "—"}</p>
        </div>
        <div className="admin-glass border border-luxury-border rounded-xl p-3">
          <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Families</p>
          <p className="text-sm font-bold text-white">{report.beneficiaries?.families || 0}</p>
        </div>
      </div>

      {/* Description */}
      <div className="admin-glass border border-luxury-border rounded-2xl p-4">
        <h3 className="text-xs text-gray-400 uppercase tracking-wider mb-3 font-semibold">Description</h3>
        <p className="text-sm text-gray-300 leading-relaxed">{report.description || "No description provided."}</p>
      </div>

      {/* Beneficiaries */}
      <div className="admin-glass border border-luxury-border rounded-2xl p-4">
        <h3 className="text-xs text-gray-400 uppercase tracking-wider mb-3 font-semibold flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Beneficiaries</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[
            { label: "Families", val: report.beneficiaries?.families },
            { label: "Children", val: report.beneficiaries?.children },
            { label: "Women", val: report.beneficiaries?.women },
            { label: "Elderly", val: report.beneficiaries?.elderly },
          ].map(b => (
            <div key={b.label} className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-2 text-center">
              <p className="text-base font-bold text-white">{b.val || 0}</p>
              <p className="text-[9px] text-gray-500">{b.label}</p>
            </div>
          ))}
        </div>
        {report.beneficiaries?.description && (
          <p className="text-xs text-gray-400 italic">{report.beneficiaries.description}</p>
        )}
      </div>

      {/* Timeline */}
      <div className="admin-glass border border-luxury-border rounded-2xl p-4">
        <h3 className="text-xs text-gray-400 uppercase tracking-wider mb-4 font-semibold">Report Timeline</h3>
        <div className="space-y-0">
          {timelineSteps.map((step, i) => {
            const isCurrent = !step.done && (
              (step.label === "Assigned to Reviewer" && report.status === "Pending Review") ||
              (step.label === "Under Review" && report.status === "Under Review") ||
              (step.label === "Verification Visit" && report.status === "Scheduled") ||
              (step.label === "Approval" && report.status === "Approved")
            );
            return (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                    step.done
                      ? "border-luxury-ivory bg-luxury-ivory/20"
                      : isCurrent
                      ? "border-[#b8860b] bg-[#b8860b]/10 animate-pulse"
                      : "border-white/20 bg-transparent"
                  }`}>
                    {step.done && <CheckCircle className="w-3 h-3 text-luxury-ivory" />}
                    {isCurrent && !step.done && <div className="w-1.5 h-1.5 rounded-full bg-[#b8860b]" />}
                  </div>
                  {i < timelineSteps.length - 1 && (
                    <div className={`w-0.5 flex-1 my-1 min-h-[20px] ${step.done ? "bg-luxury-ivory/30" : "bg-white/10"}`} />
                  )}
                </div>
                <div className="pb-4">
                  <p className={`text-sm font-medium ${
                    step.done ? "text-white" : isCurrent ? "text-[#b8860b]" : "text-gray-500"
                  }`}>{step.label}</p>
                  {step.done && step.date ? (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {new Date(step.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  ) : isCurrent ? (
                    <p className="text-[10px] text-[#b8860b]/70 mt-0.5">In Progress</p>
                  ) : (
                    <p className="text-[10px] text-gray-600 mt-0.5">Upcoming</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action: Message Admin */}
      {report.adminNotes && (
        <div className="admin-glass border border-amber-500/20 bg-amber-500/5 rounded-2xl p-4">
          <p className="text-[10px] text-amber-400 uppercase font-bold tracking-wider mb-1">Admin Notes</p>
          <p className="text-sm text-gray-200">{report.adminNotes}</p>
        </div>
      )}

      <Link
        href="/agent/messages"
        className="flex items-center justify-between w-full admin-glass border border-luxury-border rounded-2xl p-4 hover:border-luxury-ivory/30 transition group"
      >
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-luxury-ivory" />
          <div>
            <p className="text-sm font-bold text-white">Contact Admin</p>
            <p className="text-xs text-gray-400">Send a message about this report</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-luxury-ivory transition" />
      </Link>
    </div>
  );
}
