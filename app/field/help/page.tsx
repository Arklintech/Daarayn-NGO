'use client';

import React from "react";
import { HelpCircle, MessageSquare, Phone, FileText } from "lucide-react";

export default function HelpSupportPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto text-center mt-10">
      <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
        <HelpCircle className="w-8 h-8 text-luxury-gold" />
      </div>
      
      <h1 className="text-3xl font-bold text-white tracking-wide" style={{ fontFamily: 'var(--font-cinzel)' }}>HOW CAN WE HELP YOU?</h1>
      <p className="text-sm text-gray-400 mt-2 leading-relaxed max-w-xl mx-auto">
        If you are experiencing issues submitting a report or need to speak with headquarters urgently, please use the channels below.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 text-left">
        <div className="admin-glass border border-white/10 rounded-3xl p-8 shadow-xl hover:bg-white/5 transition cursor-pointer hover:border-luxury-gold/30">
          <MessageSquare className="w-6 h-6 text-luxury-gold mb-4" />
          <h3 className="text-white font-bold text-base">Live Chat</h3>
          <p className="text-sm text-gray-400 mt-1 mb-6">Chat directly with a Daarayn support coordinator.</p>
          <span className="text-sm font-semibold text-luxury-gold">Start Chat &rarr;</span>
        </div>
        
        <div className="admin-glass border border-white/10 rounded-3xl p-8 shadow-xl hover:bg-white/5 transition cursor-pointer hover:border-luxury-gold/30">
          <Phone className="w-6 h-6 text-luxury-gold mb-4" />
          <h3 className="text-white font-bold text-base">Emergency Hotline</h3>
          <p className="text-sm text-gray-400 mt-1 mb-6">For urgent field scenarios requiring immediate intervention.</p>
          <span className="text-sm font-semibold text-luxury-gold">Call HQ &rarr;</span>
        </div>

        <div className="admin-glass border border-white/10 rounded-3xl p-8 shadow-xl hover:bg-white/5 transition cursor-pointer hover:border-luxury-gold/30">
          <FileText className="w-6 h-6 text-luxury-gold mb-4" />
          <h3 className="text-white font-bold text-base">Documentation</h3>
          <p className="text-sm text-gray-400 mt-1 mb-6">Read guidelines on what constitutes verifiable evidence.</p>
          <span className="text-sm font-semibold text-luxury-gold">Read Guidelines &rarr;</span>
        </div>
      </div>
    </div>
  );
}
