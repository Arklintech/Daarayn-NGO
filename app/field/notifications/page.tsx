'use client';

import React from "react";
import { Bell, AlertCircle, CheckCircle, Clock } from "lucide-react";

export default function NotificationsPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-wide" style={{ fontFamily: 'var(--font-cinzel)' }}>NOTIFICATIONS</h1>
        <p className="text-sm text-gray-400 mt-1">
          Alerts, messages, and updates from Daarayn Headquarters.
        </p>
      </div>

      <div className="admin-glass border border-white/10 rounded-2xl p-4 md:p-6 shadow-xl">
        <div className="space-y-4">
          <div className="flex gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition border border-white/5">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 mt-1">
              <AlertCircle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Information Requested: School Renovation</p>
              <p className="text-sm text-gray-400 mt-1 leading-relaxed">Headquarters has requested additional photographs of the damaged roof before they can proceed with verification.</p>
              <p className="text-xs text-luxury-gold/70 mt-2 flex items-center gap-1.5"><Clock className="w-3 h-3" /> 2 hours ago</p>
            </div>
          </div>

          <div className="flex gap-4 p-4 rounded-xl hover:bg-white/5 transition border border-transparent hover:border-white/5 opacity-80">
            <div className="w-10 h-10 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0 mt-1">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Report Approved: Winter Blanket Distribution</p>
              <p className="text-sm text-gray-400 mt-1 leading-relaxed">Your field report has been verified, approved, and officially published as a global fundraising Cause on the Daarayn website.</p>
              <p className="text-xs text-gray-500 mt-2 flex items-center gap-1.5"><Clock className="w-3 h-3" /> 1 day ago</p>
            </div>
          </div>
          
          <div className="flex gap-4 p-4 rounded-xl hover:bg-white/5 transition border border-transparent hover:border-white/5 opacity-60">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mt-1">
              <Bell className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Welcome to the Field Operations System</p>
              <p className="text-sm text-gray-400 mt-1 leading-relaxed">Your agent account has been activated. You can now submit needs and track projects.</p>
              <p className="text-xs text-gray-500 mt-2 flex items-center gap-1.5"><Clock className="w-3 h-3" /> 1 week ago</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
