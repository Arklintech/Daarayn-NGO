'use client';
import { useState, useEffect } from 'react';
import Navbar from './Navbar';
import QuickDonationRibbon from './QuickDonationRibbon';

interface GlobalHeaderProps {
  showRibbon?: boolean;
}

export default function GlobalHeader({ showRibbon = false }: GlobalHeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <Navbar />
      {showRibbon && (
        <div className={`daarayn-global-ribbon-wrapper ${scrolled ? 'docked' : 'hero-integrated'}`}>
          <QuickDonationRibbon />
        </div>
      )}
    </>
  );
}
