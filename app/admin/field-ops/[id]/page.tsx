'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Edit3, MoreHorizontal, MapPin,
  ShieldCheck, CheckCircle, FileText,
  MessageSquare, User, AlertTriangle, ChevronDown, Clock, Image as ImageIcon
} from 'lucide-react';

type TabId = 'overview' | 'conversation' | 'media' | 'verification' | 'history';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',        label: 'Overview' },
  { id: 'conversation',    label: 'Conversation' },
  { id: 'media',           label: 'Media Gallery' },
  { id: 'verification',    label: 'Verification' },
  { id: 'history',         label: 'Timeline' }
];

export default function FieldReportWorkspace() {
  const params = useParams();
  const router = useRouter();
  const reportId = params?.id as string;

  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    async function load() {
      setLoading(true);
      try {
        const reportRef = doc(db, 'field_reports', reportId);
        const reportSnap = await getDoc(reportRef);
        if (reportSnap.exists()) {
          setReport({ id: reportSnap.id, ...reportSnap.data() });
        } else {
          // Mock data for UI testing since collections might be empty
          setReport({
            id: reportId,
            title: 'Emergency Flood Relief',
            description: 'Severe flooding has displaced 50 families in the Silchar district. Urgent need for tents, clean water, and non-perishable food items.',
            category: 'Disaster Relief',
            priority: 'Urgent',
            status: 'Pending Review',
            submittedBy: 'Ali Khan',
            fieldAgentId: 'FA-01',
            createdAt: new Date().toISOString(),
            estimatedBudget: 500000,
            beneficiaries: { families: 50, children: 120, women: 60, elderly: 20 },
            location: { country: 'India', state: 'Assam', district: 'Silchar', village: 'Barik Nagar', gps: '24.8333, 92.7833' }
          });
        }
      } catch (err) {
        console.error('Error loading report workspace:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [reportId]);

  const handleAction = async (action: string) => {
    setMoreOpen(false);
    
    if (action === 'Convert Into Cause') {
      if (confirm(`Are you sure you want to convert "${report.title}" into a new Cause?`)) {
        try {
          // This simulates creating a draft cause
          const newCauseId = `CAUSE-${Date.now()}`;
          const causeData = {
            title: report.title,
            description: report.description,
            category: report.category,
            location: report.location?.state || 'Unknown',
            targetAmount: report.estimatedBudget,
            status: 'Draft',
            fieldReportId: report.id,
            createdAt: new Date().toISOString()
          };
          
          await setDoc(doc(db, 'causes', newCauseId), causeData);
          
          // Update report status
          await setDoc(doc(db, 'field_reports', report.id), { status: 'Converted to Cause' }, { merge: true });
          setReport({ ...report, status: 'Converted to Cause' });
          
          alert("Successfully converted to Cause Draft! Navigating to Cause Management...");
          router.push(`/admin/causes/${newCauseId}`);
        } catch (e) {
          console.error(e);
          alert("Failed to convert into cause.");
        }
      }
    }
    else if (action === 'Approve Report') {
      await setDoc(doc(db, 'field_reports', report.id), { status: 'Approved' }, { merge: true });
      setReport({ ...report, status: 'Approved' });
      alert("Report Approved.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-luxury-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!report) return null;

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-6">
      
      {/* Back Button */}
      <div>
        <button onClick={() => router.push('/admin/field-ops')} className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition group w-fit">
          <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition">
            <ArrowLeft className="w-4 h-4" />
          </div>
          Back to Field Operations
        </button>
      </div>

      {/* ═══════════════════ HEADER CARD ═══════════════════ */}
      <div className="admin-glass border border-white/[0.06] rounded-3xl p-6 relative">
        <div className="flex flex-col xl:flex-row justify-between gap-8">
          
          {/* LEFT: Report Identity & Actions */}
          <div className="flex flex-1 gap-6">
            {/* Avatar/Icon */}
            <div className="relative flex-shrink-0">
              <div className="w-24 h-24 rounded-full flex items-center justify-center text-3xl text-luxury-gold"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,249,221,0.2)' }}>
                <FileText className="w-10 h-10 text-luxury-gold" />
              </div>
              <div className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 rounded-full border-[3px] border-[#080e1f] flex items-center justify-center">
                <CheckCircle className="w-3.5 h-3.5 text-[#080e1f]" />
              </div>
            </div>

            {/* Info & Actions */}
            <div className="flex-1 space-y-4 pt-1">
              {/* Top Row: Title/ID and Action Buttons */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-semibold text-white tracking-tight">{report.title}</h1>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                      report.priority === 'Urgent' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-luxury-gold/10 text-luxury-gold border-luxury-gold/20'
                    }`}>
                      {report.priority}
                    </span>
                  </div>
                  <p className="text-sm font-mono text-gray-400 mt-1">{report.id}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <button className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-sm font-medium text-white transition">
                    <Edit3 className="w-4 h-4 text-gray-400" />
                    Edit
                  </button>
                  <button 
                    onClick={() => handleAction('Convert Into Cause')}
                    className="flex items-center gap-2 px-5 py-2.5 bg-luxury-gold hover:bg-luxury-gold/80 border border-luxury-gold/50 rounded-xl text-sm font-medium text-luxury-charcoal shadow-[0_0_15px_rgba(212,175,55,0.3)] transition"
                  >
                    Convert Into Cause
                  </button>
                  
                  {/* More Actions Dropdown */}
                  <div className="relative">
                    <button 
                      onClick={() => setMoreOpen(!moreOpen)}
                      className="w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                    {moreOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                        <div className="absolute right-0 mt-2 w-56 bg-[#0e141d] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden py-1">
                          <button onClick={() => handleAction('Approve Report')} className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-gray-400" /> Approve Report
                          </button>
                          <button onClick={() => handleAction('Request Info')} className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-gray-400" /> Request Information
                          </button>
                          <button onClick={() => handleAction('Mark Urgent')} className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-400" /> Mark Urgent
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact/Location Grid */}
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <User className="w-4 h-4 text-gray-500" />
                  Submitted by {report.submittedBy}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  {report.location?.district}, {report.location?.state}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <ShieldCheck className="w-4 h-4 text-gray-500" />
                  Status: <span className="text-white">{report.status}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* RIGHT: Quick KPI Summary */}
          <div className="w-full xl:w-[280px] bg-black/20 rounded-2xl p-4 flex flex-col justify-center border border-white/5">
            <div className="space-y-4">
              <div>
                <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wider block mb-1">Estimated Budget</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white tracking-wide" style={{ fontFamily: 'var(--font-cinzel)' }}>
                    ₹{report.estimatedBudget?.toLocaleString() || '0'}
                  </span>
                </div>
              </div>
              <div className="h-[1px] w-full bg-white/10" />
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wider block mb-1">Beneficiaries</span>
                  <span className="text-sm font-semibold text-white">{report.beneficiaries?.families || 0} Families</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wider block mb-1">Date</span>
                  <span className="text-sm font-semibold text-white">{formatDate(report.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-1 mt-8 border-b border-white/[0.06] overflow-x-auto no-scrollbar pb-px">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium rounded-t-lg transition relative whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'text-luxury-gold bg-white/[0.03]' 
                  : 'text-gray-400 hover:text-white hover:bg-white/[0.02]'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div layoutId="activeTabFieldReport" className="absolute bottom-0 left-0 right-0 h-0.5 bg-luxury-gold shadow-[0_0_8px_rgba(212,175,55,0.5)]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════ TAB CONTENT AREA ═══════════════════ */}
      <div className="min-h-[400px]">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="admin-glass border border-white/[0.06] rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-white uppercase tracking-widest mb-4">Detailed Description</h3>
              <p className="text-gray-300 text-sm leading-relaxed">{report.description}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="admin-glass border border-white/[0.06] rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-white uppercase tracking-widest mb-4">Location Details</h3>
                <div className="space-y-3 text-sm text-gray-300">
                  <div className="flex justify-between"><span className="text-gray-500">Country:</span> <span>{report.location?.country}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">State:</span> <span>{report.location?.state}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">District:</span> <span>{report.location?.district}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Village:</span> <span>{report.location?.village}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">GPS:</span> <span className="font-mono text-luxury-gold">{report.location?.gps}</span></div>
                </div>
              </div>
              <div className="admin-glass border border-white/[0.06] rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-white uppercase tracking-widest mb-4">Beneficiary Breakdown</h3>
                <div className="space-y-3 text-sm text-gray-300">
                  <div className="flex justify-between"><span className="text-gray-500">Total Families:</span> <span>{report.beneficiaries?.families}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Children:</span> <span>{report.beneficiaries?.children}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Women:</span> <span>{report.beneficiaries?.women}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Elderly:</span> <span>{report.beneficiaries?.elderly}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'conversation' && (
          <div className="admin-glass border border-white/[0.06] rounded-2xl p-6 flex flex-col h-[500px]">
            <h3 className="text-sm font-semibold text-white uppercase tracking-widest mb-4">Report Conversation</h3>
            <div className="flex-1 bg-black/20 rounded-xl border border-white/5 p-4 flex items-center justify-center text-gray-500 text-sm">
              <div className="text-center">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No messages yet.</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <input type="text" placeholder="Type a message to the field agent..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-luxury-gold" />
              <button className="px-6 py-2 bg-luxury-gold text-luxury-charcoal rounded-xl text-sm font-medium">Send</button>
            </div>
          </div>
        )}

        {(activeTab !== 'overview' && activeTab !== 'conversation') && (
          <div className="admin-glass border border-white/[0.06] rounded-2xl p-12 text-center">
            <h3 className="text-lg font-medium text-white mb-2">Tab Under Construction</h3>
            <p className="text-sm text-gray-400">The {TABS.find(t => t.id === activeTab)?.label} section is currently being integrated with the global ecosystem.</p>
          </div>
        )}
      </div>
    </div>
  );
}
