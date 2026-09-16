"use client";

import React, { useEffect, useState } from "react";
import { Donation } from "@/lib/db";
import Link from "next/link";
import { 
  Heart, 
  Stethoscope, 
  Building2, 
  BookOpen, 
  GraduationCap, 
  Droplets, 
  Baby, 
  AlertTriangle, 
  Globe2,
  ArrowRight,
  Activity,
  Users,
  Plus,
  X,
  Save
} from "lucide-react";
import { motion } from "framer-motion";

import { DEFAULT_CAUSES } from "@/lib/causes";

const CAUSE_STYLE_MAP: Record<string, { icon: any, color: string }> = {
  "clean-water-wells": { icon: Droplets, color: "from-blue-500 to-cyan-500" },
  "orphan-sponsorship": { icon: Baby, color: "from-amber-500 to-orange-500" },
  "emergency-food-aid": { icon: AlertTriangle, color: "from-red-500 to-rose-500" },
  "masjid-construction": { icon: Building2, color: "from-emerald-500 to-teal-500" },
  "healthcare-medical-fund": { icon: Stethoscope, color: "from-purple-500 to-pink-500" },
};


export default function CauseManagementCenter() {
  const [loading, setLoading] = useState(true);
  const [causesList, setCausesList] = useState<any[]>([]);
  const [causeStats, setCauseStats] = useState<Record<string, { raised: number, contributors: number }>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCause, setNewCause] = useState({ name: "", category: "General", goalAmount: 100000 });

  async function fetchData() {
      setLoading(true);
      try {
        // Fetch Unified Causes from Sheets-backed API
        const causesRes = await fetch("/api/causes");
        const causesData = await causesRes.json();
        let fetchedCauses: any[] = causesData.success && Array.isArray(causesData.causes)
          ? causesData.causes
          : [];

        if (fetchedCauses.length === 0) {
          fetchedCauses = DEFAULT_CAUSES;
        }
        setCausesList(fetchedCauses);

        // Fetch Donations from Sheets-backed API
        const donationsRes = await fetch("/api/admin/donations");
        const donationsData = await donationsRes.json();
        const donations: Donation[] = donationsData.success && Array.isArray(donationsData.donations)
          ? donationsData.donations
          : [];

        const stats: Record<string, { raised: number, contributors: Set<string> }> = {};
        fetchedCauses.forEach(c => {
          stats[c.id] = { raised: 0, contributors: new Set() };
        });

        donations.forEach(donation => {
          if (donation.selectedCauses && Array.isArray(donation.selectedCauses)) {
            donation.selectedCauses.forEach((cause: any) => {
              if (stats[cause.causeId]) {
                stats[cause.causeId].raised += cause.allocatedAmount;
                stats[cause.causeId].contributors.add(donation.donorId);
              }
            });
          }
        });

        const formattedStats: Record<string, { raised: number, contributors: number }> = {};
        Object.keys(stats).forEach(key => {
          formattedStats[key] = {
            raised: stats[key].raised,
            contributors: stats[key].contributors.size
          };
        });

        setCauseStats(formattedStats);
      } catch (err) {
        console.error("Failed to fetch cause stats", err);
        // Show DEFAULT_CAUSES so page is never blank
        setCausesList(DEFAULT_CAUSES);
      } finally {
        setLoading(false);
      }
    }

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateCause = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCause.name) return;
    
    try {
      const slug = newCause.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const causeId = slug || `cause_${Date.now()}`;
      
      const causeData = {
        id: causeId,
        title: newCause.name,
        name: newCause.name,
        slug: slug,
        description: `Support for ${newCause.name}`,
        category: newCause.category,
        targetAmount: Number(newCause.goalAmount),
        goalAmount: Number(newCause.goalAmount),
        raisedAmount: 0,
        status: "active",
        createdAt: new Date().toISOString(),
      };

      await fetch("/api/causes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(causeData),
      });

      setIsModalOpen(false);
      setNewCause({ name: "", category: "General", goalAmount: 100000 });
      fetchData();
    } catch (error) {
      console.error("Error creating cause:", error);
    }
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white font-playfair flex items-center gap-3">
            Cause Management Center
          </h1>
          <p className="mt-2 text-gray-400 text-sm max-w-3xl leading-relaxed">
            Executive dashboard for monitoring donor-directed contributions. Daarayn acts as a steward for these funds, ensuring every donation is perfectly mapped to the donor's intended cause with complete transparency and accountability.
          </p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[var(--gold)] text-gray-950 px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-yellow-500 transition-colors"
        >
          <Plus className="h-5 w-5" />
          Create Cause
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#1a2332] border border-white/10 rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white font-playfair">Add New Cause</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleCreateCause} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Cause Name</label>
                <input 
                  type="text" 
                  value={newCause.name} 
                  onChange={e => setNewCause({...newCause, name: e.target.value})}
                  className="w-full bg-[#0a121c] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--gold)]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Category</label>
                <input 
                  type="text" 
                  value={newCause.category} 
                  onChange={e => setNewCause({...newCause, category: e.target.value})}
                  className="w-full bg-[#0a121c] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--gold)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Goal Amount (₹)</label>
                <input 
                  type="number" 
                  value={newCause.goalAmount} 
                  onChange={e => setNewCause({...newCause, goalAmount: Number(e.target.value)})}
                  className="w-full bg-[#0a121c] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--gold)]"
                />
              </div>
              <div className="pt-4 flex justify-end">
                <button type="submit" className="bg-[var(--gold)] text-gray-950 px-6 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-yellow-500 w-full justify-center">
                  <Save className="h-5 w-5" />
                  Save Cause
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <Activity className="h-8 w-8 animate-spin text-[var(--gold)]" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {causesList.map((cause, index) => {
             const stats = causeStats[cause.id] || { raised: 0, contributors: 0 };
            const safeGoalAmount = cause.goalAmount || 0;
            const percentage = Math.min(100, Math.round((stats.raised / (safeGoalAmount || 1)) * 100)) || 0;
            
            // Map styles
            const style = CAUSE_STYLE_MAP[cause.id] || { icon: Heart, color: "from-gray-500 to-gray-900" };
            const Icon = style.icon;

            return (
              <motion.div
                key={cause.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link 
                  href={`/admin/causes/${cause.id}`}
                  className="block h-full relative group rounded-2xl border border-white/[0.08] bg-black/40 p-6 backdrop-blur-sm overflow-hidden transition-all duration-300 hover:border-[var(--gold)]/50 hover:bg-white/[0.02]"
                >
                  {/* Background Gradient */}
                  <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${style.color} rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity duration-500 -mr-10 -mt-10`} />

                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-gray-300 group-hover:text-white transition-colors" />
                        </div>
                        <h2 className="text-lg font-semibold text-white">{cause.name}</h2>
                      </div>
                      <ArrowRight className="w-5 h-5 text-gray-500 group-hover:text-[var(--gold)] transition-colors group-hover:translate-x-1" />
                    </div>

                    <div className="mt-2 space-y-1 flex-1">
                      <p className="text-sm text-gray-400">Total Raised</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-medium tracking-tight">₹{stats.raised.toLocaleString()}</p>
                        <p className="text-sm text-[#F2EEE3]/60 font-medium">/ ₹{(cause.goalAmount || 0).toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-[var(--gold)] font-semibold">{percentage}% Funded</span>
                        <span className="text-gray-400 flex items-center gap-1">
                          <Users className="w-3 h-3" /> {stats.contributors} {stats.contributors === 1 ? 'Contributor' : 'Contributors'}
                        </span>
                      </div>
                      <div className="w-full bg-white/[0.05] rounded-full h-1.5 overflow-hidden">
                        <motion.div 
                          className="bg-gradient-to-r from-[#e5c158] to-[#d4af37] h-full rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
