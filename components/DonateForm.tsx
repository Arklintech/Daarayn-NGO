'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { IndianRupee, Hash, User, Mail, UploadCloud, CheckCircle2, ShieldCheck, FileImage, Loader2, ArrowRight, Heart, Stethoscope, Building2, BookOpen, GraduationCap, Droplets, Baby, AlertTriangle, Globe2 } from 'lucide-react';
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import DonationSuccess from './DonationSuccess';

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
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }}>
        <Icon size={16} />
      </div>
      {children}
    </div>
  </motion.div>
);

// Safe string normalization helper
const normStr = (str?: string) => (str || '').toLowerCase().replace(/[’']/g, "'").trim();

// Map common names to icons
const getIconForCause = (title?: string) => {
  const t = normStr(title);
  if (t.includes('medical') || t.includes('health')) return Stethoscope;
  if (t.includes('masjid') || t.includes('mosque')) return Building2;
  if (t.includes('quran') || t.includes('endowment')) return BookOpen;
  if (t.includes('education') || t.includes('school')) return GraduationCap;
  if (t.includes('water')) return Droplets;
  if (t.includes('orphan')) return Baby;
  if (t.includes('emergency') || t.includes('relief')) return AlertTriangle;
  if (t.includes('family')) return Heart;
  return Globe2;
};

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
  
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    async function loadCauses() {
      try {
        const snap = await getDocs(collection(db, "causes"));
        let list: any[] = [];
        snap.forEach((doc) => {
          const data = doc.data();
          list.push({ id: doc.id, name: data.name || data.title || "Cause", ...data });
        });
        
        if (list.length === 0) throw new Error("No causes found in database");
        setCauses(list);

        // Handle fallback if initial cause isn't found
        let finalList = list;
        const normInit = normStr(initialCause);
        if (normInit && 
            normInit !== 'contribution' && 
            normInit !== 'general' && 
            normInit !== 'general donation' &&
            !list.find(c => normStr(c.name) === normInit || normStr(c.title) === normInit || c.id === initialCause)
        ) {
          const fallbackId = `custom_${Date.now()}`;
          finalList = [{ id: fallbackId, name: initialCause }, ...list];
        }
        setCauses(finalList);

        // Auto-select initial cause if matched
        const initialMatch = finalList.find(c => normStr(c.name) === normInit || normStr(c.title) === normInit || c.id === initialCause);
        if (initialMatch) {
          setSelectedCausesList([initialMatch.id]);
        }
        
      } catch (err) {
        console.warn("Failed to fetch causes, using fallback", err);
        const fallbacks = [
          { id: "family-relief", name: "Family Relief" },
          { id: "medical-assistance", name: "Medical Assistance" },
          { id: "masjid-fund", name: "Masjid Fund" },
          { id: "quran-endowment", name: "Qur'an Endowment" },
          { id: "education", name: "Education" },
          { id: "water-projects", name: "Water Projects" },
          { id: "orphan-support", name: "Orphan Support" },
          { id: "emergency-relief", name: "Emergency Relief" }
        ];
        
        let finalList = [...fallbacks];
        const normInit = normStr(initialCause);
        if (normInit && !fallbacks.find(c => normStr(c.name) === normInit || c.id === initialCause)) {
          finalList = [{ id: `custom_${Date.now()}`, name: initialCause }, ...finalList];
        }
        setCauses(finalList);
        
        const matched = finalList.find(c => normStr(c.name) === normInit || c.id === initialCause);
        if (matched) setSelectedCausesList([matched.id]);
      }
    }
    loadCauses();
  }, [initialCause]);

  const toggleCause = (causeId: string) => {
    setSelectedCausesList(prev => 
      prev.includes(causeId) ? prev.filter(id => id !== causeId) : [...prev, causeId]
    );
  };

  const selectedCount = selectedCausesList.length;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const formData = new FormData(e.currentTarget);
      const amount = Number(formData.get('amount') || 0);

      if (selectedCount === 0) {
        setError('Please select at least one cause to direct your contribution to.');
        setLoading(false);
        return;
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
      
      const perCauseAmount = Math.floor(amount / selectedCount);

      const selectedCauses = causes
        .filter(c => selectedCausesList.includes(c.id))
        .map(c => ({
          causeId: c.id,
          causeName: c.name,
          allocatedAmount: perCauseAmount,
          percentage: 100 / selectedCausesList.length
        }));

      formData.set('selectedCauses', JSON.stringify(selectedCauses));
      formData.set('cause', selectedCauses.length === 1 ? selectedCauses[0].causeName : "Multiple Causes");

      const res = await fetch('/api/donate', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.success) {
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
      {!hideCausesGrid && (
        <motion.div variants={itemVariants} className="space-y-3">
        <div>
          <h3 style={{ fontSize: '1.1rem', color: '#fff', fontFamily: 'var(--font-playfair)', marginBottom: '4px' }}>Choose Where Your Contribution Goes</h3>
          <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', lineHeight: '1.4' }}>
            Your contribution will be directed exclusively to the cause(s) you select. 
            This selection becomes part of your permanent donation record and cannot be changed after verification.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginTop: '1rem' }}>
          {causes.map((cause) => {
            const isSelected = selectedCausesList.includes(cause.id);
            const causeTitle = cause.name || cause.title || 'Cause';
            const Icon = getIconForCause(causeTitle);
            
            return (
              <motion.div
                key={cause.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => toggleCause(cause.id)}
                style={{
                  background: isSelected ? 'rgba(255, 249, 221, 0.08)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isSelected ? 'var(--ivory-light)' : 'rgba(255,255,255,0.05)'}`,
                  borderRadius: '12px',
                  padding: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {isSelected && (
                  <div style={{ position: 'absolute', top: 0, right: 0, width: '40px', height: '40px', background: 'radial-gradient(circle at top right, var(--ivory-light), transparent)', opacity: 0.2 }} />
                )}
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ 
                    width: '32px', height: '32px', borderRadius: '8px', 
                    background: isSelected ? 'rgba(255, 249, 221, 0.15)' : 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <Icon size={18} style={{ color: isSelected ? '#C9A24B' : 'rgba(255,255,255,0.7)', flexShrink: 0 }} />
                  </div>
                  <span style={{ 
                    fontSize: '0.9rem', 
                    fontWeight: isSelected ? '600' : '400', 
                    color: isSelected ? '#fff' : 'rgba(255,255,255,0.8)' 
                  }}>
                    {cause.name}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
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

      <InputWrapper icon={Hash} label="UPI Reference Code" required>
        <input
          type="text"
          name="upiRef"
          required
          placeholder="12-digit transaction ID"
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
          <span>Transparent Ledger</span>
        </div>
      </motion.div>
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </motion.form>
  );
}
