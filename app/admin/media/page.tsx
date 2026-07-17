'use client';

import React, { useState, useEffect } from "react";
import { db, storage } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { 
  Image, 
  Upload, 
  Trash2, 
  Copy, 
  Check, 
  FileText, 
  Video,
  Download,
  AlertCircle
} from "lucide-react";
import { motion } from "framer-motion";

export default function AdminMedia() {
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchMedia = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "gallery"));
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setMediaList(list);
    } catch (err) {
      console.warn("Storage registry error:", err);
      // fallback mock list
      const mocks = [
        { id: "med_1", name: "student_profile.png", fileUrl: "/images/student_profile.png", size: "84 KB", type: "image/png", createdAt: "2026-07-04T12:00:00Z" },
        { id: "med_2", name: "family_relief.png", fileUrl: "/images/family_relief.png", size: "145 KB", type: "image/png", createdAt: "2026-07-04T12:05:00Z" },
        { id: "med_3", name: "trust_annual_report_2025.pdf", fileUrl: "", size: "1.2 MB", type: "application/pdf", createdAt: "2026-07-01T10:00:00Z" }
      ];
      setMediaList(mocks);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("files", file);

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Upload failed. Server responded with error.");
      }
      const data = await res.json();
      if (!data.success || !data.urls || data.urls.length === 0) {
        throw new Error(data.error || "Upload failed");
      }

      const downloadUrl = data.urls[0];
      const filename = downloadUrl.split('/').pop();

      const generatedId = `med_${Date.now()}`;
      const record = {
        id: generatedId,
        name: file.name,
        fileUrl: downloadUrl,
        size: `${Math.round(file.size / 1024)} KB`,
        type: file.type || "application/octet-stream",
        createdAt: new Date().toISOString(),
        filename: filename
      };

      await setDoc(doc(db, "gallery", generatedId), record);
      fetchMedia();
    } catch (err: any) {
      console.error("Storage upload error:", err);
      alert("Failed to upload file: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMedia = async (item: any) => {
    if (!window.confirm(`Delete ${item.name} permanently?`)) return;
    setLoading(true);
    try {
      // NOTE: We only delete from firestore right now, as it's locally hosted
      await deleteDoc(doc(db, "gallery", item.id));
      fetchMedia();
    } catch (err) {
      console.error("Delete media error:", err);
      setMediaList(prev => prev.filter(m => m.id !== item.id));
      setLoading(false);
    }
  };

  const handleCopyLink = (item: any) => {
    navigator.clipboard.writeText(item.fileUrl || window.location.origin + `/uploads/${item.name}`);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Cloud Media Library</h2>
          <p className="text-[10px] text-gray-400 mt-0.5 font-medium">Assets, annual reports, and receipts</p>
        </div>

        <label className="flex items-center gap-2 px-4.5 py-2.5 rounded-xl bg-gradient-to-r from-luxury-gold to-luxury-gold-light hover:brightness-105 active:scale-[0.98] text-black font-semibold transition cursor-pointer">
          <Upload className="w-4 h-4" />
          {uploading ? "Uploading file..." : "Upload New Asset"}
          <input 
            type="file" 
            onChange={handleFileUpload} 
            className="hidden" 
          />
        </label>
      </div>

      {loading && mediaList.length === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="h-40 rounded-3xl admin-glass animate-pulse"></div>
          <div className="h-40 rounded-3xl admin-glass animate-pulse"></div>
        </div>
      ) : (
        /* Visual cards grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {mediaList.map((item) => {
            const isImage = item.type.startsWith("image/");
            return (
              <motion.div
                key={item.id}
                className="rounded-3xl admin-glass border border-white/[0.06] overflow-hidden flex flex-col justify-between hover:border-luxury-gold/20 transition duration-300 relative group"
              >
                {/* Visual Thumbnail */}
                <div className="h-32 bg-luxury-bg-deep/40 relative border-b border-white/[0.04] flex items-center justify-center overflow-hidden">
                  {isImage && item.fileUrl ? (
                    <img src={item.fileUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : item.type.startsWith("video/") ? (
                    <Video className="w-8 h-8 text-luxury-gold opacity-50" />
                  ) : (
                    <FileText className="w-8 h-8 text-luxury-gold opacity-50" />
                  )}
                </div>

                {/* Body Meta details */}
                <div className="p-4 space-y-3">
                  <div>
                    <h4 className="font-bold text-white truncate text-[11px]" title={item.name}>{item.name}</h4>
                    <span className="text-[9px] text-gray-500 font-semibold block mt-0.5">{item.size} • {item.type.split("/")[1]?.toUpperCase() || "FILE"}</span>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
                    <button 
                      onClick={() => handleCopyLink(item)}
                      className="flex-1 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] text-[10px] font-bold text-white transition flex items-center justify-center gap-1"
                      title="Copy public link"
                    >
                      {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedId === item.id ? "Copied" : "Copy URL"}
                    </button>
                    <button 
                      onClick={() => handleDeleteMedia(item)}
                      className="p-1.5 rounded-lg bg-red-950/20 border border-red-500/10 hover:bg-red-900/30 text-red-400 transition"
                      title="Delete asset"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
