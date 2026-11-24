#!/usr/bin/env node
// Turns `roua audit --json` output into a GitHub job summary (Markdown) and
// workflow annotations. Used by action.yml. No dependencies.
import { readFileSync } from "node:fs";

const raw = JSON.parse(readFileSync(process.argv[2], "utf8"));
const reports = Array.isArray(raw) ? raw : [raw];
const icon = { pass: "✅", info: "ℹ️", warn: "⚠️", fail: "❌", error: "💥" };
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
const annotate = (level, title, msg) => process.stderr.write(`::${level} title=${title.replace(/[,:\n]/g, " ")}::${msg.replace(/\r?\n/g, " ")}\n`);

const out = ["## ROUA audit", ""];
const bad = reports.filter((r) => !r.ok);
out.push(bad.length ? `**${bad.length} of ${reports.length} role(s) are not read-only:** ${bad.map((r) => `\`${r.role}\``).join(", ")}` : `**All ${reports.length} role(s) are read-only.**`, "");
for (const r of reports) {
  const s = r.summary;
  out.push(`### \`${r.role}\` ${r.ok ? "✅ read-only" : "❌ not read-only"}`, "", `${s.fail} fail, ${s.warn} warn, ${s.pass} pass, ${s.info} info`, "");
  out.push("| | Check | Details | Fix |", "|---|---|---|---|");
  const order = { fail: 0, error: 1, warn: 2, info: 3, pass: 4 };
  for (const c of [...r.results].sort((a, b) => order[a.severity] - order[b.severity])) {
    out.push(`| ${icon[c.severity]} | **${c.id}** ${cell(c.title)} | ${cell(c.details.slice(0, 5).join("\n"))} | ${c.severity === "pass" ? "" : cell(c.fix ?? "")} |`);
    if (c.severity === "fail" || c.severity === "error") annotate("error", `ROUA ${r.role} ${c.id}`, `${c.title}: ${c.details.slice(0, 3).join("; ")}`);
    else if (c.severity === "warn") annotate("warning", `ROUA ${r.role} ${c.id}`, `${c.title}: ${c.details.slice(0, 3).join("; ")}`);
  }
  out.push("");
}
out.push("<sub>ROUA (Read-Only User Account) · https://kaizam.com</sub>");
process.stdout.write(out.join("\n") + "\n");
