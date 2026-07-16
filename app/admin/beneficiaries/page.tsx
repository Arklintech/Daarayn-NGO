'use client';

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { 
  Users2, 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  Save, 
  CheckCircle, 
  AlertCircle,
  FileCheck,
  Search
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminBeneficiaries() {
  const [beneficiaries, setBeneficiaries] = useState<any[]>([]);
  const [filteredList, setFilteredList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editMode, setEditMode] = useState<"create" | "update">("create");
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [formState, setFormState] = useState<any>({
    name: "",
    familyDetails: "",
    location: "",
    contact: "",
    caseType: "Family Relief",
    status: "Verified",
    assistanceHistory: ""
  });

  const loadBeneficiaries = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "beneficiaries"));
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setBeneficiaries(list);
      setFilteredList(list);
    } catch (err) {
      console.warn("Beneficiary load error, loading mocks:", err);
      const mocks = [
        { id: "ben_001", name: "Zainab Bi", familyDetails: "Widowed mother with 4 kids, primary support needed for education and house rent", location: "Kalyan, Maharashtra", contact: "+919988776655", caseType: "Family Relief", status: "Verified", assistanceHistory: "₹30,000 rent grant disbursed on June 2026." },
        { id: "ben_002", name: "Sheikh Arham", familyDetails: "Student memorizing Qur'an, belongs to underprivileged family of 6", location: "Mumbra, Thane", contact: "+918877665544", caseType: "Qur’an Endowment", status: "Verified", assistanceHistory: "₹2,000 monthly study scholarship ongoing." }
      ];
      setBeneficiaries(mocks);
      setFilteredList(mocks);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBeneficiaries();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredList(beneficiaries);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredList(beneficiaries.filter(item => 
      item.name.toLowerCase().includes(q) ||
      item.location.toLowerCase().includes(q) ||
      item.caseType.toLowerCase().includes(q)
    ));
  }, [searchQuery, beneficiaries]);

  const handleOpenEditor = (mode: "create" | "update", item?: any) => {
    setEditMode(mode);
    if (mode === "update" && item) {
      setCurrentId(item.id);
      setFormState({ ...item });
    } else {
      setCurrentId(null);
      setFormState({
        name: "",
        familyDetails: "",
        location: "",
        contact: "",
        caseType: "Family Relief",
        status: "Verified",
        assistanceHistory: ""
      });
    }
    setIsEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const generatedId = currentId || `ben_${Date.now()}`;
      await setDoc(doc(db, "beneficiaries", generatedId), {
        id: generatedId,
        ...formState
      });
      setIsEditorOpen(false);
      loadBeneficiaries();
    } catch (err) {
      console.error("Save beneficiary error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this beneficiary record?")) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, "beneficiaries", id));
      loadBeneficiaries();
    } catch (err) {
      console.error("Delete beneficiary error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        {/* Search */}
        <div className="relative w-full sm:w-auto min-w-[280px]">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search beneficiary registry..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none"
          />
        </div>

        <button 
          onClick={() => handleOpenEditor("create")}
          className="flex items-center gap-2 px-4.5 py-2.5 rounded-xl bg-gradient-to-r from-luxury-ivory to-white hover:brightness-105 active:scale-[0.98] text-black font-semibold tracking-wider transition w-full sm:w-auto justify-center"
        >
          <Plus className="w-4 h-4" /> Add Beneficiary
        </button>
      </div>

      {/* Grid of Beneficiaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredList.map((item) => (
          <motion.div
            key={item.id}
            className="p-5 rounded-3xl admin-glass border border-white/[0.06] flex flex-col justify-between space-y-4 hover:border-luxury-ivory/20 transition duration-300"
          >
            <div>
              <div className="flex items-center justify-between mb-3.5">
                <span className="text-[9px] font-bold text-luxury-ivory uppercase tracking-widest">{item.caseType}</span>
                <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                  item.status === "Verified" 
                    ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/20"
                    : "bg-amber-950/40 text-amber-300 border-amber-500/20"
                }`}>
                  {item.status === "Verified" ? <CheckCircle className="w-2.5 h-2.5" /> : <AlertCircle className="w-2.5 h-2.5" />}
                  {item.status}
                </span>
              </div>
              <h3 className="text-sm font-bold text-white font-playfair">{item.name}</h3>
              <p className="text-gray-400 text-[10px] leading-relaxed mt-2"><span className="font-semibold text-gray-500 uppercase tracking-wider block text-[8px] mb-0.5">Family Details</span> {item.familyDetails}</p>
              <p className="text-gray-400 text-[10px] leading-relaxed mt-3"><span className="font-semibold text-gray-500 uppercase tracking-wider block text-[8px] mb-0.5">Assistance History</span> {item.assistanceHistory || "None recorded"}</p>
            </div>

            <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between text-[10px]">
              <div className="text-gray-500">
                <span className="block text-[8px] uppercase tracking-wider">Contact</span>
                <span className="text-white font-medium">{item.contact} ({item.location})</span>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleOpenEditor("update", item)}
                  className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-white transition"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => handleDelete(item.id)}
                  className="p-2 rounded-xl bg-red-950/20 border border-red-500/10 hover:bg-red-900/30 text-red-400 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Editor drawer */}
      <AnimatePresence>
        {isEditorOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditorOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-md p-6 rounded-3xl admin-glass border border-white/[0.08] relative z-10 text-xs"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-6">
                <h3 className="text-sm font-bold text-white font-playfair uppercase tracking-wider">
                  {editMode === "create" ? "Add Beneficiary File" : "Edit Beneficiary Record"}
                </h3>
                <button onClick={() => setIsEditorOpen(false)}>
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Beneficiary Name</label>
                  <input 
                    type="text" 
                    required
                    value={formState.name}
                    onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory"
                  />
                </div>

                <div>
                  <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Family Details & Conditions</label>
                  <textarea 
                    rows={3}
                    required
                    value={formState.familyDetails}
                    onChange={(e) => setFormState(prev => ({ ...prev, familyDetails: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Contact Number</label>
                    <input 
                      type="text" 
                      required
                      value={formState.contact}
                      onChange={(e) => setFormState(prev => ({ ...prev, contact: e.target.value }))}
                      className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Location / City</label>
                    <input 
                      type="text" 
                      required
                      value={formState.location}
                      onChange={(e) => setFormState(prev => ({ ...prev, location: e.target.value }))}
                      className="w-full px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Case Type</label>
                    <select 
                      value={formState.caseType}
                      onChange={(e) => setFormState(prev => ({ ...prev, caseType: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-[#06120c] border border-white/[0.08] text-white"
                    >
                      <option value="Family Relief">Family Relief</option>
                      <option value="Qur’an Endowment">Qur’an Endowment</option>
                      <option value="Masjid Infrastructure">Masjid Infrastructure</option>
                      <option value="Clean Water Fund">Clean Water Fund</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Verification Status</label>
                    <select 
                      value={formState.status}
                      onChange={(e) => setFormState(prev => ({ ...prev, status: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-[#06120c] border border-white/[0.08] text-white"
                    >
                      <option value="Verified">Verified</option>
                      <option value="Pending Verification">Pending Verification</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Assistance History Log</label>
                  <input 
                    type="text" 
                    value={formState.assistanceHistory}
                    onChange={(e) => setFormState(prev => ({ ...prev, assistanceHistory: e.target.value }))}
                    placeholder="e.g. rent support ₹30,000 on June 2026."
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-3 pt-4 border-t border-white/[0.06] justify-end">
                  <button 
                    type="button" 
                    onClick={() => setIsEditorOpen(false)}
                    className="px-5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-gray-400"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-luxury-ivory to-white text-black font-semibold"
                  >
                    Save Record
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
