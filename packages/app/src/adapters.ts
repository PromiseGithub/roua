/**
 * Framework adapters. No framework is a dependency: the types are structural.
 */

import { evaluateRequest, type RouaAppAccount, type RouaDecision, type RouaGuardOptions } from "./policy.js";

type Maybe<T> = T | null | undefined;

const denyBody = (d: RouaDecision) => JSON.stringify({ error: d.message, roua: { denied: d.reason } });

// ------------------------------------------------------------ Express / Connect
interface NodeReq {
  method?: string;
  url?: string;
  originalUrl?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  roua?: { account: RouaAppAccount; decision: RouaDecision };
}
interface NodeRes {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

/**
 * Express/Connect middleware. Mount it AFTER authentication and body parsing:
 *
 *   app.use(express.json());
 *   app.use(rouaExpress({ getAccount: (req) => req.user?.roua }));
 */
export function rouaExpress<Req extends NodeReq>(
  opts: RouaGuardOptions & { getAccount: (req: Req) => Maybe<RouaAppAccount> },
) {
  return (req: Req, res: NodeRes, next: (err?: unknown) => void) => {
    let account: Maybe<RouaAppAccount>;
    try {
      account = opts.getAccount(req);
    } catch (e) {
      return next(e);
    }
    if (!account) return next();
    const d = evaluateRequest(
      { method: req.method ?? "GET", url: req.originalUrl ?? req.url ?? "/", headers: req.headers, body: req.body },
      account,
      opts,
    );
    for (const [k, v] of Object.entries(d.headers)) res.setHeader(k, v);
    if (d.allow) {
      req.roua = { account, decision: d };
      return next();
    }
    res.statusCode = d.status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(denyBody(d));
  };
}

// ------------------------------------------------------------ Fastify
interface FastifyReq {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface FastifyReply {
  code(status: number): FastifyReply;
  header(name: string, value: string): FastifyReply;
  send(payload?: unknown): unknown;
}

/**
 * Fastify preHandler hook (runs after body parsing):
 *
 *   fastify.addHook("preHandler", rouaFastify({ getAccount: (req) => req.user?.roua }));
 */
export function rouaFastify<Req extends FastifyReq>(opts: RouaGuardOptions & { getAccount: (req: Req) => Maybe<RouaAppAccount> }) {
  return async (req: Req, reply: FastifyReply) => {
    const account = opts.getAccount(req);
    if (!account) return;
    const d = evaluateRequest({ method: req.method, url: req.url, headers: req.headers, body: req.body }, account, opts);
    for (const [k, v] of Object.entries(d.headers)) reply.header(k, v);
    if (!d.allow) return reply.code(d.status).header("Content-Type", "application/json; charset=utf-8").send(denyBody(d));
  };
}

// ------------------------------------------------------------ Fetch API (Next.js middleware, Hono, Workers, Deno, Bun)

/**
 * Evaluate a Fetch API Request. Reads a clone of the body only for GraphQL
 * POSTs, so the original stays readable by your handler.
 *
 *   // Next.js middleware.ts
 *   const denied = await rouaFetchGuard(request, account, opts);
 *   if (denied) return denied;
 */
export async function rouaFetchGuard(request: Request, account: Maybe<RouaAppAccount>, opts: RouaGuardOptions = {}): Promise<Response | null> {
  if (!account) return null;
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => (headers[k] = v));
  const url = new URL(request.url);
  let body: unknown;
  const first = evaluateRequest({ method: request.method, url: url.pathname + url.search, headers }, account, opts);
  if (!first.allow && first.reason === "graphql" && request.method.toUpperCase() === "POST") {
    try {
      body = await request.clone().text();
    } catch {
      body = undefined;
    }
  }
  const d = body === undefined ? first : evaluateRequest({ method: request.method, url: url.pathname + url.search, headers, body }, account, opts);
  if (d.allow) return null;
  return new Response(denyBody(d), { status: d.status, headers: { ...d.headers, "Content-Type": "application/json; charset=utf-8" } });
}
