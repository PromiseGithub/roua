/**
 * Integration tests against a REAL PostgreSQL server (run in CI for several
 * major versions). Covers what PGlite cannot: password (SCRAM) login as the
 * new account, apply -> verify as that account, connection limits, revocation
 * of open sessions.
 *
 *   ROUA_TEST_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:pg
 */
import pg from "pg";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { main } from "../src/index.js";
import { urlForUser } from "../src/db.js";

const ADMIN = process.env.ROUA_TEST_ADMIN_URL;
const PASSWORD = "IntegrationTestPassword0123456789";
const ACCOUNT = "roua_agent_ci";

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s), confirm: async () => true, color: false } };
};

async function sql(url: string, text: string) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return (await c.query(text)).rows;
  } finally {
    await c.end();
  }
}

async function errorCode(client: pg.Client, text: string) {
  try {
    await client.query(text);
    return null;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

describe.skipIf(!ADMIN)("real PostgreSQL", () => {
  const admin = ADMIN!;
  let file: string;

  beforeAll(async () => {
    await sql(admin, `
      DROP SCHEMA IF EXISTS roua_ci CASCADE;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ACCOUNT}') THEN
          EXECUTE 'DROP OWNED BY ${ACCOUNT}'; EXECUTE 'DROP ROLE ${ACCOUNT}';
        END IF;
      END $$;
      CREATE SCHEMA roua_ci;
      CREATE TABLE roua_ci.products (id serial PRIMARY KEY, name text);
      CREATE TABLE roua_ci.users (id serial PRIMARY KEY, email text, password_hash text);
      CREATE TABLE roua_ci.salaries (id serial PRIMARY KEY, amount numeric);
      INSERT INTO roua_ci.products (name) VALUES ('a'), ('b');
      INSERT INTO roua_ci.users (email, password_hash) VALUES ('ada@example.com', 'x');
    `);
    const db = new URL(admin).pathname.slice(1) || "postgres";
    const dir = mkdtempSync(join(tmpdir(), "roua-pg-"));
    file = join(dir, "roua.yaml");
    writeFileSync(
      file,
      `roua_version: "0.1"
account:
  name: ${ACCOUNT}
  profile: agent
  level: L2
  owner: ci@example.com
  approved_by: ci-approver@example.com
  purpose: "CI integration test"
  expires_at: "${new Date(Date.now() + 7 * 86_400_000).toISOString()}"
  level_role: roua_l2_ci
  limits: { max_connections: 2, statement_timeout_s: 10 }
target:
  engine: postgresql
  database: ${db}
  schemas: [roua_ci]
scope:
  exclude: ["roua_ci.salaries"]
hardening:
  revoke_public_schema_create: true   # PostgreSQL 13/14 let PUBLIC create in schema public
auth:
  password_env: ROUA_CI_PASSWORD
`,
    );
    process.env.ADMIN_DATABASE_URL = admin;
    process.env.ROUA_CI_PASSWORD = PASSWORD;
  });

  afterAll(async () => {
    await sql(admin, `DROP SCHEMA IF EXISTS roua_ci CASCADE`).catch(() => {});
  });

  it("apply creates the account, logs in with SCRAM and verifies as it (I1)", async () => {
    const t = io();
    const code = await main(["apply", "-f", file, "--yes"], t.io);
    expect(t.err.join("\n")).not.toContain("Could not log in");
    expect(code, t.out.join("\n") + t.err.join("\n")).toBe(0);
    expect(t.out.join("\n")).toContain("READ-ONLY");
    expect(t.out.join("\n")).toMatch(/PASS\s+P2/);
  });

  it("as the account: reads allowed data, cannot write or read excluded data (I2-I7)", async () => {
    const c = new pg.Client({ connectionString: urlForUser(admin, ACCOUNT, PASSWORD) });
    await c.connect();
    try {
      expect((await c.query("SELECT count(*)::int AS n FROM roua_ci.products")).rows[0].n).toBe(2);
      expect(await errorCode(c, "SELECT * FROM roua_ci.salaries")).toBe("42501");
      expect(await errorCode(c, "SELECT password_hash FROM roua_ci.users")).toBe("42501");
      await c.query("BEGIN");
      await c.query("SET LOCAL transaction_read_only = off");
      expect(await errorCode(c, "INSERT INTO roua_ci.products (name) VALUES ('x')")).toBe("42501");
      await c.query("ROLLBACK");
      await c.query("BEGIN");
      await c.query("SET LOCAL transaction_read_only = off");
      expect(await errorCode(c, "CREATE TABLE roua_ci.evil (x int)")).toBe("42501");
      await c.query("ROLLBACK");
    } finally {
      await c.end();
    }
  });

  it("enforces the connection limit (I10)", async () => {
    const url = urlForUser(admin, ACCOUNT, PASSWORD);
    const clients = [new pg.Client({ connectionString: url }), new pg.Client({ connectionString: url })];
    await Promise.all(clients.map((c) => c.connect()));
    const third = new pg.Client({ connectionString: url });
    await expect(third.connect()).rejects.toThrow(/too many connections/);
    await Promise.all(clients.map((c) => c.end()));
  });

  it("re-apply is idempotent (I13)", async () => {
    const t = io();
    expect(await main(["apply", "-f", file, "--yes"], t.io)).toBe(0);
  });

  it("revoke ends open sessions and blocks login (I12)", async () => {
    const url = urlForUser(admin, ACCOUNT, PASSWORD);
    const open = new pg.Client({ connectionString: url });
    open.on("error", () => {});
    await open.connect();
    const t = io();
    expect(await main(["revoke", ACCOUNT], t.io)).toBe(0);
    await expect(open.query("SELECT 1")).rejects.toThrow();
    await expect(new pg.Client({ connectionString: url }).connect()).rejects.toThrow(/not permitted to log in/);
  });

  it("expire --due revokes an expired account (I11)", async () => {
    await sql(admin, `ALTER ROLE ${ACCOUNT} LOGIN; COMMENT ON ROLE ${ACCOUNT} IS 'ROUA/0.1 profile=agent level=L2 owner=ci@example.com expires=2020-01-01T00:00:00Z purpose="x"'`);
    const t = io();
    await main(["expire", "--due"], t.io);
    expect(t.out.join()).toContain(`revoked ${ACCOUNT}`);
    await expect(new pg.Client({ connectionString: urlForUser(admin, ACCOUNT, PASSWORD) }).connect()).rejects.toThrow();
  });
});
