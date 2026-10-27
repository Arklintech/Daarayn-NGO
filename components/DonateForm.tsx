'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { IndianRupee, User, Mail, UploadCloud, CheckCircle2, ShieldCheck, FileImage, Loader2, Check, ChevronDown, Sparkles } from 'lucide-react';
import DonationSuccess from './DonationSuccess';
import { getCauseMeta } from './QuickDonationRibbon';
import { toggleDonationCause } from '@/lib/donations/causeToggle';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

const InputWrapper = ({ icon: Icon, children, label, required }: any) => (
  <motion.div variants={itemVariants} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
    <label style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', fontWeight: 500, letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
      {label} {required && <span style={{ color: 'var(--ivory-light)' }}>*</span>}
    </label>
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <Icon style={{ position: 'absolute', left: '1rem', color: 'var(--gold-base)', opacity: 0.8, pointerEvents: 'none' }} size={18} />
      {children}
    </div>
  </motion.div>
);

// Safe string normalization helper
const normStr = (s?: string) => (s || '').toLowerCase().trim().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');

const isGeneralCause = (c: any) => c.id === 'general' || normStr(c.name || c.title).startsWith('general');

// Display name + subtitle for a cause row (submission still uses the full cause name)
const getCauseLabel = (c: any) => isGeneralCause(c)
  ? { name: 'General Donation', desc: 'Where Most Needed' }
  : { name: c.name || c.title || 'Cause', desc: c.category };

interface DonateFormProps {
  initialAmount?: string;
  initialCurrency?: string;
  initialCause?: string;
  hideCausesGrid?: boolean;
  onSuccess?: (data: any) => void;
}

