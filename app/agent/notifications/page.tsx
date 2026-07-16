'use client';

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { Bell, CheckCircle, AlertCircle, Info, Award, Check } from "lucide-react";
import { useFieldAgentAuth } from "@/lib/FieldAgentAuthContext";
import { FieldNotification } from "@/lib/db-field-ops";

const iconMap: Record<string, any> = {
  Alert: AlertCircle,
  Info: Info,
  Success: CheckCircle,
  Assignment: Award,
};

const colorMap: Record<string, string> = {
  Alert: "text-red-400 bg-red-500/10 border-red-500/20",
  Info: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  Success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  Assignment: "text-luxury-ivory bg-luxury-ivory/10 border-luxury-border",
};

export default function NotificationsPage() {
  const { agentData } = useFieldAgentAuth();
  const [notifications, setNotifications] = useState<FieldNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentData?.id) return;
    const fetchNotifications = async () => {
      try {
        const q = query(
          collection(db, "field_notifications"),
          where("agentId", "==", agentData.id)
        );
        const snap = await getDocs(q);
        const list: FieldNotification[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() } as FieldNotification));
        // Sort in JS to avoid composite index requirement
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setNotifications(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchNotifications();
  }, [agentData?.id]);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "field_notifications", id), { isRead: true });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-playfair tracking-wide">Alerts</h1>
          <p className="text-sm text-gray-400 mt-1">Your notifications and assignments</p>
        </div>
        {unreadCount > 0 && (
          <span className="bg-luxury-ivory text-black text-[11px] font-bold px-2.5 py-1 rounded-full">
            {unreadCount} new
          </span>
        )}
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="admin-glass border border-luxury-border rounded-2xl p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="admin-glass border border-luxury-border rounded-2xl p-10 text-center flex flex-col items-center">
          <Bell className="w-10 h-10 text-gray-600 mb-3" />
          <p className="text-gray-300 font-semibold mb-1">No notifications yet</p>
          <p className="text-xs text-gray-500">You'll be notified when admins update your reports.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map(notif => {
            const Icon = iconMap[notif.type] || Info;
            const color = colorMap[notif.type] || "text-gray-400 bg-white/5 border-white/10";
            return (
              <div
                key={notif.id}
                className={`admin-glass rounded-2xl p-4 transition border ${notif.isRead ? "border-white/[0.06] opacity-70" : "border-luxury-border"}`}
              >
                <div className="flex gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-white">{notif.title}</p>
                      {!notif.isRead && (
                        <button
                          onClick={() => markAsRead(notif.id)}
                          className="p-1 text-gray-500 hover:text-luxury-ivory transition flex-shrink-0"
                          title="Mark as read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{notif.message}</p>
                    <p className="text-[9px] text-gray-600 mt-2">
                      {new Date(notif.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
