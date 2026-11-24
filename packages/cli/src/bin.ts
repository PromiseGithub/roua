#!/usr/bin/env node
import { main } from "./index.js";

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`roua: ${(e as Error).message}\n`);
    process.exit(2);
  },
);
