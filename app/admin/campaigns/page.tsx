'use client';

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { 
  Flame, 
  Plus, 
  Edit2, 
  Trash2, 
  Save, 
  X, 
  Activity,
  Calendar,
  Users
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminCampaigns() {
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editMode, setEditMode] = useState<"create" | "update">("create");
  
  const [formState, setFormState] = useState({ 
    id: "", 
    title: "", 
    description: "",
    status: "Active", 
    targetAmount: 0, 
    raisedAmount: 0,
    startDate: "",
    endDate: ""
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "campaigns"));
      const list: any[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setCampaigns(list);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleOpenEditor = (mode: "create" | "update", item?: any) => {
    setEditMode(mode);
    if (mode === "update" && item) {
      setFormState({ ...item });
    } else {
      setFormState({ 
        id: "", 
        title: "", 
        description: "",
        status: "Active", 
        targetAmount: 0, 
        raisedAmount: 0,
        startDate: new Date().toISOString().split('T')[0],
        endDate: ""
      });
    }
    setIsEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const id = formState.id || `camp_${Date.now()}`;
      await setDoc(doc(db, "campaigns", id), { ...formState, id });
      setIsEditorOpen(false);
      fetchData();
    } catch(e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this campaign?")) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, "campaigns", id));
      setCampaigns(prev => prev.filter(c => c.id !== id));
    } catch(e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white font-playfair flex items-center gap-3">
            Active Campaigns
          </h1>
          <p className="mt-2 text-gray-400 text-sm max-w-3xl leading-relaxed">
            Manage time-sensitive fundraising drives and special campaigns.
          </p>
        </div>
        <button 
          onClick={() => handleOpenEditor("create")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-luxury-ivory to-white hover:brightness-105 active:scale-[0.98] text-black font-semibold text-xs tracking-wider transition"
        >
          <Plus className="w-4 h-4" /> New Campaign
        </button>
      </div>

      {loading && campaigns.length === 0 ? (
        <div className="flex h-[40vh] items-center justify-center">
          <Activity className="h-8 w-8 animate-spin text-[var(--gold)]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mt-6">
          {campaigns.map((camp) => (
            <motion.div
              key={camp.id}
              className="rounded-3xl admin-glass border border-white/[0.06] overflow-hidden flex flex-col hover:border-luxury-ivory/20 transition duration-300 relative group"
            >
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center">
                    <Flame className="w-6 h-6 text-orange-400" />
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                    camp.status === "Active" 
                      ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/20"
                      : "bg-gray-800 text-gray-400 border-white/[0.08]"
                  }`}>
                    {camp.status}
                  </span>
                </div>
                
                <h3 className="text-lg font-bold text-white tracking-wide font-playfair">{camp.title}</h3>
                <p className="text-xs text-gray-400 mt-2 line-clamp-2">{camp.description}</p>
                
                <div className="mt-6 space-y-3 flex-1">
                  <div>
                    <div className="flex justify-between text-[10px] font-semibold text-gray-400 mb-1">
                      <span>CAMPAIGN PROGRESS</span>
                      <span className="text-white">{Math.round((camp.raisedAmount / (camp.targetAmount || 1)) * 100)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div className="h-full bg-luxury-ivory rounded-full" style={{ width: `${Math.round((camp.raisedAmount / (camp.targetAmount || 1)) * 100)}%` }}></div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-[10px] font-semibold">
                    <div className="p-2.5 rounded-xl bg-white/[0.01] border border-white/[0.04]">
                      <span className="text-gray-500 block uppercase text-[8px] tracking-wider">Target</span>
                      <span className="text-white font-bold block mt-0.5">₹{(camp.targetAmount || 0).toLocaleString()}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/[0.01] border border-white/[0.04]">
                      <span className="text-gray-500 block uppercase text-[8px] tracking-wider">Raised</span>
                      <span className="text-luxury-ivory font-bold block mt-0.5">₹{(camp.raisedAmount || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 mt-4 border-t border-white/[0.04]">
                  <button 
                    onClick={() => handleOpenEditor("update", camp)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-[10px] font-bold text-white transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button 
                    onClick={() => handleDelete(camp.id)}
                    className="p-2 rounded-xl bg-red-950/20 border border-red-500/10 hover:bg-red-900/30 text-red-400 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
          {campaigns.length === 0 && (
            <div className="col-span-full py-12 text-center border border-white/5 rounded-3xl bg-white/[0.02]">
              <Flame className="w-12 h-12 text-gray-600 mx-auto mb-4 opacity-50" />
              <h3 className="text-white font-medium">No Active Campaigns</h3>
              <p className="text-sm text-gray-500 mt-1">Create a new campaign to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Editor Modal */}
      <AnimatePresence>
        {isEditorOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsEditorOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-xl p-6 rounded-3xl admin-glass border border-white/[0.08] relative z-10 text-xs"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-6">
                <h3 className="text-base font-bold text-white font-playfair uppercase tracking-wider">
                  {editMode === "create" ? "Create Campaign" : "Edit Campaign"}
                </h3>
                <button onClick={() => setIsEditorOpen(false)} className="p-1.5 rounded-lg border border-white/[0.08] hover:bg-white/[0.04]">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Campaign Title</label>
                  <input type="text" required value={formState.title} onChange={e => setFormState(p => ({ ...p, title: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory" />
                </div>
                <div>
                  <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Description</label>
                  <textarea rows={3} required value={formState.description} onChange={e => setFormState(p => ({ ...p, description: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Target (₹)</label>
                    <input type="number" required value={formState.targetAmount} onChange={e => setFormState(p => ({ ...p, targetAmount: Number(e.target.value) }))} className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory" />
                  </div>
                  <div>
                    <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Status</label>
                    <select value={formState.status} onChange={e => setFormState(p => ({ ...p, status: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl bg-[#06120c] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory">
                      <option value="Active">Active</option>
                      <option value="Completed">Completed</option>
                      <option value="Archived">Archived</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-6 border-t border-white/[0.06] justify-end">
                  <button type="button" onClick={() => setIsEditorOpen(false)} className="px-5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] font-bold text-gray-400 hover:text-white transition">Cancel</button>
                  <button type="submit" className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-luxury-ivory to-white text-black font-semibold tracking-wide transition flex items-center gap-1.5 shadow-lg">
                    <Save className="w-4 h-4" /> Save Campaign
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
