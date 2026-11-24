# Contributing to ROUA

Thank you for helping. ROUA is young, and reviews of the draft spec are as valuable as code.

## Most wanted

1. **Try to break `verify`.** Build a PostgreSQL role that can write or read a secret while `roua verify` still passes. Report it privately ([SECURITY.md](SECURITY.md)) and you will be credited.
2. **Review the spec.** Open an issue or discussion for anything unclear, wrong or missing in [SPEC.md](SPEC.md) or [ROUA-App](docs/ROUA-APP.md).
3. **Run `roua audit --all` on a staging database** and tell us about false positives or confusing output.
4. **New engines** (see [ROADMAP.md](ROADMAP.md)). An engine is accepted only with integration tests on a real server that prove writes fail.
5. **ROUA-App adapters** for Django, Rails, Laravel and others.

## Development

```console
npm install
npm run build
npm test
```

- `npm test` runs unit tests and end-to-end tests on PGlite (PostgreSQL compiled to WebAssembly). No Docker needed.
- `npm run test:pg` runs the integration suite against a real server (set `ROUA_TEST_ADMIN_URL`). CI runs it on PostgreSQL 13 to 17.

## Rules for changes

- **Never weaken a MUST** from the spec in code. If a database cannot enforce something natively, use a documented fallback and report a warning.
- **Escaping is security-critical.** Every name and value that reaches SQL goes through `packages/core/src/escape.ts`. Add tests for any new input.
- **Keep `@roua-dev/core` pure:** no I/O and no runtime dependencies. The same code runs in the browser.
- **Never log or persist secrets.**
- Generated SQL must stay deterministic for the same input, because the web generator and the CLI must produce the same script.
- Add a test for every bug fix, ideally one that runs against a real PostgreSQL engine.

## Spec changes

Substantive changes to the standard go through an RFC: copy `rfcs/0000-template.md`, open a pull request, and allow at least 14 days for comment. See [rfcs/README.md](rfcs/README.md).

## Conduct

Be kind and assume good faith. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
