/**
 * The ROUA metadata string, stored as the role's COMMENT so any tool (or
 * person) can tell what an account is for, who owns it and when it expires.
 *
 *   ROUA/0.1 profile=agent level=L2 owner=jane@example.com approved_by=cto@example.com
 *     approval_ref=TICKET-123 created=2026-11-23 expires=2027-02-21T00:00:00.000Z purpose="Docs agent"
 */

import { ROUA_METADATA_PREFIX } from "./constants.js";
import { approversOf, type RouaConfig } from "./config.js";

export interface RouaMetadata {
  version: string;
  fields: Record<string, string>;
}

export function buildMetadata(cfg: RouaConfig, now: Date): string {
  const a = cfg.account;
  const parts = [
    ROUA_METADATA_PREFIX,
    `profile=${a.profile}`,
    `level=${a.level}`,
    `owner=${a.owner}`,
  ];
  const approvers = approversOf(cfg);
  if (approvers.length) parts.push(`approved_by=${approvers.join(",")}`);
  if (a.approval_ref) parts.push(`approval_ref=${a.approval_ref}`);
  parts.push(`created=${now.toISOString().slice(0, 10)}`);
  parts.push(`expires=${new Date(a.expires_at).toISOString()}`);
  parts.push(`purpose="${a.purpose.replace(/["\\]/g, "'").replace(/\s+/g, " ").trim()}"`);
  return parts.join(" ");
}

/** Parse a ROUA comment. Returns null if the string is not ROUA metadata. */
export function parseMetadata(comment: string | null | undefined): RouaMetadata | null {
  if (!comment) return null;
  const m = /^ROUA\/(\d+\.\d+)\s*(.*)$/s.exec(comment.trim());
  if (!m) return null;
  const fields: Record<string, string> = {};
  const re = /([a-z_]+)=("([^"]*)"|\S+)/g;
  let f: RegExpExecArray | null;
  while ((f = re.exec(m[2] ?? ""))) fields[f[1]!] = f[3] ?? f[2]!;
  return { version: m[1]!, fields };
}
