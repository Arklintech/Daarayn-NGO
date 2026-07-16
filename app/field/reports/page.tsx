'use client';

import React, { useState } from "react";
import { FileText, MapPin, ArrowRight, Clock } from "lucide-react";

export default function MyReportsPage() {
  const [activeTab, setActiveTab] = useState('All');
  
  const recentReports = [
    { id: 'FR-004', title: 'Masjid Roof Repair', location: 'Hyderabad, Telangana', date: 'Submitted on 18 Jul 2026', status: 'Pending Review', statusStyle: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    { id: 'FR-003', title: 'School Renovation', location: 'Nizamabad, Telangana', date: 'Submitted on 10 Jul 2026', status: 'Approved', statusStyle: 'bg-green-500/10 text-green-400 border-green-500/20' },
    { id: 'FR-002', title: 'Water Well Installation', location: 'Karimnagar, Telangana', date: 'Submitted on 28 Jun 2026', status: 'Completed', statusStyle: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      
      {/* Header & Tabs */}
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-white tracking-wide" style={{ fontFamily: 'var(--font-cinzel)' }}>MY REPORTS</h1>
        
        <div className="flex bg-white/5 border border-white/10 rounded-lg p-1 w-full md:w-fit">
          {['All', 'Pending', 'Approved', 'Completed'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === tab ? 'bg-luxury-gold text-luxury-charcoal shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Reports List */}
      <div className="admin-glass border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="divide-y divide-white/10">
          {recentReports.map((report, i) => (
            <div key={i} className="p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/5 transition cursor-pointer">
              <div className="flex gap-4">
                <div className="w-16 h-16 rounded-xl bg-white/5 flex-shrink-0 border border-white/10 flex items-center justify-center text-luxury-gold">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-white">{report.title}</h4>
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3 text-luxury-gold" /> {report.location}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${report.statusStyle}`}>
                      {report.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 flex items-center gap-1"><Clock className="w-3 h-3" /> {report.date}</p>
                </div>
              </div>
              <div className="hidden md:flex">
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition">
                  <ArrowRight className="w-5 h-5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
