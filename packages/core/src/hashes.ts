/**
 * Pure-JS hashes used to put password *verifiers* (never plaintext) into
 * generated scripts for engines that accept them:
 *
 * - MySQL 8+    caching_sha2_password  ($A$005$ + SHA-256-crypt, 5000 rounds)
 * - MariaDB     mysql_native_password  (*HEX(SHA1(SHA1(password))))
 * - SQL Server  CREATE LOGIN ... HASHED (0x0200 + salt + SHA-512)
 * - Redis       ACL SETUSER #<sha256 hex>
 *
 * Synchronous and dependency-free so they run in Node, browsers and workers,
 * including insecure contexts without crypto.subtle. Tested against node:crypto
 * and published test vectors.
 */
import { sha256 } from "./sha256.js";

const enc = new TextEncoder();

export const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ---------------------------------------------------------------- SHA-1

export function sha1(data: Uint8Array): Uint8Array {
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = data.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(padded.length - 4, bits >>> 0);
  const w = new Uint32Array(80);
  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!, 1);
    let [a, b, c, d, e] = h as [number, number, number, number, number];
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20 ? [(b & c) | (~b & d), 0x5a827999] : i < 40 ? [b ^ c ^ d, 0x6ed9eba1] : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6];
      const t = (rotl(a, 5) + f + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30) >>> 0;
      b = a;
      a = t;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  h.forEach((x, i) => ov.setUint32(i * 4, x));
  return out;
}

// ---------------------------------------------------------------- SHA-512 (BigInt)

const K512 = [
  "428a2f98d728ae22", "7137449123ef65cd", "b5c0fbcfec4d3b2f", "e9b5dba58189dbbc", "3956c25bf348b538", "59f111f1b605d019",
  "923f82a4af194f9b", "ab1c5ed5da6d8118", "d807aa98a3030242", "12835b0145706fbe", "243185be4ee4b28c", "550c7dc3d5ffb4e2",
  "72be5d74f27b896f", "80deb1fe3b1696b1", "9bdc06a725c71235", "c19bf174cf692694", "e49b69c19ef14ad2", "efbe4786384f25e3",
  "0fc19dc68b8cd5b5", "240ca1cc77ac9c65", "2de92c6f592b0275", "4a7484aa6ea6e483", "5cb0a9dcbd41fbd4", "76f988da831153b5",
  "983e5152ee66dfab", "a831c66d2db43210", "b00327c898fb213f", "bf597fc7beef0ee4", "c6e00bf33da88fc2", "d5a79147930aa725",
  "06ca6351e003826f", "142929670a0e6e70", "27b70a8546d22ffc", "2e1b21385c26c926", "4d2c6dfc5ac42aed", "53380d139d95b3df",
  "650a73548baf63de", "766a0abb3c77b2a8", "81c2c92e47edaee6", "92722c851482353b", "a2bfe8a14cf10364", "a81a664bbc423001",
  "c24b8b70d0f89791", "c76c51a30654be30", "d192e819d6ef5218", "d69906245565a910", "f40e35855771202a", "106aa07032bbd1b8",
  "19a4c116b8d2d0c8", "1e376c085141ab53", "2748774cdf8eeb99", "34b0bcb5e19b48a8", "391c0cb3c5c95a63", "4ed8aa4ae3418acb",
  "5b9cca4f7763e373", "682e6ff3d6b2b8a3", "748f82ee5defb2fc", "78a5636f43172f60", "84c87814a1f0ab72", "8cc702081a6439ec",
  "90befffa23631e28", "a4506cebde82bde9", "bef9a3f7b2c67915", "c67178f2e372532b", "ca273eceea26619c", "d186b8c721c0c207",
  "eada7dd6cde0eb1e", "f57d4f7fee6ed178", "06f067aa72176fba", "0a637dc5a2c898a6", "113f9804bef90dae", "1b710b35131c471b",
  "28db77f523047d84", "32caab7b40c72493", "3c9ebe0a15c9bebc", "431d67c49c100d4c", "4cc5d4becb3e42b6", "597f299cfc657e2a",
  "5fcb6fab3ad6faec", "6c44198c4a475817",
].map((x) => BigInt("0x" + x));

export function sha512(data: Uint8Array): Uint8Array {
  const M = (1n << 64n) - 1n;
  const rotr = (x: bigint, n: bigint) => ((x >> n) | (x << (64n - n))) & M;
  const h = [
    0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
    0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n,
  ];
  const padded = new Uint8Array(((data.length + 17 + 127) >> 7) << 7);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = BigInt(data.length) * 8n;
  view.setBigUint64(padded.length - 8, bits);
  const w: bigint[] = new Array(80);
  for (let off = 0; off < padded.length; off += 128) {
    for (let i = 0; i < 16; i++) w[i] = view.getBigUint64(off + i * 8);
    for (let i = 16; i < 80; i++) {
      const s0 = rotr(w[i - 15]!, 1n) ^ rotr(w[i - 15]!, 8n) ^ (w[i - 15]! >> 7n);
      const s1 = rotr(w[i - 2]!, 19n) ^ rotr(w[i - 2]!, 61n) ^ (w[i - 2]! >> 6n);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) & M;
    }
    let [a, b, c, d, e, f, g, hh] = h as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
    for (let i = 0; i < 80; i++) {
      const S1 = rotr(e, 14n) ^ rotr(e, 18n) ^ rotr(e, 41n);
      const ch = (e & f) ^ (~e & M & g);
      const t1 = (hh + S1 + ch + K512[i]! + w[i]!) & M;
      const S0 = rotr(a, 28n) ^ rotr(a, 34n) ^ rotr(a, 39n);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) & M;
      hh = g; g = f; f = e; e = (d + t1) & M; d = c; c = b; b = a; a = (t1 + t2) & M;
    }
    h[0] = (h[0]! + a) & M; h[1] = (h[1]! + b) & M; h[2] = (h[2]! + c) & M; h[3] = (h[3]! + d) & M;
    h[4] = (h[4]! + e) & M; h[5] = (h[5]! + f) & M; h[6] = (h[6]! + g) & M; h[7] = (h[7]! + hh) & M;
  }
  const out = new Uint8Array(64);
  const ov = new DataView(out.buffer);
  h.forEach((x, i) => ov.setBigUint64(i * 8, x));
  return out;
}

