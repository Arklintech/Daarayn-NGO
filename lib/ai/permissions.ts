/**
 * lib/ai/permissions.ts
 *
 * Role-Based Access Control (RBAC) rules for Daarayn AI-TOS.
 */

import { normalizeUserRole } from "./roleNormalizer";

export type UserRole = "super_admin" | "editor" | "inspector" | "finance" | "compliance" | "public";

export interface PermissionRule {
  canReadLedger: boolean;
  canReadDonors: boolean;
  canGenerateDrafts: boolean;
  canExecuteActions: boolean;
  allowedCollections: string[];
}

export const ROLE_PERMISSIONS: Record<UserRole, PermissionRule> = {
  super_admin: {
    canReadLedger: true,
    canReadDonors: true,
    canGenerateDrafts: true,
    canExecuteActions: true,
    allowedCollections: ["donors", "donations", "allocations", "programs", "communications", "settings", "publicLedger"],
  },
  editor: {
    canReadLedger: true,
    canReadDonors: true,
    canGenerateDrafts: true,
    canExecuteActions: false, // Propose only, Super Admin approves execution
    allowedCollections: ["donors", "donations", "allocations", "programs", "communications", "publicLedger"],
  },
  inspector: {
    canReadLedger: true,
    canReadDonors: false,
    canGenerateDrafts: false,
    canExecuteActions: false,
    allowedCollections: ["programs", "publicLedger"],
  },
  finance: {
    canReadLedger: true,
    canReadDonors: true,
    canGenerateDrafts: false,
    canExecuteActions: false,
    allowedCollections: ["donors", "donations", "allocations", "programs", "publicLedger", "executive"],
  },
  compliance: {
    canReadLedger: true,
    canReadDonors: false,
    canGenerateDrafts: false,
    canExecuteActions: false,
    allowedCollections: ["donations", "allocations", "programs", "publicLedger", "settings", "executive"],
  },
  public: {
    canReadLedger: true,
    canReadDonors: false,
    canGenerateDrafts: false,
    canExecuteActions: false,
    allowedCollections: ["publicLedger", "programs"], // Programs holds public case details
  },
};

/**
 * Validates if the user role can access specific collection/document
 */
export function checkPermission(
  role: string,
  collectionName: string,
  action: "read" | "write"
): boolean {
  const normalizedRole = normalizeUserRole(role);
  const config = ROLE_PERMISSIONS[normalizedRole] || ROLE_PERMISSIONS.public;

  if (action === "read") {
    return config.allowedCollections.includes(collectionName);
  }

  if (action === "write") {
    return normalizedRole === "super_admin"; // Only super_admin executes direct backend operations
  }

  return false;
}
