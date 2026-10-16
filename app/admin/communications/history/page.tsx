"use client";

import React, { useEffect, useState } from "react";
import { BarChart2, Activity, Users, CheckCircle, XCircle, ArrowLeft, Download, FileText } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

export default function BroadcastAnalytics() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const broadcastId = searchParams.get("id");

  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [singleBroadcast, setSingleBroadcast] = useState<any>(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch single broadcast report when id parameter is present
  useEffect(() => {
    if (!broadcastId) {
      setSingleLoading(false);
      return;
    }

    async function fetchSingle() {
      setSingleLoading(true);
      try {
        const res = await fetch(`/api/admin/communications/status?id=${encodeURIComponent(broadcastId)}`);
        const data = await res.json();

        if (res.ok && data.success && data.broadcast) {
          setSingleBroadcast(data.broadcast);
          setError(null);
        } else {
          setError(data.error || "Broadcast not found");
        }
      } catch (err) {
        console.error("Failed to load broadcast", err);
        setError("Failed to load broadcast data");
      } finally {
        setSingleLoading(false);
      }
    }

    fetchSingle();
  }, [broadcastId]);

  useEffect(() => {
    async function fetchBroadcasts() {
      try {
        const res = await fetch("/api/admin/communications");
        const data = await res.json();
        if (data.success && Array.isArray(data.communications)) {
          // Normalize Google Sheets communication records
          const mapped = data.communications.map((c: any) => ({
            id: c.id,
            createdBy: c.createdBy || "Admin",
            createdAt: c.createdAt,
            communicationType: c.type || "Email Broadcast",
            causeName: (c.selectedCauses || []).join(", "),
            totalRecipients: Number(c.recipientCount || 0),
            status: c.status || "Completed",
            stats: {
              sent: Number(c.sentCount || 0),
              failed: Number(c.failedCount || 0),
              remaining: Math.max(0, Number(c.recipientCount || 0) - Number(c.sentCount || 0) - Number(c.failedCount || 0))
            }
          }));
          setBroadcasts(mapped);
        }
      } catch (err) {
        console.error("Failed to fetch broadcasts from Google Sheets", err);
      } finally {
        setLoading(false);
      }
    }
    fetchBroadcasts();
  }, []);

  // Show single broadcast report if id parameter is present
  if (broadcastId) {
    if (singleLoading) {
      return (
        <div className="p-8 text-center text-gray-500">
          <div className="animate-spin inline-block">Loading Report...</div>
        </div>
      );
    }

    if (error || !singleBroadcast) {
      return (
        <div className="p-8 max-w-2xl mx-auto">
          <button onClick={() => router.push('/admin/communications/history')} className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white transition mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to History
          </button>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Broadcast Report</h1>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-red-400">
              <p>{error || "Broadcast not found."}</p>
            </div>
          </div>
        </div>
      );
    }

    const exportCSV = () => {
      const headers = ["Broadcast ID,Status,Recipients,Sent,Failed,Duration"];
      const rows = [
        `"${singleBroadcast.id}","${singleBroadcast.status}",${singleBroadcast.totalRecipients},${singleBroadcast.stats?.sent || 0},${singleBroadcast.stats?.failed || 0},"${singleBroadcast.processingDurationMs || 0}ms"`
      ];
      const csvContent = "data:text/csv;charset=utf-8," + headers.concat(rows).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Broadcast_Report_${broadcastId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    };

    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <button onClick={() => router.push('/admin/communications/history')} className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Back to History
          </button>
          <div className="flex gap-3 w-full sm:w-auto">
            <button onClick={exportCSV} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-semibold text-white hover:bg-white/10 transition">
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button onClick={() => window.print()} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white rounded-lg text-xs font-semibold text-black hover:bg-gray-100 transition">
              <FileText className="w-4 h-4" /> Save as PDF
            </button>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">Broadcast Report</h1>
              <p className="text-sm font-mono text-[var(--gold)]">{singleBroadcast.id}</p>
            </div>
            <div className="text-right">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${singleBroadcast.status === 'Completed' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-yellow-500/10 text-yellow-400'}`}>
                {singleBroadcast.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-white/10 pt-6">
            <div className="space-y-4 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Communication Type</span><span className="font-semibold text-white uppercase text-xs">{singleBroadcast.communicationType?.replace(/_/g, ' ')}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Target Causes</span><span className="font-semibold text-white">{singleBroadcast.causeName}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Started At</span><span className="font-semibold text-white">{new Date(singleBroadcast.startedAt || singleBroadcast.createdAt).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Duration</span><span className="font-semibold text-white">{singleBroadcast.processingDurationMs ? (singleBroadcast.processingDurationMs / 1000).toFixed(1) + 's' : 'Processing...'}</span></div>
            </div>

            <div className="space-y-4 text-sm bg-black/20 p-4 rounded-xl border border-white/5">
              <div className="flex justify-between"><span className="text-gray-400">Recipients Resolved</span><span className="font-bold text-white">{singleBroadcast.totalRecipients}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Successfully Sent</span><span className="font-bold text-green-400">{singleBroadcast.stats?.sent || 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Failed</span><span className="font-bold text-red-400">{singleBroadcast.stats?.failed || 0}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Pending</span><span className="font-bold text-yellow-400">{singleBroadcast.stats?.remaining || 0}</span></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            <div key={b.id} onClick={() => router.push(`/admin/communications/history?id=${b.id}`)} className="p-4 border-b border-white/10 cursor-pointer active:bg-white/10">
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
                <tr key={b.id} onClick={() => router.push(`/admin/communications/history?id=${b.id}`)} className="hover:bg-white/5 cursor-pointer transition">
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
