"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { ArrowLeft, Download, CheckCircle, XCircle, Clock, FileText } from "lucide-react";
import { useRouter, useParams } from "next/navigation";

export default function BroadcastReport() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  
  const [broadcast, setBroadcast] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const bDoc = await getDoc(doc(db, "broadcasts", id));
        if (bDoc.exists()) {
          setBroadcast({ id: bDoc.id, ...bDoc.data() });
        }
        
        const q = query(collection(db, "broadcast_email_jobs"), where("broadcastId", "==", id));
        const jSnap = await getDocs(q);
        setJobs(jSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Failed to load broadcast data", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  const exportCSV = () => {
    if (!jobs.length) return;
    const headers = ["Recipient Name,Recipient Email,Status,Retry Count,Failure Reason,Completed Time"];
    const rows = jobs.map(j => `"${j.recipientName}","${j.recipientEmail}","${j.status}",${j.retryCount},"${j.failureReason || ''}","${j.completedTime || ''}"`);
    const csvContent = "data:text/csv;charset=utf-8," + headers.concat(rows).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Broadcast_Report_${id}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading Report...</div>;
  }

  if (!broadcast) {
    return <div className="p-8 text-center text-red-400">Broadcast not found.</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 print:p-0 print:m-0 print:max-w-none print:bg-white print:text-black">
      {/* Non-print Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <button onClick={() => router.push('/admin/communications/history')} className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white transition">
          <ArrowLeft className="w-4 h-4" /> Back to History
        </button>
        <div className="flex gap-3 w-full sm:w-auto">
          <button onClick={exportCSV} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-semibold text-white hover:bg-white/10 transition">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => window.print()} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[var(--gold)] rounded-lg text-xs font-semibold text-black hover:bg-[var(--gold)]/90 transition">
            <FileText className="w-4 h-4" /> Save as PDF
          </button>
        </div>
      </div>

      {/* Report Header */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 print:bg-transparent print:border-none print:p-0">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white print:text-black mb-1">Broadcast Report</h1>
            <p className="text-sm font-mono text-[var(--gold)] print:text-gray-600">{broadcast.id}</p>
          </div>
          <div className="text-right">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${broadcast.status === 'Completed' ? 'bg-green-500/10 text-green-400 border border-green-500/20 print:border-green-600 print:text-green-700' : 'bg-yellow-500/10 text-yellow-400'}`}>
              {broadcast.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:gap-4 border-t border-white/10 print:border-gray-300 pt-6">
          <div className="space-y-4 text-sm">
            <div className="flex justify-between"><span className="text-gray-400 print:text-gray-600">Communication Type</span><span className="font-semibold text-white print:text-black uppercase text-xs">{broadcast.communicationType.replace(/_/g, ' ')}</span></div>
            <div className="flex justify-between"><span className="text-gray-400 print:text-gray-600">Target Causes</span><span className="font-semibold text-white print:text-black">{broadcast.causeName}</span></div>
            <div className="flex justify-between"><span className="text-gray-400 print:text-gray-600">Started At</span><span className="font-semibold text-white print:text-black">{new Date(broadcast.startedAt || broadcast.createdAt).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-400 print:text-gray-600">Duration</span><span className="font-semibold text-white print:text-black">{broadcast.processingDurationMs ? (broadcast.processingDurationMs / 1000).toFixed(1) + 's' : 'Processing...'}</span></div>
          </div>
          
          <div className="space-y-4 text-sm bg-black/20 print:bg-transparent p-4 rounded-xl border border-white/5 print:border-none">
            <div className="flex justify-between"><span className="text-gray-400 print:text-gray-600">Recipients Resolved</span><span className="font-bold text-white print:text-black">{broadcast.totalRecipients}</span></div>
            <div className="flex justify-between"><span className="text-gray-400 print:text-gray-600">Successfully Sent</span><span className="font-bold text-green-400 print:text-green-700">{broadcast.stats?.sent || 0}</span></div>
            <div className="flex justify-between"><span className="text-gray-400 print:text-gray-600">Failed</span><span className="font-bold text-red-400 print:text-red-700">{broadcast.stats?.failed || 0}</span></div>
            <div className="flex justify-between"><span className="text-gray-400 print:text-gray-600">Pending</span><span className="font-bold text-yellow-400 print:text-yellow-700">{broadcast.stats?.remaining || 0}</span></div>
          </div>
        </div>
      </div>

      {/* Recipient Details */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden print:bg-transparent print:border-none print:mt-8">
        <div className="p-5 border-b border-white/10 print:border-gray-300">
          <h3 className="text-lg font-bold text-white print:text-black">Recipient Delivery Logs</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-400 print:text-gray-700">
            <thead className="bg-white/5 print:bg-gray-100 text-xs uppercase text-gray-500 print:text-gray-800">
              <tr>
                <th className="px-6 py-4 font-semibold">Recipient</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Retries</th>
                <th className="px-6 py-4 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 print:divide-gray-200">
              {jobs.map(job => (
                <tr key={job.id} className="hover:bg-white/5 print:hover:bg-transparent transition">
                  <td className="px-6 py-4">
                    <p className="font-medium text-white print:text-black">{job.recipientName}</p>
                    <p className="text-xs text-gray-500">{job.recipientEmail}</p>
                  </td>
                  <td className="px-6 py-4">
                    {job.status === 'Sent' ? (
                      <span className="flex items-center gap-1.5 text-green-400 print:text-green-700 text-xs font-semibold"><CheckCircle className="w-3.5 h-3.5" /> Sent</span>
                    ) : job.status === 'Failed' ? (
                      <span className="flex items-center gap-1.5 text-red-400 print:text-red-700 text-xs font-semibold"><XCircle className="w-3.5 h-3.5" /> Failed</span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-yellow-400 print:text-yellow-700 text-xs font-semibold"><Clock className="w-3.5 h-3.5" /> Pending</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">{job.retryCount || 0}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-gray-500">
                      {job.failureReason ? (
                        <span className="text-red-400/80 print:text-red-600">{job.failureReason}</span>
                      ) : job.completedTime ? (
                        new Date(job.completedTime).toLocaleTimeString()
                      ) : '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
