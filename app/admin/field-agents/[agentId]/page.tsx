'use client';

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { 
  ArrowLeft, MapPin, Phone, Mail, ShieldCheck, Clock, 
  CheckCircle, XCircle, FileText, Activity, Calendar
} from "lucide-react";
import Link from "next/link";
import { FieldAgent, FieldReport, FieldActivity } from "@/lib/db-field-ops";

export default function FieldAgentCRM({ params }: { params: Promise<{ agentId: string }> }) {
  const unwrappedParams = React.use(params);
  const agentId = unwrappedParams.agentId;

  const [agent, setAgent] = useState<FieldAgent | null>(null);
  const [reports, setReports] = useState<FieldReport[]>([]);
  const [activities, setActivities] = useState<FieldActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCRMData = async () => {
      setLoading(true);
      try {
        // Fetch Agent
        const agentDoc = await getDoc(doc(db, "field_agents", agentId));
        if (agentDoc.exists()) setAgent(agentDoc.data() as FieldAgent);
        
        // Fetch Reports
        const reportsQuery = query(collection(db, "field_reports"), where("agentId", "==", agentId));
        const reportsSnap = await getDocs(reportsQuery);
        const rList: FieldReport[] = [];
        reportsSnap.forEach(d => rList.push(d.data() as FieldReport));
        setReports(rList);

        // Fetch Activities
        const actQuery = query(collection(db, "field_activities"), where("agentId", "==", agentId), orderBy("timestamp", "desc"));
        const actSnap = await getDocs(actQuery);
        const aList: FieldActivity[] = [];
        actSnap.forEach(d => aList.push(d.data() as FieldActivity));
        setActivities(aList);

      } catch (err) {
        console.error("Error fetching CRM data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCRMData();
  }, [agentId]);

  if (loading) return <div className="p-10 text-center text-gray-500">Loading Agent CRM...</div>;
  if (!agent) return <div className="p-10 text-center text-red-500">Agent not found.</div>;

  const verificationRate = agent.stats?.reportsSubmitted > 0 
    ? Math.round((agent.stats.reportsApproved / agent.stats.reportsSubmitted) * 100) 
    : 0;

  return (
    <div className="space-y-6 text-xs max-w-7xl mx-auto w-full pb-20">
      <div className="flex items-center gap-4">
        <Link href="/admin/field-agents" className="p-2 bg-black/40 border border-white/[0.08] rounded-xl hover:bg-white/[0.04] transition">
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-luxury-gold font-playfair tracking-wide uppercase">Agent Profile</h2>
          <p className="text-gray-400 mt-1">CRM ID: {agent.id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Profile Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="admin-glass border border-white/[0.08] rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)] overflow-hidden">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 flex items-center justify-center text-luxury-gold font-bold text-3xl mb-4">
                {agent.name.charAt(0)}
              </div>
              <h3 className="text-lg font-bold text-white">{agent.name}</h3>
              <p className="text-luxury-gold font-medium mt-1">{agent.role}</p>
              
              <div className="flex gap-2 mt-4 w-full">
                <span className={`flex-1 py-1.5 rounded-lg text-center font-bold text-[10px] ${agent.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                  {agent.status}
                </span>
                <span className="flex-1 py-1.5 rounded-lg text-center font-bold text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {verificationRate}% VR
                </span>
              </div>
            </div>

            <div className="mt-6 space-y-4 pt-6 border-t border-white/[0.06]">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-white break-all">{agent.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-white">{agent.phone}</span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-gray-500" />
                <span className="text-white">{agent.region}</span>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-gray-400">Joined {new Date(agent.joinDate).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="admin-glass border border-white/[0.08] rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-wider font-playfair">Lifetime Performance</h4>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Total Reports</span>
                <span className="text-white font-bold">{agent.stats?.reportsSubmitted || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Approved</span>
                <span className="text-emerald-400 font-bold">{agent.stats?.reportsApproved || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-amber-500" /> Pending</span>
                <span className="text-amber-400 font-bold">{agent.stats?.reportsPending || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 flex items-center gap-2"><XCircle className="w-3.5 h-3.5 text-red-500" /> Rejected</span>
                <span className="text-red-400 font-bold">{agent.stats?.reportsRejected || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Reports & Activity */}
        <div className="lg:col-span-2 space-y-6">
          <div className="admin-glass border border-white/[0.08] rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider font-playfair">Submitted Reports</h4>
              <Link href={`/admin/field-ops?agent=${agent.id}`} className="text-luxury-gold hover:underline">View in Field Ops</Link>
            </div>
            {reports.length === 0 ? (
              <div className="p-10 text-center text-gray-500">This agent hasn't submitted any reports yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/[0.01] border-b border-white/[0.06] text-gray-500 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="p-3">Report ID</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {reports.map(r => (
                      <tr key={r.id} className="hover:bg-white/[0.02]">
                        <td className="p-3 text-white font-medium">{r.id}</td>
                        <td className="p-3 text-gray-300">{r.category}</td>
                        <td className="p-3 text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/[0.05] text-gray-300 border border-white/[0.1]">{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="admin-glass border border-white/[0.08] rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            <div className="p-4 border-b border-white/[0.06]">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider font-playfair">Activity Timeline</h4>
            </div>
            <div className="p-5">
              {activities.length === 0 ? (
                <div className="text-center text-gray-500 py-4">No logged activity.</div>
              ) : (
                <div className="space-y-6 border-l-2 border-white/[0.06] ml-2 pl-6">
                  {activities.map((act) => (
                    <div key={act.id} className="relative">
                      <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-luxury-gold border-[3px] border-[#0B120F]"></div>
                      <p className="text-[11px] font-bold text-luxury-gold uppercase tracking-wider mb-1">{new Date(act.timestamp).toLocaleString()}</p>
                      <p className="text-[13px] text-white font-medium mb-0.5">{act.action}</p>
                      {act.reportId && <p className="text-[11px] text-gray-400">Report: {act.reportId}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
