import { describe, expect, it } from "vitest";
import {
  evaluateRequest,
  isReadOnlyGraphQL,
  normalizePath,
  operationTypes,
  rouaExpress,
  rouaFetchGuard,
  type RouaAppAccount,
} from "@roua/app";

const future = new Date(Date.now() + 86_400_000).toISOString();
const demo: RouaAppAccount = { profile: "demo", mode: "read_only", expiresAt: future };
const reviewer: RouaAppAccount = { profile: "review", mode: "sandbox", expiresAt: future, sandboxTenant: "sandbox-42" };
const opts = { readPostAllowlist: [/^\/api\/search$/] };

const allow = (method: string, url: string, account = demo, body?: unknown, headers?: Record<string, string>) =>
  evaluateRequest({ method, url, body, headers }, account, opts);

describe("read_only mode", () => {
  it("allows every safe request and sets the ROUA header", () => {
    for (const url of ["/", "/dashboard", "/settings/billing", "/api/orders?page=2"]) {
      const d = allow("GET", url);
      expect(d.allow, url).toBe(true);
      expect(d.headers.ROUA).toMatch(/profile=demo; level=app; mode=read_only; expires=/);
    }
  });

  it("denies writes with 403 and ROUA-Denied: write", () => {
    for (const [m, url] of [["POST", "/api/orders"], ["PUT", "/api/orders/1"], ["PATCH", "/me"], ["DELETE", "/api/orders/1"]] as const) {
      const d = allow(m, url);
      expect(d.allow, `${m} ${url}`).toBe(false);
      expect(d.status).toBe(403);
      expect(d.headers["ROUA-Denied"]).toBe("write");
    }
  });

  it("allows declared read-only POST routes", () => {
    expect(allow("POST", "/api/search").allow).toBe(true);
  });

  it("lets the user log out and refresh the session", () => {
    expect(allow("POST", "/logout").allow).toBe(true);
    expect(allow("POST", "/auth/refresh").allow).toBe(true);
  });

  it("allows GraphQL queries and denies mutations, subscriptions and unknowns", () => {
    expect(allow("POST", "/graphql", demo, { query: "{ me { id } }" }).allow).toBe(true);
    expect(allow("POST", "/graphql", demo, { query: "query Q($id: ID!) { order(id: $id) { total } }" }).allow).toBe(true);
    expect(allow("POST", "/graphql", demo, { query: "mutation { deleteOrder(id: 1) }" }).allow).toBe(false);
    expect(allow("POST", "/graphql", demo, JSON.stringify({ query: "subscription { ticks }" })).allow).toBe(false);
    expect(allow("POST", "/graphql", demo, [{ query: "{ a }" }, { query: "mutation { b }" }]).allow).toBe(false);
    expect(allow("POST", "/graphql", demo, { extensions: { persistedQuery: { sha256Hash: "abc" } } }).allow).toBe(false);
    expect(allow("GET", "/graphql?query=" + encodeURIComponent("mutation { x }")).allow).toBe(false);
  });

  it("cannot be bypassed with method overrides, encodings or path tricks", () => {
    expect(allow("POST", "/api/search", demo, undefined, { "X-HTTP-Method-Override": "DELETE" }).allow).toBe(false);
    expect(allow("GET", "/api/orders/1", demo, undefined, { "x-http-method-override": "DELETE" }).allow).toBe(false);
    expect(allow("GET", "/api/orders/1?_method=DELETE").allow).toBe(false);
    expect(allow("GET", "/Settings/%45xport").allow).toBe(false); // export, encoded + case
    expect(allow("GET", "/settings/%2565xport").allow).toBe(false); // double-encoded
    expect(allow("GET", "/a/../exports").allow).toBe(false);
    expect(allow("POST", "/API//Search/").allow).toBe(true);
  });

  it("expires", () => {
    const d = evaluateRequest({ method: "GET", url: "/" }, { ...demo, expiresAt: "2020-01-01T00:00:00Z" });
    expect(d.status).toBe(401);
    expect(d.headers["ROUA-Denied"]).toBe("expired");
  });
});

