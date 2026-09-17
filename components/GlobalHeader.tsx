'use client';
import Navbar from './Navbar';
import QuickDonationRibbon from './QuickDonationRibbon';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

interface GlobalHeaderProps {
  showRibbon?: boolean;
}

export default function GlobalHeader({ showRibbon = false }: GlobalHeaderProps) {
  const { scrollY } = useScroll();
  const [isAtTop, setIsAtTop] = useState(true);

  useEffect(() => {
    return scrollY.on('change', (latest) => {
      // Mobile behavior: Ribbon appears when user is on top section (< 120px), hides when sliding down, reappears on return to top
      if (latest > 120) {
        setIsAtTop(false);
      } else {
        setIsAtTop(true);
      }
    });
  }, [scrollY]);

  // Desktop ribbon floating animation
  const ribbonTop = useTransform(scrollY, [0, 100], [92, 80]);

  return (
    <header className="w-full relative">
      <Navbar />
      {showRibbon && (
        <section className="daarayn-quick-donation-section">
          {/* Desktop Floating Ribbon (Visible on md and larger screens) */}
          <div className="hidden md:block w-full">
            <motion.div 
              className="daarayn-global-ribbon-wrapper"
              style={{ top: ribbonTop }}
            >
              <QuickDonationRibbon />
            </motion.div>
          </div>

          {/* Mobile Quick Donation Ribbon: In natural layout flow, pushed below fixed navbar */}
          <div className="block md:hidden w-full" style={{ paddingTop: '96px', paddingBottom: '8px', pointerEvents: 'auto' }}>
            <QuickDonationRibbon />
          </div>
        </section>
      )}
    </header>
  );
}
