'use client';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

export default function Navbar() {
  const { scrollY } = useScroll();
  const [activeHash, setActiveHash] = useState('');
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

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
    <nav style={{ position: 'fixed', top: 0, left: 0, width: '100%', padding: '24px 16px', zIndex: 100, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }} className="site-header lg:px-8">
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
          padding: '0 16px',
          boxShadow: navShadow,
          pointerEvents: 'auto',
          position: 'relative'
        }}
        className="lg:px-[24px]"
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
        <Link href="/#home" onClick={() => { setActiveHash('#home'); setIsOpen(false); }} style={{ textDecoration: 'none', zIndex: 10 }}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
          >
            <motion.img 
              style={{ scale: logoScale, transformOrigin: 'center center', display: 'block' }}
              src="/daarayn-logo-transparent.png" 
              alt="Daarayn Logo" 
              width={60} 
              height={60}
              className="lg:w-[80px] lg:h-[80px]"
              onError={(e: any) => { e.currentTarget.src = '/brand logo .png' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-cinzel)', fontSize: '18px', fontWeight: 400, letterSpacing: '2px', color: '#fff', lineHeight: 1.1, textShadow: '0 2px 10px rgba(255,255,255,0.1)' }} className="lg:text-[24px]">
                DAARAYN
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }} className="lg:gap-[8px]">
                <span style={{ display: 'block', width: '12px', height: '1px', background: 'rgba(255,249,221,0.5)', flexShrink: 0 }} className="lg:w-[24px]" />
                <span style={{ fontFamily: 'var(--font-cinzel)', fontSize: '9px', fontWeight: 300, letterSpacing: '1.5px', color: 'rgba(255, 249, 221, 0.9)', textTransform: 'uppercase' }} className="lg:text-[11px] lg:tracking-[2px]">
                  FOUNDATION
                </span>
                <span style={{ display: 'block', width: '12px', height: '1px', background: 'rgba(255,249,221,0.5)', flexShrink: 0 }} className="lg:w-[24px]" />
              </div>
            </div>
          </motion.div>
        </Link>

        {/* Center: Navigation Links (Desktop) */}
        <div className="desktop-nav items-center gap-[12px] z-10" style={{ zIndex: 10 }}>
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

        {/* Mobile Toggle Button */}
        <div className="mobile-toggle z-10 items-center pr-2">
          <button onClick={() => setIsOpen(!isOpen)} className="text-[#FFF9DD] p-2 focus:outline-none bg-white/5 rounded-lg border border-white/10 active:scale-95 transition-transform">
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Drawer */}
        {isOpen && (
          <div className="mobile-drawer absolute top-[100%] left-0 w-full bg-[#011533]/95 backdrop-blur-xl rounded-b-xl border border-t-0 border-[#FFF9DD]/15 p-4 flex flex-col gap-2 shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-50">
            {navItems.map((item) => {
              const isActive = activeHash === item.href.replace('/', '');
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => {
                    setActiveHash(item.href.replace('/', ''));
                    setIsOpen(false);
                  }}
                  className={`text-[15px] p-3 rounded-lg transition-colors border ${isActive ? 'bg-[#FFF9DD]/10 text-[#FFF9DD] border-[#FFF9DD]/20 font-medium' : 'text-gray-200 border-transparent hover:bg-white/5 hover:text-[#FFF9DD] hover:border-white/10'}`}
                >
                  {item.name}
                </Link>
              );
            })}
          </div>
        )}
      </motion.div>
    </nav>
  );
}
