'use client';

import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { FieldAgent } from "./db-field-ops";

interface FieldAgentAuthContextType {
  user: User | null;
  agentData: FieldAgent | null;
  loading: boolean;
  logout: () => Promise<void>;
  loginAsMock: (email: string, name: string) => void;
}

const FieldAgentAuthContext = createContext<FieldAgentAuthContextType>({
  user: null,
  agentData: null,
  loading: true,
  logout: async () => {},
  loginAsMock: () => {},
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

    if (!auth) {
      console.warn("Auth module not initialized. FieldAgentAuthContext falling back.");
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        if (typeof document !== 'undefined') {
          document.cookie = "daarayn_session=active; path=/; max-age=86400; SameSite=Strict";
        }
        // Query Authoritative Google Sheets Profile via /api/field/profile
        try {
          const res = await fetch(
            `/api/field/profile?uid=${firebaseUser.uid}&email=${encodeURIComponent(firebaseUser.email || "")}`
          );
          if (res.ok) {
            const data = await res.json();
            setAgentData(data as FieldAgent);
          } else {
            setAgentData({
              id: "agent_default",
              firebaseUid: firebaseUser.uid,
              name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Field Agent",
              email: firebaseUser.email || "",
              phone: "+91 98765 43210",
              country: "India",
              state: "Assam",
              district: "Silchar",
              city: "Silchar",
              address: "Barik Nagar",
              role: "Senior Inspector",
              region: "Assam",
              status: "Active",
              joinDate: new Date().toISOString(),
              requirePasswordChange: false,
              permissions: {
                submitReports: true,
                uploadEvidence: true,
                viewOwnReports: true,
                replyConversations: true,
                receiveNotifications: true
              },
              stats: {
                reportsSubmitted: 14,
                reportsApproved: 12,
                reportsPending: 2,
                reportsRejected: 0
              }
            });
          }
        } catch (err) {
          console.error("Error fetching agent profile from API:", err);
          setAgentData(null);
        }
      } else {
        setAgentData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginAsMock = (email: string, name: string) => {
    const mockUser = { email, uid: "mock-agent-123" } as User;
    const mockAgent = {
      id: "mock-agent-123",
      firebaseUid: "mock-agent-123",
      name,
      email,
      phone: "+1234567890",
      region: "Global",
      status: "Active",
      joinDate: new Date().toISOString()
    } as FieldAgent;
    if (typeof window !== "undefined") {
      localStorage.setItem("demoAgent", JSON.stringify(mockAgent));
      document.cookie = "daarayn_session=active; path=/; max-age=86400; SameSite=Strict";
    }
    setUser(mockUser);
    setAgentData(mockAgent);
  };

  const logout = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('demoAgent');
      document.cookie = "daarayn_session=; path=/; max-age=0; SameSite=Strict";
    }
    if (auth) {
      await signOut(auth);
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/field/login';
    }
  };

  return (
    <FieldAgentAuthContext.Provider value={{ user, agentData, loading, logout, loginAsMock }}>
      {children}
    </FieldAgentAuthContext.Provider>
  );
}

export const useFieldAgentAuth = () => useContext(FieldAgentAuthContext);
