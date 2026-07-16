'use client';

import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { FieldAgent } from "./db-field-ops";

interface FieldAgentAuthContextType {
  user: User | null;
  agentData: FieldAgent | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const FieldAgentAuthContext = createContext<FieldAgentAuthContextType>({
  user: null,
  agentData: null,
  loading: true,
  logout: async () => {},
});

export function FieldAgentAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [agentData, setAgentData] = useState<FieldAgent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // --- DEMO BYPASS ---
    const demoAgentStr = typeof window !== 'undefined' ? localStorage.getItem('demoAgent') : null;
    if (demoAgentStr) {
      try {
        const agent = JSON.parse(demoAgentStr);
        // Mock a Firebase User object
        setUser({ uid: agent.firebaseUid || 'demo-uid', email: agent.email } as User);
        setAgentData(agent);
        setLoading(false);
        return () => {}; // No-op unsubscribe
      } catch (e) {
        console.error("Failed to parse demo agent", e);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Query Firestore to find the agent with this firebaseUid
        try {
          const q = query(collection(db, "field_agents"), where("firebaseUid", "==", firebaseUser.uid));
          const snap = await getDocs(q);
          if (!snap.empty) {
            setAgentData(snap.docs[0].data() as FieldAgent);
          } else {
            setAgentData(null);
          }
        } catch (err) {
          console.error("Error fetching agent data", err);
          setAgentData(null);
        }
      } else {
        setAgentData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('demoAgent');
    }
    await signOut(auth);
    if (typeof window !== 'undefined') {
      window.location.href = '/agent/login';
    }
  };

  return (
    <FieldAgentAuthContext.Provider value={{ user, agentData, loading, logout }}>
      {children}
    </FieldAgentAuthContext.Provider>
  );
}

export const useFieldAgentAuth = () => useContext(FieldAgentAuthContext);
