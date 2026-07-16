/**
 * lib/ai/knowledge/permissionEngine.ts
 *
 * Role-Based Access Control (RBAC) Engine for Daarayn AI-TOS.
 * Restricts query executions and database retrievals by administrator user roles.
 */

import type { MominDepartment } from "./router";
import { normalizeMominRole } from "../roleNormalizer";

export type MominRole = "super_admin" | "editor" | "inspector" | "public";

export interface PermissionCheck {
  isAuthorized: boolean;
  errorText?: string;
  allowedCollections: string[];
}

/**
 * Validates role-based permission sets for target specialists departments
 * and returns the allowed collections filter.
 */
export function checkRBAC(role: MominRole | string, department: MominDepartment): PermissionCheck {
  role = normalizeMominRole(role);

  // 1. Define allowed collections mapped to role definitions
  const publicCollections = ["publicLedger", "programs", "settings"];
  const inspectorCollections = [...publicCollections, "allocations"];
  const editorCollections = [...inspectorCollections, "donors", "donations", "communications"];
  const superAdminCollections = [...editorCollections];

  // 2. Validate department access limits
  switch (role) {
    case "super_admin":
      return { isAuthorized: true, allowedCollections: superAdminCollections };

    case "editor":
      if (department === "administration") {
        return {
          isAuthorized: false,
          errorText: "Access Denied: Configuration administration is restricted to Super Admin role permissions only.",
          allowedCollections: []
        };
      }
      return { isAuthorized: true, allowedCollections: editorCollections };

    case "inspector":
      // Inspectors check compliance/progress but cannot view private financial records (donations details, donor profiles, communications drafts logs)
      const restrictedInspectorDepts: MominDepartment[] = ["donation", "donor", "communication", "administration"];
      if (restrictedInspectorDepts.includes(department)) {
        return {
          isAuthorized: false,
          errorText: `Access Denied: Your Inspector role does not permit access to the ${department} specialist intelligence department.`,
          allowedCollections: []
        };
      }
      return { isAuthorized: true, allowedCollections: inspectorCollections };

    case "public":
    default:
      // Public guest is restricted to public ledger totals and published programs
      const allowedPublicDepts: MominDepartment[] = ["global", "knowledge"];
      if (!allowedPublicDepts.includes(department)) {
        return {
          isAuthorized: false,
          errorText: "Access Denied: Restricted access to public resources only. Sign-in required for administrative intelligence specialists.",
          allowedCollections: []
        };
      }
      return { isAuthorized: true, allowedCollections: publicCollections };
  }
}
