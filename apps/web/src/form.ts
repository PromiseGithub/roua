/**
 * Pure mapping from the generator form to a roua.yaml config object.
 * Kept separate from the DOM so it can be unit-tested.
 */
import type { Level, MaskFunction, Profile, RouaConfig } from "@roua-dev/core";

export interface FormValues {
  name: string;
  profile: Profile;
  level: Level;
  owner: string;
  purpose: string;
  approvedBy: string;
  approvalRef: string;
  expiresDate: string; // yyyy-mm-dd
  expiresTime?: string; // HH:MM, used for L5
  maxConnections: string;
  statementTimeout: string;
  allowedSources: string;
  database: string;
  schemas: string;
  objectOwner: string;
  include: string;
  exclude: string;
  publicObjects: string;
  analyticsViews: string;
  columnsDeny: string;
  columnsAllow: string;
  mask: string; // lines "schema.table.column: fn"
  revokeTemp: boolean;
  revokePublicCreate: boolean;
  plaintext: boolean;
}

export const splitList = (s: string): string[] =>
  s
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export function parseMask(text: string): { mask: Record<string, MaskFunction>; errors: string[] } {
  const mask: Record<string, MaskFunction> = {};
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const l = line.trim();
    if (!l || l.startsWith("#")) return;
    const m = /^([^:\s]+)\s*:\s*(\S+)$/.exec(l);
    if (!m) errors.push(`Mask line ${i + 1}: use "schema.table.column: function"`);
    else mask[m[1]!] = m[2] as MaskFunction;
  });
  return { mask, errors };
}

export function formToConfig(v: FormValues): { config: RouaConfig; errors: string[] } {
  const errors: string[] = [];
  const approvers = splitList(v.approvedBy);
  const time = v.level === "L5" && v.expiresTime ? v.expiresTime : "00:00";
  const expires = v.expiresDate ? `${v.expiresDate}T${time}:00Z` : "";
  const { mask, errors: maskErrors } = parseMask(v.mask);
  errors.push(...maskErrors);

  const limits: Record<string, number> = {};
  if (v.maxConnections.trim()) limits.max_connections = Number(v.maxConnections);
  if (v.statementTimeout.trim()) limits.statement_timeout_s = Number(v.statementTimeout);

  const scope: NonNullable<RouaConfig["scope"]> = {};
  const set = <K extends keyof typeof scope>(k: K, val: (typeof scope)[K]) => {
    if (Array.isArray(val) ? val.length : val && Object.keys(val).length) scope[k] = val;
  };
  set("include", splitList(v.include));
  set("exclude", splitList(v.exclude));
  set("public_objects", splitList(v.publicObjects));
  set("analytics_views", splitList(v.analyticsViews));
  set("columns_deny", splitList(v.columnsDeny));
  set("columns_allow", splitList(v.columnsAllow));
  set("mask", mask);

  const config: RouaConfig = {
    roua_version: "0.1",
    account: {
      name: v.name.trim(),
      profile: v.profile,
      level: v.level,
      owner: v.owner.trim(),
      purpose: v.purpose.trim(),
      ...(approvers.length ? { approved_by: approvers.length === 1 ? approvers[0]! : approvers } : {}),
      ...(v.approvalRef.trim() ? { approval_ref: v.approvalRef.trim() } : {}),
      expires_at: expires,
      ...(Object.keys(limits).length ? { limits } : {}),
      ...(splitList(v.allowedSources).length ? { network: { allowed_sources: splitList(v.allowedSources) } } : {}),
    },
    target: {
      engine: "postgresql",
      database: v.database.trim(),
      schemas: splitList(v.schemas),
      ...(v.objectOwner.trim() ? { object_owner: v.objectOwner.trim() } : {}),
    },
    ...(Object.keys(scope).length ? { scope } : {}),
    ...(v.revokeTemp || v.revokePublicCreate
      ? { hardening: { ...(v.revokeTemp ? { revoke_temp_from_public: true } : {}), ...(v.revokePublicCreate ? { revoke_public_schema_create: true } : {}) } }
      : {}),
    auth: { method: v.plaintext ? "password" : "scram_verifier" },
  };
  return { config, errors };
}