// ---------------------------------------------------------------- SHA-256-crypt (Drepper)

const B64 = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * The SHA-256 variant of Ulrich Drepper's SHA-crypt, returning only the
 * 43-character hash part. `maxSaltLength` is 16 in the original and 20 in MySQL.
 */
export function sha256Crypt(password: string, salt: string, rounds = 5000, maxSaltLength = 16): string {
  const p = enc.encode(password);
  const s = enc.encode(salt).slice(0, maxSaltLength);
  const b = sha256(concat(p, s, p));
  const aParts: Uint8Array[] = [p, s];
  for (let n = p.length; n > 0; n -= 32) aParts.push(b.slice(0, Math.min(32, n)));
  for (let n = p.length; n > 0; n >>= 1) aParts.push(n & 1 ? b : p);
  let a = sha256(concat(...aParts));
  const dpParts: Uint8Array[] = [];
  for (let i = 0; i < p.length; i++) dpParts.push(p);
  const dp = sha256(concat(...dpParts));
  const P = new Uint8Array(p.length);
  for (let i = 0; i < p.length; i++) P[i] = dp[i % 32]!;
  const dsParts: Uint8Array[] = [];
  for (let i = 0; i < 16 + a[0]!; i++) dsParts.push(s);
  const ds = sha256(concat(...dsParts));
  const S = ds.slice(0, s.length);
  for (let i = 0; i < rounds; i++) {
    const parts: Uint8Array[] = [];
    parts.push(i & 1 ? P : a);
    if (i % 3) parts.push(S);
    if (i % 7) parts.push(P);
    parts.push(i & 1 ? a : P);
    a = sha256(concat(...parts));
  }
  let out = "";
  const b64 = (b2: number, b1: number, b0: number, n: number) => {
    let w = (b2 << 16) | (b1 << 8) | b0;
    for (let i = 0; i < n; i++) {
      out += B64[w & 0x3f];
      w >>= 6;
    }
  };
  const order = [
    [0, 10, 20], [21, 1, 11], [12, 22, 2], [3, 13, 23], [24, 4, 14],
    [15, 25, 5], [6, 16, 26], [27, 7, 17], [18, 28, 8], [9, 19, 29],
  ];
  for (const [x, y, z] of order) b64(a[x!]!, a[y!]!, a[z!]!, 4);
  b64(0, a[31]!, a[30]!, 3);
  return out;
}

// ---------------------------------------------------------------- engine verifiers

const SALT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomSalt(n: number): string {
  const limit = 256 - (256 % SALT_ALPHABET.length);
  const buf = new Uint8Array(n * 2);
  let s = "";
  while (s.length < n) {
    globalThis.crypto.getRandomValues(buf);
    for (const x of buf) if (x < limit && s.length < n) s += SALT_ALPHABET[x % SALT_ALPHABET.length];
  }
  return s;
}

/**
 * MySQL 8+ caching_sha2_password authentication string, for
 * `CREATE USER ... IDENTIFIED WITH caching_sha2_password AS '<this>'`.
 * The salt is alphanumeric so the string is safe in a SQL literal.
 */
export function mysqlCachingSha2Hash(password: string, salt = randomSalt(20)): string {
  if (!/^[A-Za-z0-9]{20}$/.test(salt)) throw new Error("salt must be 20 alphanumeric characters");
  return `$A$005$${salt}${sha256Crypt(password, salt, 5000, 20)}`;
}

/** mysql_native_password hash (MariaDB, older MySQL): *UPPER(HEX(SHA1(SHA1(pw)))). */
export function mysqlNativeHash(password: string): string {
  return "*" + toHex(sha1(sha1(enc.encode(password)))).toUpperCase();
}

/** SQL Server 2012+ password hash for CREATE LOGIN ... WITH PASSWORD = 0x... HASHED. */
export function sqlServerPasswordHash(password: string, salt?: Uint8Array): string {
  const s = salt ?? globalThis.crypto.getRandomValues(new Uint8Array(4));
  if (s.length !== 4) throw new Error("salt must be 4 bytes");
  const utf16 = new Uint8Array(password.length * 2);
  for (let i = 0; i < password.length; i++) {
    const c = password.charCodeAt(i);
    utf16[i * 2] = c & 0xff;
    utf16[i * 2 + 1] = c >> 8;
  }
  return "0x0200" + toHex(s).toUpperCase() + toHex(sha512(concat(utf16, s))).toUpperCase();
}

/** Redis ACL password hash: lowercase hex SHA-256, used as #<hash>. */
export function redisPasswordHash(password: string): string {
  return toHex(sha256(enc.encode(password)));
}
