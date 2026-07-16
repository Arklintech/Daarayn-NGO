"use client";

import React from "react";
import { BarChart, MapPin, CreditCard, Activity } from "lucide-react";
import { motion } from "framer-motion";

export default function CauseAnalyticsTab({ cause, contributions }: { cause: any, contributions: any[] }) {
  // Compute some basic analytics
  const totalAmount = contributions.reduce((acc, c) => acc + (c.allocatedAmount || 0), 0);
  const upiCount = contributions.filter(c => c.paymentMethod?.toUpperCase().includes('UPI')).length;
  const bankCount = contributions.filter(c => c.paymentMethod?.toUpperCase().includes('BANK')).length;
  
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Advanced Analytics</h2>
          <p className="text-sm text-gray-400">Real-time telemetry for {cause?.name || "this cause"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 p-6 rounded-xl flex flex-col items-center justify-center text-center">
          <Activity className="w-8 h-8 text-blue-400 mb-3" />
          <h3 className="text-sm font-medium text-gray-400">Donation Velocity</h3>
          <p className="text-2xl font-semibold text-white mt-1">Active</p>
        </div>
        
        <div className="bg-white/5 border border-white/10 p-6 rounded-xl flex flex-col items-center justify-center text-center">
          <MapPin className="w-8 h-8 text-emerald-400 mb-3" />
          <h3 className="text-sm font-medium text-gray-400">Top Donor Region</h3>
          <p className="text-2xl font-semibold text-white mt-1">India</p>
        </div>
        
        <div className="bg-white/5 border border-white/10 p-6 rounded-xl flex flex-col items-center justify-center text-center">
          <CreditCard className="w-8 h-8 text-purple-400 mb-3" />
          <h3 className="text-sm font-medium text-gray-400">Payment Preferences</h3>
          <div className="flex gap-4 mt-2 text-sm text-gray-300">
             <span>UPI: {upiCount}</span>
             <span>Bank: {bankCount}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
