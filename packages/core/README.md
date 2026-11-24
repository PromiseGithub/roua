# @roua/core

The engine behind [ROUA](https://github.com/PromiseGithub/roua) (Read-Only User Accounts): config validation, the PostgreSQL planner, the auditor (`auditRole`), the verifier (`verifyCurrentUser`) and SCRAM-SHA-256 verifiers.

Pure TypeScript with **zero runtime dependencies**. It does no I/O of its own (you pass an executor function), so it runs in Node, browsers and workers.

```ts
import { auditRole, formatReport } from "@roua/core";
const exec = async (sql: string) => (await client.query(sql)).rows;
console.log(formatReport(await auditRole(exec, "readonly")));
```

Apache-2.0. The term ROUA was coined by Promise Okoroji.
