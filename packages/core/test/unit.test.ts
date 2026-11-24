import { createHash, createHmac, pbkdf2Sync } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import {
  generatePassword,
  globToRegex,
  isSecretColumnName,
  parseMetadata,
  buildMetadata,
  planPostgres,
  quoteIdent,
  quoteLiteral,
  scramSha256Verifier,
  validateConfig,
  type RouaConfig,
} from "@roua/core";

const NOW = new Date("2026-11-23T12:00:00Z");

const base = () => ({
  roua_version: "0.1",
  account: {
    name: "roua_agent_docs",
    profile: "agent",
    level: "L2",
    owner: "owner@example.com",
    approved_by: "cto@example.com",
    purpose: "Docs assistant",
    expires_at: "2027-01-31T00:00:00Z",
  },
  target: { engine: "postgresql", database: "appdb", schemas: ["public"] },
});

describe("escaping", () => {
  it("quotes identifiers and rejects anything unusual", () => {
    expect(quoteIdent("users")).toBe('"users"');
    for (const bad of ['a"b', "a;b", "a b", "", "1abc", "a-b", "x".repeat(64), "a\u0000"]) {
      expect(() => quoteIdent(bad), bad).toThrow();
    }
  });

  it("escapes literals", () => {
    expect(quoteLiteral("it's")).toBe("'it''s'");
    expect(quoteLiteral("a\\b")).toBe("E'a\\\\b'");
    expect(() => quoteLiteral("a\u0000b")).toThrow();
  });

  it("round-trips hostile strings through a real PostgreSQL parser", async () => {
    const db = await PGlite.create();
    const nasty = [
      "'; DROP TABLE x; --",
      "\\'; SELECT 1; --",
      "$roua$ $$ $tag$",
      "/* comment */ -- line",
      "unicode: é 漢字 🦄",
      "back\\slash\\\\double",
      "quote''double",
      "\n\r\t",
    ];
    // Newer PostgreSQL versions refuse standard_conforming_strings = off; test it where it exists.
    const modes = ["on"];
    try {
      await db.exec("SET standard_conforming_strings = off");
      modes.push("off");
    } catch {
      /* not supported by this server */
    }
    for (const s of nasty) {
      for (const scs of modes) {
        await db.exec(`SET standard_conforming_strings = ${scs}`);
        const rows = (await db.query<{ v: string }>(`SELECT ${quoteLiteral(s)} AS v`)).rows;
        expect(rows[0]!.v, `${s} with scs=${scs}`).toBe(s);
      }
    }
    await db.close();
  });

  it("turns scope globs into anchored regexes", () => {
    expect(globToRegex("public.*")).toBe("^public\\.[^.]*$");
    expect(new RegExp(globToRegex("sales.order_*")).test("sales.order_items")).toBe(true);
    expect(new RegExp(globToRegex("sales.order_*")).test("sales.orders")).toBe(false);
    expect(() => globToRegex("public")).toThrow();
    expect(() => globToRegex("public.a;b")).toThrow();
  });
});

describe("secret column detector", () => {
  it.each([
    "password", "password_hash", "passwd", "pwd", "api_key", "apiKey", "secret", "client_secret", "access_token",
    "refreshToken", "mfa_secret", "totp_seed", "otp", "salt", "private_key", "encryption_key", "pin", "cvv",
    "card_number", "webhook_signing_key", "recovery_codes", "credential_json",
  ])("flags %s", (name) => expect(isSecretColumnName(name)).toBe(true));

  it.each(["email", "name", "created_at", "pinned", "spin_count", "salted_at", "description", "keyboard_layout", "company"])(
    "does not flag %s",
    (name) => expect(isSecretColumnName(name)).toBe(false),
  );
});

