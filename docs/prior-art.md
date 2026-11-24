# How ROUA relates to existing tools

Reviewers rightly ask: "Doesn't X already do this?" Often X does part of it, and ROUA is designed to sit next to it. Below is our understanding of each tool. If we describe a project inaccurately, please [open an issue](https://github.com/PromiseGithub/roua/issues) and we will fix it.

## What ROUA adds

1. **A shared vocabulary.** Profiles (why an account exists) and levels L0 to L5 (what it can see) mean the same thing in every organization, tool and contract. "Give the vendor a `support` ROUA at L4 for 7 days" is a complete, checkable request.
2. **Verification of "read-only".** `roua audit` and `roua verify` answer one question for any role, including roles that were not created with ROUA: *can this account change anything or read secrets?* They follow `SET ROLE` paths, column grants, ownership, sequences, SECURITY DEFINER functions, large objects and `pg_hba.conf`. Then they make real write attempts, rolled back, to prove the refusals.
3. **A serverless generator.** The web generator is one static HTML file that runs offline. People who will never install a CLI can still produce a correct, reviewable script.
4. **An application-level counterpart.** [ROUA-App](ROUA-APP.md) applies the same idea to demo and app-review logins.

## Tools ROUA works with

| Tool | What it does well | How ROUA fits |
|---|---|---|
| **HashiCorp Vault** (database secrets engine) | Issues short-lived, automatically revoked database credentials from a role definition (creation statements plus TTL). | Use the ROUA level role as what Vault grants: Vault's creation statement becomes `CREATE ROLE "{{name}}" … IN ROLE roua_l2_ops VALID UNTIL '{{expiration}}'`. Then run `roua audit --role <vault-user>` or `roua verify` to prove the issued users really are read-only. Vault handles credential lifecycle; ROUA handles what the credential can do, and proves it. |
| **Teleport, StrongDM** and similar access proxies | Identity-based, audited, often just-in-time access to databases through a proxy. | They decide *who* gets in and record what they do. The database role behind the proxy still decides what is possible. Map proxy roles to ROUA level roles and audit them with `roua audit`. |
| **AWS IAM database authentication** (and other cloud IAM logins) | Short-lived tokens instead of passwords for RDS and Aurora. | It replaces the password, not the privileges. The database user still needs ROUA-style grants; audit it with `roua audit`. |
| **PostgreSQL Anonymizer** (`anon` extension) | Rich static and dynamic masking with declarative rules and many masking functions. | A good choice for advanced masking. ROUA L4 ships a small built-in masking set so it works without extensions. If you already use Anonymizer, give the ROUA the masked role it provides, and `roua verify` still checks that writes and secrets are blocked. |
| **pgaudit** | Session and object audit logging for PostgreSQL. | ROUA recommends it (check C1) for the audit-trail requirement. |
| **Data security proxies and governance platforms** | Policy enforcement, discovery and classification across many data stores. | They can feed `columns_deny` with their classification results and consume ROUA reports as evidence. |

## What ROUA is not

- Not a proxy, a vault or a server. Nothing runs between your users and your database.
- Not a data-classification product. The secret detector is a best-effort safety net, and your deny-list is the authority.
- Not a replacement for least privilege in your application roles. It covers the accounts you hand to someone or something outside the normal application path.
