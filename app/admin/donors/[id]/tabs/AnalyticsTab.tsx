'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Award, Calendar, Target, BarChart2 } from 'lucide-react';

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="p-5 rounded-2xl space-y-1"
      style={{
        background: accent ? 'rgba(255,249,221,0.05)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${accent ? 'rgba(255,249,221,0.15)' : 'rgba(255,255,255,0.06)'}`,
      }}>
      <p className="text-[10px] uppercase tracking-widest text-gray-500">{label}</p>
      <p className={`text-xl font-bold font-mono ${accent ? 'text-luxury-gold' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function MiniBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400 truncate max-w-[70%]">{label}</span>
        <span className="text-luxury-gold font-mono">INR {value.toLocaleString()}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, rgba(255,249,221,0.4), rgba(255,249,221,0.8))' }} />
      </div>
    </div>
  );
}

export default function AnalyticsTab({ donor, donations, causes }: any) {
  const stats = useMemo(() => {
    if (!donations.length) return null;

    const sorted = [...donations].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
    const amounts = donations.map((d: any) => d.amount || 0);
    const total = amounts.reduce((s: number, v: number) => s + v, 0);
    const avg = Math.round(total / donations.length);
    const max = Math.max(...amounts);
    const min = Math.min(...amounts);

    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    // Duration in months
    const monthsDiff = first && last
      ? Math.max(1, Math.round((new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24 * 30)))
      : 1;
    const frequency = (donations.length / monthsDiff).toFixed(1);

    // Preferred cause
    const causeCounts: Record<string, { name: string; total: number; count: number }> = {};
    donations.forEach((d: any) => {
      (d.selectedCauses || []).forEach((c: any) => {
        if (!causeCounts[c.causeId]) causeCounts[c.causeId] = { name: c.causeName, total: 0, count: 0 };
        causeCounts[c.causeId].total += c.allocatedAmount || 0;
        causeCounts[c.causeId].count++;
      });
    });
    const preferredCause = Object.values(causeCounts).sort((a, b) => b.total - a.total)[0];

    // Monthly trend (last 6 months)
    const months: Record<string, number> = {};
    donations.forEach((d: any) => {
      if (!d.date) return;
      const key = d.date.slice(0, 7); // YYYY-MM
      months[key] = (months[key] || 0) + (d.amount || 0);
    });
    const trend = Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6);

    return { total, avg, max, min, frequency, first, last, preferredCause, trend, causeCounts };
  }, [donations]);

  if (!stats) {
    return (
      <div className="text-center py-20 text-gray-500">
        <BarChart2 className="w-10 h-10 mx-auto text-gray-700 mb-3" />
        <p>No donation data available for analytics.</p>
      </div>
    );
  }

  const maxTrend = Math.max(...stats.trend.map(([, v]) => v), 1);

  return (
    <div className="space-y-6">

      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard label="Lifetime Giving" value={`INR ${stats.total.toLocaleString()}`} accent />
        <StatCard label="Largest Contribution" value={`INR ${stats.max.toLocaleString()}`} />
        <StatCard label="Average Contribution" value={`INR ${stats.avg.toLocaleString()}`} />
        <StatCard label="Total Donations" value={String(donations.length)} />
        <StatCard label="First Contribution" value={stats.first?.date || '—'} />
        <StatCard label="Latest Contribution" value={stats.last?.date || '—'} />
        <StatCard label="Frequency (per month)" value={stats.frequency} sub="approximate" />
        <StatCard
          label="Preferred Cause"
          value={stats.preferredCause?.name?.split(' ').slice(0, 2).join(' ') || '—'}
          sub={stats.preferredCause ? `INR ${stats.preferredCause.total.toLocaleString()}` : undefined}
        />
      </div>

      {/* Contribution Trend */}
      <div className="p-5 rounded-2xl space-y-4"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Monthly Contribution Trend</h3>
        {stats.trend.length === 0 ? (
          <p className="text-sm text-gray-500">Not enough data for trend.</p>
        ) : (
          <div className="flex items-end gap-2 h-28">
            {stats.trend.map(([month, val]) => {
              const pct = (val / maxTrend) * 100;
              return (
                <div key={month} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-[9px] text-gray-500 font-mono truncate">{`INR ${val > 999 ? (val / 1000).toFixed(1) + 'k' : val}`}</span>
                  <div className="w-full rounded-t-md transition-all duration-700"
                    style={{
                      height: `${Math.max(pct, 4)}%`,
                      background: 'linear-gradient(180deg, rgba(255,249,221,0.7), rgba(255,249,221,0.2))',
                      minHeight: '4px',
                    }} />
                  <span className="text-[9px] text-gray-600 font-mono truncate w-full text-center">{month.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cause breakdown */}
      {Object.keys(stats.causeCounts).length > 0 && (
        <div className="p-5 rounded-2xl space-y-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Cause Participation Breakdown</h3>
          <div className="space-y-3">
            {Object.values(stats.causeCounts)
              .sort((a, b) => b.total - a.total)
              .map(c => (
                <MiniBar key={c.name} label={c.name} value={c.total} max={stats.total} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
