"use client";

import React, { useEffect, useState } from "react";
import { Database, RefreshCw, CheckCircle, AlertTriangle, Cloud, Activity } from "lucide-react";
import { motion } from "framer-motion";

export default function SyncManagementPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState("");

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sync/status");
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/sync/retry", { method: "POST" });
      const data = await res.json();
      setMessage(data.message || data.error);
      await fetchStatus();
    } catch (err: any) {
      setMessage("Error triggering retry.");
    } finally {
      setRetrying(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-[var(--gold)]">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const isHealthy = status?.googleSheetsStatus === "Connected" && status?.syncStats?.failed === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Database className="h-8 w-8 text-[var(--gold)]" />
            Synchronization Engine
          </h1>
          <p className="text-gray-400 mt-2">
            Dual Database Architecture (Firestore ➔ Google Sheets)
          </p>
        </div>
        <button
          onClick={handleRetry}
          disabled={retrying || status?.syncStats?.failed === 0}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-black hover:bg-[var(--gold-light)] disabled:opacity-50 transition-all"
        >
          <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
          Retry Failed Tasks
        </button>
      </div>

      {message && (
        <div className="bg-white/5 border border-[var(--gold)] text-[var(--gold)] px-4 py-3 rounded-lg text-sm">
          {message}
        </div>
      )}

      {/* HEALTH STATUS */}
      <div className={`p-6 rounded-xl border ${isHealthy ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'} flex items-center gap-4`}>
        {isHealthy ? (
          <CheckCircle className="h-10 w-10 text-green-400" />
        ) : (
          <AlertTriangle className="h-10 w-10 text-red-400" />
        )}
        <div>
          <h3 className={`text-lg font-bold ${isHealthy ? 'text-green-400' : 'text-red-400'}`}>
            {isHealthy ? "System Healthy" : "Attention Required"}
          </h3>
          <p className="text-sm text-gray-300">
            {isHealthy 
              ? "All synchronization tasks are up to date and databases are connected." 
              : "There are failed synchronization tasks or connection issues."}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Firestore Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-white/10 bg-black/40 p-6 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-400">Primary Database</h3>
            <Database className="h-5 w-5 text-blue-400" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-white">Firestore</div>
            <p className="mt-1 text-sm text-green-400 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-400"></span> {status?.firestoreStatus}
            </p>
          </div>
        </motion.div>

        {/* Google Sheets Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-white/10 bg-black/40 p-6 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-400">Business Database</h3>
            <Cloud className="h-5 w-5 text-green-500" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-white">Google Sheets</div>
            <p className={`mt-1 text-sm flex items-center gap-1 ${status?.googleSheetsStatus === "Connected" ? 'text-green-400' : 'text-red-400'}`}>
              <span className={`h-2 w-2 rounded-full ${status?.googleSheetsStatus === "Connected" ? 'bg-green-400' : 'bg-red-400'}`}></span> 
              {status?.googleSheetsStatus}
            </p>
          </div>
        </motion.div>

        {/* Synced Tasks */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border border-white/10 bg-black/40 p-6 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-400">Total Synced</h3>
            <Activity className="h-5 w-5 text-[var(--gold)]" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-white">{status?.syncStats?.synced || 0}</div>
            <p className="mt-1 text-sm text-gray-400">Successful operations</p>
          </div>
        </motion.div>

        {/* Failed Tasks */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border border-white/10 bg-black/40 p-6 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-400">Failed Queue</h3>
            <AlertTriangle className={`h-5 w-5 ${status?.syncStats?.failed > 0 ? 'text-red-400' : 'text-gray-400'}`} />
          </div>
          <div className="mt-4">
            <div className={`text-2xl font-bold ${status?.syncStats?.failed > 0 ? 'text-red-400' : 'text-white'}`}>
              {status?.syncStats?.failed || 0}
            </div>
            <p className="mt-1 text-sm text-gray-400">Require manual retry</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
