/**
 * Password generation and PostgreSQL SCRAM-SHA-256 verifiers.
 * Uses WebCrypto (browsers, Node 20+, Deno, Bun, workers); falls back to a
 * pure-JS implementation where crypto.subtle is unavailable (insecure contexts).
 * Randomness always comes from crypto.getRandomValues, which every context has.
 */
import { hmacSha256, pbkdf2Sha256, sha256 } from "./sha256.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto (crypto.subtle) is not available in this environment");
  return c.subtle;
}

/**
 * Cryptographically random alphanumeric password (no characters that need
 * escaping anywhere). Rejection sampling keeps the distribution uniform.
 */
export function generatePassword(length = 32): string {
  if (!Number.isInteger(length) || length < 16 || length > 256) throw new Error("Password length must be 16 to 256");
  const out: string[] = [];
  const limit = 256 - (256 % ALPHABET.length);
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    globalThis.crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < limit) out.push(ALPHABET[b % ALPHABET.length]!);
      if (out.length === length) break;
    }
  }
  return out.join("");
}

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await subtle().importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle().sign("HMAC", k, data as BufferSource));
}

/** True if SASLprep would leave this password unchanged (printable ASCII). */
export function isScramSafePassword(password: string): boolean {
  return /^[\x21-\x7e]+$/.test(password);
}

/**
 * Build a SCRAM-SHA-256 verifier that PostgreSQL accepts in
 * `CREATE/ALTER ROLE ... PASSWORD 'SCRAM-SHA-256$...'`, so the plaintext
 * password never appears in the script, the server log or pg_stat_statements.
 */
export async function scramSha256Verifier(
  password: string,
  opts: { salt?: Uint8Array; iterations?: number; forceFallback?: boolean } = {},
): Promise<string> {
  if (!isScramSafePassword(password)) {
    throw new Error("SCRAM verifier requires a printable-ASCII password (SASLprep is not implemented)");
  }
  const salt = opts.salt ?? randomBytes(16);
  const iterations = opts.iterations ?? 4096;
  const enc = new TextEncoder();
  if (opts.forceFallback || !globalThis.crypto?.subtle) {
    const salted = pbkdf2Sha256(enc.encode(password), salt, iterations);
    const storedKey = sha256(hmacSha256(salted, enc.encode("Client Key")));
    const serverKey = hmacSha256(salted, enc.encode("Server Key"));
    return `SCRAM-SHA-256$${iterations}:${toBase64(salt)}$${toBase64(storedKey)}:${toBase64(serverKey)}`;
  }
  const baseKey = await subtle().importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salted = new Uint8Array(
    await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, baseKey, 256),
  );
  const clientKey = await hmac(salted, enc.encode("Client Key"));
  const storedKey = new Uint8Array(await subtle().digest("SHA-256", clientKey as BufferSource));
  const serverKey = await hmac(salted, enc.encode("Server Key"));
  return `SCRAM-SHA-256$${iterations}:${toBase64(salt)}$${toBase64(storedKey)}:${toBase64(serverKey)}`;
}
