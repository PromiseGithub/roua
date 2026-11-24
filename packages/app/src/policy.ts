/**
 * ROUA-App: consequence-free application accounts.
 *
 * A ROUA-App account can open every screen and exercise every feature, but
 * cannot cause a consequence: it cannot change real data, move money, send
 * messages to real people, or change identity and security settings.
 *
 * Two modes:
 *  - read_only: only safe methods (GET/HEAD/OPTIONS), GraphQL queries, and
 *    POST routes you declare as read-only (e.g. search). Everything else: 403.
 *  - sandbox:   writes are allowed, but your app MUST route this account to an
 *    isolated, resettable sandbox tenant with external side effects stubbed.
 *    Identity, credential, money and outbound-message routes stay blocked.
 */

import { isReadOnlyGraphQL } from "./graphql.js";

export type RouaAppMode = "read_only" | "sandbox";

export interface RouaAppAccount {
  profile: string; // agent | demo | review | audit | support | training | analytics | custom
  level?: string;
  mode: RouaAppMode;
  expiresAt: string | Date;
  /** sandbox mode: the isolated tenant your data layer must use. */
  sandboxTenant?: string;
}

export interface RouaGuardOptions {
  /** POST routes with read semantics, e.g. [/^\/search$/, "/api/reports/preview"]. */
  readPostAllowlist?: (string | RegExp)[];
  /** Paths that accept GraphQL. Default ["/graphql"]. */
  graphqlPaths?: (string | RegExp)[];
  /** Blocked for every non-safe method, in both modes. Defaults to ALWAYS_BLOCKED. */
  alwaysBlocked?: RegExp[];
  /** Added to alwaysBlocked (keeps the defaults). */
  extraBlocked?: RegExp[];
  /** Blocked for every method, including GET. Defaults to BLOCKED_READS (bulk exports, secret reveals). */
  blockedReads?: RegExp[];
  /** Non-safe routes that only manage the session (logout, token refresh). Defaults to SESSION_ROUTES. */
  sessionRoutes?: RegExp[];
  /** sandbox mode only: always-blocked paths you have made safe (e.g. checkout in provider test mode). */
  sandboxAllow?: RegExp[];
  /** Clock, for tests. */
  now?: () => number;
}

export interface RouaRequest {
  method: string;
  /** Path with optional query string, e.g. "/graphql?x=1". */
  url: string;
  headers?: Record<string, string | string[] | undefined>;
  /** Parsed body (object/array) or raw string. Needed for GraphQL POSTs. */
  body?: unknown;
}

export type DenyReason = "expired" | "blocked" | "write" | "graphql" | "bad-request";

export interface RouaDecision {
  allow: boolean;
  status: number;
  reason?: DenyReason;
  message?: string;
  headers: Record<string, string>;
}

const seg = (alts: string) => new RegExp(`(^|/)(${alts})(/|$)`);

/** Routes that change identity, credentials, access, money or reach the outside world. */
export const ALWAYS_BLOCKED: RegExp[] = [
  seg("password|passwd|reset-password|change-password|forgot-password"),
  seg("mfa|2fa|otp|totp|webauthn|passkeys?|security-keys?|recovery-codes?"),
  seg("change-email|update-email|verify-email|change-phone|update-phone"),
  seg("api[-_]?keys?|tokens?|personal-access-tokens?|access-tokens?|ssh-keys?|secrets?|credentials?"),
  seg("invites?|invitations?|roles?|permissions?|sso|saml|scim|impersonat\\w*"),
  seg("billing|payments?|payouts?|refunds?|charges?|checkout|subscriptions?|invoices?|transfers?|withdraw\\w*|wallets?"),
  seg("webhooks?|sms|emails?|broadcasts?|campaigns?|newsletters?|push-notifications?|notifications/send"),
  seg("exports?|backups?|dumps?|data-export|takeout"),
  /(^|\/)account(\/|$).*(delete|close|deactivate|cancel)/,
  /(^|\/)(delete|close|deactivate)-account(\/|$)/,
];

/** Blocked even for GET: bulk personal-data exports and secret reveals. */
export const BLOCKED_READS: RegExp[] = [
  seg("exports?|backups?|dumps?|data-export|takeout"),
  /(^|\/)(api[-_]?keys?|tokens?|secrets?|credentials?)\/[^/]+\/(reveal|show|plaintext|raw)(\/|$)/,
];