describe("passwords and SCRAM", () => {
  it("generates strong alphanumeric passwords", () => {
    const p = generatePassword();
    expect(p).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(new Set(Array.from({ length: 50 }, () => generatePassword())).size).toBe(50);
  });

  it("matches an independent SCRAM-SHA-256 implementation (RFC 7677)", async () => {
    const salt = Buffer.from("0123456789abcdef");
    const password = "pencil";
    const v = await scramSha256Verifier(password, { salt, iterations: 4096 });
    const salted = pbkdf2Sync(password, salt, 4096, 32, "sha256");
    const clientKey = createHmac("sha256", salted).update("Client Key").digest();
    const storedKey = createHash("sha256").update(clientKey).digest("base64");
    const serverKey = createHmac("sha256", salted).update("Server Key").digest("base64");
    expect(v).toBe(`SCRAM-SHA-256$4096:${salt.toString("base64")}$${storedKey}:${serverKey}`);
  });

  it("pure-JS fallback gives the same verifier as WebCrypto", async () => {
    const salt = Buffer.from("fedcba9876543210");
    for (const pw of ["pencil", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6", "x".repeat(100)]) {
      expect(await scramSha256Verifier(pw, { salt, forceFallback: true })).toBe(await scramSha256Verifier(pw, { salt }));
    }
  });

  it("refuses non-ASCII passwords (no SASLprep)", async () => {
    await expect(scramSha256Verifier("pässword")).rejects.toThrow();
  });
});

describe("config validation", () => {
  it("accepts a good config", () => {
    const r = validateConfig(base(), { now: NOW });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("rejects unknown keys, bad names and missing expiry", () => {
    const c: any = base();
    c.account.name = "Bad-Name";
    c.account.surprise = 1;
    delete c.account.expires_at;
    const r = validateConfig(c, { now: NOW });
    expect(r.errors.join("\n")).toMatch(/account.name/);
    expect(r.errors.join("\n")).toMatch(/Unknown key account.surprise/);
    expect(r.errors.join("\n")).toMatch(/expires_at/);
  });

  it("enforces profile maximum expiry", () => {
    const c: any = base();
    c.account.expires_at = "2027-12-31T00:00:00Z";
    expect(validateConfig(c, { now: NOW }).errors.join()).toMatch(/90 days/);
  });

  it("requires two approvers and at most 24 hours for L5", () => {
    const c: any = base();
    c.account.level = "L5";
    const r = validateConfig(c, { now: NOW });
    expect(r.errors.join("\n")).toMatch(/two distinct approvers/);
    expect(r.errors.join("\n")).toMatch(/24 hours/);
    c.account.approved_by = ["a@example.com", "b@example.com"];
    c.account.expires_at = "2026-11-24T06:00:00Z";
    expect(validateConfig(c, { now: NOW }).ok).toBe(true);
  });

  it("rejects malicious values that would reach SQL", () => {
    const c: any = base();
    c.target.schemas = ['public"; DROP TABLE x; --'];
    c.account.owner = "x' OR 1=1";
    const r = validateConfig(c, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("planner", () => {
  const cfg = () => validateConfig(base(), { now: NOW }).config as RouaConfig;

  it("is deterministic (web generator == CLI, I14)", () => {
    const a = planPostgres(cfg(), { now: NOW, secret: { kind: "placeholder" } });
    const b = planPostgres(cfg(), { now: NOW, secret: { kind: "placeholder" } });
    expect(a.setupSql).toBe(b.setupSql);
  });

  it("never uses pg_read_all_data or default privileges", () => {
    const p = planPostgres(cfg(), { now: NOW, secret: { kind: "placeholder" } });
    expect(p.setupSql).not.toMatch(/pg_read_all_data/);
    expect(p.setupSql).not.toMatch(/ALTER DEFAULT PRIVILEGES/);
    expect(p.setupSql).toMatch(/^BEGIN;$/m);
    expect(p.setupSql).toMatch(/^COMMIT;$/m);
  });

  it("puts only the verifier in the script, and warns on plaintext", async () => {
    const v = await scramSha256Verifier("abcdefghijklmnopqrstuvwxyz123456");
    const p = planPostgres(cfg(), { now: NOW, secret: { kind: "scram", verifier: v } });
    expect(p.setupSql).toContain(v);
    expect(p.setupSql).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    const plain = planPostgres(cfg(), { now: NOW, secret: { kind: "password", password: "pw" } });
    expect(plain.warnings.join()).toMatch(/plaintext/);
  });

  it("writes parseable metadata", () => {
    const m = parseMetadata(buildMetadata(cfg(), NOW));
    expect(m?.fields).toMatchObject({ profile: "agent", level: "L2", owner: "owner@example.com", purpose: "Docs assistant" });
  });
});
