/**
 * CLI tests over the real PostgreSQL wire protocol (PGlite socket server).
 * PGlite has a single session, so logging in as a *different* user (apply ->
 * verify) is covered by postgres.pg.test.ts against a real server in CI.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { main } from "../src/index.js";

let db: PGlite;
let server: PGLiteSocketServer;
const PORT = 54329 + Math.floor(Math.random() * 500);

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s), confirm: async () => true, color: false },
  };
}

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`
    CREATE TABLE public.products (id serial PRIMARY KEY, name text);
    CREATE TABLE public.users (id serial PRIMARY KEY, email text, password_hash text);
    CREATE ROLE readonly LOGIN PASSWORD 'readonly';
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
    GRANT INSERT ON public.products TO readonly;
  `);
  server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1" });
  await server.start();
  process.env.ADMIN_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
});

afterAll(async () => {
  await server?.stop();
  await db?.close();
});

describe("roua CLI", () => {
  it("prints help", async () => {
    const t = io();
    expect(await main(["--help"], t.io)).toBe(0);
    expect(t.out.join()).toContain("Is your read-only user actually read-only?");
  });

  it("audit: exits 1 and explains why for a careless readonly user", async () => {
    const t = io();
    expect(await main(["audit", "--role", "readonly"], t.io)).toBe(1);
    const text = t.out.join("\n");
    expect(text).toMatch(/FAIL\s+T1/);
    expect(text).toContain("public.products: INSERT");
    expect(text).toMatch(/FAIL\s+X1/);
    expect(text).toContain("public.users.password_hash");
    expect(text).toMatch(/FAIL\s+R2/);
    expect(text).toContain("NOT READ-ONLY");
  });

  it("audit --json produces a machine-readable report", async () => {
    const t = io();
    await main(["audit", "--role", "readonly", "--json"], t.io);
    const report = JSON.parse(t.out.join(""));
    expect(report.role).toBe("readonly");
    expect(report.ok).toBe(false);
    expect(report.summary.fail).toBeGreaterThan(0);
  });

  it("refuses connection strings on the command line and missing env vars", async () => {
    const t = io();
    expect(await main(["audit", "--role", "x", "--url-env", "NOPE_NOT_SET"], t.io)).toBe(2);
    expect(t.err.join()).toContain("Set NOPE_NOT_SET");
  });

  it("init -> plan -> apply SQL -> audit passes -> list -> expire -> revoke", async () => {
    const dir = mkdtempSync(join(tmpdir(), "roua-cli-"));
    const file = join(dir, "roua.yaml");
    let t = io();
    expect(await main(["init", "-f", file, "--profile", "agent", "--name", "roua_agent_cli", "--database", "postgres"], t.io)).toBe(0);
    // Adapt the starter file to this database.
    writeFileSync(file, readFileSync(file, "utf8").replace("object_owner: app_owner", "object_owner: postgres").replace(/scope:\n(  .*\n)+/, "scope:\n  exclude: []\n"));

    t = io();
    expect(await main(["plan", "-f", file, "--out", dir], t.io)).toBe(0);
    const setup = readFileSync(join(dir, "setup.sql"), "utf8");
    expect(setup).toContain('CREATE ROLE "roua_agent_cli" NOLOGIN');
    await db.exec(setup);

    t = io();
    expect(await main(["audit", "--role", "roua_agent_cli"], t.io)).toBe(0);
    expect(t.out.join("\n")).toContain("READ-ONLY");

    t = io();
    await main(["list"], t.io);
    expect(t.out.join("\n")).toMatch(/roua_agent_cli\s+agent\s+L2/);

    // Pretend the account expired.
    await db.exec(
      `COMMENT ON ROLE roua_agent_cli IS 'ROUA/0.1 profile=agent level=L2 owner=a@example.com expires=2020-01-01T00:00:00Z purpose="old"'; ALTER ROLE roua_agent_cli LOGIN;`,
    );
    t = io();
    await main(["expire", "--due", "--dry-run"], t.io);
    expect(t.out.join()).toContain("would revoke roua_agent_cli");
    t = io();
    await main(["expire", "--due"], t.io);
    expect(t.out.join()).toContain("revoked roua_agent_cli");
    expect((await db.query<{ rolcanlogin: boolean }>("SELECT rolcanlogin FROM pg_roles WHERE rolname = 'roua_agent_cli'")).rows[0]!.rolcanlogin).toBe(false);

    t = io();
    expect(await main(["revoke", "roua_agent_cli", "--drop", "--yes"], t.io)).toBe(0);
    expect((await db.query("SELECT 1 FROM pg_roles WHERE rolname = 'roua_agent_cli'")).rows).toHaveLength(0);
  });

  it("rejects an invalid config with a clear message", async () => {
    const dir = mkdtempSync(join(tmpdir(), "roua-cli-"));
    const file = join(dir, "roua.yaml");
    writeFileSync(file, 'roua_version: "0.1"\naccount: { name: "Bad Name" }\n');
    const t = io();
    expect(await main(["plan", "-f", file], t.io)).toBe(2);
    expect(t.err.join()).toContain("account.name");
  });
});
