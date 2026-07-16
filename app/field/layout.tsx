'use client';

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Home, 
  FileText, 
  PlusCircle, 
  Bell, 
  User, 
  HelpCircle,
  Menu,
  X
} from "lucide-react";

export default function FieldPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const menuItems = [
    { name: "Home", href: "/field", icon: Home },
    { name: "My Reports", href: "/field/reports", icon: FileText },
    { name: "Report New Need", href: "/field/new", icon: PlusCircle },
    { name: "Notifications", href: "/field/notifications", icon: Bell, badge: 3 },
    { name: "Profile", href: "/field/profile", icon: User },
    { name: "Help & Support", href: "/field/help", icon: HelpCircle },
  ];

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-[#080e1f] border-r border-white/5">
      {/* Brand Header */}
      <div className="p-8 flex items-center justify-center lg:justify-start gap-3 border-b border-white/[0.06]">
        <img src="/brand logo1.png" alt="Daarayn" className="w-8 h-8 object-contain filter brightness-110 drop-shadow-[0_0_4px_rgba(212,175,55,0.25)]" />
        <div className="hidden lg:block">
          <h2 className="text-sm font-semibold tracking-widest font-playfair text-white">DAARAYN</h2>
          <span className="text-[10px] text-luxury-gold uppercase tracking-wider block">Field Operations</span>
        </div>
      </div>

      <div className="hidden lg:block px-8 py-4">
        <span className="text-xs text-gray-400 block">Volunteer Portal</span>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-2 space-y-1 no-scrollbar px-4">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/field' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileSidebarOpen(false)}
              className={`flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-300 group ${
                isActive 
                  ? "bg-white/5 text-luxury-gold border border-white/10" 
                  : "text-gray-400 hover:text-white hover:bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center gap-4">
                <item.icon className={`w-5 h-5 transition-colors ${isActive ? 'text-luxury-gold' : 'text-gray-500 group-hover:text-gray-300'}`} />
                <span className={`text-[13px] font-medium tracking-wide hidden lg:block ${isActive ? 'text-luxury-ivory' : ''}`}>
                  {item.name}
                </span>
              </div>
              {item.badge && (
                <span className="hidden lg:flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 text-[10px] font-bold">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Footer Graphic */}
      <div className="p-4 hidden lg:block border-t border-white/[0.06]">
        <div className="bg-black/40 rounded-xl p-5 border border-white/5 relative overflow-hidden h-32 flex flex-col justify-between group cursor-pointer hover:border-luxury-gold/30 transition">
          <p className="text-xs text-gray-300 font-medium leading-relaxed relative z-10 w-2/3 group-hover:text-white transition">
            Making an impact together for a better Ummah.
          </p>
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-luxury-gold/10 blur-2xl rounded-full" />
        </div>
      </div>
    </div>
  );

  // Mobile Bottom Navigation
  const renderMobileBottomNav = () => (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#080e1f]/95 backdrop-blur-md border-t border-white/10 flex items-center justify-around pb-safe pt-2 z-50">
      {menuItems.slice(0, 5).map((item) => {
        const isActive = pathname === item.href || (item.href !== '/field' && pathname.startsWith(item.href));
        return (
          <Link key={item.name} href={item.href} className="flex flex-col items-center p-2">
            <div className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-colors ${isActive ? 'bg-white/10 text-luxury-gold' : 'text-gray-500'}`}>
              <item.icon className="w-5 h-5" />
              {item.badge && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500/20 border border-emerald-500/50 rounded-full flex items-center justify-center text-[8px] text-emerald-400 font-bold">
                  {item.badge}
                </span>
              )}
            </div>
            <span className={`text-[9px] font-medium mt-1 ${isActive ? 'text-luxury-gold' : 'text-gray-500'}`}>{item.name}</span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#020704] flex overflow-hidden font-sans text-gray-200">
      
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-72 flex-shrink-0 h-screen z-20">
        {renderSidebarContent()}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative pb-16 lg:pb-0">
        
        {/* Background glow effects */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-luxury-gold/5 blur-[150px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-emerald-900/10 blur-[150px] rounded-full pointer-events-none" />

        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-white/5 bg-[#020704]/80 backdrop-blur-md z-10 sticky top-0 shadow-sm">
          <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
            <img src="/brand logo1.png" alt="Daarayn" className="w-5 h-5 object-contain filter brightness-110" />
            <span className="text-[10px] font-semibold text-luxury-gold uppercase tracking-widest">Field Portal</span>
          </div>
          <div className="flex items-center gap-3">
             <Bell className="w-5 h-5 text-gray-400 hover:text-white" />
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto relative z-10 no-scrollbar">
          <div className="p-4 md:p-8 max-w-6xl mx-auto">
            {children}
          </div>
        </div>

        {renderMobileBottomNav()}
      </main>
    </div>
  );
}
