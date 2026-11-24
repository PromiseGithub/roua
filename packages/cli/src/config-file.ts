import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { validateConfig, type RouaConfig } from "@roua/core";
import { UsageError } from "./db.js";

export function loadConfig(path: string, now = new Date()): { config: RouaConfig; warnings: string[] } {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new UsageError(`Cannot read ${path}. Create one with: roua init`);
  }
  let data: unknown;
  try {
    data = parse(text, { schema: "core", uniqueKeys: true });
  } catch (e) {
    throw new UsageError(`${path} is not valid YAML: ${(e as Error).message}`);
  }
  // YAML may parse unquoted timestamps as Date objects; the spec wants strings.
  const acct = (data as { account?: { expires_at?: unknown } })?.account;
  if (acct && acct.expires_at instanceof Date) acct.expires_at = acct.expires_at.toISOString();
  const v = validateConfig(data, { now });
  if (!v.ok) throw new UsageError(`${path} is invalid:\n  - ${v.errors.join("\n  - ")}`);
  return { config: v.config!, warnings: v.warnings };
}
