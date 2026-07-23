'use client';

import { useState, useMemo } from 'react';
import { Cpu, RefreshCw, Sparkles } from 'lucide-react';

function generateSummary(donor: any, donations: any[], communications: any[]): string {
  const total = donations.reduce((s: number, d: any) => s + (d.amount || 0), 0) || donor.totalAmountDonated || 0;
  const count = donations.length || donor.totalDonations || 0;
  const sorted = [...donations].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Preferred cause
  const causeTotals: Record<string, { name: string; total: number }> = {};
  donations.forEach((d: any) => {
    (d.selectedCauses || []).forEach((c: any) => {
      if (!causeTotals[c.causeId]) causeTotals[c.causeId] = { name: c.causeName, total: 0 };
      causeTotals[c.causeId].total += c.allocatedAmount || 0;
    });
  });
  const preferred = Object.values(causeTotals).sort((a, b) => b.total - a.total)[0];

  // Duration
  const firstDate = first?.date ? new Date(first.date) : null;
  const lastDate = last?.date ? new Date(last.date) : null;
  const months = firstDate && lastDate
    ? Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 30)))
    : 0;

  const pending = donations.filter((d: any) => d.status === 'pending').length;
  const commCount = communications.length;

  const lines: string[] = [];
  lines.push(`RELATIONSHIP OVERVIEW`);
  lines.push(`─────────────────────`);
  lines.push(`${donor.name || 'This donor'} has maintained an active relationship with Daarayn Foundation${months > 0 ? ` for approximately ${months} month${months > 1 ? 's' : ''}` : ''}.`);
  lines.push('');

  lines.push(`LIFETIME SUPPORT`);
  lines.push(`─────────────────────`);
  lines.push(`Lifetime contribution: INR ${total.toLocaleString()} across ${count} donation${count !== 1 ? 's' : ''}.`);
  if (preferred) {
    lines.push(`Preferred cause: ${preferred.name} (INR ${preferred.total.toLocaleString()} allocated).`);
  }
  lines.push('');

  lines.push(`CONTRIBUTION BEHAVIOUR`);
  lines.push(`─────────────────────`);
  if (first) lines.push(`First contribution: ${first.date} — INR ${(first.amount || 0).toLocaleString()}.`);
  if (last && count > 1) lines.push(`Most recent contribution: ${last.date} — INR ${(last.amount || 0).toLocaleString()}.`);
  if (months > 0 && count > 0) {
    const freq = (count / months).toFixed(1);
    lines.push(`Contribution frequency: ~${freq} donation${parseFloat(freq) !== 1 ? 's' : ''} per month.`);
  }
  lines.push('');

  lines.push(`COMMUNICATION HISTORY`);
  lines.push(`─────────────────────`);
  lines.push(commCount > 0
    ? `${commCount} communication${commCount !== 1 ? 's' : ''} have been sent to this donor. Engagement channels: ${donor.communicationPreference || 'Email'}.`
    : `No formal communications have been dispatched to this donor yet.`);
  lines.push('');

  lines.push(`PENDING ACTIONS`);
  lines.push(`─────────────────────`);
  if (pending > 0) {
    lines.push(`⚠ ${pending} contribution${pending > 1 ? 's' : ''} pending verification. Immediate review recommended.`);
  } else {
    lines.push(`✓ All contributions are verified and up to date. No pending actions.`);
  }
  lines.push('');

  lines.push(`RECOMMENDED FOLLOW-UP`);
  lines.push(`─────────────────────`);
  const daysSinceLast = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
  if (daysSinceLast !== null && daysSinceLast > 90) {
    lines.push(`Last contribution was ${daysSinceLast} days ago. A personalised outreach email is recommended to re-engage this donor.`);
  } else if (preferred) {
    lines.push(`Send a project progress update for ${preferred.name} to reinforce transparency and build long-term trust.`);
  } else {
    lines.push(`Maintain regular communication with this donor through project updates and impact reports.`);
  }

  return lines.join('\n');
}

export default function KhizrTab({ donor, donations, communications }: any) {
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);

  const summary = useMemo(() => generateSummary(donor, donations, communications), [donor, donations, communications]);

  const handleGenerate = () => {
    setLoading(true);
    setTimeout(() => { setGenerated(true); setLoading(false); }, 1200);
  };

  return (
    <div className="max-w-3xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-luxury-gold/60" />
            <h2 className="text-base font-semibold text-white">Khizr Executive Summary</h2>
          </div>
          <p className="text-sm text-gray-400">AI-generated relationship summary. Visible to administrators only.</p>
        </div>
        <button onClick={handleGenerate} disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition disabled:opacity-50 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, rgba(255,249,221,0.12), rgba(255,249,221,0.06))', border: '1px solid rgba(255,249,221,0.2)' }}>
          {loading
            ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating…</>
            : <><Sparkles className="w-3.5 h-3.5" /> {generated ? 'Regenerate' : 'Generate Summary'}</>}
        </button>
      </div>

      {!generated && !loading && (
        <div className="text-center py-20 rounded-2xl space-y-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Cpu className="w-12 h-12 mx-auto text-gray-700" />
          <p className="text-gray-400 text-sm">Click "Generate Summary" to create an AI executive brief for this donor.</p>
          <p className="text-gray-600 text-xs max-w-md mx-auto">
            Khizr analyses contribution patterns, communication history, and cause alignment to produce a concise relationship summary.
          </p>
        </div>
      )}

      {loading && (
        <div className="text-center py-20 rounded-2xl space-y-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,249,221,0.08)' }}>
          <div className="w-8 h-8 border-2 border-luxury-gold border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400">Analysing donor relationship data…</p>
        </div>
      )}

      {generated && !loading && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,249,221,0.1)' }}>
          <div className="flex items-center gap-3 px-5 py-3 border-b"
            style={{ borderColor: 'rgba(255,249,221,0.08)', background: 'rgba(255,249,221,0.03)' }}>
            <Sparkles className="w-3.5 h-3.5 text-luxury-gold/50" />
            <span className="text-[10px] uppercase tracking-widest text-luxury-gold/50 font-semibold">Khizr — AI Executive Brief</span>
          </div>
          <pre className="p-6 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap font-sans overflow-x-auto">
            {summary}
          </pre>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[11px] text-gray-600 leading-relaxed">
        This summary is generated algorithmically from available Firestore data. It is an internal tool for administrators only and is not a substitute for direct donor communication. Never share this document externally.
      </p>
    </div>
  );
}
