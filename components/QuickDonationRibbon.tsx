'use client';
import { useState, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

export default function QuickDonationRibbon() {
  const [scrolled, setScrolled] = useState(false);
  const [atBottom, setAtBottom] = useState(false);
  const [amount, setAmount] = useState('500');
  const [currency, setCurrency] = useState('INR');
  const [cause, setCause] = useState('General');

  const [causes, setCauses] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
      const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 100;
      setAtBottom(nearBottom);
    };
    window.addEventListener('scroll', handleScroll);
    
    async function fetchCauses() {
      try {
        const snap = await getDocs(collection(db, "causes"));
        let list: any[] = [];
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        if (list.length > 0) setCauses(list);
      } catch (err) {
        console.warn("Failed to load causes in ribbon", err);
      }
    }
    fetchCauses();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className={`daarayn-quick-donation-section ${scrolled ? 'scrolled' : ''}`}
      style={atBottom ? { opacity: 0, pointerEvents: 'none', transition: 'opacity 0.3s' } : { transition: 'opacity 0.3s' }}
    >
      <div className="daarayn-quick-donation-ribbon">
        
        {/* Currency Dropdown */}
        <div className="daarayn-ribbon-currency-wrapper">
          <select 
            className="daarayn-ribbon-currency-select" 
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="INR">INR ₹</option>
            <option value="GBP">GBP £</option>
            <option value="USD">USD $</option>
            <option value="AED">AED د.إ</option>
            <option value="SAR">SAR ﷼</option>
          </select>
          <ChevronDownIcon />
        </div>

        {/* Input Field */}
        <div className="daarayn-ribbon-input-group">
          <input 
            type="number" 
            className="daarayn-ribbon-input" 
            placeholder="Enter Amount" 
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
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
              ₹{preset}
            </button>
          ))}
        </div>

        {/* Cause is implicitly General Donation for Quick Donation */}

        {/* Donate Button */}
        <button 
          type="button"
          className="daarayn-ribbon-donate-btn" 
          onClick={() => window.location.href = `/pay?amt=${amount}&cur=${currency}&cause=${encodeURIComponent(cause)}`}
        >
          Quick Donation <ArrowRightIcon />
        </button>
      </div>

    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ribbon-chevron">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ribbon-arrow">
      <line x1="5" y1="12" x2="19" y2="12"></line>
      <polyline points="12 5 19 12 12 19"></polyline>
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  );
}

function UserCheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="8.5" cy="7" r="4"></circle>
      <polyline points="17 11 19 13 23 9"></polyline>
    </svg>
  );
}
