'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getAuth, onIdTokenChanged, User } from 'firebase/auth';
import { usePathname, useRouter } from 'next/navigation';
import { initializePwaDatabase } from '@/lib/pwa/db';
import { auth } from '@/lib/firebase';

interface BootstrapContextProps {
  user: User | null;
  role: 'admin' | 'field' | 'public' | null;
  isReady: boolean;
}

const BootstrapContext = createContext<BootstrapContextProps>({ user: null, role: null, isReady: false });

export const RoleBootstrapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'field' | 'public' | null>(null);
  const [isReady, setIsReady] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Sole unified observer for auth validation and claims propagation
    const unsubscribe = onIdTokenChanged(auth, async (currentUser) => {
      setIsReady(false);

      if (!currentUser) {
        setUser(null);
        setRole('public');
        
        // Guard protected admin & field sub-apps
        if ((pathname.startsWith('/admin') && pathname !== '/admin/login') || 
            (pathname.startsWith('/agent') && pathname !== '/agent/login')) {
          router.replace(pathname.startsWith('/admin') ? '/admin/login' : '/agent/login');
        } else {
          setIsReady(true);
        }
        return;
      }

      try {
        // Force cryptographic refresh of claims token on transition
        const tokenResult = await currentUser.getIdTokenResult(true);
        // Note: In our current firebase setup, custom claims might not be populated immediately for dev mode.
        // We will default to public, but if they are an admin or agent we infer from their login flow later in the specific contexts. 
        // For the enterprise structure, we read claims:
        const userRole = (tokenResult.claims.role as 'admin' | 'field') || 'public';

        // 1. Authoritative Route Gate checks
        // Since we are transitioning, we will temporarily allow the route if claims aren't fully set up to prevent breaking local dev,
        // but strictly enforcing it is the goal.
        if (pathname.startsWith('/admin') && userRole !== 'admin' && pathname !== '/admin/login') {
          // If they aren't admin, let the inner AuthContext handle the rejection for now to preserve backwards compatibility.
          // In a pure prod env with claims, we would `router.replace('/unauthorized')` here.
        }

        if (pathname.startsWith('/agent') && userRole !== 'field' && userRole !== 'admin' && pathname !== '/agent/login') {
          // Same here, let FieldAgentAuthContext handle it for now.
        }

        // 2. Client-side isolated store initializations
        await initializePwaDatabase();

        setUser(currentUser);
        setRole(userRole);
        setIsReady(true);

      } catch (error) {
        console.error('[Role Bootstrap Engine] Initialization failure:', error);
        // Fallback for dev mode where network might block
        setIsReady(true);
      }
    });

    return () => unsubscribe();
  }, [pathname, router]);

  if (!isReady) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#0A0B0D]">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-[#00B4D8] border-t-transparent" />
          <p className="mt-6 text-xs font-mono tracking-widest text-gray-400 uppercase">BOOTSTRAPPING DAARAYN OS ENGINE...</p>
        </div>
      </div>
    );
  }

  return (
    <BootstrapContext.Provider value={{ user, role, isReady }}>
      {children}
    </BootstrapContext.Provider>
  );
};

export const useBootstrap = () => useContext(BootstrapContext);
