# Roadmap

ROUA grows by being useful, not by covering everything at once. An engine is added only when it has a tested reference implementation and integration tests on real servers that prove writes fail.

## 0.1 (this release, draft)

- [x] Spec 0.1 draft: definition, profiles, levels L0 to L5, secrets, metadata, lifecycle, verification checks
- [x] PostgreSQL 13+: `audit`, `verify`, `plan`, `apply`, `revoke`, `list`, `expire`, `init`
- [x] Offline single-file web generator
- [x] ROUA-App companion draft and `@roua-dev/app` (Express, Fastify, Fetch API)
- [x] End-to-end tests on PGlite; CI on PostgreSQL 13 to 17

## 0.2

- [x] Generators for MySQL, MariaDB, SQL Server and Azure SQL, Oracle, MongoDB and Redis/Valkey, tested in CI against real servers on every change
- [x] Preview generators for Snowflake and BigQuery
- [x] "Check an account you already have" audits for every engine
- [x] kaizam.com: one offline page for every engine

## Next

- [ ] Outside review: at least two PostgreSQL or security reviewers try to break `verify`
- [ ] A `roua audit` GitHub Action, with SARIF output for code-scanning dashboards
- [ ] Vault integration guide with example dynamic-role definitions
- [ ] `pg_cron` option for engine-side expiry
- [ ] L3 helper that generates aggregate views with a minimum group size
- [ ] ROUA-App adapters: Django, Rails, Laravel
- [ ] Signed releases, an SBOM, and published checksums for the web generator

## Later (each needs its own tests on real servers)

- Snowflake and BigQuery out of preview (needs a test account in CI)
- `roua` CLI apply/verify for engines beyond PostgreSQL
- Elasticsearch/OpenSearch roles, ClickHouse, CockroachDB, DynamoDB IAM
- SaaS profiles: read-only permission sets for common SaaS apps
