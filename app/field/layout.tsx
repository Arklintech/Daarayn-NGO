'use client';

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, FileText, PlusCircle, Bell, User, HelpCircle, MessageSquare, MapPin
} from "lucide-react";
import { FieldAgentAuthProvider, useFieldAgentAuth } from "@/lib/FieldAgentAuthContext";
import { MosqueSilhouetteMini } from "@/components/MosqueSilhouette";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

const navItems = [
  { name: "Dashboard", href: "/field/dashboard", icon: Home },
  { name: "My Reports", href: "/field/reports", icon: FileText },
  { name: "New Need", href: "/field/reports/new", icon: PlusCircle },
  { name: "Messages", href: "/field/messages", icon: MessageSquare },
  { name: "Alerts", href: "/field/notifications", icon: Bell },
  { name: "Profile", href: "/field/profile", icon: User },
  { name: "Help", href: "/field/help", icon: HelpCircle },
];

const mobileNavItems = [
  { name: "Home", href: "/field/dashboard", icon: Home },
  { name: "Reports", href: "/field/reports", icon: FileText },
  { name: "New Need", href: "/field/reports/new", icon: PlusCircle },
  { name: "Messages", href: "/field/messages", icon: MessageSquare },
  { name: "Profile", href: "/field/profile", icon: User },
];

function AgentNavigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { agentData } = useFieldAgentAuth();
  
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [unreadReports, setUnreadReports] = useState(0);

  useEffect(() => {
    if (!agentData?.id) return;

    const unsubMessages = onSnapshot(query(collection(db, "field_conversations"), where("agentId", "==", agentData.id)), (snap) => {
      let count = 0;
      snap.forEach(d => { if (d.data().unreadCountAgent > 0) count++; });
      setUnreadMessages(count);
    });

    const unsubAlerts = onSnapshot(query(collection(db, "field_notifications"), where("agentId", "==", agentData.id)), (snap) => {
      let count = 0;
      snap.forEach(d => { if (!d.data().isRead) count++; });
      setUnreadAlerts(count);
    });

    const unsubReports = onSnapshot(query(collection(db, "field_reports"), where("agentId", "==", agentData.id)), (snap) => {
      let count = 0;
      snap.forEach(d => { if (d.data().hasAgentUnreadUpdate) count++; });
      setUnreadReports(count);
    });

    return () => {
      unsubMessages();
      unsubAlerts();
      unsubReports();
    };
  }, [agentData?.id]);

  const isActiveLink = (href: string) =>
    href === "/field/dashboard"
      ? pathname === "/field/dashboard"
      : href === "/field/reports"
      ? pathname === "/field/reports"
      : pathname.startsWith(href);

  const getBadgeCount = (name: string) => {
    if (name === "Messages" || name === "Messages") return unreadMessages;
    if (name === "Alerts") return unreadAlerts;
    if (name === "My Reports" || name === "Reports") return unreadReports;
    return 0;
  };

  return (
    <div className="bg-[#020704] min-h-screen">
      <div className="flex min-h-screen bg-[#020704] text-gray-200 font-sans max-w-enterprise mx-auto relative shadow-2xl">
        {/* ─── Desktop Sidebar (lg+) ──────────────────────── */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-[#020704] border-r border-luxury-border z-40">
        <div className="flex items-center gap-3 p-6 pb-4 border-b border-white/[0.06]">
          <img src="/daarayn-logo-transparent.png" alt="Daarayn" className="w-14 h-14 object-contain filter brightness-110" />
          <div className="leading-tight">
            <h1 className="text-sm font-bold text-white tracking-widest font-playfair uppercase">Daarayn</h1>
            <p className="text-[10px] text-luxury-gold font-semibold uppercase tracking-wider">Field Operations</p>
          </div>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto no-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActiveLink(item.href);
            const badge = getBadgeCount(item.name);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center justify-between px-4 py-2.5 rounded-lg transition-all text-[13px] font-medium ${
                  active
                    ? "bg-luxury-gold/10 text-luxury-gold border border-luxury-border"
                    : "text-gray-400 hover:bg-white/[0.02] hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {item.name}
                </div>
                {badge > 0 && (
                  <span className="bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-4">
          <div className="bg-gradient-to-b from-white/[0.05] to-transparent rounded-2xl pt-4 px-4 pb-0 relative overflow-hidden border border-white/[0.08] text-center">
            <div className="absolute -top-4 -right-4 w-20 h-20 bg-luxury-gold/5 rounded-full blur-xl pointer-events-none" />
            <h4 className="text-[11px] font-medium text-gray-300 leading-relaxed relative z-10 pb-2">
              Making an impact together for a better Ummah.
            </h4>
            <MosqueSilhouetteMini className="w-full h-auto block relative z-10 -mb-1" />
          </div>
        </div>
      </aside>

      {/* ─── Tablet Sidebar (md only, icon-only) ─────────── */}
      <aside className="hidden md:flex lg:hidden flex-col fixed left-0 top-0 bottom-0 w-16 bg-[#020704] border-r border-luxury-border z-40 items-center py-5 gap-3">
        <img src="/daarayn-logo-transparent.png" alt="Daarayn" className="w-11 h-11 object-contain filter brightness-110 mb-4" />
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActiveLink(item.href);
          const badge = getBadgeCount(item.name);
          return (
            <Link
              key={item.name}
              href={item.href}
              title={item.name}
              className={`relative flex items-center justify-center w-10 h-10 rounded-xl transition-all ${
                active
                  ? "bg-luxury-gold/10 text-luxury-gold border border-luxury-border"
                  : "text-gray-500 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5" />
              {badge > 0 && (
                <span className="absolute -top-1 -right-1 flex w-4 h-4 rounded-full bg-red-500 border-2 border-[#020704] text-[8px] font-bold text-white items-center justify-center">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </Link>
          );
        })}
      </aside>

      {/* ─── Mobile Top Header ───────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-xl border-b border-luxury-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/daarayn-logo-transparent.png" alt="Daarayn" className="w-10 h-10 object-contain filter brightness-110" />
          <div className="leading-tight">
            <h1 className="text-[13px] font-bold text-white tracking-widest font-playfair uppercase">Daarayn</h1>
            <p className="text-[9px] text-luxury-gold font-semibold uppercase tracking-wider">Field Operations</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-white/[0.05] border border-luxury-border px-2.5 py-1 rounded-lg">
          <MapPin className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] font-medium text-white">Active</span>
        </div>
      </header>

      {/* ─── Main Content ────────────────────────────────── */}
      <main className={[
        "flex-1 min-h-screen w-full overflow-y-auto",
        "lg:pl-64",       
        "md:pl-16",       
        "pt-[60px] md:pt-0",
        "pb-[72px] md:pb-0",
      ].join(" ")}>
        <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-8">
          {children}
        </div>
      </main>

      {/* ─── Mobile Bottom Navigation ─────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#020704]/95 backdrop-blur-xl border-t border-luxury-border">
        <div className="flex items-end justify-around px-1 py-2" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActiveLink(item.href);
            const badge = getBadgeCount(item.name);

            if (item.name === "New Need") {
              return (
                <Link key={item.name} href={item.href} className="flex flex-col items-center -mt-5">
                  <div className="w-[52px] h-[52px] rounded-full bg-gradient-to-tr from-luxury-gold to-[#b8860b] flex items-center justify-center shadow-[0_0_20px_rgba(212,175,55,0.35)] border-[3px] border-[#020704]">
                    <Icon className="w-5 h-5 text-black" />
                  </div>
                  <span className="text-[9px] font-medium text-luxury-gold mt-1">New Need</span>
                </Link>
              );
            }

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-1 transition ${
                  active ? "text-luxury-gold" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1 flex w-3 h-3 rounded-full bg-red-500 border border-[#020704] text-[7px] font-bold text-white items-center justify-center">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-medium">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      </div>
    </div>
  );
}

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/field/login" || pathname === "/field";

  // Inject PWA Manifest for Agent & Register SW
  useEffect(() => {
    let link = document.querySelector("link[rel~='manifest']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.href = '/field/manifest.webmanifest';

    // Register single root service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(err => {
        console.error('Service Worker registration failed: ', err);
      });
    }
  }, []);

  if (isLoginPage) {
    return (
      <FieldAgentAuthProvider>
        {children}
      </FieldAgentAuthProvider>
    );
  }

  return (
    <FieldAgentAuthProvider>
      <AgentNavigation>{children}</AgentNavigation>
    </FieldAgentAuthProvider>
  );
}
