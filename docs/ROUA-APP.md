# ROUA-App: consequence-free application accounts

**Companion specification 0.1 (draft)** · Term "ROUA" coined by Promise Okoroji · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

[ROUA-DB](../SPEC.md) is about database logins. ROUA-App is about **application** logins: the account you give an app-store reviewer, a prospect watching a demo, or an AI agent that uses your product through its UI or API.

These users need to **experience every feature**. A reviewer has to see the checkout screen and the admin panel. A demo needs a dashboard full of data. An agent needs to learn every workflow. They must not be able to cause anything that matters.

## 1. Definition

A **ROUA-App account** can open every screen and try every feature, but **cannot cause a consequence**. A consequence is any of:

1. changing **real** data: production tenants, real customers, real records;
2. moving **money** or anything of value (payments, refunds, payouts, credits, transfers);
3. **reaching people** or outside systems: email, SMS, push notifications, webhooks, calls to third-party APIs that act;
4. changing **identity or access**: passwords, MFA, email or phone, API keys and tokens, invitations, roles, SSO;
5. **taking data out in bulk**: exports, backups, downloads of personal data.

The account **MUST** also expire, be revocable at once, name an owner, and declare a profile (same profiles as ROUA-DB §3).

## 2. Modes

| Mode | Writes | Use it for |
|---|---|---|
| `read_only` | Refused (HTTP 403) | Demos of dashboards and reports, AI agents learning a product, auditors |
| `sandbox` | Accepted, but only into an isolated, resettable sandbox tenant | App-store review, interactive demos, training: anywhere the user must *do* things to judge the app |

`sandbox` mode does not weaken the definition. Writes are allowed only where they have no consequence. Requirements:

- The account **MUST** be bound to a sandbox tenant seeded with **synthetic** data. It **MUST NOT** be able to read or write any real tenant.
- External side effects **MUST** be stubbed: payment providers in test mode, email and SMS to a sink, push notifications suppressed, outbound webhooks disabled.
- The sandbox **SHOULD** reset on a schedule (for example nightly) and **MUST** reset or be destroyed at expiry.
- Category 4 (identity and access) stays blocked even in the sandbox. A reviewer who changes the shared demo password locks out the next reviewer.

## 3. Enforcement requirements

On every request from a ROUA-App account, the server:

1. **MUST** refuse the request if the account has expired (HTTP 401).
2. **MUST**, in `read_only` mode, allow only `GET`, `HEAD`, `OPTIONS`, GraphQL operations that are queries, and `POST` routes the application explicitly declares read-only (search, report previews). Everything else gets HTTP 403 with the header `ROUA-Denied: write`.
3. **MUST** refuse, in both modes, routes in categories 2 to 5 unless the application has made them consequence-free (for example checkout wired to a payment provider's test mode in the sandbox).
4. **MUST** treat method-override headers (`X-HTTP-Method-Override` and similar) and `_method` parameters as the method they claim. It **MUST** normalize paths (decoding, case, duplicate slashes, dot segments) before matching.
5. **MUST** fail closed on GraphQL it cannot parse, including persisted queries it cannot resolve.
6. **SHOULD** send `ROUA: profile=<p>; level=<l>; mode=<m>; expires=<iso>` on responses, so clients and agents know the session's limits.
7. **SHOULD** rate-limit the account and tag its audit-log entries `roua=true`.
8. **MUST NOT** have side effects on safe methods. A `GET` that changes state breaks HTTP semantics and breaks ROUA.

GraphQL in `sandbox` mode: path-based rules cannot see mutation names. Applications **MUST** block identity, credential and money mutations in their resolvers for sandbox accounts.

## 4. User interface

- Show a persistent banner: *"Read-only account: changes are disabled"* (or *"Sandbox: changes reset nightly and reach no one"*).
- **Disable** write controls with a tooltip instead of hiding them. Reviewers and agents need to see that features exist.
- When a write is refused, say so plainly rather than failing silently.

## 5. Data model

```sql
ALTER TABLE users ADD COLUMN roua_profile    text NULL;         -- agent|demo|review|audit|support|training|analytics|custom
ALTER TABLE users ADD COLUMN roua_level      text NULL;         -- optional, informational
ALTER TABLE users ADD COLUMN roua_mode       text NULL;         -- read_only | sandbox
ALTER TABLE users ADD COLUMN roua_expires_at timestamptz NULL;
ALTER TABLE users ADD COLUMN roua_sandbox    text NULL;         -- sandbox tenant id (sandbox mode)
```

Best practice is to back a ROUA-App account with a ROUA-DB account at the database layer as well (defence in depth). In `read_only` mode the application's own queries for that session can then run as a database ROUA.

## 6. Reference implementation

[`@roua-dev/app`](../packages/app) provides the request policy plus adapters for Express/Connect, Fastify and the Fetch API (Next.js middleware, Hono, Cloudflare Workers, Deno, Bun):

```ts
import { rouaExpress } from "@roua-dev/app";

app.use(express.json());
app.use(rouaExpress({
  getAccount: (req) => req.user?.roua,          // { profile, mode, expiresAt, sandboxTenant? } or undefined
  readPostAllowlist: [/^\/api\/search$/],
}));
```

Adapters for Django, Rails and Laravel are planned. The policy is small (see [`policy.ts`](../packages/app/src/policy.ts)) and easy to port. Contributions are welcome.

## 7. App-store review hand-off

Store consoles ask for a demo login under names like "App Review Information" or "App access", and these change over time, so check the current console. A template:

> **Demo account (ROUA sandbox).** Username: `…` Password: provided in the credentials field.
> This account can use every feature. Purchases use the payment provider's test mode, and messages are delivered to an internal sink. Data resets nightly. Identity settings (password, email, two-factor authentication) are disabled for this shared account. The account expires on `<date>`.

Align the expiry with the review window plus a margin, and revoke the account when the review is done.
