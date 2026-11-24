# @roua-dev/cli

`roua`: audit, verify, create and revoke read-only PostgreSQL accounts.

```console
export ADMIN_DATABASE_URL=postgres://admin@host/db
npx @roua-dev/cli audit --role readonly      # is it actually read-only?
npx @roua-dev/cli init && npx @roua-dev/cli plan && npx @roua-dev/cli apply
```

Connection strings are read only from environment variables. Run `roua --help` for every command. Docs: https://github.com/PromiseGithub/roua

Apache-2.0. The term ROUA was coined by Promise Okoroji.
