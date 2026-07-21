"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Bell,
  Search,
  CheckCircle2,
  Filter as FilterIcon,
  MapPin,
  MessageSquare,
  User,
  IndianRupee,
  Target,
  Megaphone,
  BarChart2,
  Star,
  MoreVertical,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  Trash2,
  MailOpen,
  X
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch, deleteDoc } from "firebase/firestore";
import { AdminNotification, NotificationCategory, CATEGORY_META } from "@/lib/notifications";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

type FilterType = "all" | "unread" | "starred" | "today" | "week";

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

function isYesterday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  const yesterday = new Date(n);
  yesterday.setDate(yesterday.getDate() - 1);
  return d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear();
}

function isThisWeek(iso: string) {
  return Date.now() - new Date(iso).getTime() < 7 * 24 * 60 * 60 * 1000;
}

const CATEGORY_ICONS: Record<NotificationCategory, any> = {
  field_reports: MapPin,
  conversations: MessageSquare,
  donors: User,
  donations: IndianRupee,
  causes_campaigns: Target,
  communications: Megaphone,
  executive_reports: BarChart2,
};

const CATEGORY_COLORS: Record<NotificationCategory, { bg: string, border: string, text: string }> = {
  field_reports: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400" },
  conversations: { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-400" },
  donors: { bg: "bg-purple-500/10", border: "border-purple-500/20", text: "text-purple-400" },
  donations: { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-400" },
  causes_campaigns: { bg: "bg-teal-500/10", border: "border-teal-500/20", text: "text-teal-400" },
  communications: { bg: "bg-pink-500/10", border: "border-pink-500/20", text: "text-pink-400" },
  executive_reports: { bg: "bg-yellow-500/10", border: "border-yellow-500/20", text: "text-yellow-400" },
};

export default function NotificationCenterPage() {
  const [notifications, setNotifications] = useState<(AdminNotification & { id: string, isStarred?: boolean })[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Real-time Firestore listener
  useEffect(() => {
    const q = query(collection(db, "admin_notifications"), orderBy("createdAt", "desc"), limit(200));
    const unsub = onSnapshot(q, (snap) => {
      const list: (AdminNotification & { id: string, isStarred?: boolean })[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as AdminNotification), isStarred: (d.data() as any).isStarred }));
      setNotifications(list);
      
      // Auto-select first item if nothing selected, and mark it read
      if (list.length > 0) {
        setSelectedId((prev) => {
          if (!prev) {
            const first = list[0];
            if (!first.isRead) {
              updateDoc(doc(db, "admin_notifications", first.id), {
                isRead: true,
                readAt: new Date().toISOString(),
              }).catch(() => {});
            }
            return first.id;
          }
          return prev;
        });
      }
    });
    return () => unsub();
  }, []);

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.isRead;
    if (filter === "starred") return n.isStarred;
    if (filter === "today") return isToday(n.createdAt);
    if (filter === "week") return isThisWeek(n.createdAt);
    return true;
  }).filter((n) => {
    if (search) {
      const q = search.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.description.toLowerCase().includes(q);
    }
    return true;
  });

  const totalUnread = notifications.filter((n) => !n.isRead).length;
  const totalStarred = notifications.filter((n) => n.isStarred).length;

  const markRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "admin_notifications", id), {
        isRead: true,
        readAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.isRead);
    if (!unread.length) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((n) => {
        batch.update(doc(db, "admin_notifications", n.id), {
          isRead: true,
          readAt: new Date().toISOString(),
        });
      });
      await batch.commit();
    } catch (e) {
      console.error(e);
    }
  };

  const markUnread = async (id: string) => {
    try {
      await updateDoc(doc(db, "admin_notifications", id), {
        isRead: false,
        readAt: null,
      });
    } catch (e) { console.error(e); }
  };

  const toggleStar = async (id: string, current: boolean) => {
    try {
      await updateDoc(doc(db, "admin_notifications", id), { isStarred: !current });
    } catch (e) { console.error(e); }
  };

  const deleteNotif = async (id: string) => {
    try {
      await deleteDoc(doc(db, "admin_notifications", id));
      if (selectedId === id) setSelectedId(null);
    } catch (e) { console.error(e); }
  };

  const categories = Object.entries(CATEGORY_META) as [NotificationCategory, typeof CATEGORY_META[NotificationCategory]][];
  
  const todayList = filtered.filter(n => isToday(n.createdAt));
  const yesterdayList = filtered.filter(n => isYesterday(n.createdAt));
  const olderList = filtered.filter(n => !isToday(n.createdAt) && !isYesterday(n.createdAt));

  const selectedItem = notifications.find(n => n.id === selectedId);

  return (
    <div className="flex flex-col h-full w-full min-w-0 bg-[#030906] min-h-screen text-gray-200 p-4 lg:p-5 space-y-4 overflow-hidden">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Notification Center</h1>
          <p className="text-xs text-gray-400 mt-1">Stay updated with what matters across Daarayn.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto mt-2 md:mt-0">
          <div className="relative w-full md:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search notifications..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs text-white placeholder-gray-500 focus:outline-none focus:border-luxury-gold/50 transition-colors w-full"
            />
          </div>
          <div className="flex gap-2">
            <button 
              onClick={markAllRead}
              disabled={totalUnread === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              Mark all as read
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] text-xs font-medium transition-colors whitespace-nowrap">
              <FilterIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Category Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 lg:gap-3 w-full min-w-0">
        {categories.map(([cat, meta]) => {
          const catUnread = notifications.filter(n => n.category === cat && !n.isRead).length;
          const Icon = CATEGORY_ICONS[cat];
          const colorClass = CATEGORY_COLORS[cat];
          return (
            <div key={cat} className="flex flex-col p-2 lg:p-3 rounded-xl bg-white/[0.015] border border-white/[0.04] hover:bg-white/[0.03] transition-colors cursor-pointer relative overflow-hidden group min-w-0">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex flex-row items-center gap-2 mb-2 min-w-0">
                <div className={`w-6 h-6 rounded-full ${colorClass.bg} ${colorClass.border} border flex items-center justify-center shrink-0`}>
                  <Icon className={`w-3 h-3 ${colorClass.text}`} />
                </div>
                <span className="text-[9px] xl:text-[10px] font-medium text-gray-300 leading-tight flex-1 whitespace-normal break-words">{meta.label}</span>
              </div>
              <div className="min-w-0 mt-auto">
                <div className="text-lg xl:text-xl font-bold text-white leading-none">{notifications.filter(n => n.category === cat).length}</div>
                <div className={`text-[8px] xl:text-[9px] font-semibold tracking-wider uppercase mt-0.5 whitespace-normal ${catUnread > 0 ? colorClass.text : 'text-gray-600'}`}>
                  {catUnread > 0 ? `${catUnread} Unread` : "0 Unread"}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filters & Total */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-white/[0.06] pb-3 gap-3 min-w-0">
        <div className="text-xs font-medium text-gray-300 flex items-center whitespace-nowrap">
          Total Unread: <span className="text-luxury-gold font-bold ml-1">{totalUnread}</span>
          <span className="mx-2 text-gray-600">|</span>
          Starred: <span className="text-amber-400 font-bold ml-1">{totalStarred}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            { key: "all", label: "All" },
            { key: "unread", label: "Unread" },
            { key: "starred", label: "Starred" },
            { key: "today", label: "Today" },
            { key: "week", label: "This Week" }
          ] as { key: FilterType, label: string }[]).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-md text-[10px] font-medium transition-colors ${
                filter === f.key 
                  ? "bg-luxury-gold/20 text-luxury-gold border border-luxury-gold/30" 
                  : "bg-transparent text-gray-400 hover:text-white border border-transparent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Two Columns */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0 min-w-0 w-full overflow-hidden">
        
        {/* Left Col: List */}
        <div className={`w-full lg:w-[40%] xl:w-[35%] flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar min-w-0 shrink-0 ${selectedItem ? 'hidden lg:flex' : 'flex'}`}>
          
          {todayList.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold tracking-wider uppercase text-gray-500 mb-2">Today</h3>
              <div className="space-y-1.5">
                {todayList.map(n => <NotificationRow key={n.id} notification={n} isSelected={selectedId === n.id} onSelect={() => { setSelectedId(n.id); if (!n.isRead) markRead(n.id); }} />)}
              </div>
            </div>
          )}

          {yesterdayList.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold tracking-wider uppercase text-gray-500 mb-2">Yesterday</h3>
              <div className="space-y-1.5">
                {yesterdayList.map(n => <NotificationRow key={n.id} notification={n} isSelected={selectedId === n.id} onSelect={() => { setSelectedId(n.id); if (!n.isRead) markRead(n.id); }} />)}
              </div>
            </div>
          )}

          {olderList.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold tracking-wider uppercase text-gray-500 mb-2">Older</h3>
              <div className="space-y-1.5">
                {olderList.map(n => <NotificationRow key={n.id} notification={n} isSelected={selectedId === n.id} onSelect={() => { setSelectedId(n.id); if (!n.isRead) markRead(n.id); }} />)}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center border border-white/[0.04] border-dashed rounded-2xl bg-white/[0.01]">
              <Bell className="w-8 h-8 text-gray-600 mb-3" />
              <p className="text-sm font-medium text-gray-400">No notifications found.</p>
            </div>
          )}

        </div>

        {/* Right Col: Detail Pane */}
        <div className={`flex-1 rounded-xl bg-[#0a0f0c] border border-white/[0.06] p-4 lg:p-6 flex-col relative overflow-y-auto overflow-x-hidden custom-scrollbar min-w-0 min-h-0 ${!selectedItem ? 'hidden lg:flex' : 'flex'}`}>
          {/* Abstract glow */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-luxury-gold/[0.02] rounded-full blur-[60px] pointer-events-none" />

          {selectedItem ? (
            <div className="flex flex-col h-full relative z-10">
              
              {/* Header */}
              <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between mb-5 gap-3 min-w-0">
                <div className="flex items-start gap-3 min-w-0">
                  <button onClick={() => setSelectedId(null)} className="lg:hidden mt-1 p-1.5 rounded-md bg-white/[0.05] text-gray-400 hover:text-white flex-shrink-0 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className={`w-9 h-9 rounded-full ${CATEGORY_COLORS[selectedItem.category].bg} ${CATEGORY_COLORS[selectedItem.category].border} border flex items-center justify-center shrink-0`}>
                    {React.createElement(CATEGORY_ICONS[selectedItem.category], { className: `w-4 h-4 ${CATEGORY_COLORS[selectedItem.category].text}` })}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-white mb-0.5 leading-tight truncate">{selectedItem.title}</h2>
                    <p className="text-[11px] text-gray-400 truncate">{selectedItem.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!selectedItem.isRead && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[9px] font-bold text-amber-500 uppercase tracking-wider">
                      <div className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" /> Unread
                    </div>
                  )}
                  <button
                    onClick={() => toggleStar(selectedItem.id, !!selectedItem.isStarred)}
                    title={selectedItem.isStarred ? "Remove star" : "Star this notification"}
                    className="p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
                  >
                    <Star className={`w-3.5 h-3.5 ${selectedItem.isStarred ? "fill-amber-400 text-amber-400" : "text-gray-500 hover:text-amber-400"}`} />
                  </button>
                  <MoreMenu
                    onMarkUnread={() => markUnread(selectedItem.id)}
                    onDelete={() => deleteNotif(selectedItem.id)}
                    isRead={selectedItem.isRead}
                  />
                </div>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-y-3 gap-x-4 mb-5 border-b border-white/[0.06] pb-5 min-w-0">
                <MetaItem icon={<Target className="w-3.5 h-3.5" />} label="Category" value={CATEGORY_META[selectedItem.category].label} />
                <MetaItem icon={<User className="w-3.5 h-3.5" />} label="Created By" value={selectedItem.createdBy} />
                <MetaItem icon={<Search className="w-3.5 h-3.5" />} label="Date & Time" value={new Date(selectedItem.createdAt).toLocaleString()} />
                
                {/* Dynamically render other metadata */}
                {selectedItem.metadata && Object.entries(selectedItem.metadata).map(([key, value]) => (
                  <MetaItem 
                    key={key} 
                    icon={<ChevronRight className="w-3 h-3" />} 
                    label={key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} 
                    value={
                      typeof value === 'object' && value !== null 
                        ? JSON.stringify(value) 
                        : (key.toLowerCase().includes('amount') ? `₹${Number(value).toLocaleString()}` : String(value))
                    } 
                  />
                ))}
              </div>

              {/* Full Description / Body */}
              <div className="mb-5 flex-1">
                <h4 className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase mb-2">Details</h4>
                <p className="text-xs text-gray-300 leading-relaxed max-w-2xl">
                  {selectedItem.description}
                </p>
                {/* You can expand this section if metadata contains full body content */}
                {selectedItem.metadata?.fullMessage && (
                   <div className="mt-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs text-gray-300 italic">
                     "{selectedItem.metadata.fullMessage}"
                   </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-white/[0.06] mt-auto">
                <Link href={selectedItem.actionUrl} className="px-3 py-1.5 rounded-lg bg-luxury-gold text-[#030906] text-xs font-semibold hover:bg-luxury-gold/90 transition flex items-center gap-1.5">
                  View Record <ArrowRight className="w-3 h-3" />
                </Link>
                {selectedItem.isRead ? (
                  <button onClick={() => markUnread(selectedItem.id)} className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-white text-xs font-medium transition flex items-center gap-1.5">
                    <MailOpen className="w-3 h-3" /> Mark Unread
                  </button>
                ) : (
                  <button onClick={() => markRead(selectedItem.id)} className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-white text-xs font-medium transition flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3" /> Mark as Read
                  </button>
                )}
                <button
                  onClick={() => deleteNotif(selectedItem.id)}
                  className="px-3 py-1.5 rounded-lg bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 text-red-500 text-xs font-medium transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-white/[0.02] flex items-center justify-center mb-4">
                <Bell className="w-6 h-6 text-gray-600" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">No Notification Selected</h3>
              <p className="text-sm text-gray-400">Select a notification from the list to view its details.</p>
            </div>
          )}

        </div>
      </div>

    </div>
  );
}

function NotificationRow({ notification, isSelected, onSelect }: { notification: AdminNotification & { id: string, isStarred?: boolean }, isSelected: boolean, onSelect: () => void }) {
  const Icon = CATEGORY_ICONS[notification.category];
  const colorClass = CATEGORY_COLORS[notification.category];

  return (
    <div 
      onClick={onSelect}
      className={`p-3 rounded-xl cursor-pointer transition-all border flex items-start gap-3 ${
        isSelected 
          ? "bg-white/[0.05] border-white/[0.12]" 
          : "bg-transparent border-transparent hover:bg-white/[0.02] hover:border-white/[0.04]"
      }`}
    >
      <div className={`w-8 h-8 rounded-full ${colorClass.bg} flex items-center justify-center flex-shrink-0 mt-0.5 relative`}>
        <Icon className={`w-3.5 h-3.5 ${colorClass.text}`} />
        {!notification.isRead && (
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-luxury-gold border-2 border-[#030906]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <h4 className={`text-xs font-semibold truncate pr-3 ${!notification.isRead ? 'text-white' : 'text-gray-300'}`}>
            {notification.title}
          </h4>
          <span className="text-[9px] text-gray-500 font-medium flex-shrink-0">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </span>
        </div>
        <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">
          {notification.description}
        </p>
      </div>
      {notification.isStarred && (
        <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0 mt-3" />
      )}
    </div>
  );
}

function MoreMenu({ onMarkUnread, onDelete, isRead }: { onMarkUnread: () => void; onDelete: () => void; isRead: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="p-2 rounded-lg hover:bg-white/[0.04] text-gray-500 hover:text-white transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-44 bg-[#0d1410] border border-white/[0.08] rounded-xl shadow-xl overflow-hidden">
          <button
            onClick={() => { onMarkUnread(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-[12px] text-gray-300 hover:bg-white/[0.05] hover:text-white transition text-left"
          >
            <MailOpen className="w-3.5 h-3.5 text-gray-400" />
            {isRead ? "Mark as Unread" : "Mark as Read"}
          </button>
          <div className="border-t border-white/[0.06]" />
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-[12px] text-red-400 hover:bg-red-500/10 transition text-left"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function MetaItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <div className="w-5 h-5 rounded-md bg-white/[0.04] flex items-center justify-center text-gray-400 mt-0.5 shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] text-gray-500 font-medium uppercase tracking-wider truncate">{label}</div>
        <div className="text-xs font-semibold text-white break-words">{value}</div>
      </div>
    </div>
  );
}
