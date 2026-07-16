'use client';

import { useState } from 'react';
import DonateForm from '@/components/DonateForm';
import DonationSuccess from '@/components/DonationSuccess';
import { ShieldCheck, Lock, CheckCircle2 } from 'lucide-react';

export default function PayPageLayout({ amount, currency, cause }: { amount: string, currency: string, cause: string }) {
  const [successData, setSuccessData] = useState<any>(null);

  if (successData) {
    return (
      <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', minHeight: '60vh' }}>
        <DonationSuccess 
          trackingId={successData.trackingId}
          amount={successData.amount}
          selectedCauses={successData.selectedCauses}
          date={successData.date}
          onReset={() => setSuccessData(null)}
        />
      </div>
    );
  }

  return (
    <div className="container donate-container">
      <div className="donate-text">
        <h2 style={{ fontSize: '2.2rem', marginBottom: '0.75rem', fontFamily: 'var(--font-playfair)' }}>Secure Contribution</h2>
        <p className="lead" style={{ fontSize: '1rem', color: 'rgba(252,251,251,0.85)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
          Your contribution to <strong style={{ color: 'var(--ivory-light)' }}>{cause}</strong> will be securely recorded and verified by our team. Every contribution receives a unique tracking ID for complete transparency.
        </p>

        <DonateForm 
          initialAmount={amount} 
          initialCurrency={currency} 
          initialCause={cause} 
          onSuccess={setSuccessData}
        />
      </div>

      <div className="donate-qr" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Premium QR Card */}
        <div className="glass-panel" style={{ 
          padding: '1.5rem', 
          display: 'flex', 
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
        </div>

        {/* Security & Transparency Card */}
        <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <Lock size={16} color="var(--ivory-light)" />
            <h3 style={{ fontSize: '1.05rem', margin: 0, color: 'var(--ivory-light)' }}>Security & Transparency</h3>
          </div>
          
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <CheckCircle2 size={14} color="#2ecc71" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)', lineHeight: '1.4' }}>Your contribution is securely recorded in our immutable ledger.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <CheckCircle2 size={14} color="#2ecc71" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)', lineHeight: '1.4' }}>Payment proof is used exclusively for internal verification.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <CheckCircle2 size={14} color="#2ecc71" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)', lineHeight: '1.4' }}>Daarayn adheres to a strict 100% transparency policy.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
