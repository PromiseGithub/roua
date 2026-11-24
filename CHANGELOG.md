# Changelog

Notable changes to the ROUA specification and tools. The project uses semantic versioning. Before 1.0, minor versions may contain breaking changes.

## 0.3.0 (2026-11-24)

- **kaizam.com is now a site:** a page per database (kaizam.com/mysql/, /sqlserver/, …) explaining the usual way, what it misses and what ROUA does, guides for AI agents and app-review accounts, plus sitemap.xml, robots.txt, canonical URLs, structured data and a 404 page. Every page is still one offline file with no network requests.
- **GitHub Action:** `uses: PromiseGithub/roua@v0.3.0` audits PostgreSQL roles in CI, writes a job summary and annotations, and fails the build when an account is not read-only.
- **MCP server:** `roua mcp` (`npx -y @roua-dev/cli mcp`) gives AI agents tools to list engines, write audit scripts, generate ROUA scripts to a folder (secrets never enter the conversation) and audit a PostgreSQL role live. No new dependencies. Listed in the MCP Registry as io.github.PromiseGithub/roua.
- **Docker image:** `ghcr.io/promisegithub/roua`, built from source with provenance and an SBOM.

## 0.2.0 (2026-11-24)

- New engines in `@roua-dev/core` and the web generator: MySQL, MariaDB, SQL Server and Azure SQL, Oracle, MongoDB and Redis/Valkey (tested in CI against real servers), plus Snowflake and BigQuery (preview). Each produces setup, audit, revoke and drop scripts.
- `auditScript()` and the web page's "Check an account you already have" write an audit for any existing account on any engine.
- Password verifiers instead of plaintext where engines accept them: MySQL caching_sha2_password, MariaDB native hash, SQL Server hashed logins, Redis SHA-256.
- kaizam.com redesigned: one offline page for every engine, an account checker, guidance for AI agents and an FAQ.

## 0.1.1 (2026-11-24)

No changes to the specification or to tool behaviour.

- Packages are now published from GitHub Actions with npm Trusted Publishing (OIDC). No npm token is stored in the repository, and every release carries provenance.
- The web generator is hosted at https://kaizam.com.

## 0.1.0 (2026-11-24)

First public draft.

**Specification**
- ROUA-DB 0.1: definition, profiles, levels L0 to L5, secret handling, metadata string, lifecycle, and verification checks (R1–R5, T1–T3, S1, D1, Q1, F1, F2, X1, N1, N2, C1, M1, P1–P3, V1, V5, V7).
- ROUA-App 0.1 companion draft: `read_only` and `sandbox` modes for application accounts.
- Approval is a SHOULD, because tools cannot validate it. L5 is the exception.
- The secret detector is defined as best effort; the user's deny-list is the authoritative control.
- L3 and L4 views must use `security_barrier`, and the `hash` mask must use a key the ROUA cannot read.
- New tables never become readable automatically.

**Tools**
- `@roua-dev/core`: PostgreSQL planner, auditor and verifier, plus SCRAM-SHA-256 verifiers. Zero runtime dependencies.
- `@roua-dev/cli`: `audit`, `verify`, `init`, `plan`, `apply`, `revoke`, `list`, `expire`.
- `@roua-dev/app`: request policy with Express, Fastify and Fetch API adapters.
- Offline single-file web generator.
