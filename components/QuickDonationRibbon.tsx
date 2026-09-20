'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Check, 
  ChevronDown, 
  ArrowRight, 
  Sparkles, 
  Droplets, 
  Baby, 
  AlertTriangle, 
  Building2, 
  Stethoscope, 
  Coins
} from 'lucide-react';

const CURRENCIES = [
  { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼', label: 'Saudi Riyal' },
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  GBP: '£',
  USD: '$',
  AED: 'د.إ',
  SAR: '﷼',
};

const DEFAULT_CAUSES_LIST = [
  { id: 'general', name: 'General Donation', category: 'Where Most Needed' },
  { id: 'clean-water-wells', name: 'Clean Water Tube Wells Initiative', category: 'Water & Sanitation' },
  { id: 'orphan-sponsorship', name: 'Orphan & Child Care Sponsorship', category: 'Education & Care' },
  { id: 'emergency-food-aid', name: 'Emergency Food & Relief Distribution', category: 'Emergency Relief' },
  { id: 'masjid-construction', name: 'Community Masjid Construction & Repairs', category: 'Infrastructure' },
  { id: 'healthcare-medical-fund', name: 'Healthcare & Medical Aid Fund', category: 'Healthcare' }
];

function getCauseMeta(title: string) {
  const t = (title || '').toLowerCase();
  if (t.includes('water') || t.includes('well')) {
    return { icon: Droplets, color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)' };
  }
  if (t.includes('orphan') || t.includes('child')) {
    return { icon: Baby, color: '#f472b6', bg: 'rgba(244, 114, 182, 0.12)' };
  }
  if (t.includes('food') || t.includes('relief') || t.includes('emergency')) {
    return { icon: AlertTriangle, color: '#fb923c', bg: 'rgba(251, 146, 60, 0.12)' };
  }
  if (t.includes('masjid') || t.includes('mosque') || t.includes('construction')) {
    return { icon: Building2, color: '#34d399', bg: 'rgba(52, 211, 153, 0.12)' };
  }
  if (t.includes('health') || t.includes('medical')) {
    return { icon: Stethoscope, color: '#f87171', bg: 'rgba(248, 113, 113, 0.12)' };
  }
  return { icon: Sparkles, color: '#D4AF37', bg: 'rgba(212, 175, 55, 0.12)' };
}

export default function QuickDonationRibbon() {
  const router = useRouter();
  const [amount, setAmount] = useState('500');
  const [currency, setCurrency] = useState('INR');
  const [cause, setCause] = useState('General');
  const [causes, setCauses] = useState<{ id: string; name: string; category?: string }[]>([]);
  const [isCauseOpen, setIsCauseOpen] = useState(false);
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);

  const causeRef = useRef<HTMLDivElement>(null);
  const currencyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchCauses() {
      try {
        const res = await fetch('/api/causes');
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            const apiCauses = list.map((c: any) => ({
              id: c.id,
              name: c.name || c.title,
              category: c.category || 'Strategic Cause'
            }));
            const withoutGeneral = apiCauses.filter(
              (c: any) => c.id !== 'general' && !c.name.toLowerCase().includes('general')
            );
            setCauses([
              { id: 'general', name: 'General Donation', category: 'Where Most Needed' },
              ...withoutGeneral
            ]);
          }
        }
      } catch (err) {
        console.warn('Failed to load causes in ribbon', err);
      }
    }
    fetchCauses();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (causeRef.current && !causeRef.current.contains(event.target as Node)) {
        setIsCauseOpen(false);
      }
      if (currencyRef.current && !currencyRef.current.contains(event.target as Node)) {
        setIsCurrencyOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsCauseOpen(false);
        setIsCurrencyOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const symbol = CURRENCY_SYMBOLS[currency] || '₹';
  const causeList = causes.length > 0 ? causes : DEFAULT_CAUSES_LIST;
  const activeCauseDisplayName = cause === 'General' ? 'General Donation' : cause;
  const activeCauseMeta = getCauseMeta(activeCauseDisplayName);
  const ActiveCauseIcon = activeCauseMeta.icon;

  const handleSelectCause = (selectedName: string) => {
    setCause(selectedName === 'General Donation' ? 'General' : selectedName);
    setIsCauseOpen(false);
  };

  const handleSelectCurrency = (code: string) => {
    setCurrency(code);
    setIsCurrencyOpen(false);
  };

  return (
    <div className="daarayn-quick-donation-section">
      <div className="daarayn-quick-donation-ribbon">
        
        {/* Currency & Amount Input Unified Group */}
        <div className="daarayn-ribbon-amount-row">
          <div className="daarayn-ribbon-currency-wrapper" ref={currencyRef}>
            <button
              type="button"
              className="daarayn-ribbon-trigger-btn"
              onClick={() => {
                setIsCurrencyOpen(prev => !prev);
                setIsCauseOpen(false);
              }}
              aria-haspopup="listbox"
              aria-expanded={isCurrencyOpen}
              aria-label="Select Currency"
            >
              <span className="daarayn-ribbon-currency-code">{currency}</span>
              <span className="daarayn-ribbon-currency-symbol">{symbol}</span>
              <ChevronDown 
                size={12} 
                className={`daarayn-ribbon-trigger-chevron ${isCurrencyOpen ? 'open' : ''}`} 
              />
            </button>

            {/* Custom Luxury Currency Popover */}
            <AnimatePresence>
              {isCurrencyOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="daarayn-custom-dropdown-container daarayn-currency-dropdown"
                  role="listbox"
                >
                  <div className="daarayn-dropdown-header">
                    <div className="daarayn-dropdown-header-left">
                      <Coins size={11} className="text-[#D4AF37]" />
                      <span className="daarayn-dropdown-header-title">Select Currency</span>
                    </div>
                  </div>

                  <div className="daarayn-dropdown-list">
                    {CURRENCIES.map((c) => {
                      const isSelected = currency === c.code;
                      return (
                        <button
                          key={c.code}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`daarayn-dropdown-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleSelectCurrency(c.code)}
                        >
                          <div 
                            className="daarayn-dropdown-item-icon"
                            style={{ 
                              background: isSelected ? 'rgba(212, 175, 55, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                              color: isSelected ? '#FFF9DD' : 'rgba(255, 255, 255, 0.75)'
                            }}
                          >
                            <span style={{ fontSize: '13px', fontWeight: 600 }}>{c.symbol}</span>
                          </div>
                          <div className="daarayn-dropdown-item-text">
                            <span className="daarayn-dropdown-item-name">{c.code}</span>
                            <span className="daarayn-dropdown-item-desc">{c.label}</span>
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

          <div className="daarayn-ribbon-input-group">
            <input 
              type="number" 
              className="daarayn-ribbon-input" 
              placeholder="Amount" 
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Donation Amount"
            />
          </div>
        </div>

        {/* Preset Buttons */}
        <div className="daarayn-ribbon-presets">
          {['100', '500', '1000', '5000'].map(preset => (
            <button 
              key={preset}
              type="button"
              className={`daarayn-preset-btn ${amount === preset ? 'active' : ''}`}
              onClick={() => setAmount(preset)}
            >
              {symbol}{preset}
            </button>
          ))}
        </div>

        {/* Cause Dropdown & CTA Row */}
        <div className="daarayn-ribbon-action-row">
          <div className="daarayn-ribbon-cause-wrapper" ref={causeRef}>
            <button
              type="button"
              className="daarayn-ribbon-trigger-btn"
              onClick={() => {
                setIsCauseOpen(prev => !prev);
                setIsCurrencyOpen(false);
              }}
              aria-haspopup="listbox"
              aria-expanded={isCauseOpen}
              aria-label="Select Cause"
            >
              <span 
                className="daarayn-ribbon-trigger-icon"
                style={{ background: activeCauseMeta.bg, color: activeCauseMeta.color }}
              >
                <ActiveCauseIcon size={13} />
              </span>
              <span className="daarayn-ribbon-trigger-label">
                {activeCauseDisplayName}
              </span>
              <ChevronDown 
                size={14} 
                className={`daarayn-ribbon-trigger-chevron ${isCauseOpen ? 'open' : ''}`} 
              />
            </button>

            {/* Custom Luxury Cause Popover */}
            <AnimatePresence>
              {isCauseOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="daarayn-custom-dropdown-container daarayn-cause-dropdown"
                  role="listbox"
                >
                  {/* Header */}
                  <div className="daarayn-dropdown-header">
                    <div className="daarayn-dropdown-header-left">
                      <Sparkles size={11} className="text-[#D4AF37]" />
                      <span className="daarayn-dropdown-header-title">Direct Your Contribution</span>
                    </div>
                    <span className="daarayn-dropdown-header-badge">100% Policy</span>
                  </div>

                  {/* Options List */}
                  <div className="daarayn-dropdown-list">
                    {causeList.map((c) => {
                      const isSelected = 
                        cause === c.name || 
                        (cause === 'General' && (c.id === 'general' || c.name === 'General Donation'));
                      const meta = getCauseMeta(c.name);
                      const Icon = meta.icon;

                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`daarayn-dropdown-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleSelectCause(c.name)}
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
                            <span className="daarayn-dropdown-item-name">{c.name}</span>
                            {c.category && (
                              <span className="daarayn-dropdown-item-desc">{c.category}</span>
                            )}
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

          {/* Donate Button */}
          <button 
            type="button"
            className="daarayn-ribbon-donate-btn" 
            onClick={() => router.push(`/pay?amt=${amount}&cur=${currency}&cause=${encodeURIComponent(cause)}&source=ribbon`)}
          >
            <span>Quick Donate</span>
            <ArrowRight size={15} className="ribbon-arrow" />
          </button>
        </div>

      </div>
    </div>
  );
}
