'use client';

import React, { useState } from "react";
import { HelpCircle, MessageSquare, Book, ChevronDown, ChevronUp, Phone, Mail, ExternalLink } from "lucide-react";
import Link from "next/link";

const faqs = [
  {
    q: "How do I submit a new field report?",
    a: "Go to the 'New Need' section from the navigation. Fill in the 5-step form with basic info, location, need details, beneficiaries, and media. Submit to send it for review."
  },
  {
    q: "How long does review take?",
    a: "Admin team typically reviews reports within 2-5 working days. Urgent reports are prioritized. You'll get an alert once the status changes."
  },
  {
    q: "What does 'Needs Info' status mean?",
    a: "The admin has reviewed your report but needs additional information. Check your Messages for what's needed, and reply promptly to avoid delays."
  },
  {
    q: "Can I edit a report after submission?",
    a: "Currently, reports cannot be edited after submission. If you need to update information, contact admin via Messages and they can add notes."
  },
  {
    q: "What happens after Approval?",
    a: "The verified need gets converted to an official Cause on the Daarayn website where donors can contribute directly to that specific need."
  },
  {
    q: "How do I contact admin?",
    a: "Use the Messages section to start an Operations conversation. You can also send messages linked to specific reports from the Report Detail page."
  },
];

export default function HelpPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white font-playfair tracking-wide">Help & Support</h1>
        <p className="text-sm text-gray-400 mt-1">Get assistance for your field operations</p>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/agent/messages" className="admin-glass border border-luxury-border rounded-2xl p-4 hover:border-luxury-gold/30 transition group">
          <MessageSquare className="w-6 h-6 text-luxury-gold mb-2" />
          <p className="text-sm font-bold text-white group-hover:text-luxury-gold transition">Message Admin</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Get direct support</p>
        </Link>
        <Link href="/agent/reports/new" className="admin-glass border border-luxury-border rounded-2xl p-4 hover:border-luxury-gold/30 transition group">
          <Book className="w-6 h-6 text-luxury-gold mb-2" />
          <p className="text-sm font-bold text-white group-hover:text-luxury-gold transition">Submit Report</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Report a new need</p>
        </Link>
      </div>

      {/* FAQs */}
      <div className="admin-glass border border-luxury-border rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-luxury-gold" />
            Frequently Asked Questions
          </h2>
        </div>
        <div className="divide-y divide-white/[0.05]">
          {faqs.map((faq, i) => (
            <div key={i}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full p-4 text-left flex items-center justify-between gap-3 hover:bg-white/[0.02] transition"
              >
                <span className="text-sm font-medium text-white">{faq.q}</span>
                {openFaq === i
                  ? <ChevronUp className="w-4 h-4 text-luxury-gold flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                }
              </button>
              {openFaq === i && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-gray-400 leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Contact Block */}
      <div className="admin-glass border border-luxury-border rounded-2xl p-5 space-y-4">
        <h3 className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Contact Daarayn Operations</h3>
        {[
          { icon: Mail, label: "Email", value: "fieldops@daarayn.org" },
          { icon: Phone, label: "Phone", value: "+91 XXXXX XXXXX" },
        ].map(c => (
          <div key={c.label} className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/[0.03] border border-white/[0.06] rounded-lg flex items-center justify-center">
              <c.icon className="w-4 h-4 text-luxury-gold" />
            </div>
            <div>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider">{c.label}</p>
              <p className="text-sm text-white">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Version */}
      <p className="text-center text-[10px] text-gray-600">Daarayn Field Operations Portal · v1.0.0</p>
    </div>
  );
}
