export type Role = "super_admin" | "finance_admin" | "field_supervisor" | "field_agent" | "donor";

export type Permission = 
  | "donations:read" 
  | "donations:write" 
  | "donations:verify"
  | "field_ops:read" 
  | "field_ops:write" 
  | "field_ops:approve"
  | "users:manage" 
  | "ledger:export"
  | "settings:manage";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [
    "donations:read", "donations:write", "donations:verify",
    "field_ops:read", "field_ops:write", "field_ops:approve",
    "users:manage", "ledger:export", "settings:manage"
  ],
  finance_admin: [
    "donations:read", "donations:write", "donations:verify",
    "ledger:export"
  ],
  field_supervisor: [
    "field_ops:read", "field_ops:write", "field_ops:approve"
  ],
  field_agent: [
    "field_ops:read", "field_ops:write"
  ],
  donor: [
    "donations:read"
  ]
};

export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

export function validateRolePermissions(role: Role, requiredPermissions: Permission[]): boolean {
  return requiredPermissions.every(perm => hasPermission(role, perm));
}
