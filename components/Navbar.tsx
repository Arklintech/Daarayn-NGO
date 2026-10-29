'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

export default function Navbar() {
  const router = useRouter();
  const { scrollY } = useScroll();
  const [activeHash, setActiveHash] = useState('');
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Dynamic Scroll Values
  const navHeight = useTransform(scrollY, [0, 100], [70, 58]);
  const navPadding = useTransform(scrollY, [0, 100], ['0 20px', '0 16px']);
  const navBg = useTransform(scrollY, [0, 100], ['rgba(1, 21, 51, 0.75)', 'rgba(1, 21, 51, 0.98)']);
  const navBlur = useTransform(scrollY, [0, 100], ['blur(12px)', 'blur(24px)']);
  const navShadow = useTransform(scrollY, [0, 100], ['0 8px 24px rgba(0, 0, 0, 0.15)', '0 16px 36px rgba(0, 0, 0, 0.4)']);
  const logoScale = useTransform(scrollY, [0, 100], [1.08, 0.95]);

  // Keep track of hash for active state
  useEffect(() => {
    setActiveHash(window.location.hash || '#home');
    const handleHashChange = () => setActiveHash(window.location.hash || '#home');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Program entries come from the Programs module (published programs that have a menu label), never from a hardcoded list.
  const [programLinks, setProgramLinks] = useState<{ name: string; href: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/programs?kind=project')
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (cancelled || !Array.isArray(list)) return;
        setProgramLinks(list.filter((p: any) => p?.content?.navLabel).slice(0, 4).map((p: any) => ({ name: p.content.navLabel, href: `/programs/${encodeURIComponent(p.id)}` })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const navItems = [
    { name: 'Home', href: '/#home' },
    { name: 'Programs', href: '/programs' },
    ...programLinks,
    { name: 'Campaigns', href: '/campaigns' },
    { name: 'About Us', href: '/#about' },
  ];

  return (
    <nav style={{ position: 'fixed', top: 0, left: 0, width: '100%', padding: '16px 16px', zIndex: 100, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }} className="lg:px-8">
      <motion.div 
        style={{
          width: '100%',
          maxWidth: '1180px',
          height: navHeight,
          background: navBg,
          backdropFilter: navBlur,
          WebkitBackdropFilter: navBlur,
          border: '1px solid rgba(255, 249, 221, 0.15)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
          padding: '0 20px',
          boxShadow: navShadow,
          pointerEvents: 'auto',
          position: 'relative'
        }}
        className="lg:px-[24px]"
      >
        {/* Glow Effects */}
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '30%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255, 249, 221, 0.4), transparent)', zIndex: 0 }} />
        <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '50%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255, 249, 221, 0.2), transparent)', zIndex: 0 }} />

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
        <Link href="/#home" onClick={() => { setActiveHash('#home'); setIsOpen(false); }} style={{ textDecoration: 'none', zIndex: 10, flexShrink: 0 }}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {/* PNG has wide transparent padding: render large and pull in with negative margins so the mark reads big without growing the bar */}
            <motion.span
              className="brand-sweep-logo w-[74px] h-[74px] lg:w-[84px] lg:h-[84px]"
              style={{ scale: logoScale, transformOrigin: 'center center', margin: '-14px -6px -14px -12px', ['--logo-src' as any]: 'url("/daarayn-logo-transparent.png")' }}
            >
              <img
                src="/daarayn-logo-transparent.png"
                alt="Daarayn Logo"
                width={84}
                height={84}
                onError={(e: any) => { e.currentTarget.src = '/brand logo .png' }}
              />
            </motion.span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span className="brand-sweep-text text-[18px] lg:text-[21px]" style={{ fontFamily: 'var(--font-cinzel)', fontWeight: 700, letterSpacing: '4px', lineHeight: 1.1, marginRight: '-4px' }}>
                DAARAYN
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                <span style={{ display: 'block', width: '10px', height: '1px', background: 'rgba(255,249,221,0.6)', flexShrink: 0 }} />
                <span className="text-[9.5px] lg:text-[10.5px]" style={{ fontFamily: 'var(--font-cinzel)', fontWeight: 400, letterSpacing: '2px', color: '#FFF9DD', textTransform: 'uppercase' }}>
                  FOUNDATION
                </span>
                <span style={{ display: 'block', width: '10px', height: '1px', background: 'rgba(255,249,221,0.6)', flexShrink: 0 }} />
              </div>
            </div>
          </motion.div>
        </Link>

        {/* Center: Navigation Links (Desktop) */}
        <div className="hidden lg:flex items-center gap-[6px] lg:gap-[10px] xl:gap-[16px] z-10" style={{ zIndex: 10 }}>
          {navItems.map((item) => {
            const isActive = activeHash === item.href.replace('/', '');
            return (
              <div 
                key={item.name} 
                style={{ position: 'relative' }}
                onMouseEnter={() => setHoveredPath(item.href)}
                onMouseLeave={() => setHoveredPath(null)}
              >
                <a 
                  href={item.href}
                  onClick={(e) => {
                    const id = item.href.replace('/#', '');
                    const element = document.getElementById(id);
                    if (window.location.pathname === '/' && element) {
                      e.preventDefault();
                      setActiveHash(item.href.replace('/', ''));
                      element.scrollIntoView({ behavior: 'smooth' });
                      window.history.pushState(null, '', item.href);
                    } else {
                      // Navigate to target route/anchor when on payment gate or other subpages
                      e.preventDefault();
                      router.push(item.href);
                    }
                  }}
                  className="px-[8px] lg:px-[12px] xl:px-[16px] py-[8px] text-[13px] xl:text-[14px]"
                  style={{
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? '#FFF9DD' : '#fff',
                    textDecoration: 'none',
                    display: 'block',
                    transition: 'color 0.3s ease',
                    textShadow: hoveredPath === item.href ? '0 0 8px rgba(255, 249, 221, 0.4)' : 'none',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <motion.span
                    animate={{ y: hoveredPath === item.href ? -2 : 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                    style={{ display: 'inline-block' }}
                  >
                    {item.name}
                  </motion.span>
                </a>

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
        <div className="lg:hidden flex z-10 items-center pr-2">
          <button type="button" onClick={() => setIsOpen(!isOpen)} className="text-[#FFF9DD] p-2 focus:outline-none bg-white/5 rounded-lg border border-white/10 active:scale-95 transition-transform">
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Drawer */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              style={{
                position: 'absolute',
                top: '100%',
                left: '16px',
                right: '16px',
                marginTop: '12px',
                background: 'rgba(1, 21, 51, 0.95)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                borderRadius: '20px',
                border: '1px solid rgba(255, 249, 221, 0.15)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 30px 60px rgba(0,0,0,0.8)',
                zIndex: 50,
                overflow: 'hidden'
              }}
              className="mobile-drawer"
            >
              {navItems.map((item, index) => {
                const isActive = activeHash === item.href.replace('/', '');
                return (
                  <motion.div
                    key={item.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.04 }}
                  >
                    <a
                      href={item.href}
                      onClick={(e) => {
                        const id = item.href.replace('/#', '');
                        const element = document.getElementById(id);
                        setIsOpen(false);
                        if (window.location.pathname === '/' && element) {
                          e.preventDefault();
                          setActiveHash(item.href.replace('/', ''));
                          element.scrollIntoView({ behavior: 'smooth' });
                          window.history.pushState(null, '', item.href);
                        } else {
                          e.preventDefault();
                          router.push(item.href);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 20px',
                        borderRadius: '14px',
                        textDecoration: 'none',
                        color: isActive ? '#FFF9DD' : 'rgba(255, 255, 255, 0.85)',
                        background: isActive ? 'rgba(255, 249, 221, 0.1)' : 'transparent',
                        fontWeight: isActive ? 600 : 400,
                        border: `1px solid ${isActive ? 'rgba(255, 249, 221, 0.2)' : 'transparent'}`,
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <span style={{ fontSize: '16px', letterSpacing: '0.5px' }}>{item.name}</span>
                      {isActive && (
                        <motion.div 
                          layoutId="active-indicator-mobile"
                          style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FFF9DD', boxShadow: '0 0 12px #FFF9DD' }}
                        />
                      )}
                    </a>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </nav>
  );
}
