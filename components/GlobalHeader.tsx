'use client';
import Navbar from './Navbar';
import QuickDonationRibbon from './QuickDonationRibbon';
import { motion, useScroll, useTransform } from 'framer-motion';

interface GlobalHeaderProps {
  showRibbon?: boolean;
}

export default function GlobalHeader({ showRibbon = false }: GlobalHeaderProps) {
  const { scrollY } = useScroll();
  
  // Ribbon starts at 140px (Hero integration) and moves to 100px on scroll.
  // The Navbar finishes shrinking to 64px (plus 24px padding = 88px bottom edge).
  // 100px gives a perfect 12px gap between the Navbar and the Ribbon at all times.
  const ribbonTop = useTransform(scrollY, [0, 100], [140, 100]);

  return (
    <>
      <Navbar />
      {showRibbon && (
        <motion.div 
          className="daarayn-global-ribbon-wrapper"
          style={{ top: ribbonTop }}
        >
          <QuickDonationRibbon />
        </motion.div>
      )}
    </>
  );
}
