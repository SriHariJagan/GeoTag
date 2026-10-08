export const ROLES = {
  SUPERADMIN: "SUPERADMIN",
  ADMIN: "ADMIN",
  SUPERVISOR: "SUPERVISOR",
  VENDOR: "VENDOR",
  // Read-only oversight: full admin views + audit logs, no actions.
  MONITOR: "MONITOR",
};

export const VALID_ROLES = Object.values(ROLES);

// LAB_ANALYST was offered by the old UserForm but has no routes, guards,
// or backend support. It is intentionally NOT listed here (future use only).
