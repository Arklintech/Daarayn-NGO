"use client";

import React from "react";
import { Image as ImageIcon, Video, FileText } from "lucide-react";
import { motion } from "framer-motion";

export default function CauseMediaTab({ cause }: { cause: any }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Media Assets</h2>
          <p className="text-sm text-gray-400">Verified field images and video evidence</p>
        </div>
        <button className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-lg transition-colors border border-white/10">
          Upload Evidence
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Placeholder media items */}
        <div className="aspect-square rounded-xl bg-white/5 border border-white/10 flex items-center justify-center relative group overflow-hidden">
           <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10" />
           <ImageIcon className="w-8 h-8 text-gray-500 group-hover:scale-110 transition-transform" />
           <div className="absolute bottom-3 left-3 z-20">
             <p className="text-xs font-medium text-white">Field Survey.jpg</p>
           </div>
        </div>
        <div className="aspect-square rounded-xl bg-white/5 border border-white/10 flex items-center justify-center relative group overflow-hidden">
           <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10" />
           <Video className="w-8 h-8 text-gray-500 group-hover:scale-110 transition-transform" />
           <div className="absolute bottom-3 left-3 z-20">
             <p className="text-xs font-medium text-white">Distribution_Q1.mp4</p>
           </div>
        </div>
      </div>
    </motion.div>
  );
}
