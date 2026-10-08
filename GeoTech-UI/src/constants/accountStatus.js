// Account + invitation + assignment lifecycles (mirror backend rbac.py).
// Import from here — never scatter raw status strings in components.

export const ACCOUNT_STATUS = {
  INVITED: "INVITED",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  DEACTIVATED: "DEACTIVATED",
};

export const INVITATION_STATUS = {
  PENDING: "PENDING",
  SENT: "SENT",
  ACCEPTED: "ACCEPTED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
};

export const ASSIGNMENT_STATUS = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  REMOVED: "REMOVED",
};

export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "CONSULTANT",
  "TEMPORARY",
];

export const PROFICIENCIES = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"];

export const SUPERVISOR_SPECIALIZATIONS = [
  "SOIL_INVESTIGATION",
  "ROCK_INVESTIGATION",
  "BOREHOLE_DRILLING",
  "CORE_DRILLING",
  "SPT",
  "SAMPLING",
  "SITE_SUPERVISION",
  "QUALITY_CONTROL",
  "SAFETY",
];
