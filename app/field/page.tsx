'use client';

import React from "react";
import { useRouter } from "next/navigation";
import { 
  FileText, CheckCircle, Clock, AlertCircle, ArrowRight,
  MapPin, Bell, ChevronDown, PlusCircle
} from "lucide-react";

export default function FieldPortalDashboard() {
  const router = useRouter();

  const kpis = [
    { title: "Total Reports", sub: "Reports submitted", value: "12", icon: FileText, iconColor: "text-emerald-400", iconBg: "bg-emerald-500/10", borderColor: "border-emerald-500/20" },
    { title: "Pending Review", sub: "Awaiting review", value: "2", icon: Clock, iconColor: "text-amber-400", iconBg: "bg-amber-500/10", borderColor: "border-amber-500/20" },
    { title: "Approved", sub: "Reports approved", value: "8", icon: CheckCircle, iconColor: "text-green-400", iconBg: "bg-green-500/10", borderColor: "border-green-500/20" },
    { title: "Need Info", sub: "Need more info", value: "1", icon: AlertCircle, iconColor: "text-blue-400", iconBg: "bg-blue-500/10", borderColor: "border-blue-500/20" },
    { title: "Completed", sub: "Projects completed", value: "6", icon: CheckCircle, iconColor: "text-purple-400", iconBg: "bg-purple-500/10", borderColor: "border-purple-500/20" },
  ];

  const recentReports = [
    { id: 'FR-004', title: 'Masjid Roof Repair', location: 'Hyderabad, Telangana', date: '2 days ago', status: 'Pending Review', statusStyle: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    { id: 'FR-003', title: 'School Building Renovation', location: 'Nizamabad, Telangana', date: '1 week ago', status: 'Approved', statusStyle: 'bg-green-500/10 text-green-400 border-green-500/20' },
    { id: 'FR-002', title: 'Water Well Installation', location: 'Karimnagar, Telangana', date: '3 weeks ago', status: 'Completed', statusStyle: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  ];

  return (
    <div className="space-y-8">
      
      {/* Top Profile / Notification Bar (Desktop only) */}
      <div className="hidden lg:flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-400">Assalamu Alaikum,</p>
          <h1 className="text-2xl font-bold text-white mt-1 flex items-center gap-2">
            Abdul Rahman <span className="text-xl">👋</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Thank you for being a part of Daarayn Field Operations.</p>
        </div>
        <div className="flex items-center gap-4">
          <button className="relative p-2 text-gray-400 hover:text-white transition">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full border border-[#020704]"></span>
          </button>
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full py-1.5 px-1.5 pr-3 cursor-pointer hover:bg-white/10 transition">
            <div className="w-8 h-8 rounded-full bg-luxury-gold flex items-center justify-center text-[#080e1f] text-xs font-bold shadow-[0_0_10px_rgba(212,175,55,0.3)]">
              AR
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Mobile Greeting */}
      <div className="lg:hidden mb-4">
        <p className="text-xs text-gray-400">Assalamu Alaikum,</p>
        <h1 className="text-xl font-bold text-white mt-1 flex items-center gap-2">
          Abdul Rahman <span className="text-lg">👋</span>
        </h1>
        <p className="text-xs text-gray-500 mt-1">Thank you for your dedicated service.</p>
      </div>

      {/* Hero Action Banner */}
      <div className="relative bg-[#080e1f] rounded-3xl p-6 md:p-8 overflow-hidden flex flex-col md:flex-row items-center justify-between border border-white/10 shadow-xl">
        <div className="relative z-10 w-full md:w-2/3">
          <div className="flex items-center gap-3 mb-3">
             <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
               <FileText className="w-5 h-5 text-luxury-gold" />
             </div>
             <h2 className="text-xl font-bold text-white">Have you found a need<br/>that requires help?</h2>
          </div>
          <p className="text-sm text-gray-400 mb-6 max-w-md">
            Submit a new report and our team will review it.
          </p>
          <button 
            onClick={() => router.push('/field/new')}
            className="flex items-center gap-2 px-6 py-3 bg-luxury-gold hover:bg-luxury-gold/90 text-luxury-charcoal rounded-xl text-sm font-semibold transition shadow-[0_0_15px_rgba(212,175,55,0.3)] w-full md:w-auto justify-center"
          >
            <PlusCircle className="w-4 h-4" /> Report a New Need <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        
        {/* Abstract Overlay */}
        <div className="absolute right-0 bottom-0 opacity-20 w-[250px] md:w-[350px] pointer-events-none">
           <svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" className="fill-luxury-gold">
             <path d="M 10 100 L 10 60 Q 20 40 30 60 L 30 100 Z M 40 100 L 40 50 Q 55 30 70 50 L 70 100 Z M 80 100 L 80 30 Q 100 0 120 30 L 120 100 Z M 130 100 L 130 50 Q 145 30 160 50 L 160 100 Z M 170 100 L 170 70 Q 180 50 190 70 L 190 100 Z" />
           </svg>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        {kpis.map((kpi, i) => (
          <div key={i} className="admin-glass border border-white/5 rounded-2xl p-5 hover:bg-white/5 transition">
            <div className={`w-8 h-8 rounded-lg ${kpi.iconBg} ${kpi.borderColor} border flex items-center justify-center mb-3`}>
              <kpi.icon className={`w-4 h-4 ${kpi.iconColor}`} />
            </div>
            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{kpi.title}</p>
            <h2 className="text-3xl font-bold text-white my-1" style={{ fontFamily: 'var(--font-cinzel)' }}>{kpi.value}</h2>
            <p className="text-[10px] text-gray-400">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Recent Reports List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-400 tracking-widest uppercase">Recent Reports</h3>
          <button className="text-xs font-medium text-luxury-gold hover:text-white transition">View All</button>
        </div>
        
        <div className="admin-glass border border-white/5 rounded-2xl overflow-hidden">
          <div className="divide-y divide-white/5">
            {recentReports.map((report, i) => (
              <div key={i} className="p-4 md:p-5 flex items-center justify-between hover:bg-white/5 transition cursor-pointer">
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex-shrink-0 flex items-center justify-center text-gray-400 border border-white/10">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-white truncate">{report.title}</h4>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-luxury-gold" /> {report.location}
                    </p>
                  </div>
                </div>
                
                <div className="hidden md:flex items-center justify-center w-32">
                   <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold border ${report.statusStyle}`}>
                      {report.status}
                   </span>
                </div>
                
                <div className="hidden md:flex flex-col items-end w-32">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Submitted</span>
                  <span className="text-xs text-gray-300 mt-0.5">{report.date}</span>
                </div>
                
                <div className="flex-shrink-0 ml-4">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10 hover:bg-white/10 transition text-gray-400 hover:text-white">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
    </div>
  );
}
