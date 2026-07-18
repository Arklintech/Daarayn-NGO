'use client';

import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

export type AdminRole = 
  | "Super Admin" 
  | "Admin" 
  | "Editor" 
  | "Content Manager" 
  | "Finance Manager" 
  | "Volunteer Manager";

export interface AdminUserData {
  uid: string;
  email: string;
  name: string;
  role: AdminRole;
  status: "active" | "inactive";
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  adminData: AdminUserData | null;
  loading: boolean;
  role: AdminRole | null;
  logout: () => Promise<void>;
  hasPermission: (requiredRoles: AdminRole[]) => boolean;
  loginAsMock: (email: string, name: string, role: AdminRole) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  adminData: null,
  loading: true,
  role: null,
  logout: async () => {},
  hasPermission: () => false,
  loginAsMock: () => {},
});

export function AuthContextProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [adminData, setAdminData] = useState<AdminUserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local mock storage first
    if (typeof window !== "undefined") {
      const cachedMock = localStorage.getItem("daarayn_mock_auth");
      if (cachedMock) {
        try {
          const parsed = JSON.parse(cachedMock);
          setUser({ email: parsed.email, uid: "mock-uid-123" } as User);
          setAdminData({
            uid: "mock-uid-123",
            email: parsed.email,
            name: parsed.name,
            role: parsed.role,
            status: "active",
          });
          setLoading(false);
          return;
        } catch (e) {
          localStorage.removeItem("daarayn_mock_auth");
        }
      }
    }

    if (!auth) {
      console.warn("Auth module not initialized. Falling back to unauthenticated state.");
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        if (typeof document !== 'undefined') {
          document.cookie = "daarayn_session=active; path=/; max-age=86400; SameSite=Strict";
        }
        try {
          const userDocRef = doc(db, "users", currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            setAdminData(userDoc.data() as AdminUserData);
          } else {
            // Auto-create a default Super Admin for the first user if none exists
            // This is useful for initial setup
            const defaultRole: AdminRole = "Super Admin";
            const initialData: AdminUserData = {
              uid: currentUser.uid,
              email: currentUser.email || "",
              name: currentUser.displayName || currentUser.email?.split("@")[0] || "Administrator",
              role: defaultRole,
              status: "active",
              createdAt: new Date().toISOString(),
            };
            await setDoc(userDocRef, initialData);
            setAdminData(initialData);
          }
        } catch (error) {
          console.error("Error loading admin role profile:", error);
          setAdminData(null);
        }
      } else {
        setAdminData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginAsMock = (email: string, name: string, role: AdminRole) => {
    const mockUser = { email, uid: "mock-uid-123" } as User;
    const mockData: AdminUserData = {
      uid: "mock-uid-123",
      email,
      name,
      role,
      status: "active"
    };
    if (typeof window !== "undefined") {
      localStorage.setItem("daarayn_mock_auth", JSON.stringify({ email, name, role }));
      document.cookie = "daarayn_session=active; path=/; max-age=86400; SameSite=Strict";
    }
    setUser(mockUser);
    setAdminData(mockData);
  };

  const logout = async () => {
    setLoading(true);
    if (typeof window !== "undefined") {
      localStorage.removeItem("daarayn_mock_auth");
      document.cookie = "daarayn_session=; path=/; max-age=0; SameSite=Strict";
    }
    if (auth) {
      await signOut(auth);
    }
    setUser(null);
    setAdminData(null);
    setLoading(false);
  };

  const hasPermission = (requiredRoles: AdminRole[]): boolean => {
    if (!adminData) return false;
    if (adminData.role === "Super Admin") return true; // Super Admin bypasses all checks
    return requiredRoles.includes(adminData.role);
  };

  const role = adminData ? adminData.role : null;

  return (
    <AuthContext.Provider value={{ user, adminData, loading, role, logout, hasPermission, loginAsMock }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
