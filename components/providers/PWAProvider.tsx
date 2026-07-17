'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { initializeFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface PWAState {
  isOnline: boolean;
  networkLatency: 'good' | 'poor' | 'critical';
  updatePending: boolean;
  installPromptEvent: any;
  triggerAppUpdate: () => void;
}

const PWAContext = createContext<PWAState | undefined>(undefined);

export const PWAProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [networkLatency, setNetworkLatency] = useState<'good' | 'poor' | 'critical'>('good');
  const [updatePending, setUpdatePending] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const [blurred, setBlurred] = useState(false);

  useEffect(() => {
    // 1. Connectivity Auditing
    const evaluateConnectivity = () => {
      const online = navigator.onLine;
      setIsOnline(online);

      if (!online) {
        setNetworkLatency('critical');
        return;
      }

      const connection = (navigator as any).connection;
      if (connection) {
        const { rtt, downlink } = connection;
        if (rtt > 500 || downlink < 1.5) {
          setNetworkLatency('poor');
        } else {
          setNetworkLatency('good');
        }
      }
    };

    window.addEventListener('online', evaluateConnectivity);
    window.addEventListener('offline', evaluateConnectivity);
    evaluateConnectivity();

    // 2. Service Worker Registrations & Dynamic Updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdatePending(true); // Prompts user "Update Now" / "Later"
              }
            });
          }
        });
      });
    }

    // 3. BeforeInstallPrompt Capturing for Custom Triggering
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    });

    // 4. Client Privacy Masking (Visibility Change and OS Switcher Protection)
    const handleVisibilityAndFocus = () => {
      if (document.hidden || !document.hasFocus()) {
        setBlurred(true);
      } else {
        setBlurred(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityAndFocus);
    window.addEventListener('blur', handleVisibilityAndFocus);
    window.addEventListener('focus', handleVisibilityAndFocus);

    // 5. Firebase Multi-Tab Offline Persistence Bootstrapping
    const initializeSecureFirestore = async () => {
      // In the Daarayn architecture, db is already initialized in @/lib/firebase.
      // But we can attempt to enable persistence on it if it hasn't been enabled already.
      try {
        await enableMultiTabIndexedDbPersistence(db);
        console.log('[Firestore] Local-First Multi-Tab Persistence Ready.');
      } catch (err: any) {
        if (err.code === 'failed-precondition') {
          console.warn('[Firestore] Multi-tab active elsewhere. Dynamic offline fallback active.');
        } else if (err.code === 'unimplemented') {
          console.error('[Firestore] Client engine does not support offline capabilities.');
        }
      }
    };

    initializeSecureFirestore();

    return () => {
      window.removeEventListener('online', evaluateConnectivity);
      window.removeEventListener('offline', evaluateConnectivity);
      document.removeEventListener('visibilitychange', handleVisibilityAndFocus);
      window.removeEventListener('blur', handleVisibilityAndFocus);
      window.removeEventListener('focus', handleVisibilityAndFocus);
    };
  }, []);

  const triggerAppUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && reg.waiting) {
          reg.waiting.postMessage({ action: 'skipWaiting' });
          window.location.reload();
        }
      });
    }
  };

  return (
    <PWAContext.Provider value={{ isOnline, networkLatency, updatePending, installPromptEvent, triggerAppUpdate }}>
      <div className={`transition-all duration-300 ${blurred ? 'blur-xl pointer-events-none select-none opacity-40' : ''}`}>
        {children}
      </div>
      
      {/* Offline Banner */}
      {!isOnline && (
        <div className="fixed bottom-0 left-0 right-0 bg-red-600 text-white text-xs font-semibold py-1 px-4 text-center z-[9999] shadow-lg animate-in slide-in-from-bottom">
          You are currently offline. Changes will be saved locally and synced when you reconnect.
        </div>
      )}

      {/* Update Pending Banner */}
      {updatePending && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[350px] bg-luxury-bg border border-amber-500/50 rounded-xl p-4 z-[9999] shadow-2xl flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/30 shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">Update Available</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">A new version of Daarayn OS is ready to install.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setUpdatePending(false)} className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-gray-300 transition-colors">
              Later
            </button>
            <button onClick={triggerAppUpdate} className="flex-1 px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-bold shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-colors">
              Update Now
            </button>
          </div>
        </div>
      )}
    </PWAContext.Provider>
  );
};

export const usePWA = () => {
  const context = useContext(PWAContext);
  if (!context) throw new Error('usePWA must be used within a PWAProvider');
  return context;
};
