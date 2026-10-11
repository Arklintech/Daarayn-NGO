'use client';

import React, { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { auth } from "./firebase";
import { onIdTokenChanged, signOut, User } from "firebase/auth";
import { clearAuthCookies, writeAuthCookies } from "./authCookies";

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
  /** Why the signed-in account was refused admin access, if it was. */
  adminError: string | null;
  loading: boolean;
  role: AdminRole | null;
  logout: () => Promise<void>;
  hasPermission: (requiredRoles: AdminRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  adminData: null,
  adminError: null,
  loading: true,
  role: null,
  logout: async () => {},
  hasPermission: () => false,
});

export function AuthContextProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin") ?? false;

  const [user, setUser] = useState<User | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const [adminData, setAdminData] = useState<AdminUserData | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminCheckedFor, setAdminCheckedFor] = useState<string | null>(null);

  // Keep the session cookie in step with Firebase's ID token (refreshed hourly).
  useEffect(() => {
    if (!auth) {
      console.warn("Auth module not initialized. Falling back to unauthenticated state.");
      setTokenReady(true);
      return;
    }

    const unsubscribe = onIdTokenChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          writeAuthCookies(await currentUser.getIdToken());
        } catch (err) {
          console.error("[Auth] Could not read ID token:", err);
        }
      } else {
        clearAuthCookies();
        setAdminData(null);
        setAdminError(null);
        setAdminCheckedFor(null);
      }
      setUser(currentUser);
      setTokenReady(true);
    });

    return () => unsubscribe();
  }, []);

  // Admin access is decided by the server (ADMIN_EMAILS), only on admin routes.
  useEffect(() => {
    if (!isAdminRoute || !user || adminCheckedFor === user.uid) return;
    let cancelled = false;

    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/admin/session", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (res.ok && data.success) {
          setAdminData({
            uid: user.uid,
            email: data.admin.email,
            name: user.displayName || data.admin.email.split("@")[0] || "Administrator",
            role: "Super Admin",
            status: "active",
          });
          setAdminError(null);
        } else {
          setAdminData(null);
          setAdminError(data.error || "This account is not authorized for the admin panel.");
        }
      } catch {
        if (cancelled) return;
        setAdminData(null);
        setAdminError("Could not verify administrator access. Check your connection and try again.");
      }
      if (!cancelled) setAdminCheckedFor(user.uid);
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdminRoute, user, adminCheckedFor]);

  const loading = !tokenReady || (isAdminRoute && !!user && adminCheckedFor !== user.uid);

  const logout = async () => {
    clearAuthCookies();
    if (auth) {
      await signOut(auth);
    }
    setUser(null);
    setAdminData(null);
    setAdminError(null);
    setAdminCheckedFor(null);
  };

  const hasPermission = (requiredRoles: AdminRole[]): boolean => {
    if (!adminData) return false;
    if (adminData.role === "Super Admin") return true; // Super Admin bypasses all checks
    return requiredRoles.includes(adminData.role);
  };

  const role = adminData ? adminData.role : null;

  return (
    <AuthContext.Provider value={{ user, adminData, adminError, loading, role, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
