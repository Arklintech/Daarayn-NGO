/**
 * lib/ai/roleNormalizer.ts
 *
 * Single source of truth for mapping UI / Firebase admin roles
 * to KHIZR AI-TOS RBAC roles.
 */

import type { KhizrRole } from "./knowledge/permissionEngine";
import type { UserRole } from "./permissions";

const UI_ROLE_MAP: Record<string, KhizrRole> = {
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
 * into a canonical KHIZR RBAC role.
 */
export function normalizeKhizrRole(role?: string | null): KhizrRole {
  if (!role) return "public";

  const normalized = role.toLowerCase().trim().replace(/\s+/g, "_");

  if (UI_ROLE_MAP[normalized]) {
    return UI_ROLE_MAP[normalized];
  }

  // Already a valid KhizrRole
  const valid: KhizrRole[] = ["super_admin", "editor", "inspector", "public"];
  if (valid.includes(normalized as KhizrRole)) {
    return normalized as KhizrRole;
  }

  return "public";
}

/**
 * Normalizes to the broader UserRole set used by BusinessRulesEngine.
 */
export function normalizeUserRole(role?: string | null): UserRole {
  const khizr = normalizeKhizrRole(role);
  if (khizr === "super_admin" || khizr === "editor" || khizr === "inspector" || khizr === "public") {
    return khizr;
  }
  return "public";
}
