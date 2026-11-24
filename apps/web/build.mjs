// Builds ONE self-contained file: dist/index.html.
// Script and styles are inlined and pinned by SHA-256 in the Content-Security-Policy,
// so the page works offline (even from file://) and cannot load or send anything.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => join(here, "src", p);

const result = await build({
  entryPoints: [src("main.ts")],
  bundle: true,
  format: "iife",
  target: ["es2020"],
  minify: true,
  legalComments: "none",
  write: false,
  alias: { "@roua-dev/core": join(here, "../../packages/core/src/index.ts") },
});
// Escape "</" so the bundle cannot close the <script> element early.
const script = result.outputFiles[0].text.replace(/<\/(script)/gi, "<\\/$1").trimEnd();
const style = readFileSync(src("styles.css"), "utf8").trim();

const hash = (s) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;
const csp = [
  "default-src 'none'",
  `script-src ${hash(script)}`,
  `style-src ${hash(style)}`,
  "img-src data:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const forbidden = ["fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "EventSource", "importScripts"];
const found = forbidden.filter((f) => script.includes(f));
if (found.length) throw new Error(`Bundle must not use network APIs: ${found.join(", ")}`);

const buildId = createHash("sha256").update(script + style).digest("hex").slice(0, 12);
const html = readFileSync(src("template.html"), "utf8")
  .replace("__CSP__", csp)
  .replace("__BUILD__", buildId)
  .replace("<style>__STYLE__</style>", () => `<style>${style}</style>`)
  .replace("<script>__SCRIPT__</script>", () => `<script>${script}</script>`);

mkdirSync(join(here, "dist"), { recursive: true });
writeFileSync(join(here, "dist", "index.html"), html);
const sum = createHash("sha256").update(html).digest("hex");
writeFileSync(join(here, "dist", "index.html.sha256"), `${sum}  index.html\n`);
console.log(`apps/web/dist/index.html  ${(html.length / 1024).toFixed(1)} KiB  sha256 ${sum}`);
