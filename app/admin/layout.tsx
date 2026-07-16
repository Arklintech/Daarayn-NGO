'use client';

import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  LayoutDashboard, 
  FolderHeart, 
  Flame, 
  BadgeIndianRupee, 
  BookMarked, 
  Users2, 
  FileText, 
  Image, 
  PenTool, 
  HeartHandshake, 
  Inbox, 
  Settings2, 
  LogOut, 
  Menu, 
  X, 
  User as UserIcon,
  ShieldCheck,
  Sparkles,
  Mail,
  MapPin,
  Bell
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, where } from "firebase/firestore";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, adminData, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);

  // Real-time unread count
  React.useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "admin_notifications"),
      where("isRead", "==", false)
    );
    const unsub = onSnapshot(q, (snap) => {
      setTotalUnread(snap.docs.length);
    });
    return () => unsub();
  }, [user]);

  // If this is the login page, bypass layout entirely
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  // Security route guard during load
  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#020704]">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-luxury-ivory border-t-transparent mx-auto"></div>
          <p className="mt-4 text-sm text-gray-400 font-medium">Authorizing administrator session...</p>
        </div>
      </div>
    );
  }

  // Guard: if no user is signed in, redirect to login
  if (!user) {
    if (typeof window !== "undefined") {
      router.replace("/admin/login");
    }
    return null;
  }

  const sidebarSections = [
    {
      title: "Notification Center",
      items: [
        { name: "Notification Center", href: "/admin/notifications", icon: Bell },
      ]
    },
    {
      title: "Dashboard",
      items: [
        { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      ]
    },
    {
      title: "Intelligence",
      items: [
        { name: "MOMIN AI", href: "/admin/ai", icon: Sparkles },
      ]
    },
    {
      title: "Field Operations",
      items: [
        { name: "Field Operations", href: "/admin/field-ops", icon: MapPin },
        { name: "Field Agents", href: "/admin/field-agents", icon: HeartHandshake },
      ]
    },
    {
      title: "Donor Management",
      items: [
        { name: "Donors CRM", href: "/admin/donors", icon: Users2 },
        { name: "Donations", href: "/admin/donations", icon: BadgeIndianRupee },
        { name: "Donor Communications", href: "/admin/communications", icon: Mail },
      ]
    },
    {
      title: "Programs & Causes",
      items: [
        { name: "Programs", href: "/admin/programs", icon: FolderHeart },
        { name: "Campaigns", href: "/admin/campaigns", icon: Flame },
        { name: "Cause Management Center", href: "/admin/causes", icon: BookMarked },
        { name: "Beneficiaries", href: "/admin/beneficiaries", icon: Users2 },
      ]
    },
    {
      title: "Transparency",
      items: [
        { name: "Public Ledger", href: "/admin/ledger", icon: FileText },
      ]
    },
    {
      title: "Content Management",
      items: [
        { name: "Content CMS", href: "/admin/content", icon: FileText },
        { name: "Media Library", href: "/admin/media", icon: Image },
        { name: "Blog & News", href: "/admin/blog", icon: PenTool },
      ]
    },
    {
      title: "Communications",
      items: [
        { name: "Inbox", href: "/admin/contacts", icon: Inbox },
      ]
    },
    {
      title: "Administration",
      items: [
        { name: "Settings", href: "/admin/settings", icon: Settings2 },
      ]
    }
  ];

  const handleLogout = async () => {
    await logout();
    router.replace("/admin/login");
  };

  const currentRole = adminData?.role || "Administrator";
  const adminName = adminData?.name || user.email?.split("@")[0] || "Admin";

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand Header */}
      <div className="p-6 border-b border-white/[0.06] flex items-center gap-3">
        <img src="/brand logo1.png" alt="Daarayn Logo" className="w-9 h-9 object-contain filter brightness-110 drop-shadow-[0_0_4px_rgba(212,175,55,0.25)]" />
        <div>
          <h2 className="text-xs font-semibold tracking-[0.4em] font-playfair text-white">DAARAYN</h2>
          <span className="text-[9px] font-semibold text-luxury-ivory uppercase tracking-widest block mt-0.5">Control Center</span>
        </div>
      </div>

      {/* Admin Quick Profile */}
      <div className="p-4 mx-4 my-3 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-luxury-ivory/10 border border-luxury-ivory/25 flex items-center justify-center text-luxury-ivory font-bold text-sm">
          {adminName[0].toUpperCase()}
        </div>
        <div className="overflow-hidden">
          <h4 className="text-xs font-semibold text-white truncate">{adminName}</h4>
          <span className="text-[9px] font-medium text-luxury-ivory/80 block mt-0.5 flex items-center gap-1">
            <ShieldCheck className="w-2.5 h-2.5 inline" /> {currentRole}
          </span>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 px-4 py-4 space-y-6 overflow-y-auto">
        {sidebarSections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {section.title !== "Notification Center" && section.title !== "Dashboard" && (
              <h3 className="px-4 text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {section.title}
              </h3>
            )}
            {section.items.map((item) => {
              const Icon = item.icon as any;
              const isActive = pathname.startsWith(item.href!);
              return (
                <Link
                  key={item.name}
                  href={item.href!}
                  onClick={() => setMobileSidebarOpen(false)}
                  className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-medium transition duration-200 ${
                    isActive 
                      ? "bg-gradient-to-r from-luxury-ivory/15 to-transparent border-l-2 border-luxury-ivory text-white font-semibold"
                      : "text-gray-400 hover:bg-white/[0.02] hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? "text-luxury-ivory" : "text-gray-400"}`} />
                    {item.name}
                  </div>
                  {item.name === "Notification Center" && totalUnread > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center leading-none shadow-[0_0_8px_rgba(239,68,68,0.5)]">
                      {totalUnread > 99 ? "99+" : totalUnread}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer / Logout */}
      <div className="p-4 border-t border-white/[0.06]">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-medium text-red-400 hover:bg-red-950/20 hover:text-red-300 transition duration-200"
        >
          <LogOut className="w-4.5 h-4.5" />
          Authorize Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05110a] via-[#020704] to-[#030906] flex text-gray-200">
      
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 border-r border-white/[0.06] bg-luxury-bg-deep/40 backdrop-blur-xl shrink-0 h-screen sticky top-0">
        {renderSidebarContent()}
      </aside>

      {/* Main Panel Wrapper */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Header */}
        <header className="h-16 border-b border-white/[0.06] bg-luxury-bg-deep/20 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setMobileSidebarOpen(true)}
              className="p-1.5 rounded-lg border border-white/[0.08] hover:bg-white/[0.04] lg:hidden transition"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5 text-gray-300" />
            </button>
            <div className="hidden sm:block">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">DAARAYN COMMAND</span>
              <h1 className="text-sm font-semibold text-white tracking-wide font-playfair uppercase -mt-0.5">
                {sidebarSections.flatMap(s => s.items as any[]).find(item => item.href && pathname.startsWith(item.href))?.name || "Command Centre"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">

            {/* Profile trigger */}
            <Link 
              href="/admin/settings" 
              className="flex items-center gap-2.5 pl-3 py-1.5 border-l border-white/[0.06]"
            >
              <div className="w-8 h-8 rounded-full bg-luxury-card border border-white/[0.08] flex items-center justify-center text-gray-400 hover:text-white transition">
                <UserIcon className="w-4 h-4" />
              </div>
            </Link>
          </div>
        </header>

        {/* Dynamic Inner Panel Viewport */}
        <main className={`flex-1 ${pathname.startsWith('/admin/field-ops') ? 'h-[calc(100vh-64px)] flex flex-col overflow-hidden' : 'p-6 lg:p-8 overflow-y-auto'}`}>
          {children}
        </main>
      </div>

      {/* Mobile Drawer Sidebar Overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
            />
            <motion.aside 
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 left-0 w-64 bg-luxury-bg-deep border-r border-white/[0.08] z-50 lg:hidden"
            >
              <button 
                onClick={() => setMobileSidebarOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg border border-white/[0.08] hover:bg-white/[0.04]"
                aria-label="Close sidebar"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
              {renderSidebarContent()}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
