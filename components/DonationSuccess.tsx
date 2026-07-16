'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface CauseAllocation {
  causeId: string;
  causeName: string;
  allocatedAmount: number;
  percentage: number;
}

interface DonationSuccessProps {
  trackingId: string;
  amount: number;
  selectedCauses: CauseAllocation[];
  date: string;
  onReset?: () => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 250, damping: 25 } }
};

export default function DonationSuccess({ trackingId, amount, selectedCauses }: DonationSuccessProps) {
  const causeText = selectedCauses.length === 1 
    ? selectedCauses[0].causeName 
    : `${selectedCauses.length} Selected Causes`;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="ds-page"
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

        .ds-page {
          width: 100%;
          max-width: 460px;
          text-align: center;
          margin: 0 auto;
          font-family: 'Inter', sans-serif !important;
          color: #EDEAE0 !important;
        }

        .ds-page * {
          box-sizing: border-box;
        }

        .ds-check {
          width: 56px;
          height: 56px;
          margin: 0 auto 28px;
          border-radius: 50%;
          background: rgba(63,174,131,0.12);
          border: 1px solid rgba(63,174,131,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .ds-h1 {
          font-family: 'Fraunces', serif !important;
          font-weight: 600 !important;
          font-size: 28px !important;
          line-height: 1.25 !important;
          letter-spacing: -0.01em !important;
          margin: 0 0 10px 0 !important;
          color: #fff !important;
        }

        .ds-subtext {
          margin: 0 auto !important;
          font-size: 14.5px !important;
          line-height: 1.6 !important;
          color: #8A93A6 !important;
          max-width: 340px !important;
        }

        .ds-arabic {
          font-family: 'Fraunces', serif !important;
          font-size: 34px !important;
          margin-top: 36px !important;
          color: #E9D9AE !important;
          direction: rtl !important;
        }

        .ds-translit {
          margin-top: 10px !important;
          font-weight: 600 !important;
          font-size: 15px !important;
          letter-spacing: 0.02em !important;
        }

        .ds-translation {
          margin-top: 4px !important;
          font-size: 13px !important;
          font-style: italic !important;
          color: #8A93A6 !important;
        }

        .ds-motif {
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          margin: 32px 0 28px !important;
        }
        .ds-motif::before, .ds-motif::after {
          content: '';
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(201,162,75,0.35));
        }
        .ds-motif::after { background: linear-gradient(90deg, rgba(201,162,75,0.35), transparent); }
        .ds-motif span {
          width: 6px;
          height: 6px;
          background: #C9A24B;
          transform: rotate(45deg);
          flex-shrink: 0;
        }

        .ds-card {
          text-align: left !important;
          background: #0F1826 !important;
          border: 1px solid rgba(255,255,255,0.07) !important;
          border-radius: 16px !important;
          padding: 28px 26px 24px !important;
        }

        .ds-card-title {
          font-family: 'Fraunces', serif !important;
          font-weight: 500 !important;
          font-size: 17px !important;
          margin: 0 0 20px 0 !important;
          color: #fff !important;
        }

        .ds-row {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          padding: 14px 0 !important;
          border-top: 1px solid rgba(255,255,255,0.06) !important;
        }
        .ds-row:first-of-type { border-top: none !important; }

        .ds-row-label {
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          letter-spacing: 0.06em !important;
          text-transform: uppercase !important;
          color: #6E7789 !important;
        }
        .ds-row-label svg { flex-shrink: 0; opacity: 0.75; }

        .ds-row-value {
          font-family: 'IBM Plex Mono', monospace !important;
          font-size: 14px !important;
          font-weight: 500 !important;
          color: #EDEAE0 !important;
        }
        .ds-row-value.ds-strong { font-size: 15px !important; }

        .ds-badge {
          display: inline-flex !important;
          align-items: center !important;
          gap: 6px !important;
          background: rgba(217,164,65,0.14) !important;
          border: 1px solid rgba(217,164,65,0.4) !important;
          color: #E5B85E !important;
          font-family: 'Inter', sans-serif !important;
          font-size: 11.5px !important;
          font-weight: 600 !important;
          letter-spacing: 0.04em !important;
          text-transform: uppercase !important;
          padding: 5px 10px 5px 8px !important;
          border-radius: 100px !important;
        }
        .ds-badge .ds-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #E5B85E;
        }

        .ds-dua {
          margin-top: 20px !important;
          background: rgba(201,162,75,0.05) !important;
          border-left: 2px solid #C9A24B !important;
          padding: 16px 18px !important;
          font-family: 'Fraunces', serif !important;
          font-style: italic !important;
          font-size: 14px !important;
          line-height: 1.65 !important;
          color: #D8D3C4 !important;
        }

        .ds-cta {
          margin-top: 22px !important;
          width: 100% !important;
          background: #EFE5C9 !important;
          color: #1A1406 !important;
          border: none !important;
          border-radius: 10px !important;
          padding: 15px !important;
          font-family: 'Inter', sans-serif !important;
          font-size: 14.5px !important;
          font-weight: 600 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 8px !important;
          cursor: pointer !important;
          text-decoration: none !important;
        }

        .ds-home-link {
          display: block !important;
          text-align: center !important;
          margin-top: 18px !important;
          font-size: 13.5px !important;
          color: #8A93A6 !important;
          text-decoration: none !important;
        }

        .ds-footer {
          margin-top: 44px !important;
          text-align: center !important;
          font-size: 12.5px !important;
          line-height: 1.7 !important;
          color: #545D6E !important;
          padding: 0 20px !important;
        }
        .ds-footer strong { color: #8A93A6 !important; font-weight: 500 !important; }
      `}} />

      <motion.div variants={itemVariants}>
        <div className="ds-check">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5L9.5 17L19 7" stroke="#3FAE83" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 className="ds-h1">Contribution successfully recorded</h1>
        <p className="ds-subtext">Your contribution has been securely received and is now awaiting verification.</p>
      </motion.div>

      <motion.div variants={itemVariants}>
        <div className="ds-arabic">جَزَاكَ اللَّهُ خَيْرًا</div>
        <div className="ds-translit">Jazāk Allāhu Khayran</div>
        <div className="ds-translation">May Allah reward you with abundant goodness for your generosity.</div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <div className="ds-motif"><span></span></div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <div className="ds-card">
          <div className="ds-card-title">Contribution summary</div>

          <div className="ds-row">
            <div className="ds-row-label">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6E7789" strokeWidth="2"><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/></svg>
              Donation ID
            </div>
            <div className="ds-row-value">{trackingId}</div>
          </div>

          <div className="ds-row">
            <div className="ds-row-label">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6E7789" strokeWidth="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>
              Selected cause
            </div>
            <div className="ds-row-value">{causeText}</div>
          </div>

          <div className="ds-row">
            <div className="ds-row-label">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6E7789" strokeWidth="2"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h9M6 13c0-3 2-5 6-5"/></svg>
              Amount
            </div>
            <div className="ds-row-value ds-strong">₹{amount.toLocaleString()}</div>
          </div>

          <div className="ds-row">
            <div className="ds-row-label">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6E7789" strokeWidth="2"><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z"/></svg>
              Status
            </div>
            <span className="ds-badge"><span className="ds-dot"></span>Verifying</span>
          </div>

          <div className="ds-row">
            <div className="ds-row-label">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6E7789" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
              Est. verification time
            </div>
            <div className="ds-row-value">24–48 hours</div>
          </div>

          <div className="ds-dua">
            "O Allah, accept this charity, place barakah in our wealth, forgive our shortcomings, and make this contribution a source of continuous reward in this life and the Hereafter. Āmīn."
          </div>

          <a href="/#ledger" className="ds-cta">
            Track contribution
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1A1406" strokeWidth="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </a>
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <a href="/" className="ds-home-link">Return to home</a>

        <div className="ds-footer">
          Thank you for placing your trust in <strong className="ds-strong">Daarayn Foundation</strong>.<br/>
          Every verified contribution is permanently recorded in our Public Ledger to uphold Amanah, transparency, and accountability.
        </div>
      </motion.div>

    </motion.div>
  );
}
