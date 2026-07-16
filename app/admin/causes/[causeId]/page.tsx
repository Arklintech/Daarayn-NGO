"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { Donation } from "@/lib/db";
import {
  ArrowLeft, 
  Heart, 
  Stethoscope, 
  Building2, 
  BookOpen, 
  GraduationCap, 
  Droplets, 
  Baby, 
  AlertTriangle, 
  Globe2,
  TrendingUp,
  Activity,
  Users,
  BadgeCheck,
  Calendar,
  ExternalLink
} from "lucide-react";
import { motion } from "framer-motion";
import CauseMediaTab from "@/components/admin/CauseMediaTab";
import CauseReportsTab from "@/components/admin/CauseReportsTab";
import CauseAnalyticsTab from "@/components/admin/CauseAnalyticsTab";

const CAUSE_STYLE_MAP: Record<string, { icon: any, color: string }> = {
  "family-relief-bundle": { icon: Heart, color: "from-rose-500 to-rose-900" },
  "orphan-care-sponsor": { icon: Baby, color: "from-violet-500 to-violet-900" },
  "masjid-al-noor-const": { icon: Building2, color: "from-emerald-500 to-emerald-900" },
  "sheikh-arham-sponsorship": { icon: GraduationCap, color: "from-amber-500 to-amber-900" },
};

