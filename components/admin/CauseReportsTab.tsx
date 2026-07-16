"use client";

import React from "react";
import { FileText, Download, Eye } from "lucide-react";
import { motion } from "framer-motion";

export default function CauseReportsTab({ cause }: { cause: any }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Compliance & Impact Reports</h2>
          <p className="text-sm text-gray-400">View and generate PDF impact reports for transparency</p>
        </div>
        <button className="px-4 py-2 bg-[var(--gold)]/10 hover:bg-[var(--gold)]/20 text-[var(--gold)] border border-[var(--gold)]/30 text-sm font-medium rounded-lg transition-colors">
          Generate New Report
        </button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase bg-white/[0.02] border-b border-white/10">
            <tr>
              <th className="px-6 py-4 font-semibold">Report Name</th>
              <th className="px-6 py-4 font-semibold">Generated Date</th>
              <th className="px-6 py-4 font-semibold">Type</th>
              <th className="px-6 py-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            <tr className="hover:bg-white/[0.02] transition-colors">
              <td className="px-6 py-4 flex items-center gap-3">
                <FileText className="w-4 h-4 text-[var(--gold)]" />
                <span className="text-white font-medium">Q3 Impact Summary</span>
              </td>
              <td className="px-6 py-4 text-gray-400">2026-07-10</td>
              <td className="px-6 py-4">
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Impact
                </span>
              </td>
              <td className="px-6 py-4 text-right space-x-3">
                <button className="text-gray-400 hover:text-white transition-colors"><Eye className="w-4 h-4 inline" /></button>
                <button className="text-gray-400 hover:text-white transition-colors"><Download className="w-4 h-4 inline" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
