'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Edit3, MoreHorizontal, Mail, Phone, MapPin,
  ShieldCheck, CheckCircle, DollarSign, Heart,
  MessageSquare, BarChart2, FileText, Bookmark, Cpu, User, Layers, Gift, Landmark, ChevronDown
} from 'lucide-react';

import OverviewTab from './tabs/OverviewTab';
import DonationsTab from './tabs/DonationsTab';
import CommunicationsTab from './tabs/CommunicationsTab';
import DocumentsTab from './tabs/DocumentsTab';
import LedgerTab from './tabs/LedgerTab';
import AnalyticsTab from './tabs/AnalyticsTab';
import AdminNotesTab from './tabs/AdminNotesTab';
import KhizrTab from './tabs/KhizrTab';

type TabId = 'overview' | 'donations' | 'communications' | 'documents' | 'ledger' | 'analytics' | 'notes' | 'khizr';

const TABS: { id: TabId; label: string; icon?: any }[] = [
  { id: 'overview',        label: 'Overview' },
  { id: 'donations',       label: 'Donations' },
  { id: 'communications',  label: 'Communications' },
  { id: 'documents',       label: 'Documents' },
  { id: 'ledger',          label: 'Ledger' },
  { id: 'notes',           label: 'Notes' },
  { id: 'analytics',       label: 'Analytics' },
  { id: 'khizr',           label: 'Khizr Summary' },
];

