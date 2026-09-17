'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onIdTokenChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { initializePwaDatabase } from '@/lib/pwa/db';

interface BootstrapContextProps {
  user: User | null;
  role: 'admin' | 'field' | 'public' | null;
  isReady: boolean;
}

const BootstrapContext = createContext<BootstrapContextProps>({ user: null, role: null, isReady: true });

export const RoleBootstrapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'field' | 'public' | null>(null);
  const [isReady, setIsReady] = useState(true);

  useEffect(() => {
    if (!auth) {
      setIsReady(true);
      return;
    }

    try {
      initializePwaDatabase().catch(() => {});
    } catch {}

    const unsubscribe = onIdTokenChanged(auth, async (currentUser) => {
      try {
        if (!currentUser) {
          setUser(null);
          setRole('public');
          setIsReady(true);
          return;
        }

        const tokenResult = await currentUser.getIdTokenResult();
        const userRole = (tokenResult?.claims?.role as 'admin' | 'field') || 'public';

        setUser(currentUser);
        setRole(userRole);
        setIsReady(true);
      } catch (error) {
        console.warn('[Role Bootstrap] Non-fatal auth token check:', error);
        setIsReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <BootstrapContext.Provider value={{ user, role, isReady }}>
      {children}
    </BootstrapContext.Provider>
  );
};

export const useBootstrap = () => useContext(BootstrapContext);