export default function CauseWorkspace() {
  const params = useParams();
  const router = useRouter();
  const causeId = params.causeId as string;

  const [loading, setLoading] = useState(true);
  const [cause, setCause] = useState<any>(null);
  const [contributions, setContributions] = useState<(Donation & { allocatedAmount: number })[]>([]);
  const [stats, setStats] = useState({
    raised: 0,
    contributors: 0,
    average: 0,
    largest: 0,
    uniqueDonors: [] as any[]
  });

  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    async function fetchCauseAndContributions() {
      try {
        // Fetch Cause details
        const causeDoc = await getDoc(doc(db, "causes", causeId));
        if (!causeDoc.exists()) {
          router.push("/admin/causes");
          return;
        }
        setCause({ id: causeDoc.id, ...causeDoc.data() });
        const q = query(
          collection(db, "donations"), 
          where("status", "in", ["completed", "pending"])
        );
        const snap = await getDocs(q);
        
        let totalRaised = 0;
        let largest = 0;
        const uniqueContributorsMap = new Map<string, { id: string, email: string, name: string }>();
        const mappedContributions: (Donation & { allocatedAmount: number })[] = [];

        snap.docs.forEach(doc => {
          const donation = doc.data() as Donation;
          if (donation.selectedCauses && Array.isArray(donation.selectedCauses)) {
            const matchedCause = donation.selectedCauses.find(c => c.causeId === causeId);
            
            if (matchedCause) {
              if (donation.status === "completed") {
                totalRaised += matchedCause.allocatedAmount;
                const email = donation.donorEmail || donation.donorId; // Fallback to ID if no email on donation object
                if (!uniqueContributorsMap.has(email)) {
                  uniqueContributorsMap.set(email, {
                    id: donation.donorId,
                    email: email,
                    name: donation.donorName || "Anonymous"
                  });
                }
                
                if (matchedCause.allocatedAmount > largest) {
                  largest = matchedCause.allocatedAmount;
                }
              }
              
              mappedContributions.push({
                ...donation,
                allocatedAmount: matchedCause.allocatedAmount
              });
            }
          }
        });

        mappedContributions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        setContributions(mappedContributions);
        setStats({
          raised: totalRaised,
          contributors: uniqueContributorsMap.size,
          average: uniqueContributorsMap.size > 0 ? Math.round(totalRaised / uniqueContributorsMap.size) : 0,
          largest,
          uniqueDonors: Array.from(uniqueContributorsMap.values())
        });
      } catch (err) {
        console.error("Failed to fetch contributions", err);
      } finally {
        setLoading(false);
      }
    }

    fetchCauseAndContributions();
  }, [causeId, router]);

  if (!cause) return null;

  const style = CAUSE_STYLE_MAP[causeId] || { icon: Heart, color: "from-gray-500 to-gray-900" };
  const Icon = style.icon;
  const safeGoalAmount = cause.goalAmount || 0;
  const percentage = Math.min(100, Math.round((stats.raised / (safeGoalAmount || 1)) * 100)) || 0;

  return (
    <div className="space-y-8 pb-10">
      {/* Back & Title */}
      <div>
        <button 
          onClick={() => router.push("/admin/causes")}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Cause Management Center
        </button>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center">
            <Icon className="w-6 h-6 text-[var(--gold)]" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white font-playfair">{cause.name}</h1>
            <p className="text-gray-400 text-sm mt-1">Unified Enterprise Workspace</p>
          </div>
        </div>
      </div>

      {/* Workspace Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-2">
        {[
          { id: "overview", label: "Overview" },
          { id: "donations", label: "Donations" },
          { id: "donors", label: "Donors" },
          { id: "media", label: "Media" },
          { id: "reports", label: "Reports" },
          { id: "analytics", label: "Analytics" }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === t.id 
                ? "bg-[var(--gold)]/10 text-[var(--gold)]" 
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <Activity className="h-8 w-8 animate-spin text-[var(--gold)]" />
        </div>
      ) : (
        <>
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-[var(--gold)]/20 bg-[var(--gold)]/5 p-6 backdrop-blur-sm">
                  <h3 className="text-sm font-medium text-[var(--gold)]/80">Total Raised</h3>
                  <div className="mt-2 flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-white tracking-tight">₹{stats.raised.toLocaleString()}</p>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Goal: ₹{safeGoalAmount.toLocaleString()} ({percentage}%)</p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-white/10 bg-black/40 p-6 backdrop-blur-sm">
                  <h3 className="text-sm font-medium text-gray-400">Unique Contributors</h3>
                  <div className="mt-2 flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-white tracking-tight">{stats.contributors}</p>
                    <Users className="w-4 h-4 text-[var(--gold)]" />
                  </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl border border-white/10 bg-black/40 p-6 backdrop-blur-sm">
                  <h3 className="text-sm font-medium text-gray-400">Average Donation</h3>
                  <div className="mt-2 flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-white tracking-tight">₹{stats.average.toLocaleString()}</p>
                    <TrendingUp className="w-4 h-4 text-green-400" />
                  </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-xl border border-white/10 bg-black/40 p-6 backdrop-blur-sm">
                  <h3 className="text-sm font-medium text-gray-400">Largest Donation</h3>
                  <div className="mt-2 flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-white tracking-tight">₹{stats.largest.toLocaleString()}</p>
                    <BadgeCheck className="w-4 h-4 text-blue-400" />
                  </div>
                </motion.div>
              </div>

              {/* Progress Section */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="rounded-xl border border-white/10 bg-black/40 p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between text-sm mb-3">
                  <span className="text-gray-300 font-medium">Campaign Progress</span>
                  <span className="text-[var(--gold)] font-bold">{percentage}%</span>
                </div>
                <div className="w-full bg-white/[0.05] rounded-full h-3 overflow-hidden shadow-inner">
                  <motion.div 
                    className="bg-gradient-to-r from-[#e5c158] to-[#d4af37] h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
                  />
                </div>
              </motion.div>
            </div>
          )}

          {activeTab === "donations" && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Donor Contribution Ledger</h2>
                <span className="text-xs text-gray-400 px-3 py-1 bg-white/5 rounded-full border border-white/10">Immutable</span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-400 uppercase bg-white/[0.02] border-b border-white/10">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Donor</th>
                      <th className="px-6 py-4 font-semibold">Allocated</th>
                      <th className="px-6 py-4 font-semibold">Payment</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                      <th className="px-6 py-4 font-semibold">Proof</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {contributions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                          No contributions mapped to this cause yet.
                        </td>
                      </tr>
                    ) : (
                      contributions.map((contribution) => (
                        <tr key={contribution.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-gray-300">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-gray-500" />
                              {new Date(contribution.date).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-white">{contribution.anonymous ? "Anonymous Donor" : contribution.donorName}</div>
                            <div className="text-xs text-gray-500 font-mono mt-0.5">{contribution.id}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-bold text-[var(--gold)]">
                            ₹{contribution.allocatedAmount.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 py-1 bg-white/5 rounded text-xs text-gray-300 border border-white/10">
                              {contribution.paymentMethod}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {contribution.status === "completed" ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" /> Pending
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {contribution.proofUrl ? (
                              <a href={contribution.proofUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-xs">
                                View <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-gray-600 text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === "donors" && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Unique Donors List</h2>
                <span className="text-xs text-gray-400 px-3 py-1 bg-white/5 rounded-full border border-white/10">Derived from Verified Ledgers</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-400 uppercase bg-white/[0.02] border-b border-white/10">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Donor Name</th>
                      <th className="px-6 py-4 font-semibold">Email</th>
                      <th className="px-6 py-4 font-semibold">Donor ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {stats.uniqueDonors?.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-gray-500">
                          No verified donors yet.
                        </td>
                      </tr>
                    ) : (
                      stats.uniqueDonors?.map((donor: any, i: number) => (
                        <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-4 font-medium text-white">{donor.name}</td>
                          <td className="px-6 py-4 text-gray-400">{donor.email}</td>
                          <td className="px-6 py-4 font-mono text-xs text-gray-500">{donor.id}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === "media" && (
            <CauseMediaTab cause={cause} />
          )}

          {activeTab === "reports" && (
            <CauseReportsTab cause={cause} />
          )}

          {activeTab === "analytics" && (
            <CauseAnalyticsTab cause={cause} contributions={contributions} />
          )}
        </>
      )}
    </div>
  );
}

