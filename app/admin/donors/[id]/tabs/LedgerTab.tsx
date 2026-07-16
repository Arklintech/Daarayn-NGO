'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { ExternalLink, Download, BookOpen } from 'lucide-react';

export default function LedgerTab({ donor, donations, donorId }: any) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(query(collection(db, 'ledger_entries'), where('donorId', '==', donorId)));
        const list: any[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        setEntries(list);
      } catch {
        // Fallback: derive from donations
        setEntries(donations.filter((d: any) => d.status === 'allocated' || d.allocationStatus));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [donorId, donations]);

  if (loading) {
    return <div className="py-20 text-center"><div className="w-8 h-8 border-2 border-luxury-ivory border-t-transparent rounded-full animate-spin mx-auto" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">
          Public Ledger Records <span className="text-gray-500 text-sm font-normal ml-1">({entries.length})</span>
        </h2>
        <a href="/admin/ledger" target="_blank"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs text-gray-300 hover:text-white transition"
          style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
          <BookOpen className="w-3.5 h-3.5" /> Open Full Ledger
        </a>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-20 text-gray-500 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p>No ledger entries found for this donor yet.</p>
          <p className="text-xs mt-2">Entries appear after donations are allocated.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e: any) => (
            <div key={e.id} className="p-5 rounded-2xl space-y-3"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-luxury-ivory/70 mb-1">{e.id}</p>
                  <p className="text-sm font-medium text-white">{e.targetTitle || e.donationType || 'Donation Allocation'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{e.allocationDate || e.date || '—'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono font-semibold text-luxury-ivory">
                    INR {(e.allocatedAmount || e.amount || 0).toLocaleString()}
                  </p>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border mt-1 inline-block ${
                    e.status === 'disbursed' || e.status === 'allocated'
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                  }`}>
                    {e.allocationStatus || e.status || 'allocated'}
                  </span>
                </div>
              </div>

              {/* Allocation detail */}
              {e.selectedCauses?.length > 0 && (
                <div className="space-y-2">
                  {e.selectedCauses.map((c: any) => (
                    <div key={c.causeId} className="flex items-center justify-between text-xs text-gray-400 py-1.5 border-t"
                      style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      <span>{c.causeName}</span>
                      <span className="font-mono text-gray-300">INR {(c.allocatedAmount || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-gray-400 hover:text-white transition"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                  <ExternalLink className="w-3 h-3" /> View Entry
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-gray-400 hover:text-white transition"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                  <Download className="w-3 h-3" /> Download PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
