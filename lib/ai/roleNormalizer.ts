/**
 * lib/ai/roleNormalizer.ts
 *
 * Single source of truth for mapping UI / Firebase admin roles
 * to KHIDR AI-TOS RBAC roles.
 */

import type { KhidrRole } from "./knowledge/permissionEngine";
import type { UserRole } from "./permissions";

const UI_ROLE_MAP: Record<string, KhidrRole> = {
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
 * into a canonical KHIDR RBAC role.
 */
export function normalizeKhidrRole(role?: string | null): KhidrRole {
  if (!role) return "public";

  const normalized = role.toLowerCase().trim().replace(/\s+/g, "_");

  if (UI_ROLE_MAP[normalized]) {
    return UI_ROLE_MAP[normalized];
  }

  // Already a valid KhidrRole
  const valid: KhidrRole[] = ["super_admin", "editor", "inspector", "public"];
  if (valid.includes(normalized as KhidrRole)) {
    return normalized as KhidrRole;
  }

  return "public";
}

/**
 * Normalizes to the broader UserRole set used by BusinessRulesEngine.
 */
export function normalizeUserRole(role?: string | null): UserRole {
  const khidr = normalizeKhidrRole(role);
  if (khidr === "super_admin" || khidr === "editor" || khidr === "inspector" || khidr === "public") {
    return khidr;
  }
  return "public";
}
