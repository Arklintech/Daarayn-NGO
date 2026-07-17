'use client';

import { useState } from 'react';
import { Mail, X, CheckCircle, Clock, AlertCircle } from 'lucide-react';

const TYPE_LABELS: Record<string, string> = {
  contribution_confirmation: 'Contribution Confirmation',
  project_progress: 'Project Progress Update',
  allocation_confirmation: 'Allocation Confirmation',
  completion_report: 'Completion Report',
  general_communication: 'General Communication',
};

const STATUS_DOT: Record<string, string> = {
  sent: 'bg-emerald-400',
  queued: 'bg-amber-400',
  failed: 'bg-red-400',
};

function EmailPreviewModal({ comm, onClose }: { comm: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl"
        style={{ background: '#0d1628', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{TYPE_LABELS[comm.type] || comm.type}</p>
            <h3 className="text-base font-semibold text-white mt-0.5">{comm.subject || 'Email Preview'}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Email meta */}
        <div className="px-6 py-4 space-y-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
          {[
            ['Date Sent', comm.sentDate],
            ['Status', comm.status],
            ['Cause', comm.causeId || '—'],
            ['Created By', comm.createdBy || '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-4 text-sm">
              <span className="text-gray-500 w-24 flex-shrink-0">{k}</span>
              <span className="text-white capitalize">{v}</span>
            </div>
          ))}
        </div>

        {/* Email body */}
        <div className="p-6">
          <div className="rounded-2xl p-5 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', fontFamily: 'Georgia, serif' }}>
            {comm.message || 'No message body available.'}
          </div>
          {comm.media?.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Attached Media</p>
              <div className="flex flex-wrap gap-2">
                {comm.media.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"
                    className="text-xs text-luxury-gold/70 hover:text-luxury-gold transition underline">
                    Media {i + 1}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CommunicationsTab({ communications, donor }: any) {
  const [selected, setSelected] = useState<any>(null);

  const sorted = [...communications].sort((a, b) =>
    new Date(b.sentDate || 0).getTime() - new Date(a.sentDate || 0).getTime()
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">
          Communication History <span className="text-gray-500 text-sm font-normal ml-1">({communications.length})</span>
        </h2>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-20 text-gray-500 space-y-2">
          <Mail className="w-10 h-10 mx-auto text-gray-700" />
          <p>No communications sent to this donor yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(c => (
            <div key={c.id} onClick={() => setSelected(c)}
              className="group flex items-start gap-4 p-4 rounded-2xl cursor-pointer transition hover:border-luxury-gold/20"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>

              {/* Type icon */}
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,249,221,0.07)', border: '1px solid rgba(255,249,221,0.12)' }}>
                <Mail className="w-4 h-4 text-luxury-gold/60" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white truncate">{c.subject || TYPE_LABELS[c.type] || c.type}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{TYPE_LABELS[c.type] || c.type}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-xs text-gray-500 font-mono">{c.sentDate || '—'}</span>
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      c.status === 'sent' ? 'bg-emerald-500/10 text-emerald-400' :
                      c.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                      'bg-amber-500/10 text-amber-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[c.status] || 'bg-gray-400'}`} />
                      {c.status || 'sent'}
                    </span>
                  </div>
                </div>
                {c.causeId && (
                  <p className="text-xs text-gray-500 mt-1.5 truncate">Cause: {c.causeId}</p>
                )}
              </div>

              <div className="text-xs text-gray-600 group-hover:text-luxury-gold transition self-center flex-shrink-0">
                Preview →
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && <EmailPreviewModal comm={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
