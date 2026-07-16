'use client';

import React, { useState, useEffect } from "react";
import { db, storage } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { 
  BookMarked, 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  Save, 
  Upload, 
  FileCheck,
  Search,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminLedger() {
  const [ledger, setLedger] = useState<any[]>([]);
  const [filteredLedger, setFilteredLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Editor states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editMode, setEditMode] = useState<"create" | "update">("create");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Form State
  const [formState, setFormState] = useState<any>({
    donor: "",
    cause: "General Support",
    amount: 0,
    directAid: 0,
    opsCost: 0,
    status: "completed",
    date: "",
    refCode: "",
    proof: "✅ Verified Ledger Entry",
    proofUrl: ""
  });

  // Load ledger on mount
  const loadLedger = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "publicLedger"));
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => b.id.localeCompare(a.id));
      setLedger(list);
      setFilteredLedger(list);
    } catch (err) {
      console.warn("Ledger query error:", err);
      // Fallback logs
      const mocks = [
        { id: "DA003", donor: "Sabir Test (UPI)", cause: "Qur’an Endowment", amount: 5000, directAid: 4500, opsCost: 500, status: "completed", date: "05/07/2026", refCode: "UPI9988776655", proof: "✅ Verified Ledger Entry", proofUrl: "" },
        { id: "DA002", donor: "Ahmad Malik (UPI)", cause: "Family Relief Bundle", amount: 8000, directAid: 7200, opsCost: 800, status: "pending", date: "04/07/2026", refCode: "UPI5544332211", proof: "⏳ Check in progress", proofUrl: "" },
        { id: "DA001", donor: "Anonymous (UPI)", cause: "General Support", amount: 1500, directAid: 1350, opsCost: 150, status: "completed", date: "02/07/2026", refCode: "UPI1122334455", proof: "✅ Verified Ledger Entry", proofUrl: "" }
      ];
      setLedger(mocks);
      setFilteredLedger(mocks);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, []);

  // Filter based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredLedger(ledger);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredLedger(ledger.filter(item => 
      item.id.toLowerCase().includes(q) ||
      (item.donor && item.donor.toLowerCase().includes(q)) ||
      (item.cause && item.cause.toLowerCase().includes(q)) ||
      (item.refCode && item.refCode.toLowerCase().includes(q))
    ));
  }, [searchQuery, ledger]);

  const handleOpenEditor = (mode: "create" | "update", item?: any) => {
    setEditMode(mode);
    if (mode === "update" && item) {
      setCurrentId(item.id);
      setFormState({ ...item });
    } else {
      setCurrentId(null);
      
      const today = new Date();
      const formattedDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

      setFormState({
        donor: "",
        cause: "General Support",
        amount: 0,
        directAid: 0,
        opsCost: 0,
        status: "completed",
        date: formattedDate,
        refCode: "",
        proof: "✅ Verified Ledger Entry",
        proofUrl: ""
      });
    }
    setIsEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let finalTrackingId = currentId;
      if (!finalTrackingId) {
        const nextIndex = ledger.length + 1;
        finalTrackingId = 'DA' + String(nextIndex).padStart(3, '0');
      }

      const calculatedDirectAid = Math.floor(formState.amount * 0.9);
      const calculatedOpsCost = Math.floor(formState.amount * 0.1);

      const record = {
        ...formState,
        amount: Number(formState.amount),
        directAid: calculatedDirectAid,
        opsCost: calculatedOpsCost,
        createdAt: formState.createdAt || new Date().toISOString()
      };

      await setDoc(doc(db, "publicLedger", finalTrackingId), record);
      setIsEditorOpen(false);
      loadLedger();
    } catch (err) {
      console.error("Save ledger error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(`Warning: Deleting tracking log ${id} from public transparency records is high-risk. Proceed?`)) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, "publicLedger", id));
      loadLedger();
    } catch (err) {
      console.error("Delete ledger error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const storageRef = ref(storage, `ledger_documents/${Date.now()}_${file.name}`);
      const snap = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snap.ref);
      setFormState(prev => ({ ...prev, proofUrl: downloadUrl, proof: "📄 Receipt / Bill Uploaded" }));
    } catch (err) {
      console.error("Document upload failed:", err);
    } finally {
      setUploadingFile(false);
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
            placeholder="Search public ledger records..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory"
          />
        </div>

        <button 
          onClick={() => handleOpenEditor("create")}
          className="flex items-center gap-2 px-4.5 py-2.5 rounded-xl bg-gradient-to-r from-luxury-ivory to-white hover:brightness-105 active:scale-[0.98] text-black font-semibold text-xs tracking-wider transition w-full sm:w-auto justify-center"
        >
          <Plus className="w-4 h-4" /> Create Ledger Entry
        </button>
      </div>

      {/* Ledger Table */}
      <div className="rounded-3xl admin-glass border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06] text-gray-500 font-semibold uppercase tracking-wider text-[10px]">
                <th className="p-4">ID</th>
                <th className="p-4">Contributor</th>
                <th className="p-4">Cause Target</th>
                <th className="p-4">Direct Aid (90%)</th>
                <th className="p-4">Ops Cost (10%)</th>
                <th className="p-4">Total Amount</th>
                <th className="p-4">Date</th>
                <th className="p-4">Verification Audit</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03] text-gray-300">
              {loading && ledger.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500">
                    Loading transparency logs...
                  </td>
                </tr>
              ) : filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500">
                    No ledger entries matching filters.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="p-4 font-semibold text-white">{item.id}</td>
                    <td className="p-4 font-medium">{item.donor}</td>
                    <td className="p-4 text-gray-400">
                      {item.selectedCauses && item.selectedCauses.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {item.selectedCauses.map((c: any, i: number) => (
                            <span key={i} className="text-[10px] leading-tight">
                              <span className="text-luxury-ivory font-medium">₹{c.allocatedAmount}</span> - {c.causeName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        item.cause
                      )}
                    </td>
                    <td className="p-4 text-emerald-400 font-semibold">₹{(item.directAid || Math.floor(item.amount * 0.9)).toLocaleString()}</td>
                    <td className="p-4 text-gray-500">₹{(item.opsCost || Math.floor(item.amount * 0.1)).toLocaleString()}</td>
                    <td className="p-4 font-bold text-luxury-ivory">₹{Number(item.amount).toLocaleString()}</td>
                    <td className="p-4 font-mono text-gray-400">{item.date}</td>
                    <td className="p-4">
                      {item.proofUrl ? (
                        <a 
                          href={item.proofUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-luxury-ivory hover:underline font-semibold"
                        >
                          <FileCheck className="w-3.5 h-3.5 text-emerald-500" /> View Document
                        </a>
                      ) : (
                        <span className="text-gray-500 font-medium">{item.proof || "✅ Verified Ledger"}</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleOpenEditor("update", item)}
                          className="p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-gray-300 transition"
                          title="Edit log details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 rounded-lg bg-red-950/20 border border-red-500/10 hover:bg-red-900/30 text-red-400 transition"
                          title="Delete entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editor Modal Drawer */}
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
              className="w-full max-w-lg p-6 rounded-3xl admin-glass border border-white/[0.08] relative z-10 text-xs"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-6">
                <div>
                  <h3 className="text-sm font-bold text-white font-playfair uppercase tracking-wider">
                    {editMode === "create" ? "Add Ledger Transaction" : "Modify Ledger Record"}
                  </h3>
                  <span className="text-[9px] text-luxury-ivory font-bold tracking-widest uppercase block mt-0.5">
                    Manual Ledger Override
                  </span>
                </div>
                <button 
                  onClick={() => setIsEditorOpen(false)}
                  className="p-1.5 rounded-lg border border-white/[0.08] hover:bg-white/[0.04]"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider">Contributor / Beneficiary Description</label>
                    <input 
                      type="text" 
                      required
                      value={formState.donor}
                      onChange={(e) => setFormState(prev => ({ ...prev, donor: e.target.value }))}
                      placeholder="e.g. Sabir Test (UPI) or Direct Cash Aid"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider">Cause / Program</label>
                    <input 
                      type="text" 
                      required
                      value={formState.cause}
                      onChange={(e) => setFormState(prev => ({ ...prev, cause: e.target.value }))}
                      placeholder="e.g. Qur’an Endowment"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider">Transaction Date</label>
                    <input 
                      type="text" 
                      required
                      value={formState.date}
                      onChange={(e) => setFormState(prev => ({ ...prev, date: e.target.value }))}
                      placeholder="DD/MM/YYYY"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider">Total Value (₹)</label>
                    <input 
                      type="number" 
                      required
                      value={formState.amount}
                      onChange={(e) => setFormState(prev => ({ ...prev, amount: Number(e.target.value) }))}
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory font-bold text-luxury-ivory"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider">UPI / Bank Ref ID</label>
                    <input 
                      type="text" 
                      value={formState.refCode}
                      onChange={(e) => setFormState(prev => ({ ...prev, refCode: e.target.value }))}
                      placeholder="e.g. UPI54321..."
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory font-mono"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider">Custom Status Statement</label>
                    <input 
                      type="text" 
                      value={formState.proof}
                      onChange={(e) => setFormState(prev => ({ ...prev, proof: e.target.value }))}
                      placeholder="e.g. ✅ Verified Ledger Entry"
                      className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none focus:border-luxury-ivory"
                    />
                  </div>
                </div>

                {/* Upload Receipt */}
                <div className="p-4.5 rounded-2xl bg-white/[0.01] border border-white/[0.04] flex flex-col justify-between pt-2">
                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider">Upload Invoice / Receipt File</label>
                    <span className="text-[9px] text-gray-500 mb-3 block font-medium">Attach digital receipt or photo (JPEG, PNG, PDF)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="px-4 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.08] font-bold text-[10px] text-white cursor-pointer transition flex items-center gap-2">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingFile ? "Uploading..." : "Attach File"}
                      <input 
                        type="file" 
                        onChange={handleFileUpload}
                        className="hidden" 
                      />
                    </label>
                    {formState.proofUrl && (
                      <span className="text-[10px] text-emerald-400 truncate max-w-[200px]">Document Linked</span>
                    )}
                  </div>
                </div>

                {/* Alert warning */}
                <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/10 text-[10px] text-amber-300/80 leading-relaxed flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-luxury-ivory shrink-0 mt-0.5" />
                  <p>Caution: Ledger records represent direct public statements. Re-verify bank statement logs before marking entries as complete.</p>
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 pt-4 border-t border-white/[0.06] justify-end">
                  <button 
                    type="button"
                    onClick={() => setIsEditorOpen(false)}
                    className="px-5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] font-bold text-gray-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-luxury-ivory to-white text-black font-semibold tracking-wide transition flex items-center gap-1.5 shadow-lg"
                  >
                    <Save className="w-4 h-4" /> Save Record
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
