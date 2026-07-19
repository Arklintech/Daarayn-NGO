"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { BarChart2, Activity, Users, CheckCircle, XCircle, ArrowLeft, Download } from "lucide-react";
import { useRouter } from "next/navigation";

export default function BroadcastAnalytics() {
  const router = useRouter();
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBroadcasts() {
      try {
        const q = query(collection(db, "broadcasts"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        setBroadcasts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Failed to fetch broadcasts", err);
      } finally {
        setLoading(false);
      }
    }
    fetchBroadcasts();
  }, []);

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[50vh]">
        <Activity className="h-8 w-8 animate-spin text-[var(--gold)]" />
      </div>
    );
  }

  const totalEmails = broadcasts.reduce((acc, b) => acc + (b.totalRecipients || 0), 0);
  const totalSent = broadcasts.reduce((acc, b) => acc + (b.stats?.sent || 0), 0);
  const totalFailed = broadcasts.reduce((acc, b) => acc + (b.stats?.failed || 0), 0);
  const successRate = totalEmails > 0 ? ((totalSent / totalEmails) * 100).toFixed(1) : "0.0";
  const todayBroadcasts = broadcasts.filter(b => new Date(b.createdAt).toDateString() === new Date().toDateString()).length;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button 
            onClick={() => router.push('/admin/communications')}
            className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white transition mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Communications
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">Broadcast Analytics</h1>
          <p className="text-gray-500 text-xs md:text-sm">Enterprise Intelligence and Delivery Metrics</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Today's Broadcasts</p>
          <div className="flex items-end gap-3"><p className="text-3xl font-bold text-white">{todayBroadcasts}</p></div>
        </div>
        <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Total Processed</p>
          <div className="flex items-end gap-3"><p className="text-3xl font-bold text-white">{totalEmails}</p></div>
        </div>
        <div className="p-5 rounded-2xl bg-white/5 border border-green-500/30">
          <p className="text-xs text-green-400/80 uppercase tracking-wider mb-2">Success Rate</p>
          <div className="flex items-end gap-3"><p className="text-3xl font-bold text-green-400">{successRate}%</p></div>
        </div>
        <div className="p-5 rounded-2xl bg-white/5 border border-red-500/30">
          <p className="text-xs text-red-400/80 uppercase tracking-wider mb-2">Failed Deliveries</p>
          <div className="flex items-end gap-3"><p className="text-3xl font-bold text-red-400">{totalFailed}</p></div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-white/10">
          <h3 className="text-lg font-bold text-white">Broadcast History</h3>
        </div>
        
        {/* Mobile View (Cards) */}
        <div className="block md:hidden">
          {broadcasts.map(b => (
            <div key={b.id} onClick={() => router.push(`/admin/communications/history/${b.id}`)} className="p-4 border-b border-white/10 cursor-pointer active:bg-white/10">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-mono text-[var(--gold)]">{b.id}</span>
                <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full ${b.status === 'Completed' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{b.status}</span>
              </div>
              <p className="text-sm font-semibold text-white truncate mb-1">{b.causeName}</p>
              <div className="flex justify-between text-xs text-gray-400">
                <span>{new Date(b.createdAt).toLocaleDateString()}</span>
                <span>{b.stats?.sent || 0} Sent</span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-400">
            <thead className="bg-white/5 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Broadcast ID</th>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Cause(s)</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Recipients</th>
                <th className="px-6 py-4 font-semibold text-right">Sent</th>
                <th className="px-6 py-4 font-semibold text-right">Failed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {broadcasts.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">No broadcasts found.</td></tr>
              )}
              {broadcasts.map(b => (
                <tr key={b.id} onClick={() => router.push(`/admin/communications/history/${b.id}`)} className="hover:bg-white/5 cursor-pointer transition">
                  <td className="px-6 py-4 font-mono text-[var(--gold)] text-xs">{b.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{new Date(b.createdAt).toLocaleString()}</td>
                  <td className="px-6 py-4 font-medium text-white max-w-[200px] truncate">{b.causeName}</td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full ${b.status === 'Completed' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-medium">{b.totalRecipients}</td>
                  <td className="px-6 py-4 text-right text-green-400 font-medium">{b.stats?.sent || 0}</td>
                  <td className="px-6 py-4 text-right text-red-400 font-medium">{b.stats?.failed || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
