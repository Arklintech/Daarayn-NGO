'use client';

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, FileText, PlusCircle, Bell, User, HelpCircle, MessageSquare, MapPin
} from "lucide-react";
import { FieldAgentAuthProvider } from "@/lib/FieldAgentAuthContext";
import { MosqueSilhouetteMini } from "@/components/MosqueSilhouette";

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/agent/dashboard", icon: Home },
    { name: "My Reports", href: "/agent/reports", icon: FileText },
    { name: "New Need", href: "/agent/reports/new", icon: PlusCircle },
    { name: "Messages", href: "/agent/messages", icon: MessageSquare },
    { name: "Alerts", href: "/agent/notifications", icon: Bell },
    { name: "Profile", href: "/agent/profile", icon: User },
    { name: "Help", href: "/agent/help", icon: HelpCircle },
  ];

  // Mobile bottom nav — 5 items only
  const mobileNavItems = [
    { name: "Home", href: "/agent/dashboard", icon: Home },
    { name: "Reports", href: "/agent/reports", icon: FileText },
    { name: "New Need", href: "/agent/reports/new", icon: PlusCircle },
    { name: "Messages", href: "/agent/messages", icon: MessageSquare },
    { name: "Profile", href: "/agent/profile", icon: User },
  ];

  const isLoginPage = pathname === "/agent/login" || pathname === "/agent";

  // Login page renders completely standalone — no nav, no sidebar
  if (isLoginPage) {
    return (
      <FieldAgentAuthProvider>
        {children}
      </FieldAgentAuthProvider>
    );
  }

  const isActiveLink = (href: string) =>
    href === "/agent/dashboard"
      ? pathname === "/agent/dashboard"
      : href === "/agent/reports"
      ? pathname === "/agent/reports"
      : pathname.startsWith(href);

  return (
    <FieldAgentAuthProvider>
      {/* Root: flex-row on lg+, flex-col on smaller */}
      <div className="flex min-h-screen bg-[#020704] text-gray-200 font-sans">

        {/* ─── Desktop Sidebar (lg+) ──────────────────────── */}
        <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-[#020704] border-r border-luxury-border z-40">
          {/* Brand */}
          <div className="flex items-center gap-3 p-6 pb-4 border-b border-white/[0.06]">
            <img src="/daarayn-logo-transparent.png" alt="Daarayn" className="w-10 h-10 object-contain filter brightness-110" />
            <div className="leading-tight">
              <h1 className="text-sm font-bold text-white tracking-widest font-playfair uppercase">Daarayn</h1>
              <p className="text-[10px] text-luxury-ivory font-semibold uppercase tracking-wider">Field Operations</p>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto no-scrollbar">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActiveLink(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-[13px] font-medium ${
                    active
                      ? "bg-luxury-ivory/10 text-luxury-ivory border border-luxury-border"
                      : "text-gray-400 hover:bg-white/[0.02] hover:text-white"
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Mosque Card */}
          <div className="p-4">
            <div className="bg-gradient-to-b from-white/[0.05] to-transparent rounded-2xl pt-4 px-4 pb-0 relative overflow-hidden border border-white/[0.08] text-center">
              <div className="absolute -top-4 -right-4 w-20 h-20 bg-luxury-ivory/5 rounded-full blur-xl pointer-events-none" />
              <h4 className="text-[11px] font-medium text-gray-300 leading-relaxed relative z-10 pb-2">
                Making an impact together for a better Ummah.
              </h4>
              <MosqueSilhouetteMini className="w-full h-auto block relative z-10 -mb-1" />
            </div>
          </div>
        </aside>

        {/* ─── Tablet Sidebar (md only, icon-only) ─────────── */}
        <aside className="hidden md:flex lg:hidden flex-col fixed left-0 top-0 bottom-0 w-16 bg-[#020704] border-r border-luxury-border z-40 items-center py-5 gap-3">
          <img src="/daarayn-logo-transparent.png" alt="Daarayn" className="w-9 h-9 object-contain filter brightness-110 mb-4" />
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActiveLink(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                title={item.name}
                className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all ${
                  active
                    ? "bg-luxury-ivory/10 text-luxury-ivory border border-luxury-border"
                    : "text-gray-500 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <Icon className="w-5 h-5" />
              </Link>
            );
          })}
        </aside>

        {/* ─── Mobile Top Header ───────────────────────────── */}
        <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-xl border-b border-luxury-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/daarayn-logo-transparent.png" alt="Daarayn" className="w-8 h-8 object-contain filter brightness-110" />
            <div className="leading-tight">
              <h1 className="text-[13px] font-bold text-white tracking-widest font-playfair uppercase">Daarayn</h1>
              <p className="text-[9px] text-luxury-ivory font-semibold uppercase tracking-wider">Field Operations</p>
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
          // Offset for each sidebar size
          "lg:pl-64",       // desktop sidebar = 256px
          "md:pl-16",       // tablet sidebar = 64px
          // Top padding for mobile header
          "pt-[60px] md:pt-0",
          // Bottom padding for mobile nav
          "pb-[72px] md:pb-0",
        ].join(" ")}>
          {/* Content max-width wrapper */}
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

              if (item.name === "New Need") {
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="flex flex-col items-center -mt-5"
                  >
                    <div className="w-[52px] h-[52px] rounded-full bg-gradient-to-tr from-luxury-ivory to-[#b8860b] flex items-center justify-center shadow-[0_0_20px_rgba(212,175,55,0.35)] border-[3px] border-[#020704]">
                      <Icon className="w-5 h-5 text-black" />
                    </div>
                    <span className="text-[9px] font-medium text-luxury-ivory mt-1">New Need</span>
                  </Link>
                );
              }

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1 transition ${
                    active ? "text-luxury-ivory" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[9px] font-medium">{item.name}</span>
                </Link>
              );
            })}
          </div>
        </nav>

      </div>
    </FieldAgentAuthProvider>
  );
}
