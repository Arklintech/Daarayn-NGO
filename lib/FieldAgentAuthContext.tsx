'use client';

import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { FieldAgent } from "./db-field-ops";
import { clearAuthCookies } from "./authCookies";

interface FieldAgentAuthContextType {
  user: User | null;
  agentData: FieldAgent | null;
  /** Why a signed-in account was refused field access, if it was. */
  agentError: string | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const FieldAgentAuthContext = createContext<FieldAgentAuthContextType>({
  user: null,
  agentData: null,
  agentError: null,
  loading: true,
  logout: async () => {},
});

export function FieldAgentAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [agentData, setAgentData] = useState<FieldAgent | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      console.warn("Auth module not initialized. FieldAgentAuthContext falling back.");
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setUser(firebaseUser);

      if (!firebaseUser) {
        setAgentData(null);
        setAgentError(null);
        setLoading(false);
        return;
      }

      // The server resolves the profile from the verified token and rejects inactive agents.
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch("/api/field/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setAgentData(data as FieldAgent);
          setAgentError(null);
        } else {
          setAgentData(null);
          setAgentError(data.error || "No active field agent profile is linked to this account.");
        }
      } catch (err) {
        console.error("Error fetching agent profile from API:", err);
        setAgentData(null);
        setAgentError("Could not load your agent profile. Check your connection and try again.");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    clearAuthCookies();
    if (auth) {
      await signOut(auth);
    }
    setUser(null);
    setAgentData(null);
    setAgentError(null);
    setLoading(false);
  };

  return (
    <FieldAgentAuthContext.Provider value={{ user, agentData, agentError, loading, logout }}>
      {children}
    </FieldAgentAuthContext.Provider>
  );
}

export const useFieldAgentAuth = () => useContext(FieldAgentAuthContext);
