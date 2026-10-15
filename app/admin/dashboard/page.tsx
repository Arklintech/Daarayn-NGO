'use client';

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  UserPlus,
  XCircle,
  Target,
  MapPin,
  Landmark,
  BadgeIndianRupee,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from "recharts";
import { useRealtimeRefresh } from "@/lib/realtime/useRealtime";
import { DONATION_DATA_EVENTS, RealtimeEvent } from "@/lib/realtime/events";
import LiveStatus from "@/components/admin/LiveStatus";

const DASHBOARD_EVENTS = [...DONATION_DATA_EVENTS, RealtimeEvent.FIELD_REPORT_SUBMITTED, RealtimeEvent.FIELD_REPORT_UPDATE, RealtimeEvent.FIELD_REPORT_UPDATED];

interface DashboardData {
  readAt: string;
  stats: {
    totalDonations: number;
    completedDonations: number;
    pendingAmount: number;
    pendingDonations: number;
    rejectedAmount: number;
    rejectedDonations: number;
    averageVerifiedDonation: number;
    generalFundReceived: number;
    generalFundCount: number;
    totalDonors: number;
    newDonorsLast30Days: number;
    totalCauses: number;
    activeCampaigns: number;
    totalReports: number;
    reportsAwaitingReview: number;
  };
  statusBreakdown: { label: string; amount: number; count: number }[];
  recentDonations: { id: string; donor: string; cause: string; amount: number; date: string; status: string }[];
  monthlyTrend: { month: string; amount: number; pending: number }[];
  activity: { id: string; label: string; actor: string; entity: string; timestamp: string }[];
}

