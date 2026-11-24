import type { AuditReport, Severity } from "./postgres/audit.js";

const LABEL: Record<Severity, string> = { pass: "PASS", info: "INFO", warn: "WARN", fail: "FAIL", error: "ERR " };

export interface FormatOptions {
  color?: boolean;
  /** Show details for passing checks too. */
  verbose?: boolean;
}

/** Human-readable report for terminals. */
export function formatReport(report: AuditReport, opts: FormatOptions = {}): string {
  const c = (code: number, s: string) => (opts.color ? `\u001b[${code}m${s}\u001b[0m` : s);
  const paint: Record<Severity, (s: string) => string> = {
    pass: (s) => c(32, s),
    info: (s) => c(36, s),
    warn: (s) => c(33, s),
    fail: (s) => c(31, s),
    error: (s) => c(35, s),
  };
  const lines: string[] = [];
  const ver = report.server_version_num ? ` (PostgreSQL ${Math.floor(report.server_version_num / 10000)})` : "";
  lines.push(`ROUA audit: role ${report.role}${ver}`, "");
  for (const r of report.results) {
    lines.push(`${paint[r.severity](LABEL[r.severity])}  ${r.id.padEnd(3)} ${r.title}`);
    if (r.severity !== "pass" || opts.verbose) for (const d of r.details) lines.push(`           ${d}`);
    if (r.fix && (r.severity === "fail" || r.severity === "warn")) lines.push(`           fix: ${r.fix}`);
  }
  const s = report.summary;
  lines.push("");
  const verdict = report.ok
    ? paint.pass(s.warn ? "READ-ONLY, with warnings" : "READ-ONLY")
    : paint.fail("NOT READ-ONLY (or not safe to hand over)");
  lines.push(`${verdict}   ${s.fail} fail, ${s.warn} warn, ${s.pass} pass, ${s.info} info${s.error ? `, ${s.error} error` : ""}`);
  return lines.join("\n");
}
