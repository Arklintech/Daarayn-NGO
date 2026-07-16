'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Download, X } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  completed:  'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
  allocated:  'bg-blue-500/10 border-blue-500/25 text-blue-400',
  pending:    'bg-amber-500/10 border-amber-500/25 text-amber-400',
  rejected:   'bg-red-500/10 border-red-500/25 text-red-400',
};

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-sm text-white font-medium break-all">{value ?? '—'}</p>
    </div>
  );
}

function ContributionDrawer({ donation, onClose }: { donation: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70"
      onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
        style={{ background: '#0d1628', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div>
            <p className="font-mono text-xs text-luxury-ivory/70">{donation.id}</p>
            <h3 className="text-lg font-bold text-white mt-0.5">Contribution Details</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Core details */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            <Field label="Contribution ID" value={donation.id} />
            <Field label="Amount" value={`INR ${(donation.amount || 0).toLocaleString()}`} />
            <Field label="Currency" value={donation.currency} />
            <Field label="Payment Method" value={donation.paymentMethod} />
            <Field label="UPI / Reference" value={donation.transactionReference} />
            <Field label="Donation Date" value={donation.date} />
            <Field label="Verification Date" value={donation.verificationDate || '—'} />
            <Field label="Verified By" value={donation.verifiedBy || '—'} />
            <Field label="Status" value={donation.status} />
            <Field label="Allocation Status" value={donation.allocationStatus || '—'} />
            <Field label="Anonymous" value={donation.anonymous ? 'Yes' : 'No'} />
            <Field label="Donation Type" value={donation.donationType} />
          </div>

          {/* Causes */}
          {donation.selectedCauses?.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Cause Allocation</p>
              <div className="space-y-2">
                {donation.selectedCauses.map((c: any) => (
                  <div key={c.causeId} className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                      <p className="text-sm text-white font-medium">{c.causeName}</p>
                      <p className="text-xs text-gray-500 font-mono">{c.causeId}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-luxury-ivory font-semibold">INR {(c.allocatedAmount || 0).toLocaleString()}</p>
                      <p className="text-xs text-gray-500">{c.percentage || 0}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {donation.notes && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Donor Notes</p>
              <p className="text-sm text-gray-300 leading-relaxed p-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                {donation.notes}
              </p>
            </div>
          )}

          {/* Proof */}
          {donation.proofUrl && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Payment Proof</p>
              <a href={donation.proofUrl} target="_blank" rel="noreferrer">
                <img src={donation.proofUrl} alt="Payment Proof"
                  className="w-full max-h-60 object-cover rounded-xl border hover:opacity-90 transition"
                  style={{ borderColor: 'rgba(255,255,255,0.08)' }} />
              </a>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {donation.receiptUrl && (
              <a href={donation.receiptUrl} download
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-gray-200 hover:text-white transition"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Download className="w-4 h-4" /> Download Receipt
              </a>
            )}
            <button onClick={onClose}
              className="ml-auto px-4 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white transition"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DonationsTab({ donations }: any) {
  const [selected, setSelected] = useState<any>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = [...donations].sort((a, b) => {
    const ta = new Date(a.date || 0).getTime();
    const tb = new Date(b.date || 0).getTime();
    return sortDir === 'desc' ? tb - ta : ta - tb;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">All Contributions <span className="text-gray-500 text-sm font-normal ml-1">({donations.length})</span></h2>
        <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition px-3 py-1.5 rounded-lg"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          {sortDir === 'desc' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          {sortDir === 'desc' ? 'Newest First' : 'Oldest First'}
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p>No donations found for this donor.</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-widest text-gray-500" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <th className="px-5 py-3.5">Contribution ID</th>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5">Cause</th>
                <th className="px-5 py-3.5 text-right">Amount</th>
                <th className="px-5 py-3.5">Method</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              {sorted.map(d => (
                <tr key={d.id} onClick={() => setSelected(d)}
                  className="hover:bg-white/[0.025] cursor-pointer transition group">
                  <td className="px-5 py-4 font-mono text-xs text-luxury-ivory/80">{d.id}</td>
                  <td className="px-5 py-4 text-gray-300">{d.date || '—'}</td>
                  <td className="px-5 py-4 text-gray-300 max-w-[150px] truncate">
                    {d.selectedCauses?.[0]?.causeName || d.donationType || '—'}
                  </td>
                  <td className="px-5 py-4 text-right font-mono font-semibold text-luxury-ivory">
                    INR {(d.amount || 0).toLocaleString()}
                  </td>
                  <td className="px-5 py-4 text-gray-400 capitalize">{d.paymentMethod || '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full border ${STATUS_STYLES[d.status] || STATUS_STYLES.pending}`}>
                      {d.status || 'pending'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <ExternalLink className="w-3.5 h-3.5 text-gray-600 group-hover:text-luxury-ivory transition ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <ContributionDrawer donation={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
