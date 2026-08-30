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
  const ribbonTop = useTransform(scrollY, [0, 100], [116, 100]);

  return (
    <>
      <Navbar />
      {showRibbon && (
        <>
          {/* Desktop Floating Ribbon (Visible on md and larger screens) */}
          <div className="hidden md:block">
            <motion.div 
              className="daarayn-global-ribbon-wrapper"
              style={{ top: ribbonTop }}
            >
              <QuickDonationRibbon />
            </motion.div>
          </div>

          {/* Mobile Only Quick Donation Ribbon: Appears at landing page top, hides when scrolling down, reappears when returning to top */}
          <div className="block md:hidden">
            <AnimatePresence>
              {isAtTop && (
                <motion.div 
                  initial={{ opacity: 0, y: -25 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -25 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="fixed left-0 right-0 z-40 px-2.5 pointer-events-auto"
                  style={{ top: '88px' }}
                >
                  <QuickDonationRibbon />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </>
  );
}
