/**
 * Verification, run while CONNECTED AS the account being verified:
 *   1. the full catalog audit for current_user, plus
 *   2. live probes that attempt writes and DDL and expect PostgreSQL to refuse.
 *
 * Probe safety: every probe runs inside a transaction that is always rolled
 * back, and write probes are written so they touch zero rows
 * (UPDATE ... WHERE false, DELETE ... WHERE false, INSERT ... SELECT ... WHERE false).
 * They first switch the transaction to read-write, to prove the refusal comes
 * from privileges and not from the bypassable read-only default.
 * Statement-level triggers could still fire on a role that CAN write; they are
 * rolled back too, but run verify against a staging copy if that worries you.
 */

import { MASKED_SCHEMA_PREFIX } from "./plan.js";
import { auditRole, type AuditReport, type CheckResult, type Executor } from "./audit.js";
import { globToRegex, quoteIdent } from "../escape.js";
import type { RouaConfig } from "../config.js";

export interface VerifyOptions {
  now?: Date;
  /** Expected configuration: enables scope checks (V5) and masking checks (V7). */
  config?: RouaConfig;
  /** How many readable tables get live write probes. */
  maxProbeTables?: number;
}

const INSUFFICIENT_PRIVILEGE = "42501";

function randomSuffix(): string {
  const b = new Uint8Array(6);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Run `sql` inside BEGIN ... ROLLBACK with read-write switched on. Returns the error code, or null on success. */
async function probe(exec: Executor, sql: string): Promise<{ ok: boolean; code: string | null; message: string | null }> {
  await exec("BEGIN");
  try {
    await exec("SET LOCAL transaction_read_only = off");
    await exec(sql);
    return { ok: true, code: null, message: null };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { ok: false, code: err.code ?? null, message: err.message ?? String(e) };
  } finally {
    await exec("ROLLBACK");
  }
}

const SYS = "n.nspname NOT IN ('pg_catalog', 'information_schema') AND left(n.nspname, 3) <> 'pg_'";

export async function verifyCurrentUser(exec: Executor, options: VerifyOptions = {}): Promise<AuditReport> {
  const who = await exec("SELECT current_user AS u");
  const role = String(who[0]?.u);
  const report = await auditRole(exec, role, {
    now: options.now,
    allowColumns: options.config?.scope?.columns_allow,
  });
  const results: CheckResult[] = [...report.results];
  const tag = randomSuffix();

  // ---- P1: DDL in every schema the account can see
  const schemas = await exec(
    `SELECT n.nspname FROM pg_namespace n WHERE ${SYS} AND has_schema_privilege(n.oid, 'USAGE') ORDER BY 1 LIMIT 20`,
  );
  const ddlLeaks: string[] = [];
  for (const s of schemas) {
    const name = String(s.nspname);
    let target: string;
    try {
      target = `${quoteIdent(name)}.${quoteIdent(`roua_probe_${tag}`)}`;
    } catch {
      continue; // unusual schema names are covered by the catalog check S1
    }
    const r = await probe(exec, `CREATE TABLE ${target} (x int)`);
    if (r.ok || r.code !== INSUFFICIENT_PRIVILEGE) ddlLeaks.push(`${name}: ${r.ok ? "CREATE TABLE succeeded" : `unexpected error ${r.code}: ${r.message}`}`);
  }
  results.push(
    ddlLeaks.length
      ? { id: "P1", title: "Probe: CREATE TABLE is refused", severity: "fail", details: ddlLeaks }
      : { id: "P1", title: "Probe: CREATE TABLE is refused", severity: "pass", details: [`Refused in ${schemas.length} schema(s), even with transaction_read_only = off.`] },
  );

  // ---- P2: writes on readable tables (zero-row statements)
  const tables = await exec(
    `SELECT n.nspname, c.relname, c.relkind::text AS relkind,
            (SELECT a.attname FROM pg_attribute a
             WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
               AND has_column_privilege(c.oid, a.attnum, 'SELECT')
             ORDER BY a.attnum LIMIT 1) AS col
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p', 'v', 'f') AND ${SYS}
       AND has_any_column_privilege(c.oid, 'SELECT')
     ORDER BY 1, 2 LIMIT ${Math.max(1, options.maxProbeTables ?? 25)}`,
  );
  const writeLeaks: string[] = [];
  let probed = 0;
  for (const t of tables) {
    if (!t.col) continue;
    let rel: string, col: string;
    try {
      rel = `${quoteIdent(String(t.nspname))}.${quoteIdent(String(t.relname))}`;
      col = quoteIdent(String(t.col));
    } catch {
      continue;
    }
    probed++;
    const stmts = [
      [`UPDATE`, `UPDATE ${rel} SET ${col} = ${col} WHERE false`],
      [`DELETE`, `DELETE FROM ${rel} WHERE false`],
      [`INSERT`, `INSERT INTO ${rel} (${col}) SELECT ${col} FROM ${rel} WHERE false`],
    ] as const;
    for (const [verb, sql] of stmts) {
      const r = await probe(exec, sql);
      if (r.ok) writeLeaks.push(`${t.nspname}.${t.relname}: ${verb} was allowed`);
    }
  }
  results.push(
    writeLeaks.length
      ? { id: "P2", title: "Probe: INSERT/UPDATE/DELETE are refused", severity: "fail", details: writeLeaks }
      : {
          id: "P2",
          title: "Probe: INSERT/UPDATE/DELETE are refused",
          severity: "pass",
          details: [probed ? `Refused on ${probed} readable table(s), even with transaction_read_only = off.` : "No readable tables to probe."],
        },
  );

  // ---- P3: residual side effects PostgreSQL cannot block with privileges
  const temp = await probe(exec, `CREATE TEMP TABLE ${quoteIdent(`roua_probe_${tag}`)} (x int)`);
  const lo = await probe(exec, "SELECT lo_create(0)");
  const notify = await probe(exec, `NOTIFY ${quoteIdent(`roua_probe_${tag}`)}`);
  const residual: string[] = [];
  if (temp.ok) residual.push("Can create TEMP tables (session-local; see check D1 for the fix).");
  if (lo.ok) residual.push("Can create large objects (see check F2 for the fix).");
  if (notify.ok) {
    residual.push(
      "Can send NOTIFY. PostgreSQL has no privilege to stop this: if any application LISTENs and acts on notifications, a ROUA can trigger it. Validate the sender in listeners.",
    );
  }
  results.push(
    residual.length
      ? { id: "P3", title: "Probe: residual side effects", severity: "warn", details: residual }
      : { id: "P3", title: "Probe: residual side effects", severity: "pass", details: [] },
  );

  // ---- V5 / V7: compare what is readable with the configuration
  const cfg = options.config;
  if (cfg) {
    results.push(await scopeCheck(exec, cfg));
    if (cfg.account.level === "L4" && cfg.scope?.mask && Object.keys(cfg.scope.mask).length) {
      results.push(await maskCheck(exec, cfg));
    }
    if (cfg.account.name !== role) {
      results.push({ id: "V1", title: "Connected as the configured account", severity: "fail", details: [`Connected as ${role}, but the config is for ${cfg.account.name}.`] });
    }
  }

  const summary = { pass: 0, info: 0, warn: 0, fail: 0, error: 0 };
  for (const r of results) summary[r.severity]++;
  return { ...report, results, summary, ok: summary.fail === 0 && summary.error === 0 };
}

async function scopeCheck(exec: Executor, cfg: RouaConfig): Promise<CheckResult> {
  const rows = await exec(
    `SELECT n.nspname || '.' || c.relname AS obj, c.relkind::text AS relkind
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND ${SYS}
       AND has_any_column_privilege(c.oid, 'SELECT')
     ORDER BY 1`,
  );
  const readable = rows.map((r) => String(r.obj));
  const s = cfg.scope ?? {};
  const matches = (obj: string, patterns: string[] = []) => patterns.some((p) => new RegExp(globToRegex(p)).test(obj));
  const level = cfg.account.level;
  let bad: string[] = [];
  switch (level) {
    case "L0":
      bad = readable;
      break;
    case "L1":
      bad = readable.filter((o) => !matches(o, s.public_objects) || matches(o, s.exclude));
      break;
    case "L3":
      bad = readable.filter((o) => !matches(o, s.analytics_views) || matches(o, s.exclude));
      break;
    case "L4":
      bad = readable.filter((o) => !o.startsWith(MASKED_SCHEMA_PREFIX));
      break;
    default: {
      const include = s.include?.length ? s.include : cfg.target.schemas.map((x) => `${x}.*`);
      bad = readable.filter((o) => !matches(o, include) || matches(o, s.exclude));
    }
  }
  const title = `Readable objects match level ${level} and scope`;
  if (bad.length) return { id: "V5", title, severity: "fail", details: ["Readable but outside the configured scope:", ...bad.slice(0, 25)] };
  return { id: "V5", title, severity: "pass", details: [`${readable.length} readable object(s), all in scope.`] };
}

const MASK_TESTS: Record<string, (v: string) => boolean> = {
  email: (v) => v.includes("***"),
  partial_last4: (v) => v.startsWith("***") && v.length <= 7,
  redact: () => false, // any non-null value is a leak
  hash: (v) => /^[0-9a-f]{64}$/.test(v),
  year_only: (v) => /-01-01/.test(v),
  initials: (v) => /^(\S\.\s*)+$/.test(v),
};

async function maskCheck(exec: Executor, cfg: RouaConfig): Promise<CheckResult> {
  const leaks: string[] = [];
  let sampled = 0;
  for (const [ref, fn] of Object.entries(cfg.scope?.mask ?? {})) {
    const [schema, table, column] = ref.split(".") as [string, string, string];
    const view = `${quoteIdent(`${MASKED_SCHEMA_PREFIX}${schema}`)}.${quoteIdent(table)}`;
    let rows: Record<string, unknown>[];
    try {
      rows = await exec(`SELECT ${quoteIdent(column)}::text AS v FROM ${view} WHERE ${quoteIdent(column)} IS NOT NULL LIMIT 5`);
    } catch (e) {
      const err = e as { code?: string };
      if (err.code === "42703" || err.code === "42P01") continue; // column hidden or table not in scope
      leaks.push(`${ref}: could not sample (${(e as Error).message})`);
      continue;
    }
    for (const r of rows) {
      sampled++;
      const v = String(r.v);
      if (!MASK_TESTS[fn]!(v)) leaks.push(`${ref} (${fn}): a sampled value does not look masked`);
    }
  }
  const title = "Masked columns return masked values";
  if (leaks.length) return { id: "V7", title, severity: "fail", details: leaks };
  return { id: "V7", title, severity: "pass", details: [`${sampled} sampled value(s) masked as configured.`] };
}
