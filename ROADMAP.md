# Roadmap

ROUA grows by being useful, not by covering everything at once. An engine is added only when it has a tested reference implementation and integration tests on real servers that prove writes fail.

## 0.1 (this release, draft)

- [x] Spec 0.1 draft: definition, profiles, levels L0 to L5, secrets, metadata, lifecycle, verification checks
- [x] PostgreSQL 13+: `audit`, `verify`, `plan`, `apply`, `revoke`, `list`, `expire`, `init`
- [x] Offline single-file web generator
- [x] ROUA-App companion draft and `@roua-dev/app` (Express, Fastify, Fetch API)
- [x] End-to-end tests on PGlite; CI on PostgreSQL 13 to 17

## Next

- [ ] Outside review: at least two PostgreSQL or security reviewers try to break `verify`
- [ ] A `roua audit` GitHub Action, with SARIF output for code-scanning dashboards
- [ ] Vault integration guide with example dynamic-role definitions
- [ ] `pg_cron` option for engine-side expiry
- [ ] L3 helper that generates aggregate views with a minimum group size
- [ ] ROUA-App adapters: Django, Rails, Laravel
- [ ] Signed releases, an SBOM, and published checksums for the web generator

## Later (each needs its own tests on real servers)

- MySQL 8.4 and MariaDB 11 (per-table grants, because there is no per-object revoke; scheduled expiry events)
- SQL Server 2022 and Azure SQL (DENY-based, with an SQL Agent job for expiry)
- MongoDB 7 (allow-only roles, with views for masking)
- Snowflake (plan-only until it can be tested automatically)
- BigQuery, Redis ACLs, and Elasticsearch/OpenSearch roles
- SaaS profiles: read-only permission sets for common SaaS apps

## Not planned

- A proxy, vault or hosted service. ROUA stays a standard plus tools you run yourself.