export default function DonorWorkspace() {
  const params = useParams();
  const router = useRouter();
  const donorId = params?.id as string;

  const [donor, setDonor] = useState<any>(null);
  const [donations, setDonations] = useState<any[]>([]);
  const [causes, setCauses] = useState<any[]>([]);
  const [communications, setCommunications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!donorId) return;
    async function load() {
      setLoading(true);
      try {
        const donorRef = doc(db, 'donors', donorId);
        const donorSnap = await getDoc(donorRef);
        if (donorSnap.exists()) {
          setDonor({ id: donorSnap.id, ...donorSnap.data() });
        }

        const donSnap = await getDocs(query(collection(db, 'donations'), where('donorId', '==', donorId)));
        const donList: any[] = [];
        donSnap.forEach(d => donList.push({ id: d.id, ...d.data() }));
        setDonations(donList);

        const causeSnap = await getDocs(collection(db, 'causes'));
        const causeList: any[] = [];
        causeSnap.forEach(d => causeList.push({ id: d.id, ...d.data() }));
        setCauses(causeList);

        const commSnap = await getDocs(collection(db, 'communications'));
        const commList: any[] = [];
        commSnap.forEach(d => {
          const data = d.data();
          if (data.donorId === donorId || data.recipientEmail === donorSnap.data()?.email) {
            commList.push({ id: d.id, ...data });
          }
        });
        setCommunications(commList);
      } catch (err) {
        console.error('Error loading donor workspace:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [donorId]);

  const handleAction = async (action: string) => {
    setMoreOpen(false);
    
    if (action === 'Download Receipt') {
      const lastDonation = donations.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())[0];
      if (!lastDonation) {
        alert("No donations found to generate a receipt.");
        return;
      }
      const receiptText = `DAARAYN RECEIPT\n\nDonor: ${donor.name}\nID: ${donor.id}\nDate: ${new Date(lastDonation.date).toLocaleDateString()}\nAmount: INR ${lastDonation.amount}\nReference: ${lastDonation.transactionReference || 'N/A'}\n\nThank you for your generous contribution.`;
      const blob = new Blob([receiptText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt_${lastDonation.id}.txt`;
      a.click();
    } 
    else if (action === 'Send Communication') {
      if (donor.email) {
        window.location.href = `mailto:${donor.email}?subject=Daarayn%20Update`;
      } else {
        alert("No email address on file for this donor.");
      }
    }
    else if (action === 'Export Profile') {
      const exportData = { donor, donations, communications };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `donor_profile_${donor.id}.json`;
      a.click();
    }
    else if (action === 'Deactivate') {
      if (confirm(`Are you sure you want to deactivate ${donor.name}?`)) {
        try {
          const donorRef = doc(db, 'donors', donorId);
          await setDoc(donorRef, { status: 'inactive' }, { merge: true });
          setDonor({ ...donor, status: 'inactive' });
          alert("Donor deactivated successfully.");
        } catch (e) {
          console.error(e);
          alert("Failed to deactivate donor.");
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-luxury-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!donor) return null;

  const initials = (donor.name || 'A').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  const lifetimeGiving = donations.reduce((s: number, d: any) => s + (d.amount || 0), 0) || donor.totalAmountDonated || 0;
  const causesSupported = new Set(donations.flatMap((d: any) => (d.selectedCauses || []).map((c: any) => c.causeId))).size;
  const lastDonation = donations.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())[0];

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const tabProps = { donor, donations, causes, communications, donorId, setActiveTab };

  return (
    <div className="space-y-6">
      
      {/* Back Button */}
      <div>
        <button onClick={() => router.push('/admin/donors')} className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition group w-fit">
          <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition">
            <ArrowLeft className="w-4 h-4" />
          </div>
          Back to Donors
        </button>
      </div>

      {/* ═══════════════════ HEADER CARD ═══════════════════ */}
      <div className="admin-glass border border-white/[0.06] rounded-3xl p-6 relative">
        <div className="flex flex-col xl:flex-row justify-between gap-8">
          
          {/* LEFT: Donor Identity & Actions */}
          <div className="flex flex-col sm:flex-row flex-1 gap-6 items-center sm:items-start text-center sm:text-left">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-luxury-gold"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,249,221,0.2)' }}>
                {initials}
              </div>
              <div className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 rounded-full border-[3px] border-[#080e1f] flex items-center justify-center">
                <ShieldCheck className="w-3.5 h-3.5 text-[#080e1f]" />
              </div>
            </div>

            {/* Info & Actions */}
            <div className="flex-1 space-y-4 pt-1 w-full">
              {/* Top Row: Name/ID and Action Buttons */}
              <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-4 w-full">
                <div className="flex flex-col items-center sm:items-start">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                    <h1 className="text-2xl font-semibold text-white tracking-tight">{donor.name || 'Anonymous Donor'}</h1>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                      Verified Donor
                    </span>
                  </div>
                  <p className="text-sm font-mono text-gray-400 mt-1">{donor.id}</p>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                  <button onClick={() => alert('Edit Donor functionality coming soon')}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition hover:bg-white/5 whitespace-nowrap"
                    style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
                    <Edit3 className="w-4 h-4" /> Edit Donor
                  </button>
                  <div className="relative">
                    <button onClick={() => setMoreOpen(!moreOpen)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[#080e1f] transition hover:opacity-90 whitespace-nowrap"
                      style={{ background: 'linear-gradient(135deg, rgba(255,249,221,1), rgba(212,175,55,1))' }}>
                      More Actions <ChevronDown className="w-4 h-4" />
                    </button>
                    {moreOpen && (
                      <div className="absolute right-0 top-12 w-48 rounded-xl overflow-hidden z-50 py-1"
                        style={{ background: '#0d1628', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
                        {['Download Receipt', 'Send Communication', 'Export Profile', 'Deactivate'].map(a => (
                          <button key={a} onClick={() => handleAction(a)}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition block">
                            {a}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact row */}
              <div className="flex flex-wrap items-center gap-6 text-sm text-gray-400">
                {donor.email && (
                  <span className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-500" /> {donor.email}</span>
                )}
                {donor.phone && (
                  <span className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-500" /> {donor.phone}</span>
                )}
                {(donor.city || donor.country) && (
                  <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-500" /> {[donor.city, donor.country].filter(Boolean).join(', ')}</span>
                )}
              </div>

              {/* Pills row */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <div className="px-3 py-1.5 rounded-full text-xs text-gray-400" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  Member Since: <span className="text-gray-300 ml-1">{donor.dateJoined ? formatDate(donor.dateJoined) : '—'}</span>
                </div>
                <div className="px-3 py-1.5 rounded-full text-xs text-gray-400" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  Last Contribution: <span className="text-gray-300 ml-1">{lastDonation?.date ? formatDate(lastDonation.date) : donor.lastContributionDate ? formatDate(donor.lastContributionDate) : '—'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Vertically Stacked Metric Cards */}
          <div className="flex flex-col gap-3 w-full xl:w-[260px]">
            <div className="p-4 rounded-2xl flex items-center justify-between"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <p className="text-[11px] text-gray-400 mb-1 tracking-wide">Lifetime Giving</p>
                <p className="text-xl font-semibold text-white tracking-tight">₹{lifetimeGiving.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,249,221,0.05)', border: '1px solid rgba(255,249,221,0.15)' }}>
                <Heart className="w-4 h-4 text-luxury-gold" />
              </div>
            </div>

            <div className="p-4 rounded-2xl flex items-center justify-between"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <p className="text-[11px] text-gray-400 mb-1 tracking-wide">Total Donations</p>
                <p className="text-xl font-semibold text-white tracking-tight">{donor.totalDonations || donations.length || 0}</p>
              </div>
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,249,221,0.05)', border: '1px solid rgba(255,249,221,0.15)' }}>
                <Gift className="w-4 h-4 text-luxury-gold" />
              </div>
            </div>

            <div className="p-4 rounded-2xl flex items-center justify-between"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <p className="text-[11px] text-gray-400 mb-1 tracking-wide">Causes Supported</p>
                <p className="text-xl font-semibold text-white tracking-tight">{causesSupported || donor.projectsSupportedCount || 0}</p>
              </div>
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,249,221,0.05)', border: '1px solid rgba(255,249,221,0.15)' }}>
                <Landmark className="w-4 h-4 text-luxury-gold" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════ TAB NAVIGATION ═══════════════════ */}
      <div className="border-b border-white/[0.06]">
        <div className="flex gap-8 overflow-x-auto px-2">
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-4 text-sm font-medium whitespace-nowrap transition-colors relative ${
                  active ? 'text-luxury-gold' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab.label}
                {active && (
                  <motion.div
                    layoutId="activeTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-[2px]"
                    style={{ background: 'linear-gradient(90deg, rgba(255,249,221,1), rgba(212,175,55,1))' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════ TAB CONTENT ═══════════════════ */}
      <div className="pt-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'overview'       && <OverviewTab       {...tabProps} />}
            {activeTab === 'donations'      && <DonationsTab      {...tabProps} />}
            {activeTab === 'communications' && <CommunicationsTab {...tabProps} />}
            {activeTab === 'documents'      && <DocumentsTab      {...tabProps} />}
            {activeTab === 'ledger'         && <LedgerTab         {...tabProps} />}
            {activeTab === 'analytics'      && <AnalyticsTab      {...tabProps} />}
            {activeTab === 'notes'          && <AdminNotesTab     {...tabProps} />}
            {activeTab === 'khizr'          && <KhizrTab          {...tabProps} />}
          </motion.div>
        </AnimatePresence>
      </div>

    </div>
  );
}
