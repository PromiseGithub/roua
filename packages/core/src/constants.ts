/**
 * ROUA (Read-Only User Account): constants shared by the planner, the auditor,
 * the CLI and the web generator.
 *
 * The term "ROUA" was coined by Promise Okoroji.
 */

export const ROUA_SPEC_VERSION = "0.1";
export const ROUA_METADATA_PREFIX = `ROUA/${ROUA_SPEC_VERSION}`;

export const PROFILES = [
  "agent",
  "demo",
  "review",
  "audit",
  "support",
  "training",
  "analytics",
  "custom",
] as const;
export type Profile = (typeof PROFILES)[number];

export const LEVELS = ["L0", "L1", "L2", "L3", "L4", "L5"] as const;
export type Level = (typeof LEVELS)[number];

export interface ProfileInfo {
  title: string;
  description: string;
  defaultLevel: Level;
  defaultExpiryDays: number;
  maxExpiryDays: number;
}

export const PROFILE_INFO: Record<Profile, ProfileInfo> = {
  agent: {
    title: "AI agent",
    description: "An AI agent or assistant that needs to learn or query a system safely.",
    defaultLevel: "L2",
    defaultExpiryDays: 90,
    maxExpiryDays: 90,
  },
  demo: {
    title: "Demo",
    description: "Sales, marketing or product demos. Use synthetic data, never real customers.",
    defaultLevel: "L1",
    defaultExpiryDays: 30,
    maxExpiryDays: 30,
  },
  review: {
    title: "App review",
    description: "App store or marketplace reviewers who must exercise every feature.",
    defaultLevel: "L1",
    defaultExpiryDays: 30,
    maxExpiryDays: 45,
  },
  audit: {
    title: "Auditor",
    description: "Internal or external auditors.",
    defaultLevel: "L4",
    defaultExpiryDays: 30,
    maxExpiryDays: 30,
  },
  support: {
    title: "Support",
    description: "Vendor or internal support sessions.",
    defaultLevel: "L4",
    defaultExpiryDays: 7,
    maxExpiryDays: 7,
  },
  training: {
    title: "Training",
    description: "Onboarding and workshops, on synthetic or anonymized copies.",
    defaultLevel: "L2",
    defaultExpiryDays: 14,
    maxExpiryDays: 14,
  },
  analytics: {
    title: "Analytics",
    description: "BI tools and analytics agents reading aggregates.",
    defaultLevel: "L3",
    defaultExpiryDays: 180,
    maxExpiryDays: 180,
  },
  custom: {
    title: "Custom",
    description: "Organization-defined purpose.",
    defaultLevel: "L2",
    defaultExpiryDays: 30,
    maxExpiryDays: 365,
  },
};

export interface LevelInfo {
  name: string;
  canRead: string;
  defaultRole: string;
}

export const LEVEL_INFO: Record<Level, LevelInfo> = {
  L0: { name: "Metadata", canRead: "Structure only: schemas, tables, columns, types. No rows.", defaultRole: "roua_l0_meta" },
  L1: { name: "Public", canRead: "Only objects you list as public (catalogs, reference tables).", defaultRole: "roua_l1_public" },
  L2: { name: "Operational", canRead: "Business tables minus your deny-list and all secret columns.", defaultRole: "roua_l2_ops" },
  L3: { name: "Analytical", canRead: "Only aggregate views you list. No base tables.", defaultRole: "roua_l3_analytics" },
  L4: { name: "Masked", canRead: "All in-scope tables through generated masked views. No base tables.", defaultRole: "roua_l4_masked" },
  L5: { name: "Full (break-glass)", canRead: "All in-scope data unmasked, still never secrets. Max 24 hours, two approvers.", defaultRole: "roua_l5_full" },
};

/** L5 accounts may live at most this long. */
export const L5_MAX_HOURS = 24;

/**
 * Best-effort secret-column detector.
 *
 * Applied to the column name after converting camelCase to snake_case and
 * lowercasing. False positives fail safe (the column is hidden; add it to
 * `scope.columns_allow` to expose it). Misses are possible, which is why
 * `scope.columns_deny` exists and is part of the standard.
 *
 * The same POSIX-compatible regex is used in JavaScript and in PostgreSQL.
 */
export const SECRET_COLUMN_REGEX =
  "(^|_)(pwd|pin|mfa|otp|totp|hotp|salt|cvv|cvv2|cvc|pan|passphrase|apikey|privatekey|seed|nonce|otpauth)(_|$)" +
  "|password|passwd|secret|token|credential" +
  "|api_?key|private_?key|encryption_?key|session_?key|access_?key|signing_?key|master_?key|secret_?key" +
  "|card_?number|card_?num|webhook_?sig|signature_?key|recovery_?codes?|backup_?codes?|pass_?hash|hashed_?pass";

/** Convert a column name the same way the SQL side does, then test it. */
export function isSecretColumnName(name: string): boolean {
  const snake = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return new RegExp(SECRET_COLUMN_REGEX).test(snake);
}

export const MASK_FUNCTIONS = ["email", "partial_last4", "redact", "hash", "year_only", "initials"] as const;
export type MaskFunction = (typeof MASK_FUNCTIONS)[number];

/** Account names: lowercase, start with a letter, 3 to 63 characters. */
export const ACCOUNT_NAME_RE = /^[a-z][a-z0-9_]{2,62}$/;

/** Other identifiers we generate SQL for (schemas, tables, columns, roles). */
export const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;
