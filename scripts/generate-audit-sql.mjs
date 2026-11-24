// Writes audit.sql: the catalog checks as a plain psql script.
// Usage of the output: psql "$ADMIN_DATABASE_URL" -v role=readonly -f audit.sql
import { writeFileSync } from "node:fs";
import { renderAuditSql } from "../packages/core/dist/index.js";

const MARK = "roua_role_placeholder";
let sql = renderAuditSql(MARK).replaceAll(`'${MARK}'`, ":'role'").replaceAll(MARK, "<role>");
sql = sql.replace(
  /^-- ROUA\/0\.1 audit for role <role>\n/,
  "-- ROUA/0.1 audit (generated from packages/core; do not edit by hand)\n" +
    "-- Usage: psql \"$ADMIN_DATABASE_URL\" -v role=readonly -f audit.sql\n",
);
writeFileSync(new URL("../audit.sql", import.meta.url), sql);
console.log("wrote audit.sql");
