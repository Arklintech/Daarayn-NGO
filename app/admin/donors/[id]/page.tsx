'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DEFAULT_CAUSES } from "@/lib/causes";
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
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', country: '', city: '' });

  useEffect(() => {
    if (donor) {
      setEditForm({
        name: donor.name || '',
        email: donor.email || '',
        phone: donor.phone || '',
        country: donor.country || 'India',
        city: donor.city || ''
      });
    }
  }, [donor]);

  const handleSaveEdit = async () => {
    try {
      await fetch('/api/donors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: donorId, ...editForm, updatedAt: new Date().toISOString() })
      });
      setDonor((prev: any) => ({ ...prev, ...editForm }));
      setIsEditOpen(false);
    } catch (err) {
      console.error("Failed to update donor profile:", err);
    }
  };

  useEffect(() => {
    if (!donorId) return;
    async function load() {
      setLoading(true);
      const decodedId = decodeURIComponent(donorId);
      let donorData: any = null;

      // 1. Fetch Donors
      try {
        const dRes = await fetch('/api/donors');
        if (dRes.ok) {
          const list = await dRes.json();
          const allDonors = Array.isArray(list) ? list : list.donors || [];
          donorData = allDonors.find((d: any) => 
            d.id === donorId || 
            d.id === decodedId ||
            (d.email && d.email.toLowerCase() === decodedId.toLowerCase())
          );
        }
      } catch (err) {
        console.warn('Failed to fetch /api/donors:', err);
      }

      if (!donorData) {
        donorData = {
          id: decodedId,
          name: decodedId.includes('@') ? decodedId.split('@')[0] : "Verified Donor",
          email: decodedId.includes('@') ? decodedId : "donor@example.com",
          phone: "+91 98765 43210",
          country: "India",
          city: "Mumbai",
          dateJoined: new Date().toISOString(),
          status: "active"
        };
      }
      setDonor(donorData);

      // 2. Fetch Donations
      try {
        const donRes = await fetch('/api/admin/donations');
        if (donRes.ok) {
          const donData = await donRes.json();
          const allDonations = donData.success && Array.isArray(donData.donations) ? donData.donations : Array.isArray(donData) ? donData : [];
          const filtered = allDonations.filter((d: any) => 
            d.donorId === donorId || 
            d.donorId === decodedId || 
            (d.donor && d.donor.toLowerCase() === donorData.name?.toLowerCase()) || 
            (d.donorEmail && d.donorEmail.toLowerCase() === donorData.email?.toLowerCase())
          );
          setDonations(filtered);
        }
      } catch (err) {
        console.warn('Failed to fetch /api/admin/donations:', err);
      }

      // 3. Fetch Causes
      try {
        const cRes = await fetch('/api/causes');
        if (cRes.ok) {
          const cData = await cRes.json();
          const causeList = cData.success && Array.isArray(cData.causes) ? cData.causes : Array.isArray(cData) ? cData : DEFAULT_CAUSES;
          setCauses(causeList);
        } else {
          setCauses(DEFAULT_CAUSES);
        }
      } catch (err) {
        setCauses(DEFAULT_CAUSES);
      }

      // 4. Fetch Communications
      try {
        const commRes = await fetch('/api/admin/communications');
        if (commRes.ok) {
          const commData = await commRes.json();
          const allComms = commData.success && Array.isArray(commData.communications) ? commData.communications : Array.isArray(commData) ? commData : [];
          const filtered = allComms.filter((c: any) => 
            c.donorId === donorId || 
            c.donorId === decodedId || 
            (c.recipientEmail && c.recipientEmail.toLowerCase() === donorData.email?.toLowerCase())
          );
          setCommunications(filtered);
        }
      } catch (err) {
        console.warn('Failed to fetch /api/admin/communications:', err);
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
      if (donor?.email) {
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
      a.download = `donor_profile_${donor?.id || 'export'}.json`;
      a.click();
    }
    else if (action === 'Deactivate') {
      if (confirm(`Are you sure you want to deactivate ${donor?.name}?`)) {
        setDonor({ ...donor, status: 'inactive' });
        alert("Donor deactivated successfully.");
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

  if (!donor) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-gray-400 text-sm">Donor record could not be loaded.</p>
        <button onClick={() => router.push('/admin/donors')} className="px-4 py-2 bg-luxury-gold text-black font-semibold rounded-xl text-xs">
          Back to Donors
        </button>
      </div>
    );
  }

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
                  <button onClick={() => setIsEditOpen(true)}
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

      {/* Edit Donor Profile Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0b1324] border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Edit Donor Profile</h3>
              <button onClick={() => setIsEditOpen(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-gray-400 block mb-1 font-medium">Full Name</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-luxury-gold" />
              </div>
              <div>
                <label className="text-gray-400 block mb-1 font-medium">Email Address</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-luxury-gold" />
              </div>
              <div>
                <label className="text-gray-400 block mb-1 font-medium">Phone Number</label>
                <input type="text" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-luxury-gold" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 block mb-1 font-medium">Country</label>
                  <input type="text" value={editForm.country} onChange={e => setEditForm({ ...editForm, country: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-luxury-gold" />
                </div>
                <div>
                  <label className="text-gray-400 block mb-1 font-medium">City</label>
                  <input type="text" value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-luxury-gold" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
              <button onClick={() => setIsEditOpen(false)} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white text-xs font-semibold">
                Cancel
              </button>
              <button onClick={handleSaveEdit} className="px-4 py-2 rounded-xl bg-luxury-gold text-black font-bold text-xs hover:bg-luxury-gold/80">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
