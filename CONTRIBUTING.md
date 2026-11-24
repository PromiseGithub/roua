# Contributing to ROUA

Thank you for helping. ROUA is young, and **feedback, ideas and reviews are as valuable as code.** You do not need to write code to make a difference.

## Ways to help, smallest first

- **Tell us what you think.** Reply to the [welcome discussion](https://github.com/PromiseGithub/roua/discussions/2) or start a thread in [💡 Ideas](https://github.com/PromiseGithub/roua/discussions/categories/ideas): what is missing, confusing, or could be better.
- **Report problems** with the [issue forms](https://github.com/PromiseGithub/roua/issues/new/choose): bugs, wrong audit results, confusing pages, database requests, spec feedback.
- **Share how you use ROUA** in [Show and tell](https://github.com/PromiseGithub/roua/discussions/categories/show-and-tell).
- **Pick up an issue** labelled [`good first issue`](https://github.com/PromiseGithub/roua/labels/good%20first%20issue) or [`help wanted`](https://github.com/PromiseGithub/roua/labels/help%20wanted). Comment that you are on it, and ask anything.
- **Collaborate.** Database vendors, AI-agent platforms, security teams and would-be co-maintainers: start a thread in [Discussions](https://github.com/PromiseGithub/roua/discussions). All contact is through GitHub.

## Most wanted

1. **Try to break `verify`.** Build a PostgreSQL role that can write or read a secret while `roua verify` still passes. Report it privately ([SECURITY.md](SECURITY.md)) and you will be credited.
2. **Review the spec.** Open an issue or discussion for anything unclear, wrong or missing in [SPEC.md](SPEC.md) or [ROUA-App](docs/ROUA-APP.md).
3. **Run `roua audit --all` on a staging database** and tell us about false positives or confusing output.
4. **New engines** (see [ROADMAP.md](ROADMAP.md)). An engine is accepted only with tests on a real server that prove writes fail; see `scripts/live-engine-test.mjs` and `.github/workflows/engines.yml`.
5. **Test the preview engines** (Snowflake, BigQuery) if you have an account to test against: run the generated scripts on a throwaway account and report what happens.
6. **ROUA-App adapters** for Django, Rails, Laravel and others.

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
