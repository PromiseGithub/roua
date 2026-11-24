# ROUA: Read-Only User Account

**Specification 0.1 (draft)**

| | |
|---|---|
| Status | Draft for public comment. Expect changes before 1.0. |
| Term coined by | Promise Okoroji |
| Editor | Promise Okoroji ([@PromiseGithub](https://github.com/PromiseGithub)) |
| License | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (this document). The reference implementation is Apache-2.0. |
| Feedback | [GitHub issues](https://github.com/PromiseGithub/roua/issues) and [discussions](https://github.com/PromiseGithub/roua/discussions) |

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are used as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

This document covers **ROUA-DB**: database accounts. Application-level accounts (demos, app-store review, AI agents using a web app) are covered by the companion draft [ROUA-App](docs/ROUA-APP.md). Version 0.1 defines PostgreSQL behaviour in detail; other engines are on the [roadmap](ROADMAP.md) and will be added only after they are tested the same way.

---

## 1. Why

Every organization eventually hands someone a "read-only" login: an AI agent learning a system, a sales demo, an auditor, an app-store reviewer, a vendor's support engineer. In practice these accounts are improvised. They are often able to write through some forgotten path, they rarely expire, nobody remembers who owns them, and they can usually read password hashes and API keys.

ROUA gives everyone the same vocabulary (profiles and levels), the same minimum guarantees, and a way to **check** them.

## 2. Definition

A **ROUA (Read-Only User Account)** is a limited-purpose account that satisfies all of the following.

1. **Cannot change anything.** It **MUST** be technically unable to create, modify or delete data or schema in the target system. This **MUST** be enforced by the target system's own permission model. Client settings, conventions and session defaults (for example PostgreSQL's `default_transaction_read_only`) **MUST NOT** be relied on, because the session can turn them off.
2. **Never reads secrets.** It **MUST NOT** be able to read secret values: password hashes, API keys, tokens, MFA seeds, private keys, encryption keys and similar. This applies at every level, including L5. See §5 for how secrets are identified.
3. **Has a purpose and a scope.** It **MUST** declare a profile (§3, why it exists) and a level (§4, what it can see).
4. **Has an owner.** It **MUST** name a human who is accountable for it.
5. **Expires.** It **MUST** have an expiry no later than its profile's maximum (§3), and it **MUST** be revocable at once, including ending sessions that are already open.
6. **Is verifiable.** It **MUST** pass the verification checks in §8 before credentials are handed over.
7. **Is identifiable.** It **SHOULD** carry ROUA metadata (§6) that tools and people can read.
8. **Is approved.** It **SHOULD** record who approved it. (Tools cannot validate an approval, so this is a SHOULD; L5 raises it to a MUST, see §4.)
9. **Is limited.** It **SHOULD** have connection and statement-time limits.
10. **Is audited.** Its activity **SHOULD** be logged.

### 2.1 Residual side effects

Some database actions cannot be blocked by privileges at all. In PostgreSQL every role can send `NOTIFY`, take advisory locks and consume resources. By default every role can also create temporary tables and large objects. A ROUA is still conformant when these remain possible, provided that:

- verification **MUST** report each one that is possible (§8, checks D1, F2, P3), and
- where a fix exists that does not depend on the account's goodwill (for example revoking `TEMPORARY` from `PUBLIC`), the report **MUST** state it.

Operators **SHOULD** make sure no application treats a `NOTIFY` from an arbitrary role as a trusted command.

## 3. Profiles: why the account exists

| Profile | Code | Default level | Default expiry | Maximum expiry | Notes |
|---|---|---|---|---|---|
| AI agent | `agent` | L2 | 90 days | 90 days | An AI agent or assistant learning or querying a system |
| Demo | `demo` | L1 | 30 days | 30 days | Use synthetic data, never real customers |
| App review | `review` | L1 | 30 days | 45 days | Database side of an app-store review; see ROUA-App for the application side |
| Auditor | `audit` | L4 | 30 days | 30 days | Internal or external audits |
| Support | `support` | L4 | 7 days | 7 days | Vendor or internal support sessions |
| Training | `training` | L2 | 14 days | 14 days | On synthetic or anonymized copies |
| Analytics | `analytics` | L3 | 180 days | 180 days | BI tools and analytics agents |
| Custom | `custom` | L2 | 30 days | 365 days | Organization-defined |

## 4. Levels: what the account can see

| Level | Name | Can read | Cannot read | Approval |
|---|---|---|---|---|
| **L0** | Metadata | Structure: schemas, tables, columns, types, relationships | Any row | SHOULD: owner |
| **L1** | Public | Only objects explicitly listed as public | Everything else | SHOULD: owner |
| **L2** | Operational | In-scope tables, minus a deny-list of objects and columns | Denied objects, denied columns, secrets | SHOULD: owner and data steward |
| **L3** | Analytical | Only listed aggregate views | Base tables | SHOULD: owner and data steward |
| **L4** | Masked | All in-scope tables through generated masked views | Base tables, raw values of masked columns, secrets | SHOULD: owner, data steward, security |
| **L5** | Break-glass | All in-scope data, unmasked | Secrets (never) | **MUST**: two distinct approvers; **MUST** expire within 24 hours; activity **MUST** be audited |

Rules that apply to every level:

- New objects created after the account was set up **MUST NOT** become readable automatically. (In PostgreSQL this means no `ALTER DEFAULT PRIVILEGES` for ROUA roles: a future table might hold secrets.) Re-applying the definition picks up new objects after they pass the secret detector.
- Views used at L3 and L4 **MUST** be protected against leaky-function attacks. In PostgreSQL they **MUST** be created `WITH (security_barrier)`.
- At L4, the `hash` masking function **MUST** use a secret key the ROUA cannot read. Otherwise the account can hash guesses (email addresses, phone numbers) and compare. The reference implementation keys the hash with a value stored in a table only the owner can read.
- An L3 aggregate view **SHOULD** suppress groups smaller than a minimum size (k-anonymity), for example with `HAVING count(*) >= 10`.

### 4.1 Masking functions

| Function | Output for `ada@example.com`, `+15551234567`, `1990-07-14`, `Ada Lovelace` |
|---|---|
| `email` | `a***@example.com` |
| `partial_last4` | `***4567` |
| `redact` | `NULL` |
| `hash` | 64 hex characters, keyed (stable within one database, so joins still work) |
| `year_only` | `1990-01-01` |
| `initials` | `A. L.` |

## 5. Secrets

A ROUA **MUST NOT** read secret values. Implementations identify secret columns in two ways, and **MUST** support both:

1. **A required, user-supplied deny-list** (`scope.columns_deny`). Name-based detection cannot see inside data, so this list is the authoritative control.
2. **A best-effort name detector.** The reference detector converts the column name to `snake_case` and flags names containing, for example, `password`, `secret`, `token`, `credential`, `api_key`, `private_key`, `encryption_key`, `card_number`, `webhook_sig…`, `recovery_codes`, or the words `pwd`, `pin`, `mfa`, `otp`, `totp`, `salt`, `cvv`, `cvc`, `pan`, `seed`, `nonce`. The full regular expression is published in [`packages/core/src/constants.ts`](packages/core/src/constants.ts).

The detector is a heuristic. False positives (such as `tokens_used`) fail safe: the column is hidden until it is listed in `scope.columns_allow`. Misses are possible, which is why item 1 exists. Implementations **MUST NOT** describe the detector as a guarantee.

Hidden columns **MUST** be enforced by the database (column-level grants, or views that omit them), never by query rewriting in a client.

## 6. Naming and metadata

- Login account names **MUST** match `^[a-z][a-z0-9_]{2,62}$` and **SHOULD** follow `roua_<profile>_<label>`, for example `roua_agent_docs` or `roua_review_appstore`.
- Grants **SHOULD** be held by a NOLOGIN level role (defaults: `roua_l0_meta`, `roua_l1_public`, `roua_l2_ops`, `roua_l3_analytics`, `roua_l4_masked`, `roua_l5_full`). Accounts that share a level role share its scope. Give accounts with different scopes different level roles.
- The account **SHOULD** carry this metadata string, stored as the role comment in PostgreSQL:

```
ROUA/0.1 profile=agent level=L2 owner=jane@example.com approved_by=cto@example.com approval_ref=TICKET-123 created=2026-11-23 expires=2027-02-21T00:00:00.000Z purpose="Docs assistant"
```

  Values other than `purpose` contain no spaces or quotes. `approved_by` may hold a comma-separated list.
- Clients using a ROUA **SHOULD** identify themselves, for example PostgreSQL `application_name = 'roua:<account>:<tool>'`.

## 7. Lifecycle

```
Request -> Approve -> Plan -> Review -> Apply -> Verify -> Hand over (once) -> Use -> Rotate -> Expire -> Revoke -> Drop
```

| Step | Requirement |
|---|---|
| Plan | The exact statements **MUST** be reviewable before anything runs. |
| Apply | **SHOULD** be one transaction. Re-applying **MUST** be idempotent and **MUST** remove privileges the definition no longer grants. |
| Verify | **MUST** pass (§8) before credentials are handed over. **SHOULD** be repeated on a schedule, because other people's grants drift. |
| Hand over | The password **SHOULD** be shown once and passed through a password manager or vault, never by email or chat. Scripts **SHOULD NOT** contain the plaintext password (PostgreSQL accepts a SCRAM-SHA-256 verifier instead). |
| Expire | Expiry **MUST** stop new logins. Where the engine cannot do this natively, a scheduled job **MUST** do it. |
| Revoke | **MUST** disable login **and** terminate open sessions. (PostgreSQL's `VALID UNTIL` alone does neither for sessions already open.) |

## 8. Verification

A conformant tool **MUST** run these checks and **MUST** exit non-zero if any check fails. Warnings do not fail unless the user asks for strict mode. Check identifiers are stable so reports can be compared over time.

**Catalog checks**, which work for any role, including accounts that were never created with ROUA. Each check covers the role itself **and every role it can reach**, whether by inheritance or by `SET ROLE`.

| ID | Check | Severity if not met |
|---|---|---|
| R1 | No superuser, CREATEROLE, CREATEDB, REPLICATION or BYPASSRLS | fail |
| R2 | Login roles have an expiry within the profile maximum | fail (none) / warn (too long) |
| R3 | Connection limit set | warn |
| R4 | No dangerous predefined roles (`pg_write_all_data`, `pg_read_all_data`, server file and program roles, `pg_signal_backend`, …) | fail |
| R5 | No reachable role has admin attributes | fail |
| T1 | No INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER (or MAINTAIN on 17+) on any table or view | fail |
| T2 | No column-level INSERT, UPDATE or REFERENCES | fail |
| T3 | Owns no tables, views, sequences, schemas, functions or databases | fail |
| S1 | No CREATE on any schema | fail |
| D1 | No CREATE on the database; TEMP reported | fail / warn |
| Q1 | No UPDATE on sequences; USAGE (`nextval`) reported | fail / warn |
| F1 | Executable SECURITY DEFINER functions reported | warn |
| F2 | Large-object creation reported; `lo_compat_privileges` off | warn / fail |
| X1 | No secret-pattern column is readable | fail |
| N1 | No USAGE on foreign servers | warn |
| N2 | No `trust` authentication for the role from remote hosts; role-specific `pg_hba.conf` rules exist | fail / warn |
| C1 | Statement timeout, read-only default and audit logging configured | warn |
| M1 | ROUA metadata present and complete | warn |

**Live probes**, run while connected as the account. Each runs in a transaction that is always rolled back, after explicitly setting `transaction_read_only = off`, so a refusal proves the privilege is missing rather than the default. Write probes affect zero rows (`UPDATE … WHERE false`, `DELETE … WHERE false`, `INSERT … SELECT … WHERE false`).

| ID | Probe | Expected |
|---|---|---|
| P1 | `CREATE TABLE` in every visible schema | insufficient privilege |
| P2 | `INSERT`, `UPDATE`, `DELETE` on readable tables | insufficient privilege |
| P3 | `CREATE TEMP TABLE`, `lo_create`, `NOTIFY` | reported as residual side effects (§2.1) |

**Scope checks**, run when the definition is available.

| ID | Check |
|---|---|
| V1 | Connected as the configured account |
| V5 | Every readable object is allowed by the level and scope (for L0: nothing readable; for L4: only masked views) |
| V7 | Sampled values of masked columns are masked as configured |

The machine-readable report format is [`schemas/roua-report.schema.json`](schemas/roua-report.schema.json).

## 9. Account definition (`roua.yaml`)

The definition is a YAML file validated by [`schemas/roua.schema.json`](schemas/roua.schema.json). It **MUST NOT** contain passwords. Tools **MUST** reject unknown keys, invalid identifiers, an expiry beyond the profile maximum, and L5 definitions without two distinct approvers or with an expiry more than 24 hours away.

```yaml
roua_version: "0.1"
account:
  name: roua_agent_docs
  profile: agent
  level: L2
  owner: jane@example.com
  approved_by: cto@example.com
  approval_ref: TICKET-123
  purpose: "Docs assistant learning the data model"
  expires_at: "2027-02-21T00:00:00Z"
  limits: { max_connections: 5, statement_timeout_s: 30 }
  network: { allowed_sources: ["10.0.0.0/24"] }
target:
  engine: postgresql
  database: appdb
  schemas: [public, sales]
  object_owner: app_owner
scope:
  exclude: ["public.salaries", "public.api_keys"]
  columns_deny: ["public.users.national_id"]
hardening:
  revoke_temp_from_public: true
```

## 10. PostgreSQL profile (normative for 0.1)

Supported: PostgreSQL 13 and later. The reference implementation's SQL is the normative example. In summary:

- **Level role:** `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`. It receives `CONNECT`, `USAGE` on in-scope schemas, and `SELECT` on in-scope relations. A table with any hidden column gets a column-level grant listing only its visible columns.
- **Never** use `pg_read_all_data` (it cannot exclude columns) or `ALTER DEFAULT PRIVILEGES`.
- **Login account:** `LOGIN … INHERIT CONNECTION LIMIT n VALID UNTIL '…' PASSWORD 'SCRAM-SHA-256$…'`. It is a member of the level role and nothing else, and it holds no direct grants. Session defaults (`default_transaction_read_only`, `statement_timeout`, `idle_in_transaction_session_timeout`, `lock_timeout`, `search_path`) are conveniences only.
- **Reset on apply:** before granting, revoke everything the level role and the account hold in the database (tables, sequences, functions, schemas, database) and every other role membership of the account.
- **L4:** views in `roua_masked_<schema>` built `WITH (security_barrier = true)` and owned by the object owner. Secret and denied columns are omitted, and masked columns are wrapped in the §4.1 functions. The account gets no base-table access.
- **Network:** restrict the account in `pg_hba.conf` (`hostssl <db> <account> <cidr> scram-sha-256`), above broader rules.
- **Hardening that affects every role** is opt-in and printed as a warning otherwise: `REVOKE TEMPORARY ON DATABASE … FROM PUBLIC`, and on PostgreSQL 14 and older `REVOKE CREATE ON SCHEMA public FROM PUBLIC`.
- **Revoke:** `ALTER ROLE … NOLOGIN` then `pg_terminate_backend()` for the account's sessions.

## 11. Conformance

- A **ROUA-conformant account** satisfies §2 and passes §8 with no failures.
- A **ROUA-conformant tool** creates accounts that are conformant, runs every §8 check for its engines, and produces reports in the §8 format.
- Claims of conformance **SHOULD** name the spec version, for example "ROUA 0.1 conformant (PostgreSQL)".

## 12. Relationship to other tools

ROUA is a vocabulary plus a verification method. It is meant to work alongside existing access tools, not replace them. See [docs/prior-art.md](docs/prior-art.md). For example, the SQL a ROUA tool generates can serve as the creation statements of a HashiCorp Vault dynamic database role, and `roua verify` can check the users Vault issues.

## 13. Versioning and changes

- The specification uses semantic versioning. Until 1.0, minor versions may make breaking changes; each one is listed in [CHANGELOG.md](CHANGELOG.md).
- Changes are proposed as RFCs in [`rfcs/`](rfcs/README.md), with at least 14 days of public comment.
- New engines are added only with a tested reference implementation and integration tests on real servers.

## Acknowledgements

The term "ROUA" and the original concept were created by Promise Okoroji. Thanks to everyone who reviews and challenges this draft.
