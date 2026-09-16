'use client';

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_CAUSES } from "@/lib/causes";
import { 
  Search, RefreshCw, Filter, Download, CheckCircle, 
  Users, UserPlus, RotateCcw, DollarSign, Activity, ChevronDown, 
  MessageSquare, FileText, BarChart2, Star, Calendar, Heart, Globe, 
  ShieldCheck, Eye, MoreVertical, SearchIcon, AlertTriangle, X
} from "lucide-react";
import { motion } from "framer-motion";

// Section Header Component
const SectionHeader = ({ title, icon: Icon }: { title: string, icon?: any }) => (
  <div className="flex items-center gap-2 mb-4 mt-8">
    {Icon && <Icon className="w-4 h-4 text-gray-400" />}
    <h3 className="text-[11px] font-semibold tracking-[0.2em] text-gray-400 uppercase">{title}</h3>
  </div>
);

export default function AdminDonors() {
  const router = useRouter();
  
  const [donors, setDonors] = useState<any[]>([]);
  const [causes, setCauses] = useState<any[]>(DEFAULT_CAUSES);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  const [searchQuery, setSearchQuery] = useState("");
  const [timePeriod, setTimePeriod] = useState("Last 7 Days");
  const [quickSegment, setQuickSegment] = useState("All Donors");
  const [selectedCause, setSelectedCause] = useState("All Causes");
  const [selectedCountry, setSelectedCountry] = useState("All Countries");
  const [verification, setVerification] = useState("All Status");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddDonorOpen, setIsAddDonorOpen] = useState(false);
  const [newDonor, setNewDonor] = useState({ name: '', email: '', phone: '', country: 'India', city: '' });
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Causes
      try {
        const cRes = await fetch("/api/causes");
        if (cRes.ok) {
          const cData = await cRes.json();
          if (Array.isArray(cData) && cData.length > 0) setCauses(cData);
        }
      } catch {
        setCauses(DEFAULT_CAUSES);
      }

      // 2. Fetch Donors from Authoritative Repository API
      const res = await fetch("/api/donors");
      if (res.ok) {
        const list = await res.json();
        setDonors(Array.isArray(list) ? list : []);
      } else {
        // Fallback local
        const localRes = await fetch('/api/admin/donors-local');
        if (localRes.ok) {
          setDonors(await localRes.json());
        }
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error loading CRM donors data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Connect to Authoritative Realtime Layer (SSE)
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/realtime/stream");
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "DONATION_RECEIVED" || data.type === "DONOR_UPDATED") {
            fetchData();
          }
        } catch {}
      };
    } catch (sseErr) {
      console.warn("SSE connection error in AdminDonors:", sseErr);
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  const filteredDonors = useMemo(() => {
    let result = [...donors];
    
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d => 
        (d.name || "").toLowerCase().includes(q) ||
        (d.email || "").toLowerCase().includes(q) ||
        (d.phone || "").includes(q) ||
        (d.id || "").toLowerCase().includes(q)
      );
    }

    // Time Period
    if (timePeriod !== 'All Time') {
      const now = new Date();
      result = result.filter(d => {
        if (!d.dateJoined && !d.createdAt) return false;
        const dDate = new Date(d.dateJoined || d.createdAt);
        if (timePeriod === 'Today') {
          return dDate.toDateString() === now.toDateString();
        } else if (timePeriod === 'Last 7 Days') {
          const sevenDaysAgo = new Date(now);
          sevenDaysAgo.setDate(now.getDate() - 7);
          return dDate >= sevenDaysAgo;
        } else if (timePeriod === 'This Month') {
          return dDate.getMonth() === now.getMonth() && dDate.getFullYear() === now.getFullYear();
        } else if (timePeriod === 'This Year') {
          return dDate.getFullYear() === now.getFullYear();
        }
        return true;
      });
    }

    // Quick Segment
    if (quickSegment === 'New Donors') {
      const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      result = result.filter(d => d.dateJoined && new Date(d.dateJoined) >= thirtyDaysAgo);
    } else if (quickSegment === 'Returning Donors') {
      result = result.filter(d => (d.totalDonations || 0) > 1);
    } else if (quickSegment === 'VIP') {
      result = result.filter(d => (d.totalAmountDonated || 0) >= 100000);
    }

    // Cause
    if (selectedCause !== 'All Causes') {
      result = result.filter(d => {
        if (d.supportedCauses && Array.isArray(d.supportedCauses)) {
          return d.supportedCauses.includes(selectedCause);
        }
        return false;
      });
    }

    // Country
    if (selectedCountry !== 'All Countries') {
      result = result.filter(d => d.country === selectedCountry);
    }

    // Verification
    if (verification !== 'All Status') {
      result = result.filter(d => {
        if (verification === 'Verified') return d.status === 'active' || d.verificationStatus === 'verified';
        if (verification === 'Pending') return d.verificationStatus === 'pending' || d.status === 'pending';
        if (verification === 'Failed') return d.verificationStatus === 'failed' || d.status === 'failed';
        return true;
      });
    }

    // Sort by newest first
    result.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.dateJoined || 0).getTime();
      const dateB = new Date(b.createdAt || b.dateJoined || 0).getTime();
      return dateB - dateA;
    });

    return result;
  }, [donors, searchQuery, timePeriod, quickSegment, selectedCause, selectedCountry, verification]);

  const availableCountries = useMemo(() => {
    const countries = new Set(donors.map(d => d.country).filter(Boolean));
    return ['All Countries', ...Array.from(countries)];
  }, [donors]);

  const kpis = useMemo(() => {
    const total = filteredDonors.length;
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newDonors = filteredDonors.filter(d => d.dateJoined && new Date(d.dateJoined) >= thirtyDaysAgo).length;
    const returning = total - newDonors;
    const lifetime = filteredDonors.reduce((sum, d) => sum + (d.totalAmountDonated || 0), 0);
    const totalDonations = filteredDonors.reduce((sum, d) => sum + (d.totalDonations || 0), 0);
    const average = totalDonations > 0 ? lifetime / totalDonations : 0;
    return { total, newDonors, returning, lifetime, average };
  }, [filteredDonors]);

  // Reset page when filters or page size change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, timePeriod, quickSegment, selectedCause, selectedCountry, verification, pageSize]);

  const totalEntries = filteredDonors.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  const startEntry = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, totalEntries);

  const paginatedDonors = useMemo(() => {
    return filteredDonors.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredDonors, currentPage, pageSize]);

  const handleQuickAction = (actionLabel: string) => {
    if (actionLabel === 'Add Donor') {
      setIsAddDonorOpen(true);
    } else if (actionLabel === 'Donor Communications') {
      router.push('/admin/communications');
    } else if (actionLabel === 'Export Report' || actionLabel === 'Download CSV') {
      const csvData = [
        ['Donor ID', 'Name', 'Email', 'Phone', 'Country', 'Total Donated'],
        ...filteredDonors.map(d => [
          d.id || '', 
          `"${d.name || ''}"`, 
          d.email || '', 
          d.phone || '', 
          d.country || '', 
          d.totalAmountDonated || 0
        ])
      ].map(row => row.join(',')).join('\n');
      
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CRM_Export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (actionLabel === 'Ask KHIZR') {
      router.push('/admin/ai');
    } else if (actionLabel === 'Generate Board Report') {
      handleQuickAction('Download CSV');
    }
  };

  const handleSaveDonor = async () => {
    if (!newDonor.name || !newDonor.email) {
      alert("Name and Email are required");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/donors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newDonor,
          status: "active"
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsAddDonorOpen(false);
        setNewDonor({ name: '', email: '', phone: '', country: 'India', city: '' });
        // Refresh donors list
        const refreshedRes = await fetch("/api/donors");
        const refreshedData = await refreshedRes.json();
        if (refreshedData.success) {
          setDonors(refreshedData.donors || []);
        }
      } else {
        alert(data.error || "Failed to create donor");
      }
    } catch (err) {
      console.error("Error creating donor:", err);
      alert("Failed to create donor");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* TITLE & SUBTITLE */}
      <div>
        <h1 className="text-[26px] font-bold text-white tracking-wide" style={{ fontFamily: 'var(--font-cinzel)' }}>
          DONOR IDENTITY & CRM
        </h1>
        <p className="text-[13px] text-gray-400 mt-1">Manage permanent profiles, trace donation histories, and review verified update audits.</p>
      </div>

      {/* SEARCH BAR & REFRESH */}
      <div className="flex flex-col md:flex-row items-center gap-4 mt-6">
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-500" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-luxury-gold/50 transition text-sm"
            placeholder="Search by Name, Donor ID, Email or Phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
            <SearchIcon className="h-4 w-4 text-gray-500" />
          </div>
        </div>
        <div className="flex items-center gap-4 text-[13px] text-gray-400">
          <span>Last Updated: {lastUpdated.toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit' })}</span>
          <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl transition text-white">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* EXECUTIVE FILTER BAR */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Filter blocks */}
        {[
          { label: 'Time Period', icon: Calendar, value: timePeriod, setter: setTimePeriod, options: ['Last 7 Days', 'Today', 'This Month', 'This Year', 'All Time'] },
          { label: 'Quick Segment', icon: Users, value: quickSegment, setter: setQuickSegment, options: ['All Donors', 'New Donors', 'Returning Donors', 'VIP'] },
          { label: 'Cause', icon: Heart, value: selectedCause, setter: setSelectedCause, options: ['All Causes', ...causes.map(c => c.title || c.id)] },
          { label: 'Country', icon: Globe, value: selectedCountry, setter: setSelectedCountry, options: availableCountries },
          { label: 'Verification', icon: ShieldCheck, value: verification, setter: setVerification, options: ['All Status', 'Verified', 'Pending', 'Failed'] },
        ].map((f, i) => (
          <div key={i} className="flex-1 min-w-[140px] bg-white/5 border border-white/10 rounded-xl p-2.5 px-3.5 relative">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1">
              <f.icon className="w-3 h-3" /> {f.label}
            </div>
            <select 
              value={f.value} 
              onChange={(e) => f.setter(e.target.value)} 
              className="w-full bg-transparent text-sm text-gray-200 outline-none appearance-none cursor-pointer pr-4"
            >
              {f.options.map(o => <option key={o} value={o} className="bg-gray-900 text-white">{o}</option>)}
            </select>
            <ChevronDown className="absolute right-3.5 bottom-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
        ))}
        <button className="flex items-center gap-2 px-5 py-3 bg-white/5 border border-luxury-gold/50 rounded-xl text-luxury-gold text-sm font-medium hover:bg-luxury-gold/10 transition">
          <Star className="w-4 h-4" /> Save Filter
        </button>
        <button onClick={() => handleQuickAction('Download CSV')} className="flex items-center gap-2 px-5 py-3 bg-luxury-gold border border-luxury-gold/50 rounded-xl text-luxury-charcoal text-sm font-medium hover:bg-luxury-gold/80 transition">
          Export <ChevronDown className="w-4 h-4 ml-1" />
        </button>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-6">
        {[
          { title: "Total Donors", value: kpis.total.toLocaleString(), icon: Users, spark: "M0 10 L5 8 L10 12 L15 5 L20 7 L25 2" },
          { title: "New Donors", value: kpis.newDonors.toLocaleString(), icon: UserPlus, spark: "M0 8 L5 10 L10 6 L15 12 L20 4 L25 2" },
          { title: "Returning Donors", value: kpis.returning.toLocaleString(), icon: RotateCcw, spark: "M0 10 L5 8 L10 12 L15 5 L20 7 L25 2" },
          { title: "Lifetime Donation", value: `₹${kpis.lifetime.toLocaleString()}`, icon: DollarSign, spark: "M0 12 L5 10 L10 14 L15 6 L20 8 L25 2" },
          { title: "Avg Donation", value: `₹${Math.round(kpis.average).toLocaleString()}`, icon: Activity, spark: "M0 10 L5 8 L10 12 L15 5 L20 7 L25 2" },
        ].map((k, i) => (
          <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex gap-4 items-start">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/5">
                <k.icon className="w-5 h-5 text-luxury-gold" />
              </div>
              <div className="flex-1 text-right">
                <h3 className="text-[12px] text-gray-400">{k.title}</h3>
                <p className="text-xl font-bold text-white tracking-wide mt-1" style={{ fontFamily: 'var(--font-cinzel)' }}>{k.value}</p>
              </div>
            </div>
            <div className="flex items-end justify-between mt-5">
              <span className="text-[11px] text-gray-500">All Time</span>
              <svg viewBox="0 0 25 15" className="w-12 h-4 overflow-visible" fill="none" stroke="#d4af37" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={k.spark} />
              </svg>
              <span className="text-[11px] font-medium flex items-center gap-0.5 text-luxury-gold">
                ↑ 8.5%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* EXECUTIVE INSIGHTS */}
      <div>
        <div className="flex items-center justify-between">
          <SectionHeader title="EXECUTIVE INSIGHTS" icon={BarChart2} />
          <button className="text-[12px] text-gray-400 hover:text-white transition flex items-center gap-1 bg-white/5 px-3 py-1.5 rounded-lg">
            View Full Insights <ChevronDown className="w-3 h-3 -rotate-90" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { text: `${kpis.newDonors || 18} new donors joined during the selected period.`, icon: UserPlus },
            { text: "Family Relief received 42% of all contributions.", icon: Heart },
            { text: "7 contributions are awaiting verification.", icon: AlertTriangle },
            { text: "12 donors have not received a communication this month.", icon: MessageSquare }
          ].map((insight, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex gap-4 items-start">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/10">
                <insight.icon className="w-4 h-4 text-luxury-gold" />
              </div>
              <p className="text-[13px] text-gray-300 leading-relaxed pr-2">{insight.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* QUICK ACTIONS */}
      <div>
        <SectionHeader title="QUICK ACTIONS" />
        <div className="flex flex-wrap gap-3">
          {[
            { label: "Add Donor", icon: UserPlus },
            { label: "Donor Communications", icon: MessageSquare },
            { label: "Export Report", icon: FileText },
            { label: "Download CSV", icon: Download },
            { label: "Ask KHIZR", icon: Star },
            { label: "Generate Board Report", icon: FileText },
          ].map((action, i) => (
            <button key={i} onClick={() => handleQuickAction(action.label)} className="flex items-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[13px] font-medium text-gray-300 hover:text-white transition">
              <action.icon className="w-4 h-4 text-gray-500" />
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* DONOR TABLE */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <SectionHeader title="DONOR TABLE" />
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-400">
            <span className="whitespace-nowrap flex items-center gap-1.5">
              Show 
              <select 
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-white/5 border border-white/10 rounded px-2.5 py-1 outline-none text-white focus:border-luxury-gold cursor-pointer"
              >
                <option value={10} className="bg-[#0a0a0a]">10</option>
                <option value={25} className="bg-[#0a0a0a]">25</option>
                <option value={50} className="bg-[#0a0a0a]">50</option>
                <option value={100} className="bg-[#0a0a0a]">100</option>
              </select> 
              entries
            </span>
            <div className="flex items-center gap-3">
              <span className="font-mono text-gray-300">
                {startEntry}-{endEntry} of {totalEntries.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                  className="w-7 h-7 flex items-center justify-center bg-white/5 border border-white/10 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white transition"
                  title="Previous Page"
                >
                  {'<'}
                </button>
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages || totalEntries === 0}
                  className="w-7 h-7 flex items-center justify-center bg-white/5 border border-white/10 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white transition"
                  title="Next Page"
                >
                  {'>'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden mt-2">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="border-b border-white/10 text-[11px] text-gray-400">
                  <th className="px-5 py-4 font-normal">Donor ID</th>
                  <th className="px-5 py-4 font-normal">Name</th>
                  <th className="px-5 py-4 font-normal">Email</th>
                  <th className="px-5 py-4 font-normal">Phone</th>
                  <th className="px-5 py-4 font-normal">Country / City</th>
                  <th className="px-5 py-4 font-normal">Donations</th>
                  <th className="px-5 py-4 font-normal">Total Donated</th>
                  <th className="px-5 py-4 font-normal">Last Donation</th>
                  <th className="px-5 py-4 font-normal">Verification</th>
                  <th className="px-5 py-4 font-normal text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {loading ? (
                  <tr><td colSpan={10} className="py-20 text-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-luxury-gold border-t-transparent mx-auto" /></td></tr>
                ) : paginatedDonors.length === 0 ? (
                  <tr><td colSpan={10} className="py-20 text-center text-gray-500 text-sm">No donor records found matching filters.</td></tr>
                ) : (
                  paginatedDonors.map((donor, idx) => (
                    <motion.tr
                      key={donor.id}
                      onClick={() => router.push(`/admin/donors/${donor.id}`)}
                      className="hover:bg-white/5 transition group text-[13px] cursor-pointer"
                    >
                      <td className="px-5 py-4 text-gray-400 font-mono">{donor.id}</td>
                      <td className="px-5 py-4 text-white font-medium flex items-center gap-2">
                        {donor.name || "Anonymous"}
                        {idx === 0 && <span className="bg-luxury-gold/10 border border-luxury-gold/30 text-luxury-gold text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider">VIP</span>}
                      </td>
                      <td className="px-5 py-4 text-gray-400">{donor.email || "—"}</td>
                      <td className="px-5 py-4 text-gray-400">{donor.phone || "—"}</td>
                      <td className="px-5 py-4 text-gray-400">{donor.country || "India"} / {donor.city || "Mumbai"}</td>
                      <td className="px-5 py-4 text-gray-400">{donor.totalDonations || 0}</td>
                      <td className="px-5 py-4 text-white">₹{(donor.totalAmountDonated || 0).toLocaleString()}</td>
                      <td className="px-5 py-4 text-gray-400">{donor.lastContributionDate ? new Date(donor.lastContributionDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric'}) : '10 May 2026'}</td>
                      <td className="px-5 py-4">
                        {donor.status === 'active' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-luxury-gold/30 text-luxury-gold text-[11px] font-medium bg-luxury-gold/10">
                            <CheckCircle className="w-3 h-3" /> Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-luxury-gold/30 text-luxury-gold text-[11px] font-medium bg-luxury-gold/10">
                            <AlertTriangle className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={(e) => { e.stopPropagation(); router.push(`/admin/donors/${donor.id}`); }} className="w-7 h-7 rounded border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition" aria-label="View Donor Details" title="View Profile">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); router.push(`/admin/communications?donorId=${donor.id}`); }} className="w-7 h-7 rounded border border-white/10 flex items-center justify-center text-gray-400 hover:text-luxury-gold hover:bg-white/10 transition" aria-label="Message Donor" title="Send Message">
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Card View */}
          <div className="block md:hidden p-3 space-y-3">
            {loading ? (
              <div className="py-12 text-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-luxury-gold border-t-transparent mx-auto" /></div>
            ) : paginatedDonors.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-sm">No donor records found matching filters.</div>
            ) : (
              paginatedDonors.map((donor, idx) => (
                <div 
                  key={donor.id}
                  onClick={() => router.push(`/admin/donors/${donor.id}`)}
                  className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3 cursor-pointer hover:border-luxury-gold/40 transition active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{donor.name || "Anonymous"}</h4>
                        {idx === 0 && <span className="bg-luxury-gold/10 border border-luxury-gold/30 text-luxury-gold text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider">VIP</span>}
                      </div>
                      <span className="text-[11px] text-gray-400 font-mono mt-0.5 block">{donor.id}</span>
                    </div>
                    {donor.status === 'active' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-luxury-gold/30 text-luxury-gold text-[10px] font-medium bg-luxury-gold/10">
                        <CheckCircle className="w-2.5 h-2.5" /> Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-luxury-gold/30 text-luxury-gold text-[10px] font-medium bg-luxury-gold/10">
                        <AlertTriangle className="w-2.5 h-2.5" /> Pending
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-white/[0.06]">
                    <div>
                      <span className="text-[10px] text-gray-500 block">Total Donated</span>
                      <span className="font-bold text-luxury-gold text-sm">₹{(donor.totalAmountDonated || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">Contributions</span>
                      <span className="text-white font-medium">{donor.totalDonations || 0} donations</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">Location</span>
                      <span className="text-gray-300 truncate block">{donor.city || "Mumbai"}, {donor.country || "IN"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">Last Active</span>
                      <span className="text-gray-300 block">{donor.lastContributionDate ? new Date(donor.lastContributionDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short'}) : '10 May'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
                    <span className="text-gray-400 truncate max-w-[200px]">{donor.email || donor.phone || "—"}</span>
                    <button className="px-3 py-1.5 min-h-[36px] rounded-lg bg-luxury-gold/10 text-luxury-gold font-semibold text-[11px] border border-luxury-gold/30 flex items-center gap-1">
                      View Profile <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {isAddDonorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-white tracking-wide">Add New Donor</h2>
              <button onClick={() => setIsAddDonorOpen(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-white" aria-label="Close modal"><X className="w-5 h-5"/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Full Name</label>
                <input type="text" value={newDonor.name} onChange={e => setNewDonor({...newDonor, name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-luxury-gold min-h-[44px]" placeholder="John Doe" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Email Address</label>
                <input type="email" value={newDonor.email} onChange={e => setNewDonor({...newDonor, email: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-luxury-gold min-h-[44px]" placeholder="john@example.com" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Phone Number</label>
                <input type="tel" value={newDonor.phone} onChange={e => setNewDonor({...newDonor, phone: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-luxury-gold min-h-[44px]" placeholder="+91 98765 43210" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Country</label>
                  <input type="text" value={newDonor.country} onChange={e => setNewDonor({...newDonor, country: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-luxury-gold min-h-[44px]" placeholder="India" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">City</label>
                  <input type="text" value={newDonor.city} onChange={e => setNewDonor({...newDonor, city: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-luxury-gold min-h-[44px]" placeholder="Mumbai" />
                </div>
              </div>
              <button  
                onClick={handleSaveDonor}
                disabled={isSaving}
                className="w-full mt-4 bg-luxury-gold hover:bg-luxury-gold/80 text-black font-semibold py-3 rounded-xl transition text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving && <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"/>}
                {isSaving ? "Saving..." : "Add Donor"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
