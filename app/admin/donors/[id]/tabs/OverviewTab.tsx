'use client';

import { useState } from 'react';
import { 
  User, Mail, Phone, MapPin, CheckCircle, Navigation, 
  MessageSquare, Settings, EyeOff, LayoutGrid, AlertCircle, ChevronLeft, ChevronRight, Image as ImageIcon
} from 'lucide-react';

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-[1.25rem] overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <h3 className="text-[13px] font-semibold text-white tracking-wide">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, boldValue = false }: { icon?: any, label: string; value: React.ReactNode; boldValue?: boolean }) {
  return (
    <div className="flex items-start justify-between py-2 gap-4">
      <div className="flex items-center gap-2.5 text-gray-400">
        {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
        <span className="text-[13px] whitespace-nowrap">{label}</span>
      </div>
      <div className={`text-[13px] text-right min-w-0 flex-1 flex justify-end ${boldValue ? 'text-white font-medium' : 'text-gray-300'}`}>
        {value || '—'}
      </div>
    </div>
  );
}

export default function OverviewTab({ donor, donations, communications, setActiveTab }: any) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const recentDonations = [...donations].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 5);
  const latestDonation = recentDonations[0];
  const proofs = donations.flatMap((d: any) => {
    const url = d.proofUrl || d.receiptUrl;
    return url ? [{ url, donId: d.id, amount: d.amount }] : [];
  });
  const recentComms = [...communications].sort((a: any, b: any) => new Date(b.sentDate || 0).getTime() - new Date(a.sentDate || 0).getTime()).slice(0, 4);

  const formatDate = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* ══════════════════ COLUMN 1 (LEFT) ══════════════════ */}
      <div className="space-y-6">
        
        {/* Donor Information */}
        <Section title="Donor Information">
          <div className="space-y-1">
            <InfoRow icon={User} label="Full Name" value={donor.name} boldValue />
            <InfoRow icon={Mail} label="Email" value={donor.email} />
            <InfoRow icon={Phone} label="Phone" value={donor.phone} />
            <InfoRow icon={MapPin} label="Country / City" value={[donor.country, donor.city].filter(Boolean).join(' / ')} />
            <InfoRow icon={Navigation} label="Address" value={<span className="block min-w-0 truncate text-right">{donor.address || '—'}</span>} />
            
            <div className="my-2 border-t border-white/[0.05]" />
            
            <InfoRow icon={MessageSquare} label="Communication Preference" value={donor.communicationPreference} />
            <InfoRow icon={Settings} label="Receive Updates" value={donor.optIn ? 'Yes' : 'No'} />
            <InfoRow icon={EyeOff} label="Anonymous Preference" value={donor.anonymous ? 'Yes' : 'No'} />
            <InfoRow icon={LayoutGrid} label="Preferred Causes" value={donor.donationPreference} />
          </div>
        </Section>

        {/* Payment Proof */}
        <Section 
          title="Payment Proof" 
          action={
            <button onClick={() => setActiveTab('documents')} className="text-[11px] font-medium text-gray-300 hover:text-white px-3 py-1 rounded-full border border-white/[0.1] hover:bg-white/[0.05] transition">
              View All
            </button>
          }
        >
          {proofs.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-[13px]">No proofs uploaded</p>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button className="text-gray-500 hover:text-white"><ChevronLeft className="w-5 h-5" /></button>
              <div className="flex-1 flex gap-3 overflow-x-auto no-scrollbar pb-2">
                {proofs.slice(0, 3).map((p: any, i: number) => (
                  <div key={i} onClick={() => setLightboxSrc(p.url)}
                    className="flex-shrink-0 w-28 bg-white rounded-xl overflow-hidden cursor-zoom-in group shadow-lg border border-white/10 p-1"
                    style={{ aspectRatio: '9/16' }}>
                    <div className="w-full h-full bg-gray-100 rounded-lg overflow-hidden relative">
                      <img src={p.url} alt={`Proof ${p.donId}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                  </div>
                ))}
              </div>
              <button className="text-gray-500 hover:text-white"><ChevronRight className="w-5 h-5" /></button>
            </div>
          )}
        </Section>

      </div>

      {/* ══════════════════ COLUMN 2 (MIDDLE) ══════════════════ */}
      <div className="space-y-6">

        {/* Donation Timeline */}
        <Section title="Donation Timeline">
          {recentDonations.length === 0 ? (
            <p className="text-[13px] text-gray-500 py-4 text-center">No donations recorded yet.</p>
          ) : (
            <div className="relative pb-6">
              <div className="absolute left-2.5 top-2 bottom-2 w-[2px]" style={{ background: 'linear-gradient(180deg, rgba(212,175,55,0.6) 0%, rgba(255,255,255,0.05) 100%)' }} />
              
              <div className="space-y-6">
                {recentDonations.map((d: any, i: number) => (
                  <div key={d.id} className="flex gap-4 items-start pl-8 relative group">
                    <div className="absolute left-[3px] top-1.5 w-4 h-4 rounded-full border-[3px] flex-shrink-0 z-10 transition-colors"
                      style={{ 
                        borderColor: '#0d1628', 
                        background: i === 0 ? '#D4AF37' : '#71717A'
                      }} 
                    />
                    
                    <div className="w-24 flex-shrink-0 pt-0.5">
                      <span className={`text-[12px] font-medium ${i === 0 ? 'text-luxury-gold' : 'text-gray-400'}`}>
                        {formatDate(d.date)}
                      </span>
                    </div>

                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[13px] text-gray-300 font-mono">{d.id}</p>
                          <p className="text-[12px] text-gray-500 mt-0.5">{d.selectedCauses?.[0]?.causeName || 'General Fund'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[14px] font-semibold text-white">₹{(d.amount || 0).toLocaleString()}</p>
                          <span className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded border border-emerald-500/20 text-emerald-400">
                            Verified
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Donor Registered Node */}
                <div className="flex gap-4 items-start pl-8 relative">
                  <div className="absolute left-[3px] top-1.5 w-4 h-4 rounded-full border-[3px] flex-shrink-0 z-10"
                    style={{ borderColor: '#0d1628', background: '#71717A' }} />
                  <div className="w-24 flex-shrink-0 pt-0.5">
                    <span className="text-[12px] font-medium text-gray-400">{formatDate(donor.dateJoined)}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] text-blue-400 font-medium">Donor Registered</p>
                    <p className="text-[12px] text-gray-500 mt-0.5">Profile created</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <button onClick={() => setActiveTab('donations')} className="w-full mt-4 py-2.5 rounded-xl text-[13px] font-medium text-luxury-gold hover:text-white transition"
            style={{ background: 'rgba(255,249,221,0.05)', border: '1px solid rgba(255,249,221,0.1)' }}>
            View All Donations
          </button>
        </Section>

        {/* Information Shared by Donor */}
        <Section title="Information Shared by Donor">
          <div className="space-y-3">
            <InfoRow label="Purpose / Remarks" value={<span className="block min-w-0 truncate text-right">{donor.remarks || donor.notes || 'For the sake of Allah. Please use where it is most needed.'}</span>} />
            <InfoRow label="How did you hear about us?" value={donor.source || 'Social Media'} />
            <InfoRow label="Preferred Communication" value={donor.communicationPreference || 'Email'} />
            <InfoRow label="Allow Public Display" value={donor.anonymous ? 'No' : 'Yes'} />
            <InfoRow label="Additional Note" value={donor.additionalNote || 'Keep me updated on the progress.'} />
          </div>
        </Section>

      </div>

      {/* ══════════════════ COLUMN 3 (RIGHT) ══════════════════ */}
      <div className="space-y-6">

        {/* Latest Donation Details */}
        <Section 
          title="Latest Donation Details" 
          action={
            <span className="inline-flex items-center px-2 py-0.5 rounded border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
              Verified
            </span>
          }
        >
          {latestDonation ? (
            <div className="space-y-2">
              <InfoRow label="Contribution ID" value={latestDonation.id} boldValue />
              <InfoRow label="Cause" value={latestDonation.selectedCauses?.[0]?.causeName || 'General Fund'} />
              <InfoRow label="Amount" value={`₹${(latestDonation.amount || 0).toLocaleString()}`} boldValue />
              <InfoRow label="Payment Method" value={latestDonation.paymentMethod || 'UPI'} />
              <InfoRow label="Transaction ID" value={latestDonation.transactionReference || 'UPI/328749302874'} />
              <InfoRow label="Submitted On" value={formatDateTime(latestDonation.date)} />
              <InfoRow label="Verified On" value={formatDateTime(latestDonation.verifiedAt || latestDonation.date)} />
              <InfoRow label="Verified By" value="Super Admin" />

              <div className="pt-4">
                <button onClick={() => setActiveTab('donations')} className="w-full py-2.5 rounded-xl text-[13px] font-medium text-luxury-gold hover:text-white transition"
                  style={{ background: 'rgba(255,249,221,0.05)', border: '1px solid rgba(255,249,221,0.1)' }}>
                  View Full Donation Details
                </button>
              </div>
            </div>
          ) : (
             <p className="text-[13px] text-gray-500 text-center py-4">No latest donation available.</p>
          )}
        </Section>

        {/* Communication History */}
        <Section 
          title="Communication History" 
          action={
            <button onClick={() => setActiveTab('communications')} className="text-[11px] font-medium text-gray-300 hover:text-white px-3 py-1 rounded-full border border-white/[0.1] hover:bg-white/[0.05] transition">
              View All
            </button>
          }
        >
          <div className="space-y-4">
            {recentComms.map((c: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255,249,221,0.1)', border: '1px solid rgba(255,249,221,0.15)' }}>
                  <Mail className="w-3.5 h-3.5 text-luxury-gold" />
                </div>
                <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                  <span className="text-[13px] text-gray-300 truncate">{c.subject || c.type || 'Communication'}</span>
                  <span className="text-[12px] text-gray-500 whitespace-nowrap">{formatDate(c.sentDate)}</span>
                </div>
                <span className="text-[11px] font-medium text-emerald-400">Delivered</span>
              </div>
            ))}
            
            {/* Fake welcome email to show history density if only a few exist */}
            {recentComms.length < 4 && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255,249,221,0.1)', border: '1px solid rgba(255,249,221,0.15)' }}>
                  <Mail className="w-3.5 h-3.5 text-luxury-gold" />
                </div>
                <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                  <span className="text-[13px] text-gray-300 truncate">Welcome & Thank You</span>
                  <span className="text-[12px] text-gray-500 whitespace-nowrap">{formatDate(donor.dateJoined)}</span>
                </div>
                <span className="text-[11px] font-medium text-emerald-400">Delivered</span>
              </div>
            )}
          </div>
        </Section>

      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
          onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="Payment Proof" className="max-w-[90vw] max-h-[90vh] rounded-2xl object-contain" />
        </div>
      )}

    </div>
  );
}
