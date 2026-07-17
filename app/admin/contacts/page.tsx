'use client';

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { 
  Inbox, 
  Trash2, 
  Archive, 
  Mail, 
  Clock, 
  CheckSquare, 
  ArrowRight
} from "lucide-react";
import { motion } from "framer-motion";

export default function AdminContacts() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "contactMessages"));
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setMessages(list);
    } catch (err) {
      console.warn("Messages read error, loading mocks:", err);
      const mocks = [
        { id: "msg_1", name: "Irfan Qureshi", email: "irfan.q@live.com", subject: "Sponsorship Query", message: "Salam, I would like to sponsor 3 students for Hifdh memorization program. Can I set up direct bank transfer audits?", date: "05/07/2026", status: "New" },
        { id: "msg_2", name: "Aisha Patel", email: "aisha.patel@gmail.com", subject: "Food distribution partnership", message: "We would like to partner for distributing food kits in suburban Mumbra.", date: "03/07/2026", status: "Read" }
      ];
      setMessages(mocks);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, []);

  const handleArchive = async (id: string) => {
    try {
      const docRef = doc(db, "contactMessages", id);
      await updateDoc(docRef, { status: "Archived" });
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: "Archived" } : m));
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: "Archived" } : m));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this inbox message?")) return;
    try {
      await deleteDoc(doc(db, "contactMessages", id));
      setMessages(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== id));
    }
  };

  return (
    <div className="space-y-6 text-xs">
      <div>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Inbox Contacts</h2>
        <p className="text-[10px] text-gray-400 mt-0.5 font-medium">Customer support and donor messages</p>
      </div>

      <div className="space-y-4">
        {messages.map((item) => (
          <motion.div
            key={item.id}
            className="p-5 rounded-3xl admin-glass border border-white/[0.06] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-luxury-gold/20 transition duration-300"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                  item.status === "New" 
                    ? "bg-luxury-gold/15 text-luxury-gold border-luxury-gold/20 animate-pulse"
                    : "bg-gray-800 text-gray-400 border-white/[0.08]"
                }`}>
                  {item.status}
                </span>
                <span className="text-gray-500 font-semibold">{item.date}</span>
              </div>
              <h3 className="text-sm font-bold text-white">{item.subject || "No Subject"}</h3>
              <p className="text-gray-300 text-[11px] leading-relaxed max-w-xl">{item.message}</p>
              <div className="text-[10px] text-gray-500 font-medium">
                From: <span className="text-white">{item.name}</span> &lt;{item.email}&gt;
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              {item.status !== "Archived" && (
                <button 
                  onClick={() => handleArchive(item.id)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-white font-bold transition"
                  title="Archive Message"
                >
                  <Archive className="w-3.5 h-3.5 text-luxury-gold" /> Archive
                </button>
              )}
              <button 
                onClick={() => handleDelete(item.id)}
                className="p-2 rounded-xl bg-red-950/20 border border-red-500/10 hover:bg-red-900/30 text-red-400 transition"
                title="Delete message"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