/** Logging out and refreshing a session change nothing that matters; allowed in both modes. */
export const SESSION_ROUTES: RegExp[] = [
  seg("logout|log-out|signout|sign-out"),
  /(^|\/)(auth|session|sessions|oauth)\/(refresh|renew|token\/refresh)(\/|$)/,
  /(^|\/)(token\/refresh|refresh[-_]?token)(\/|$)/,
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const OVERRIDE_HEADERS = ["x-http-method-override", "x-http-method", "x-method-override"];

function header(req: RouaRequest, name: string): string | undefined {
  const h = req.headers;
  if (!h) return undefined;
  const v = h[name] ?? h[name.toLowerCase()] ?? Object.entries(h).find(([k]) => k.toLowerCase() === name)?.[1];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Normalize a path so encodings and casing cannot dodge the patterns:
 * decode (twice, to catch double-encoding), lowercase, drop ;params,
 * collapse slashes and dot segments, drop the trailing slash.
 */
export function normalizePath(url: string): { path: string; query: URLSearchParams } | null {
  let parsed: URL;
  try {
    parsed = new URL(url, "http://roua.invalid");
  } catch {
    return null;
  }
  let p = parsed.pathname;
  try {
    for (let k = 0; k < 2 && /%[0-9a-f]{2}/i.test(p); k++) p = decodeURIComponent(p);
  } catch {
    return null;
  }
  if (p.includes("\u0000")) return null;
  p = p.toLowerCase().replace(/\\/g, "/").replace(/;[^/]*/g, "").replace(/\/{2,}/g, "/");
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (part === "..") out.pop();
    else if (part !== "." && part !== "") out.push(part);
  }
  return { path: "/" + out.join("/"), query: parsed.searchParams };
}

const matches = (path: string, patterns: (string | RegExp)[] = []) =>
  patterns.some((p) => (typeof p === "string" ? path === p.toLowerCase().replace(/\/$/, "") : p.test(path)));

export function rouaHeaderValue(account: RouaAppAccount): string {
  const exp = new Date(account.expiresAt).toISOString();
  return `profile=${account.profile}; level=${account.level ?? "app"}; mode=${account.mode}; expires=${exp}`;
}

/** Decide one request. Pure and synchronous: adapters for frameworks wrap this. */
export function evaluateRequest(req: RouaRequest, account: RouaAppAccount, opts: RouaGuardOptions = {}): RouaDecision {
  const now = opts.now?.() ?? Date.now();
  const headers: Record<string, string> = { ROUA: rouaHeaderValue(account), "Cache-Control": "private, no-store" };
  const deny = (status: number, reason: DenyReason, message: string): RouaDecision => ({
    allow: false,
    status,
    reason,
    message,
    headers: { ...headers, "ROUA-Denied": reason },
  });

  const exp = new Date(account.expiresAt).getTime();
  if (Number.isNaN(exp) || now >= exp) return deny(401, "expired", "This ROUA account has expired.");

  const norm = normalizePath(req.url);
  if (!norm) return deny(400, "bad-request", "Malformed request path.");
  const { path, query } = norm;

  const method = req.method.toUpperCase();
  const overrides = [...OVERRIDE_HEADERS.map((h) => header(req, h)), query.get("_method") ?? undefined]
    .filter((v): v is string => Boolean(v))
    .map((v) => v.toUpperCase());
  // Fail closed: the request is "safe" only if the real method and every override are safe.
  const safe = SAFE_METHODS.has(method) && overrides.every((m) => SAFE_METHODS.has(m));
  const effectivePost = method === "POST" && overrides.length === 0;

  if (matches(path, opts.blockedReads ?? BLOCKED_READS)) {
    return deny(403, "blocked", "This action is not available to ROUA accounts.");
  }

  const isGraphQL = matches(path, opts.graphqlPaths ?? ["/graphql"]);

  if (safe) {
    if (isGraphQL && query.has("query")) {
      const ok = isReadOnlyGraphQL({ query: query.get("query"), operationName: query.get("operationName") });
      if (!ok) return deny(403, "graphql", "ROUA accounts can only run GraphQL queries.");
    }
    return { allow: true, status: 200, headers };
  }

  if (matches(path, opts.sessionRoutes ?? SESSION_ROUTES)) return { allow: true, status: 200, headers };

  const blocked = [...(opts.alwaysBlocked ?? ALWAYS_BLOCKED), ...(opts.extraBlocked ?? [])];
  if (matches(path, blocked) && !(account.mode === "sandbox" && matches(path, opts.sandboxAllow))) {
    return deny(403, "blocked", "This action is not available to ROUA accounts.");
  }

  if (account.mode === "sandbox") {
    if (!account.sandboxTenant) return deny(403, "write", "Sandbox mode requires a sandbox tenant.");
    return { allow: true, status: 200, headers: { ...headers, "ROUA-Sandbox": account.sandboxTenant } };
  }

  // read_only from here on.
  if (isGraphQL && effectivePost) {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return deny(403, "graphql", "ROUA accounts can only run GraphQL queries.");
      }
    }
    return isReadOnlyGraphQL(body)
      ? { allow: true, status: 200, headers }
      : deny(403, "graphql", "ROUA accounts can only run GraphQL queries.");
  }

  if (effectivePost && matches(path, opts.readPostAllowlist)) return { allow: true, status: 200, headers };

  return deny(403, "write", "ROUA accounts are read-only. This change was not made.");
}