describe("sandbox mode (app review)", () => {
  it("allows ordinary writes and tags them with the sandbox tenant", () => {
    const d = allow("POST", "/api/posts", reviewer);
    expect(d.allow).toBe(true);
    expect(d.headers["ROUA-Sandbox"]).toBe("sandbox-42");
    expect(allow("DELETE", "/api/posts/9", reviewer).allow).toBe(true);
  });

  it("still blocks identity, credentials, money and outbound messages", () => {
    for (const url of [
      "/account/password",
      "/settings/mfa",
      "/api/api-keys",
      "/team/invitations",
      "/billing/checkout",
      "/api/refunds",
      "/settings/webhooks",
      "/api/sms",
      "/account/delete",
      "/me/change-email",
    ]) {
      expect(allow("POST", url, reviewer).allow, url).toBe(false);
    }
  });

  it("can opt specific routes back in once they are made safe", () => {
    const d = evaluateRequest({ method: "POST", url: "/billing/checkout" }, reviewer, { sandboxAllow: [/^\/billing\/checkout$/] });
    expect(d.allow).toBe(true);
  });

  it("refuses sandbox mode without a tenant", () => {
    expect(allow("POST", "/api/posts", { ...reviewer, sandboxTenant: undefined }).allow).toBe(false);
  });
});

describe("GraphQL parser", () => {
  it.each([
    ["{ a }", ["query"]],
    ["query { a }", ["query"]],
    ["mutation M { a }", ["mutation"]],
    ['query Q($x: String = "mutation {") { a(arg: "}") }', ["query"]],
    ['# mutation { x }\nquery { a }', ["query"]],
    ['query { a(text: """ mutation { b } """) }', ["query"]],
    ["fragment F on T { x } query { ...F }", ["query"]],
    ["query A { a } mutation B { b }", ["query", "mutation"]],
  ])("%s", (q, types) => expect(operationTypes(q)).toEqual(types));

  it("selects by operationName and fails closed on garbage", () => {
    expect(operationTypes("query A { a } mutation B { b }", "A")).toEqual(["query"]);
    expect(operationTypes("query A { a }", "Missing")).toBeNull();
    expect(operationTypes("{ a ")).toBeNull();
    expect(operationTypes('{ a(x: "unterminated) }')).toBeNull();
    expect(isReadOnlyGraphQL({ query: "type Query { a: Int }" })).toBe(false);
    expect(isReadOnlyGraphQL([])).toBe(false);
  });
});

describe("adapters", () => {
  it("express: passes non-ROUA users through, blocks ROUA writes", () => {
    const mw = rouaExpress({ getAccount: (req: any) => req.user?.roua });
    let nextCalled = 0;
    const res: any = { statusCode: 200, headers: {} as Record<string, string>, setHeader(k: string, v: string) { this.headers[k] = v; }, end(b: string) { this.body = b; } };
    mw({ method: "POST", url: "/x", headers: {} } as any, res, () => nextCalled++);
    expect(nextCalled).toBe(1);
    mw({ method: "POST", url: "/x", headers: {}, user: { roua: demo } } as any, res, () => nextCalled++);
    expect(nextCalled).toBe(1);
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).roua.denied).toBe("write");
  });

  it("fetch: reads the GraphQL body from a clone", async () => {
    const q = new Request("https://app.example.com/graphql", { method: "POST", body: JSON.stringify({ query: "{ me { id } }" }) });
    expect(await rouaFetchGuard(q, demo)).toBeNull();
    expect(await q.text()).toContain("me"); // original body still readable
    const m = new Request("https://app.example.com/graphql", { method: "POST", body: JSON.stringify({ query: "mutation { x }" }) });
    const res = await rouaFetchGuard(m, demo);
    expect(res?.status).toBe(403);
  });
});

describe("normalizePath", () => {
  it("normalizes", () => {
    expect(normalizePath("/A//b/./c/../D/;jsessionid=1?x=1")?.path).toBe("/a/b/d");
    expect(normalizePath("/%E0%A4%A")).toBeNull();
  });
});
