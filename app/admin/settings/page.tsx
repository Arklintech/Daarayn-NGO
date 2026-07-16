'use client';

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { 
  Settings2, 
  UserPlus, 
  ShieldCheck, 
  Save, 
  Database,
  Search,
  EyeOff
} from "lucide-react";
import { motion } from "framer-motion";

export default function AdminSettings() {
  const { adminData } = useAuth();
  const [adminsList, setAdminsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // SEO metadata settings
  const [metaState, setMetaState] = useState({
    siteName: "Daarayn Aid – Public Foundation Trust",
    description: "Daarayn Aid — Public Foundation Trust. Contribute with full accountability: public ledger, verified distribution, and trackable impact.",
    seoKeywords: "Charity, NGO, Islamic Trust, Public Ledger, India, Maharashtra, Sadaqah, Zakat",
    socialTwitter: "https://twitter.com/daaraynorg",
    socialFb: "https://facebook.com/daaraynorg"
  });

  const loadAdmins = async () => {
    try {
      const snap = await getDocs(collection(db, "users"));
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setAdminsList(list);
    } catch (err) {
      console.warn("Error listing users from database, loading local fallback:", err);
      setAdminsList([
        { uid: "super_1", name: "Super Admin", email: "admin@daarayn.org", role: "Super Admin", status: "active" },
        { uid: "editor_1", name: "Content Editor", email: "editor@daarayn.org", role: "Editor", status: "active" }
      ]);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (adminData?.role !== "Super Admin") {
      alert("Permission denied. Only Super Administrators can update role assignments.");
      return;
    }

    try {
      const docRef = doc(db, "users", userId);
      await updateDoc(docRef, { role: newRole });
      setAdminsList(prev => prev.map(a => a.uid === userId ? { ...a, role: newRole } : a));
      alert("Administrator role updated successfully!");
    } catch (err) {
      console.error("Error setting role in Firestore:", err);
    }
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await setDoc(doc(db, "settings", "seoMetadata"), metaState);
      alert("SEO Metadata parameters successfully updated.");
    } catch (err) {
      console.error("Save meta settings error:", err);
    } finally {
      setLoading(false);
    }
  };

  const isSuperAdmin = adminData?.role === "Super Admin";

  return (
    <div className="space-y-6 text-xs">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* SEO Configuration CMS */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-3xl admin-glass border border-white/[0.06] h-fit"
        >
          <div className="flex items-center gap-2 mb-6 border-b border-white/[0.06] pb-3">
            <Settings2 className="w-5 h-5 text-luxury-ivory" />
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Website SEO Parameters</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">Control search ranking metadata</p>
            </div>
          </div>

          <form onSubmit={handleSaveMeta} className="space-y-4">
            <div>
              <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Website Display Name</label>
              <input 
                type="text" 
                required
                value={metaState.siteName}
                onChange={(e) => setMetaState(prev => ({ ...prev, siteName: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Meta Description</label>
              <textarea 
                rows={3}
                required
                value={metaState.description}
                onChange={(e) => setMetaState(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider">Meta Keywords</label>
              <input 
                type="text" 
                value={metaState.seoKeywords}
                onChange={(e) => setMetaState(prev => ({ ...prev, seoKeywords: e.target.value }))}
                placeholder="Comma separated search terms..."
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white"
              />
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-luxury-ivory to-white hover:brightness-105 active:scale-[0.98] text-black font-semibold tracking-wide transition flex items-center gap-1.5 shadow-lg"
            >
              <Save className="w-4 h-4" /> Save Metadata
            </button>
          </form>
        </motion.div>

        {/* Read-Only Firebase Config */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-6 rounded-3xl admin-glass border border-white/[0.06] h-fit"
        >
          <div className="flex items-center gap-2 mb-6 border-b border-white/[0.06] pb-3">
            <Database className="w-5 h-5 text-luxury-ivory" />
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Firebase Cloud Settings</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">Primary database config (Read-Only)</p>
            </div>
          </div>

          <div className="space-y-4 font-mono text-[10px] bg-black/40 border border-white/[0.04] p-4.5 rounded-2xl text-gray-400 select-all">
            <div className="flex justify-between border-b border-white/[0.03] pb-2">
              <span className="text-gray-500 uppercase tracking-wider text-[8px]">Project ID</span>
              <span className="text-white">daaraynorg-9165c</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.03] pb-2">
              <span className="text-gray-500 uppercase tracking-wider text-[8px]">Auth Domain</span>
              <span className="text-white">daaraynorg-9165c.firebaseapp.com</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.03] pb-2">
              <span className="text-gray-500 uppercase tracking-wider text-[8px]">Firestore Database</span>
              <span className="text-emerald-400">asia-south1 (Mumbai) / (default)</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.03] pb-2">
              <span className="text-gray-500 uppercase tracking-wider text-[8px]">Storage Bucket</span>
              <span className="text-white">daaraynorg-9165c.firebasestorage.app</span>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-gray-500 font-sans mt-2">
              <EyeOff className="w-3.5 h-3.5" /> Core API Keys and App ID parameters are encrypted.
            </div>
          </div>
        </motion.div>
      </div>

      {/* User Management Grid */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="p-6 rounded-3xl admin-glass border border-white/[0.06]"
      >
        <div className="flex justify-between items-center mb-6 border-b border-white/[0.06] pb-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Administrator Accounts Directory</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">View and update RBAC permissions</p>
          </div>
          <span className="text-[10px] text-luxury-ivory font-bold uppercase tracking-wider">Super Admin control active</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06] text-gray-500 font-semibold uppercase tracking-wider text-[9px]">
                <th className="py-2.5">User Name</th>
                <th className="py-2.5">Email</th>
                <th className="py-2.5">Assigned Role</th>
                <th className="py-2.5">User Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03] text-gray-300">
              {adminsList.map((admin) => (
                <tr key={admin.uid || admin.id} className="hover:bg-white/[0.01]">
                  <td className="py-3 font-semibold text-white">{admin.name}</td>
                  <td className="py-3 font-mono text-gray-400">{admin.email}</td>
                  <td className="py-3">
                    <select
                      value={admin.role}
                      disabled={!isSuperAdmin || admin.role === "Super Admin"}
                      onChange={(e) => handleRoleChange(admin.uid || admin.id, e.target.value)}
                      className={`px-3 py-1.5 rounded-lg border focus:outline-none ${
                        !isSuperAdmin || admin.role === "Super Admin"
                          ? "bg-transparent text-gray-500 border-none cursor-not-allowed font-semibold"
                          : "bg-[#06120c] text-white border-white/[0.08]"
                      }`}
                    >
                      <option value="Super Admin">Super Admin</option>
                      <option value="Admin">Admin</option>
                      <option value="Editor">Editor</option>
                      <option value="Content Manager">Content Manager</option>
                      <option value="Finance Manager">Finance Manager</option>
                      <option value="Volunteer Manager">Volunteer Manager</option>
                    </select>
                  </td>
                  <td className="py-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-950/40 text-emerald-300 border border-emerald-500/20">
                      {admin.status || "active"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
