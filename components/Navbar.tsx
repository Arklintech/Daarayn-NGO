'use client';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useState, useEffect } from 'react';

export default function Navbar() {
  const { scrollY } = useScroll();
  const [activeHash, setActiveHash] = useState('');
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  // Dynamic Scroll Values
  const navHeight = useTransform(scrollY, [0, 100], [80, 64]);
  const navPadding = useTransform(scrollY, [0, 100], ['0 32px', '0 24px']);
  const navBg = useTransform(scrollY, [0, 100], ['rgba(1, 21, 51, 0.7)', 'rgba(1, 21, 51, 1)']);
  const navBlur = useTransform(scrollY, [0, 100], ['blur(12px)', 'blur(24px)']);
  const navShadow = useTransform(scrollY, [0, 100], ['0 10px 30px rgba(0, 0, 0, 0.15)', '0 20px 40px rgba(0, 0, 0, 0.4)']);
  const logoScale = useTransform(scrollY, [0, 100], [1.4, 1.2]);

  // Keep track of hash for active state
  useEffect(() => {
    setActiveHash(window.location.hash || '#home');
    const handleHashChange = () => setActiveHash(window.location.hash || '#home');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navItems = [
    { name: 'Home', href: '/#home' },
    { name: 'Programs', href: '/#programs' },
    { name: 'Family Relief', href: '/#family' },
    { name: 'Qur\'an Endowment', href: '/#quran' },
    { name: 'Masjid Fund', href: '/#masjid' },
    { name: 'Public Ledger', href: '/#ledger' },
    { name: 'About Us', href: '/#about' },
  ];

  return (
    <nav style={{ position: 'fixed', top: 0, left: 0, width: '100%', padding: '24px 32px', zIndex: 100, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <motion.div 
        style={{
          width: '100%',
          maxWidth: '1400px',
          height: navHeight,
          background: navBg,
          backdropFilter: navBlur,
          WebkitBackdropFilter: navBlur,
          border: '1px solid rgba(255, 249, 221, 0.15)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: navPadding,
          boxShadow: navShadow,
          pointerEvents: 'auto',
          position: 'relative'
        }}
      >
        {/* Subtle Islamic Star Background Watermark */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: '16px', overflow: 'hidden', pointerEvents: 'none' }}>
          <svg 
            viewBox="0 0 100 100" 
            style={{ position: 'absolute', right: '-10%', top: '-50%', height: '200%', opacity: 0.04, pointerEvents: 'none', fill: 'none', stroke: '#FFF9DD', strokeWidth: 1 }}
          >
            <path d="M50 0 L60 35 L95 35 L68 55 L78 90 L50 70 L22 90 L32 55 L5 35 L40 35 Z" />
            <path d="M50 15 L58 40 L85 40 L63 56 L72 82 L50 66 L28 82 L37 56 L15 40 L42 40 Z" />
          </svg>
        </div>

        {/* Left: Logo */}
        <Link href="/#home" onClick={() => setActiveHash('#home')} style={{ textDecoration: 'none', zIndex: 10 }}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ display: 'flex', alignItems: 'center', gap: '16px' }}
          >
            {/* Removed the CSS class that had the box, now just raw image. Using brand logo .png assuming it's the transparent one */}
            <motion.img 
              style={{ scale: logoScale, transformOrigin: 'center center', display: 'block' }}
              src="/daarayn-logo-transparent.png" 
              alt="Daarayn Logo" 
              width={80} 
              height={80}
              onError={(e: any) => { e.currentTarget.src = '/brand logo .png' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-cinzel)', fontSize: '24px', fontWeight: 400, letterSpacing: '2px', color: '#fff', lineHeight: 1.1, textShadow: '0 2px 10px rgba(255,255,255,0.1)' }}>
                DAARAYN
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                <span style={{ display: 'block', width: '24px', height: '1px', background: 'rgba(255,249,221,0.5)', flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-cinzel)', fontSize: '11px', fontWeight: 300, letterSpacing: '2px', color: 'rgba(255, 249, 221, 0.9)', textTransform: 'uppercase' }}>
                  FOUNDATION
                </span>
                <span style={{ display: 'block', width: '24px', height: '1px', background: 'rgba(255,249,221,0.5)', flexShrink: 0 }} />
              </div>
            </div>
          </motion.div>
        </Link>

        {/* Center: Navigation Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', zIndex: 10 }}>
          {navItems.map((item) => {
            const isActive = activeHash === item.href.replace('/', '');
            return (
              <div 
                key={item.name} 
                style={{ position: 'relative' }}
                onMouseEnter={() => setHoveredPath(item.href)}
                onMouseLeave={() => setHoveredPath(null)}
              >
                <Link 
                  href={item.href}
                  onClick={() => setActiveHash(item.href.replace('/', ''))}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? '#FFF9DD' : '#fff',
                    textDecoration: 'none',
                    display: 'block',
                    transition: 'color 0.3s ease',
                    textShadow: hoveredPath === item.href ? '0 0 8px rgba(255, 249, 221, 0.4)' : 'none'
                  }}
                >
                  <motion.span
                    animate={{ y: hoveredPath === item.href ? -2 : 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                    style={{ display: 'inline-block' }}
                  >
                    {item.name}
                  </motion.span>
                </Link>

                {isActive && (
                  <motion.div
                    layoutId="navbar-underline"
                    style={{
                      position: 'absolute',
                      bottom: '-4px',
                      left: '15%',
                      right: '15%',
                      height: '2px',
                      background: 'linear-gradient(90deg, transparent, #FFF9DD, transparent)',
                      borderRadius: '2px'
                    }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </nav>
  );
}
