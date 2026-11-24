# Changelog

Notable changes to the ROUA specification and tools. The project uses semantic versioning. Before 1.0, minor versions may contain breaking changes.

## 0.1.0 (unreleased draft)

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
