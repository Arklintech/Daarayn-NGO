'use client';

import { useState } from 'react';
import { Download, ZoomIn, X, ChevronLeft, ChevronRight } from 'lucide-react';

export default function DocumentsTab({ donations }: any) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // Gather all proofs from all donations
  const proofs: { url: string; donId: string; date: string }[] = donations.flatMap((d: any) => {
    const url = d.proofUrl || d.receiptUrl;
    return url ? [{ url, donId: d.id, date: d.date || '' }] : [];
  });

  const receipts: { url: string; donId: string; amount: number }[] = donations.flatMap((d: any) => {
    const isScreenshot = d.receiptUrl && (d.receiptUrl.includes("proof-") || d.receiptUrl === d.proofUrl);
    return d.receiptUrl && !isScreenshot
      ? [{ url: d.receiptUrl, donId: d.id, amount: d.amount || 0 }]
      : [];
  });

  const prev = () => setLightboxIdx(i => (i !== null ? Math.max(0, i - 1) : null));
  const next = () => setLightboxIdx(i => (i !== null ? Math.min(proofs.length - 1, i + 1) : null));

  return (
    <div className="space-y-8">

      {/* Payment Proofs Gallery */}
      <div>
        <h2 className="text-base font-semibold text-white mb-4">
          Payment Proof Gallery <span className="text-gray-500 text-sm font-normal ml-1">({proofs.length})</span>
        </h2>

        {proofs.length === 0 ? (
          <div className="text-center py-16 text-gray-500 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p>No payment proofs uploaded for this donor.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {proofs.map((p, i) => (
              <div key={i} className="group relative rounded-2xl overflow-hidden aspect-video cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                onClick={() => setLightboxIdx(i)}>
                <img src={p.url} alt={`Proof ${p.donId}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 flex flex-col justify-between p-3 opacity-0 group-hover:opacity-100 transition"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}>
                  <div className="flex justify-end">
                    <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center">
                      <ZoomIn className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] text-white/70">{p.donId}</p>
                    <p className="text-xs text-white/50">{p.date}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Receipts */}
      <div>
        <h2 className="text-base font-semibold text-white mb-4">
          Receipts & Documents <span className="text-gray-500 text-sm font-normal ml-1">({receipts.length})</span>
        </h2>

        {receipts.length === 0 ? (
          <div className="text-center py-10 text-gray-500 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p>No receipts available.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {receipts.map((r, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <p className="text-sm text-white font-medium">Donation Receipt</p>
                  <p className="font-mono text-xs text-gray-500">{r.donId} · INR {r.amount.toLocaleString()}</p>
                </div>
                <a href={r.url} download
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-gray-300 hover:text-white transition"
                  style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && proofs[lightboxIdx] && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
          onClick={() => setLightboxIdx(null)}>
          <button onClick={e => { e.stopPropagation(); prev(); }}
            className="absolute left-4 p-3 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
            disabled={lightboxIdx === 0}>
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="max-w-4xl max-h-[90vh] flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <img src={proofs[lightboxIdx].url} alt="Payment Proof"
              className="max-w-full max-h-[80vh] rounded-2xl object-contain" />
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400 font-mono">{proofs[lightboxIdx].donId}</span>
              <a href={proofs[lightboxIdx].url} download
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white transition"
                style={{ background: 'rgba(255,249,221,0.1)', border: '1px solid rgba(255,249,221,0.2)' }}>
                <Download className="w-4 h-4" /> Download
              </a>
            </div>
            <p className="text-sm text-gray-500">{lightboxIdx + 1} / {proofs.length}</p>
          </div>

          <button onClick={e => { e.stopPropagation(); next(); }}
            className="absolute right-4 p-3 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
            disabled={lightboxIdx === proofs.length - 1}>
            <ChevronRight className="w-5 h-5" />
          </button>

          <button onClick={() => setLightboxIdx(null)}
            className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