export default function DonateForm({ initialAmount = '', initialCurrency = 'INR', initialCause = '', hideCausesGrid = false, onSuccess }: DonateFormProps) {
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const [causes, setCauses] = useState<any[]>([]);
  const [selectedCausesList, setSelectedCausesList] = useState<string[]>([]);
  const [isCauseOpen, setIsCauseOpen] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const causeRef = useRef<HTMLDivElement>(null);
  // Same key for retries of one submission, so the server never records it twice.
  const submissionKeyRef = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!isCauseOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (causeRef.current && !causeRef.current.contains(event.target as Node)) setIsCauseOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsCauseOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCauseOpen]);

  useEffect(() => {
    async function loadCauses() {
      const GENERAL_CAUSE = {
        id: "general",
        name: "General Donation (Where Most Needed)",
        title: "General Donation (Where Most Needed)",
        category: "General Support",
        description: "Direct your contribution where the community need is greatest."
      };

      try {
        const res = await fetch("/api/causes");
        if (!res.ok) throw new Error("Failed to fetch causes");
        const list = await res.json();
        
        if (!Array.isArray(list) || list.length === 0) throw new Error("No causes found in database");

        // Ensure General Donation is always present at top
        const hasGeneral = list.some((c: any) => c.id === 'general' || normStr(c.name || c.title) === 'general' || normStr(c.name || c.title) === 'general donation');
        let finalList = hasGeneral ? list : [GENERAL_CAUSE, ...list];

        const normInit = normStr(initialCause);
        const isGeneral = !normInit || normInit === 'general' || normInit === 'general donation' || normInit === 'contribution';

        setCauses(finalList);

        // Auto-select initial cause
        if (isGeneral) {
          const genMatch = finalList.find((c: any) => c.id === 'general' || normStr(c.name || c.title).includes('general')) || finalList[0];
          if (genMatch) setSelectedCausesList([genMatch.id]);
        } else {
          const initialMatch = finalList.find((c: any) => normStr(c.name || c.title) === normInit || c.id === initialCause);
          if (initialMatch) {
            setSelectedCausesList([initialMatch.id]);
          } else {
            setSelectedCausesList(['general']);
          }
        }
      } catch (err) {
        console.warn("API causes load error, using fallbacks:", err);
        // The catalog could not be loaded. Do not invent causes: offer only the unrestricted general donation.
        setCauses([GENERAL_CAUSE]);
        setSelectedCausesList(['general']);
        setError('The list of causes could not be loaded right now. You can still make a general donation, or try again shortly.');
        return;
      }
    }
    loadCauses();
  }, [initialCause]);

  const toggleCause = (causeId: string) => {
    setSelectedCausesList(prev => toggleDonationCause(prev, causeId));
  };

  const selectedCount = selectedCausesList.length;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const formData = new FormData(e.currentTarget);
      const amount = Number(formData.get('amount') || 0);

      // Safe auto-default: if nothing selected, use general or first cause
      let effectiveSelectedIds = selectedCausesList;
      if (effectiveSelectedIds.length === 0) {
        const fallbackCauseId = causes.find(c => c.id === 'general')?.id || (causes.length > 0 ? causes[0].id : 'general');
        effectiveSelectedIds = [fallbackCauseId];
        setSelectedCausesList(effectiveSelectedIds);
      }

      if (amount <= 0) {
        setError('Please enter a valid amount.');
        setLoading(false);
        return;
      }

      if (!file) {
        setError('Please upload a payment screenshot to proceed.');
        setLoading(false);
        return;
      }

      formData.set('screenshot', file);
      
      let selectedCauses = causes
        .filter(c => effectiveSelectedIds.includes(c.id))
        .map(c => ({
          causeId: c.id,
          causeName: c.name || c.title || "General Donation"
        }));

      if (selectedCauses.length === 0) {
        selectedCauses = [{
          causeId: "general",
          causeName: initialCause && initialCause !== 'General' ? initialCause : "General Donation (Where Most Needed)"
        }];
      }

      formData.set('selectedCauses', JSON.stringify(selectedCauses));
      formData.set('cause', selectedCauses.length === 1 ? selectedCauses[0].causeName : "Multiple Causes");
      if (!submissionKeyRef.current) {
        submissionKeyRef.current = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `1792078016510-a7o7nqkgnjr`;
      }
      formData.set('submissionKey', submissionKeyRef.current);

      const res = await fetch('/api/donate', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.success) {
        submissionKeyRef.current = null;
        const successPayload = {
          trackingId: data.trackingId,
          amount: amount,
          selectedCauses: selectedCauses,
          date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
          email: formData.get('donorContact')?.toString() || ''
        };
        
        if (onSuccess) {
          onSuccess(successPayload);
        } else {
          setSuccessData(successPayload);
        }
      } else {
        // A rejected request was not recorded, so the next attempt is a new submission.
        if (res.status < 500) submissionKeyRef.current = null;
        setError(data.error || 'Failed to submit contribution.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while submitting.');
    } finally {
      setLoading(false);
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  if (successData && !onSuccess) {
    return (
      <DonationSuccess 
        trackingId={successData.trackingId}
        amount={successData.amount}
        selectedCauses={successData.selectedCauses}
        date={successData.date}
        onReset={() => setSuccessData(null)}
      />
    );
  }

  return (
    <motion.form
      ref={formRef}
      onSubmit={handleSubmit}
      variants={containerVariants}
      initial="hidden"
      animate="show"
      style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'left' }}
    >
      <input type="hidden" name="currency" value={initialCurrency} />

      {/* Cause Selection Section */}
      {hideCausesGrid ? (
        <motion.div variants={itemVariants} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          background: 'rgba(212, 175, 55, 0.08)',
          border: '1px solid rgba(212, 175, 55, 0.25)',
          borderRadius: '12px',
          marginBottom: '0.5rem'
        }}>
          <CheckCircle2 size={18} style={{ color: 'var(--gold-base)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)' }}>
            Directing contribution to: <strong style={{ color: 'var(--ivory-light)' }}>{causes.find(c => selectedCausesList.includes(c.id))?.name || (initialCause && initialCause !== 'General' ? initialCause : 'General Donation (Where Most Needed)')}</strong>
          </span>
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="space-y-3" style={{ position: 'relative', zIndex: 30 }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', color: '#fff', fontFamily: 'var(--font-playfair)', marginBottom: '4px' }}>Choose Where Your Contribution Goes</h3>
          <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', lineHeight: '1.4' }}>
            Your contribution will be directed exclusively to the cause(s) you select. 
            This selection becomes part of your permanent donation record and cannot be changed after verification.
          </p>
        </div>

        {(() => {
          const selected = causes.filter(c => selectedCausesList.includes(c.id));
          const first = selected[0];
          const triggerLabel = selected.length === 0
            ? 'Select a cause'
            : selected.length === 1 ? getCauseLabel(first).name : `${selected.length} causes selected`;
          const triggerMeta = getCauseMeta(selected.length === 1 ? getCauseLabel(first).name : 'general');
          const TriggerIcon = triggerMeta.icon;

          return (
            <div ref={causeRef} style={{ position: 'relative', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => setIsCauseOpen(prev => !prev)}
                aria-haspopup="listbox"
                aria-expanded={isCauseOpen}
                aria-label="Select Cause"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  background: isCauseOpen ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isCauseOpen ? 'rgba(212, 175, 55, 0.45)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '12px',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease'
                }}
              >
                <span
                  className="daarayn-dropdown-item-icon"
                  style={{ background: triggerMeta.bg, color: triggerMeta.color }}
                >
                  <TriggerIcon size={15} />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#FFF9DD', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {triggerLabel}
                  </span>
                  {selected.length === 1 && getCauseLabel(first).desc && (
                    <span style={{ fontSize: '0.75rem', color: 'rgba(212, 175, 55, 0.85)' }}>{getCauseLabel(first).desc}</span>
                  )}
                </span>
                <ChevronDown size={18} className={`daarayn-ribbon-trigger-chevron ${isCauseOpen ? 'open' : ''}`} />
              </button>

              <AnimatePresence>
                {isCauseOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="daarayn-custom-dropdown-container"
                    style={{ left: 0, right: 0 }}
                    role="listbox"
                    aria-multiselectable="true"
                  >
                    <div className="daarayn-dropdown-header">
                      <div className="daarayn-dropdown-header-left">
                        <Sparkles size={11} className="text-[#D4AF37]" />
                        <span className="daarayn-dropdown-header-title">Direct Your Contribution</span>
                      </div>
                      <span className="daarayn-dropdown-header-badge">100% Policy</span>
                    </div>

                    <div className="daarayn-dropdown-list">
                      {causes.map((cause) => {
                        const isSelected = selectedCausesList.includes(cause.id);
                        const label = getCauseLabel(cause);
                        const meta = getCauseMeta(label.name);
                        const Icon = meta.icon;

                        return (
                          <button
                            key={cause.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`daarayn-dropdown-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleCause(cause.id)}
                          >
                            <div
                              className="daarayn-dropdown-item-icon"
                              style={{
                                background: isSelected ? 'rgba(212, 175, 55, 0.25)' : meta.bg,
                                color: isSelected ? '#FFF9DD' : meta.color
                              }}
                            >
                              <Icon size={15} />
                            </div>
                            <div className="daarayn-dropdown-item-text">
                              <span className="daarayn-dropdown-item-name">{label.name}</span>
                              {label.desc && <span className="daarayn-dropdown-item-desc">{label.desc}</span>}
                            </div>
                            {isSelected && (
                              <div className="daarayn-dropdown-item-check">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}
      </motion.div>
      )}

      <InputWrapper icon={IndianRupee} label={`Amount (${initialCurrency})`} required>
        <input
          type="number"
          name="amount"
          defaultValue={initialAmount}
          required
          placeholder="e.g. 1500"
          style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem 1rem 0.75rem 2.6rem', color: '#fff', fontSize: '0.95rem', outline: 'none', transition: 'all 0.3s ease' }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--ivory-light)'; e.target.style.background = 'rgba(255,255,255,0.06)'; e.target.style.boxShadow = '0 0 0 4px rgba(255, 249, 221, 0.1)'; }}
          onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.background = 'rgba(255,255,255,0.03)'; e.target.style.boxShadow = 'none'; }}
        />
      </InputWrapper>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <InputWrapper icon={User} label="Name (Optional)">
          <input
            type="text"
            name="donorName"
            placeholder="Anonymous if blank"
            style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem 1rem 0.75rem 2.6rem', color: '#fff', fontSize: '0.95rem', outline: 'none', transition: 'all 0.3s ease' }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--ivory-light)'; e.target.style.background = 'rgba(255,255,255,0.06)'; }}
            onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.background = 'rgba(255,255,255,0.03)'; }}
          />
        </InputWrapper>

        <InputWrapper icon={Mail} label="Email Address" required>
          <input
            type="email"
            name="donorContact"
            required
            placeholder="For verification updates"
            style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.75rem 1rem 0.75rem 2.6rem', color: '#fff', fontSize: '0.95rem', outline: 'none', transition: 'all 0.3s ease' }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--ivory-light)'; e.target.style.background = 'rgba(255,255,255,0.06)'; }}
            onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.background = 'rgba(255,255,255,0.03)'; }}
          />
        </InputWrapper>
      </div>

      {/* UPI QR — mobile only, shown right before the payment proof upload (desktop shows it in the right column) */}
      <motion.div variants={itemVariants} className="glass-panel qr-mobile" style={{
        width: '100%',
        maxWidth: '340px',
        margin: '0 auto',
        padding: '1.5rem',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        borderRadius: '20px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Subtle top glow */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, transparent, var(--ivory-light), transparent)', opacity: 0.5 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2ecc71', background: 'rgba(46, 204, 113, 0.1)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '1.25rem' }}>
          <ShieldCheck size={14} />
          Verified Secure UPI Payment
        </div>

        <div style={{
          background: '#fff',
          padding: '12px',
          borderRadius: '12px',
          marginBottom: '1rem',
          boxShadow: '0 8px 20px rgba(0,0,0,0.3)'
        }}>
          <img src="/images/upi-qr.png" alt="UPI QR Code" style={{ width: '100%', maxWidth: '200px', display: 'block' }} />
        </div>

        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.9rem', marginBottom: '0.75rem', textAlign: 'center', fontWeight: 500 }}>
          Scan to pay using any UPI app
        </p>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', opacity: 0.7 }}>
          <span style={{ fontSize: '0.75rem', padding: '3px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>GPay</span>
          <span style={{ fontSize: '0.75rem', padding: '3px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>PhonePe</span>
          <span style={{ fontSize: '0.75rem', padding: '3px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>Paytm</span>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <label style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', fontWeight: 500, letterSpacing: '0.3px', display: 'flex', gap: '4px' }}>
          Payment Proof <span style={{ color: 'var(--ivory-light)' }}>*</span>
        </label>

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}
          style={{
            width: '100%',
            background: isDragging ? 'rgba(255, 249, 221, 0.05)' : 'rgba(255,255,255,0.02)',
            border: `2px dashed ${isDragging ? 'var(--ivory-light)' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: '12px',
            padding: '1.25rem 1rem',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            style={{ display: 'none' }}
          />

          <AnimatePresence mode="wait">
            {file ? (
              <motion.div
                key="has-file"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}
              >
                <div style={{ background: 'rgba(46, 204, 113, 0.1)', padding: '8px', borderRadius: '50%' }}>
                  <FileImage size={20} color="#2ecc71" />
                </div>
                <div>
                  <p style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>{file.name}</p>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); }} style={{ background: 'none', border: 'none', color: 'var(--ivory-light)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}>
                  Remove file
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="no-file"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}
              >
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '50%' }}>
                  <UploadCloud size={20} color="rgba(255,255,255,0.7)" />
                </div>
                <div>
                  <p style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>Click to upload or drag & drop</p>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>PNG, JPG up to 5MB</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ color: '#ff6b6b', fontSize: '0.85rem', background: 'rgba(255,107,107,0.1)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,107,107,0.2)', display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div variants={itemVariants} style={{ marginTop: '0.25rem' }}>
        <motion.button
          whileHover={{ scale: 1.01, boxShadow: '0 8px 25px rgba(255, 249, 221, 0.3)' }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={loading}
          className="btn btn-ivory"
          style={{
            width: '100%',
            fontSize: '1rem',
            padding: '0.85rem',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 6px 15px rgba(255, 249, 221, 0.2)',
            opacity: loading ? 0.8 : 1,
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? (
            <><Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> Processing securely...</>
          ) : (
            <><ShieldCheck size={18} /> Submit Contribution</>
          )}
        </motion.button>
      </motion.div>

      <motion.div variants={itemVariants} style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
          <CheckCircle2 size={12} color="var(--ivory-light)" />
          <span>Intent Immutable</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
          <CheckCircle2 size={12} color="var(--ivory-light)" />
          <span>Amanah Guaranteed</span>
        </div>
      </motion.div>
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </motion.form>
  );
}
