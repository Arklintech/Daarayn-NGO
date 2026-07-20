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
    <div className="flex flex-col h-full bg-[#030906] min-h-screen text-gray-200 p-4 lg:p-8 space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Notification Center</h1>
          <p className="text-sm text-gray-400 mt-0.5">Stay updated with what matters across Daarayn.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto mt-3 md:mt-0">
          <div className="relative w-full md:w-64">
            <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search notifications..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-6 pr-3 py-1.5 rounded-md bg-white/[0.02] border border-white/[0.06] text-sm text-white placeholder-gray-500 focus:outline-none focus:border-luxury-gold/50 transition-colors w-full"
            />
          </div>
          <div className="flex gap-1.5">
            <button 
              onClick={markAllRead}
              disabled={totalUnread === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <CheckCircle2 className="w-3 h-3 text-gray-400 shrink-0" />
              Mark all as read
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] text-sm font-medium transition-colors whitespace-nowrap">
              <FilterIcon className="w-3 h-3 text-gray-400 shrink-0" />
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Category Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {categories.map(([cat, meta]) => {
          const catUnread = notifications.filter(n => n.category === cat && !n.isRead).length;
          const Icon = CATEGORY_ICONS[cat];
          const colorClass = CATEGORY_COLORS[cat];
          return (
            <div key={cat} className="flex flex-col p-3 rounded-md bg-white/[0.015] border border-white/[0.04] hover:bg-white/[0.03] transition-colors cursor-pointer relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-6 h-6 rounded-full ${colorClass.bg} ${colorClass.border} border flex items-center justify-center`}>
                  <Icon className={`w-3 h-3 ${colorClass.text}`} />
                </div>
                <span className="text-xs font-medium text-gray-300 leading-tight flex-1">{meta.label}</span>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{notifications.filter(n => n.category === cat).length}</div>
                <div className={`text-[8px] font-semibold tracking-wider uppercase mt-0.5 ${catUnread > 0 ? colorClass.text : 'text-gray-600'}`}>
                  {catUnread > 0 ? `${catUnread} Unread` : "0 Unread"}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filters & Total */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-white/[0.06] pb-3 gap-3">
        <div className="text-sm font-medium text-gray-300 flex items-center whitespace-nowrap">
          Total Unread: <span className="text-luxury-gold font-bold ml-0.5">{totalUnread}</span>
          <span className="mx-1.5 text-gray-600">|</span>
          Starred: <span className="text-amber-400 font-bold ml-0.5">{totalStarred}</span>
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
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
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
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        
        {/* Left Col: List */}
        <div className="w-full lg:w-[45%] flex flex-col gap-4 overflow-y-auto pr-1.5 custom-scrollbar">
          
          {todayList.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">Today</h3>
              <div className="space-y-1.5">
                {todayList.map(n => <NotificationRow key={n.id} notification={n} isSelected={selectedId === n.id} onSelect={() => { setSelectedId(n.id); if (!n.isRead) markRead(n.id); }} />)}
              </div>
            </div>
          )}

          {yesterdayList.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">Yesterday</h3>
              <div className="space-y-1.5">
                {yesterdayList.map(n => <NotificationRow key={n.id} notification={n} isSelected={selectedId === n.id} onSelect={() => { setSelectedId(n.id); if (!n.isRead) markRead(n.id); }} />)}
              </div>
            </div>
          )}

          {olderList.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">Older</h3>
              <div className="space-y-1.5">
                {olderList.map(n => <NotificationRow key={n.id} notification={n} isSelected={selectedId === n.id} onSelect={() => { setSelectedId(n.id); if (!n.isRead) markRead(n.id); }} />)}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 text-center border border-white/[0.04] border-dashed rounded-md bg-white/[0.01]">
              <Bell className="w-6 h-6 text-gray-600 mb-2" />
              <p className="text-sm font-medium text-gray-400">No notifications found.</p>
            </div>
          )}

        </div>

        {/* Right Col: Detail Pane */}
        <div className="flex-1 rounded-md bg-[#0a0f0c] border border-white/[0.06] p-4 lg:p-8 flex flex-col relative overflow-hidden">
          {/* Abstract glow */}
          <div className="absolute top-0 right-0 w-45 h-45 bg-luxury-gold/[0.02] rounded-full blur-[80px] pointer-events-none" />

          {selectedItem ? (
            <div className="flex flex-col h-full relative z-10">
              
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full ${CATEGORY_COLORS[selectedItem.category].bg} ${CATEGORY_COLORS[selectedItem.category].border} border flex items-center justify-center flex-shrink-0`}>
                    {React.createElement(CATEGORY_ICONS[selectedItem.category], { className: `w-3.5 h-3.5 ${CATEGORY_COLORS[selectedItem.category].text}` })}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white mb-0.5 leading-tight">{selectedItem.title}</h2>
                    <p className="text-sm text-gray-400">{selectedItem.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!selectedItem.isRead && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[8px] font-bold text-amber-500 uppercase tracking-wider">
                      <div className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" /> Unread
                    </div>
                  )}
                  <button
                    onClick={() => toggleStar(selectedItem.id, !!selectedItem.isStarred)}
                    title={selectedItem.isStarred ? "Remove star" : "Star this notification"}
                    className="p-1.5 rounded-md hover:bg-white/[0.04] transition-colors"
                  >
                    <Star className={`w-3 h-3 ${selectedItem.isStarred ? "fill-amber-400 text-amber-400" : "text-gray-500 hover:text-amber-400"}`} />
                  </button>
                  <MoreMenu
                    onMarkUnread={() => markUnread(selectedItem.id)}
                    onDelete={() => deleteNotif(selectedItem.id)}
                    isRead={selectedItem.isRead}
                  />
                </div>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-y-4 gap-x-6 mb-6 border-b border-white/[0.06] pb-6">
                <MetaItem icon={<Target className="w-2.5 h-2.5" />} label="Category" value={CATEGORY_META[selectedItem.category].label} />
                <MetaItem icon={<User className="w-2.5 h-2.5" />} label="Created By" value={selectedItem.createdBy} />
                <MetaItem icon={<Search className="w-2.5 h-2.5" />} label="Date & Time" value={new Date(selectedItem.createdAt).toLocaleString()} />
                
                {/* Dynamically render other metadata */}
                {selectedItem.metadata && Object.entries(selectedItem.metadata).map(([key, value]) => (
                  <MetaItem 
                    key={key} 
                    icon={<ChevronRight className="w-2.5 h-2.5" />} 
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
              <div className="mb-6 flex-1">
                <h4 className="text-xs font-semibold tracking-wider text-gray-500 uppercase mb-2">Details</h4>
                <p className="text-sm text-gray-300 leading-relaxed max-w-2xl">
                  {selectedItem.description}
                </p>
                {/* You can expand this section if metadata contains full body content */}
                {selectedItem.metadata?.fullMessage && (
                   <div className="mt-3 p-3 rounded-md bg-white/[0.02] border border-white/[0.04] text-sm text-gray-300 italic">
                     "{selectedItem.metadata.fullMessage}"
                   </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="flex items-center gap-2 pt-4 border-t border-white/[0.06]">
                <Link href={selectedItem.actionUrl} className="px-3.5 py-2 rounded-md bg-luxury-gold text-[#030906] text-sm font-semibold hover:bg-luxury-gold/90 transition flex items-center gap-1.5">
                  View Record <ArrowRight className="w-3 h-3" />
                </Link>
                {selectedItem.isRead ? (
                  <button onClick={() => markUnread(selectedItem.id)} className="px-3.5 py-2 rounded-md bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-white text-sm font-medium transition flex items-center gap-1.5">
                    <MailOpen className="w-3 h-3" /> Mark Unread
                  </button>
                ) : (
                  <button onClick={() => markRead(selectedItem.id)} className="px-3.5 py-2 rounded-md bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-white text-sm font-medium transition flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3" /> Mark as Read
                  </button>
                )}
                <button
                  onClick={() => deleteNotif(selectedItem.id)}
                  className="ml-auto px-3 py-2 rounded-md bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 text-red-500 text-sm font-medium transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-11 h-11 rounded-full bg-white/[0.02] flex items-center justify-center mb-3">
                <Bell className="w-4 h-4 text-gray-600" />
              </div>
              <h3 className="text-lg font-medium text-white mb-1.5">No Notification Selected</h3>
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
      className={`p-3 rounded-md cursor-pointer transition-all border flex items-start gap-3 ${
        isSelected 
          ? "bg-white/[0.05] border-white/[0.12]" 
          : "bg-transparent border-transparent hover:bg-white/[0.02] hover:border-white/[0.04]"
      }`}
    >
      <div className={`w-7 h-7 rounded-full ${colorClass.bg} flex items-center justify-center flex-shrink-0 mt-0 relative`}>
        <Icon className={`w-3 h-3 ${colorClass.text}`} />
        {!notification.isRead && (
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-luxury-gold border-2 border-[#030906]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <h4 className={`text-sm font-semibold truncate pr-3 ${!notification.isRead ? 'text-white' : 'text-gray-300'}`}>
            {notification.title}
          </h4>
          <span className="text-[8px] text-gray-500 font-medium flex-shrink-0">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </span>
        </div>
        <p className="text-[8.5px] text-gray-400 line-clamp-2 leading-relaxed">
          {notification.description}
        </p>
      </div>
      {notification.isStarred && (
        <Star className="w-2 h-2 fill-amber-400 text-amber-400 flex-shrink-0 mt-2" />
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
        className="p-1.5 rounded-md hover:bg-white/[0.04] text-gray-500 hover:text-white transition-colors"
      >
        <MoreVertical className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-31 bg-[#0d1410] border border-white/[0.08] rounded-md shadow-xl overflow-hidden">
          <button
            onClick={() => { onMarkUnread(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[8.5px] text-gray-300 hover:bg-white/[0.05] hover:text-white transition text-left"
          >
            <MailOpen className="w-2.5 h-2.5 text-gray-400" />
            {isRead ? "Mark as Unread" : "Mark as Read"}
          </button>
          <div className="border-t border-white/[0.06]" />
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[8.5px] text-red-400 hover:bg-red-500/10 transition text-left"
          >
            <Trash2 className="w-2.5 h-2.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function MetaItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-4 h-4 rounded-md bg-white/[0.04] flex items-center justify-center text-gray-400 mt-0 flex-shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-[8px] text-gray-500 font-medium uppercase tracking-wider mb-0">{label}</div>
        <div className="text-sm font-semibold text-white">{value}</div>
      </div>
    </div>
  );
}
