import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";
import { planPostgres, validateConfig, configToYaml } from "@roua-dev/core";
import { parse } from "yaml";
import { formToConfig, type FormValues } from "../src/form.js";

const NOW = new Date("2026-11-23T12:00:00Z");
const form: FormValues = {
  name: "roua_agent_docs", profile: "agent", level: "L2", owner: "you@example.com", purpose: "Docs agent",
  approvedBy: "cto@example.com", approvalRef: "T-1", expiresDate: "2027-01-31", maxConnections: "5", statementTimeout: "30",
  allowedSources: "10.0.0.0/24", database: "appdb", schemas: "public, sales", objectOwner: "app_owner", include: "",
  exclude: "public.salaries public.api_keys", publicObjects: "", analyticsViews: "", columnsDeny: "public.users.national_id",
  columnsAllow: "", mask: "", revokeTemp: true, revokePublicCreate: false, plaintext: false,
};

describe("web generator", () => {
  it("form -> config is valid, and its roua.yaml gives the CLI the same plan (I14)", () => {
    const { config, errors } = formToConfig(form);
    expect(errors).toEqual([]);
    const v = validateConfig(config, { now: NOW });
    expect(v.errors).toEqual([]);
    const fromWeb = planPostgres(v.config!, { now: NOW, secret: { kind: "placeholder" } });
    // Round-trip through the YAML the page offers for download, as the CLI would read it.
    const reread = validateConfig(parse(configToYaml(v.config!)), { now: NOW });
    expect(reread.errors).toEqual([]);
    const fromCli = planPostgres(reread.config!, { now: NOW, secret: { kind: "placeholder" } });
    expect(fromCli.setupSql).toBe(fromWeb.setupSql);
  });

  it("parses mask lines and reports bad ones", () => {
    const { config, errors } = formToConfig({ ...form, level: "L4", profile: "audit", mask: "public.users.email: email\nnonsense" });
    expect(config.scope?.mask).toEqual({ "public.users.email": "email" });
    expect(errors[0]).toMatch(/Mask line 2/);
  });

  describe("built page (I15)", () => {
    const dist = fileURLToPath(new URL("../dist/index.html", import.meta.url));
    beforeAll(() => {
      if (!existsSync(dist)) execFileSync(process.execPath, [fileURLToPath(new URL("../build.mjs", import.meta.url))]);
    });

    it("is one file with a CSP that forbids all network access and unhashed code", () => {
      const html = readFileSync(dist, "utf8");
      const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "";
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("connect-src 'none'");
      expect(csp).toContain("form-action 'none'");
      expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
      expect(csp).not.toContain("unsafe");
      expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|<img[^>]+src=["']?https?:/i);
      // Outbound links are fine (they load nothing); only these two hosts are linked.
      const hosts = new Set([...html.matchAll(/href="https?:\/\/([^/"]+)/g)].map((m) => m[1]));
      expect([...hosts].sort()).toEqual(["github.com", "www.npmjs.com"]);
    });

    it("offers every database and the account check", () => {
      const html = readFileSync(dist, "utf8");
      for (const id of ["engines", "checkForm", "dbTable", "generator", "check", "faq"]) expect(html).toContain(`id="${id}"`);
    });
  });
});
