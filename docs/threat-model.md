# Threat model (ROUA 0.1, PostgreSQL)

**Assets:** the data in the database (above all secrets and personal data), its integrity, and its availability.
**Adversary:** whoever holds the ROUA credentials. That might be a curious or compromised AI agent, a leaked demo password, or a malicious reviewer. Assume they know PostgreSQL well and will try every path.

| Threat | Mitigation | Verified by |
|---|---|---|
| Writes through direct table privileges | Reset-then-grant on every apply; `SELECT` only | T1, P2 |
| Writes through column-level grants | Covered separately from table grants | T2 |
| Writes through a role reachable with `SET ROLE` (NOINHERIT membership) | The account belongs to its level role only; the audit follows every reachable role | R5, T1, T2 |
| Owner privileges (owners can ALTER, DROP, GRANT) | The account owns nothing | T3 |
| DDL in a schema (PostgreSQL 14 and older grant CREATE on `public` to PUBLIC) | Opt-in hardening; reported until fixed | S1, P1 |
| Bypassing the read-only default (`SET transaction_read_only = off`) | Privileges are the control; probes explicitly turn the default off first | P1, P2 |
| SECURITY DEFINER functions that write | Reported for review; fix by revoking EXECUTE from PUBLIC | F1 |
| Large objects (`lo_create` is granted to PUBLIC) | Reported, with a fix | F2, P3 |
| Sequence manipulation (`setval`, `nextval`) | No sequence grants | Q1 |
| Writes to other databases through foreign servers or dblink | Reported | N1 |
| Reading secrets (hashes, keys, tokens) | Column-level grants; deny-list plus best-effort name detector; masked views omit secret columns | X1, V5 |
| Future tables with secrets exposed automatically | No default privileges; new tables need a re-apply, which runs the detector | Test: "flags a secret column added after setup" |
| Leaky functions revealing rows hidden by views | `security_barrier` views; TEMP removal recommended | D1, test checks the view option |
| Guessing values behind the `hash` mask | Keyed hash; the key table is unreadable by the ROUA | Test: key table returns permission denied |
| Plaintext password exposure (scripts, logs, shell history) | SCRAM verifier in scripts; connection strings only from environment variables; password shown once | Unit tests |
| SQL injection through names and values in templates | Strict identifier regex, quoting, literal escaping (tested against a real parser), dollar-quote tag check | Unit tests |
| Forgotten accounts | Mandatory expiry; `roua expire --due` for cron; `roua list` | R2 |
| Open sessions after expiry (`VALID UNTIL` does not end them) | Revoke terminates sessions | Integration test I12 |
| Logging in without a password | `pg_hba.conf` `trust` rules flagged | N2 |
| Denial of service (long queries, many connections, locks) | Statement timeout, lock timeout, idle timeout, connection limit | R3, C1 |
| `NOTIFY` used to trigger applications that LISTEN | Cannot be blocked by privileges; reported. Listeners must not trust the sender. | P3 |
| Web generator leaking the password | One static file; CSP `connect-src 'none'`, `default-src 'none'`, hashed inline code; build fails if network APIs appear | Web test I15 |
| Supply chain | `@roua/core` has zero runtime dependencies; CLI depends only on `pg` and `yaml`; `npm audit` in CI | CI |

## Known limits

- **Side channels and resource use.** A ROUA can still run expensive queries within its timeout, take advisory locks and observe timing. Limits reduce this; nothing removes it.
- **The secret detector reads names, not data.** A column named `notes` that contains passwords will not be detected. Use `columns_deny`.
- **Superuser grants made later.** ROUA cannot stop an administrator from granting more privileges after setup. Re-run `roua verify` or `roua audit` on a schedule.
- **Probes and statement triggers.** Write probes affect zero rows and are rolled back, but statement-level triggers still fire inside the rolled-back transaction when the account *can* write. Run `verify` against staging if that matters.
