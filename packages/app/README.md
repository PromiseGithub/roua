# @roua/app

Request guards for [ROUA-App](https://github.com/PromiseGithub/roua/blob/main/docs/ROUA-APP.md) accounts: logins for demos, app-store review and AI agents that can try every feature without consequence.

- `read_only` mode: only safe methods, GraphQL queries and POST routes you declare read-only
- `sandbox` mode: writes allowed (your app routes them to a resettable sandbox tenant); identity, credential, money, outbound-message and export routes stay blocked

Adapters: `rouaExpress` (Express/Connect), `rouaFastify` (preHandler hook), `rouaFetchGuard` (Next.js middleware, Hono, Workers, Deno, Bun). Zero dependencies.

Apache-2.0. The term ROUA was coined by Promise Okoroji.
