'use client';

import React, { useState, useEffect } from "react";
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
import DriveConnectionCard from "@/components/admin/DriveConnectionCard";


export default function AdminSettings() {
  const { adminData } = useAuth();
    const [loading, setLoading] = useState(false);

  // SEO metadata settings
  const [metaState, setMetaState] = useState({
    siteName: "Daarayn Foundation",
    description: "Daarayn Foundation. Contribute with full accountability: public ledger, verified distribution, and trackable impact.",
    seoKeywords: "Daarayn Foundation, Public Ledger, India, Maharashtra, Sadaqah, Zakat",
    socialTwitter: "https://twitter.com/daaraynorg",
    socialFb: "https://facebook.com/daaraynorg"
  });

  useEffect(() => {
    try {
      const cachedMeta = localStorage.getItem("daarayn_seo_meta");
      if (cachedMeta) setMetaState(JSON.parse(cachedMeta));
    } catch (e) {}
  }, []);

  const handleSaveMeta = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      localStorage.setItem("daarayn_seo_meta", JSON.stringify(metaState));
      alert("Saved in this browser only. The public website does not read these values yet, so nothing on the live site has changed.");
    } catch (err) {
      console.error("Save meta settings error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-xs">
      <DriveConnectionCard />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* SEO Configuration CMS */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-3xl admin-glass border border-white/[0.06] h-fit"
        >
          <div className="flex items-center gap-2 mb-6 border-b border-white/[0.06] pb-3">
            <Settings2 className="w-5 h-5 text-luxury-gold" />
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Website SEO Parameters</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">Draft values, stored in this browser only (not yet applied to the public site)</p>
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
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-luxury-gold to-luxury-gold-light hover:brightness-105 active:scale-[0.98] text-black font-semibold tracking-wide transition flex items-center gap-1.5 shadow-lg"
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
            <Database className="w-5 h-5 text-luxury-gold" />
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Authentication &amp; Data Sources</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">Read-only. Firebase is used for sign-in only; operational data lives in Google Sheets</p>
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
              <span className="text-gray-500 uppercase tracking-wider text-[8px]">Operational data</span>
              <span className="text-emerald-400">Google Sheets (Firestore is not used)</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.03] pb-2">
              <span className="text-gray-500 uppercase tracking-wider text-[8px]">Files &amp; evidence</span>
              <span className="text-white">Google Drive</span>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-gray-500 font-sans mt-2">
              <EyeOff className="w-3.5 h-3.5" /> Core API Keys and App ID parameters are encrypted.
            </div>
          </div>
        </motion.div>
      </div>

      {/* Administrator access */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="p-6 rounded-3xl admin-glass border border-white/[0.06]">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">Administrator Access</h3>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Who can sign in to this panel is decided on the server by the ADMIN_EMAILS allow-list and Firebase Authentication. Roles are not editable here, and no administrator list is shown because none is stored in the application.
          {adminData?.email ? <> You are signed in as <span className="text-white font-mono">{adminData.email}</span>.</> : null}
        </p>
      </motion.div>
    </div>
  );
}