const STATUS_COLORS: Record<string, string> = { Verified: "#D4AF37", Pending: "rgba(252, 211, 77, 0.55)", Rejected: "rgba(248, 113, 113, 0.45)" };

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return "";
  const min = Math.round(ms / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const loadDashboard = useCallback(async () => {
    const seq = ++requestSeq.current;
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/dashboard", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (seq !== requestSeq.current) return; // a newer refresh is already on its way
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (err: any) {
      if (seq !== requestSeq.current) return;
      setError(err.message || "Failed to load dashboard");
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const liveStatus = useRealtimeRefresh(DASHBOARD_EVENTS, loadDashboard);

  const stats = data?.stats;
  const value = (fn: (s: NonNullable<typeof stats>) => string) => (stats ? fn(stats) : loading ? "…" : "—");

  const cardItems = [
    { title: "Total Donations", value: value((s) => inr(s.totalDonations)), change: value((s) => `${plural(s.completedDonations, "verified contribution")}`), icon: TrendingUp, color: "text-[#D4AF37]" },
    { title: "Awaiting Verification", value: value((s) => inr(s.pendingAmount)), change: value((s) => `${plural(s.pendingDonations, "donation")} to review`), icon: Clock, color: "text-amber-300" },
    { title: "Registered Donors", value: value((s) => String(s.totalDonors)), change: value((s) => `${s.newDonorsLast30Days} new in the last 30 days`), icon: UserPlus, color: "text-violet-300" },
    { title: "Rejected Submissions", value: value((s) => inr(s.rejectedAmount)), change: value((s) => `${plural(s.rejectedDonations, "submission")}, excluded from totals`), icon: XCircle, color: "text-red-400" },
    { title: "Average Verified Gift", value: value((s) => inr(s.averageVerifiedDonation)), change: "Across verified donations", icon: BadgeIndianRupee, color: "text-emerald-400" },
    { title: "General Fund", value: value((s) => inr(s.generalFundReceived)), change: value((s) => `${plural(s.generalFundCount, "verified donation")} not tied to a cause`), icon: Landmark, color: "text-blue-400" },
    { title: "Active Causes", value: value((s) => String(s.activeCampaigns)), change: value((s) => `of ${s.totalCauses} causes`), icon: Target, color: "text-teal-300" },
    { title: "Field Reports", value: value((s) => String(s.totalReports)), change: value((s) => `${s.reportsAwaitingReview} awaiting review`), icon: MapPin, color: "text-[#46c6f3]" },
  ];

  const trendData = data?.monthlyTrend ?? [];
  const trendPeak = trendData.some((m) => m.amount > 0)
    ? trendData.reduce((best, m) => (m.amount > best.amount ? m : best))
    : null;
  const breakdown = data?.statusBreakdown ?? [];
  const breakdownCount = breakdown.reduce((n, b) => n + b.count, 0);

  return (
    <div className="space-y-8">
      <div className="flex justify-end -mb-4">
        <LiveStatus status={liveStatus} updatedAt={data?.readAt ?? null} error={error} refreshing={refreshing && !loading} onRetry={loadDashboard} />
      </div>

      {error && !data && (
        <div className="p-4 rounded-2xl border border-red-500/20 bg-red-500/5 text-xs text-red-200" role="alert">
          Dashboard figures could not be loaded from Google Sheets: {error}
        </div>
      )}

      {/* Overview stats layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {cardItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06 }}
              className={`p-6 rounded-3xl admin-glass border border-white/[0.06] hover:border-luxury-gold/30 hover:shadow-[0_8px_30px_rgba(212,175,55,0.04)] transition duration-300 ${error && data ? "opacity-70" : ""}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">{item.title}</p>
                  <h3 className="text-2xl font-bold font-playfair text-white mt-1.5">{item.value}</h3>
                  <span className="text-[10px] text-gray-400 font-medium block mt-1">{item.change}</span>
                </div>
                <div className={`p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] ${item.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Graphs/Analytics panels */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Monthly Donation graph */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="xl:col-span-2 p-6 rounded-3xl admin-glass border border-white/[0.06]"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Donations Trend Analysis</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">Verified contributions per month, last 6 months (India time)</p>
            </div>
            {trendPeak && (
              <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Peak: {trendPeak.month}
              </span>
            )}
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorDonations" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#D4AF37" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="month" stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "rgba(6, 18, 12, 0.9)", border: "1px solid rgba(212, 175, 55, 0.2)", borderRadius: "12px" }}
                  labelStyle={{ color: "#D4AF37", fontSize: "11px", fontWeight: "bold" }}
                  itemStyle={{ color: "#fff", fontSize: "11px" }}
                  formatter={(value) => [inr(Number(value)), "Verified"]}
                />
                <Area type="monotone" dataKey="amount" stroke="#D4AF37" strokeWidth={2.5} fillOpacity={1} fill="url(#colorDonations)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Verification pipeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26 }}
          className="p-6 rounded-3xl admin-glass border border-white/[0.06]"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Verification Pipeline</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">All recorded donations by status</p>
            </div>
            <span className="text-[10px] text-[#46c6f3] bg-[#46c6f3]/10 border border-[#46c6f3]/25 px-2 py-0.5 rounded-full font-semibold">
              {plural(breakdownCount, "record")}
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdown} margin={{ top: 10, right: 0, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "rgba(6, 18, 12, 0.9)", border: "1px solid rgba(212, 175, 55, 0.2)", borderRadius: "12px" }}
                  itemStyle={{ color: "#fff", fontSize: "11px" }}
                  labelStyle={{ color: "#D4AF37", fontSize: "11px", fontWeight: "bold" }}
                  formatter={(value, _name, item: any) => [`${inr(Number(value))} · ${plural(item?.payload?.count ?? 0, "donation")}`, "Amount"]}
                />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {breakdown.map((entry) => (
                    <Cell key={entry.label} fill={STATUS_COLORS[entry.label] || "rgba(212, 175, 55, 0.3)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Bottom section: Recent donations & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Donations Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
          className="lg:col-span-2 p-6 rounded-3xl admin-glass border border-white/[0.06] overflow-hidden"
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Recent Contributions</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">Verification queue from public website</p>
            </div>
            <Link
              href="/admin/donations"
              className="text-[10px] text-luxury-gold font-bold uppercase tracking-wider flex items-center hover:underline transition-colors"
            >
              View All <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-gray-500 font-semibold">
                  <th className="py-2.5">ID</th>
                  <th className="py-2.5">Donor Name</th>
                  <th className="py-2.5">Target Cause</th>
                  <th className="py-2.5">Amount</th>
                  <th className="py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03] text-gray-300">
                {(data?.recentDonations ?? []).map((item, idx) => (
                  <tr key={`${item.id}-${idx}`} className="hover:bg-white/[0.01] transition-colors">
                    <td className="py-3 font-semibold text-white">{item.id}</td>
                    <td className="py-3 font-medium">{item.donor}</td>
                    <td className="py-3 text-gray-400">{item.cause}</td>
                    <td className="py-3 font-bold text-luxury-gold">{inr(item.amount)}</td>
                    <td className="py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-semibold border ${
                        item.status === "completed"
                          ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/20"
                          : item.status === "rejected"
                          ? "bg-red-950/40 text-red-300 border-red-500/20"
                          : "bg-amber-950/40 text-amber-300 border-amber-500/20"
                      }`}>
                        {item.status === "completed" ? <CheckCircle className="w-2.5 h-2.5" /> : item.status === "rejected" ? <XCircle className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                        {item.status === "completed" ? "Verified" : item.status === "rejected" ? "Rejected" : "Pending"}
                      </span>
                    </td>
                  </tr>
                ))}
                {data && data.recentDonations.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-500">No donations recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38 }}
          className="p-6 rounded-3xl admin-glass border border-white/[0.06]"
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Audit Security Log</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">Latest entries from the audit log</p>
            </div>
            <AlertCircle className="w-4 h-4 text-luxury-gold" />
          </div>

          <div className="space-y-4">
            {(data?.activity ?? []).map((entry, idx) => (
              <div key={entry.id} className="flex items-start gap-3 text-[11px] leading-relaxed">
                <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${idx === 0 ? "bg-luxury-gold" : "bg-emerald-500"}`}></div>
                <div className="min-w-0">
                  <p className="text-gray-200">
                    <span className="font-semibold text-white">{entry.label}</span>
                    {entry.entity && <span className="text-gray-400"> · {entry.entity}</span>}
                  </p>
                  <span className="text-[9px] text-gray-500 block mt-0.5 truncate">{entry.actor} · {timeAgo(entry.timestamp)}</span>
                </div>
              </div>
            ))}
            {data && data.activity.length === 0 && <p className="text-[11px] text-gray-500">No audit entries yet.</p>}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
