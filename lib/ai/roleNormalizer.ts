/**
 * lib/ai/roleNormalizer.ts
 *
 * Single source of truth for mapping UI / Firebase admin roles
 * to MOMIN AI-TOS RBAC roles.
 */

import type { MominRole } from "./knowledge/permissionEngine";
import type { UserRole } from "./permissions";

const UI_ROLE_MAP: Record<string, MominRole> = {
  super_admin: "super_admin",
  superadmin: "super_admin",
  admin: "editor",
  editor: "editor",
  content_manager: "editor",
  finance_manager: "editor",
  volunteer_manager: "editor",
  inspector: "inspector",
  public: "public",
};

/**
 * Normalizes any role string from the UI, API body, or Firebase
 * into a canonical MOMIN RBAC role.
 */
export function normalizeMominRole(role?: string | null): MominRole {
  if (!role) return "public";

  const normalized = role.toLowerCase().trim().replace(/\s+/g, "_");

  if (UI_ROLE_MAP[normalized]) {
    return UI_ROLE_MAP[normalized];
  }

  // Already a valid MominRole
  const valid: MominRole[] = ["super_admin", "editor", "inspector", "public"];
  if (valid.includes(normalized as MominRole)) {
    return normalized as MominRole;
  }

  return "public";
}

/**
 * Normalizes to the broader UserRole set used by BusinessRulesEngine.
 */
export function normalizeUserRole(role?: string | null): UserRole {
  const momin = normalizeMominRole(role);
  if (momin === "super_admin" || momin === "editor" || momin === "inspector" || momin === "public") {
    return momin;
  }
  return "public";
}
