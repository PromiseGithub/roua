/**
 * Minimal, dependency-free GraphQL operation-type detector.
 *
 * It does not validate documents; it only finds top-level operation
 * definitions and their types, skipping strings, block strings and comments.
 * Anything it cannot parse returns null, and callers treat null as "deny".
 */

export type OperationType = "query" | "mutation" | "subscription";

interface Op {
  type: OperationType;
  name: string | null;
}

const NAME_START = /[_A-Za-z]/;
const NAME_CHAR = /[_0-9A-Za-z]/;

export function parseOperations(source: string): Op[] | null {
  if (typeof source !== "string" || source.length > 1_000_000) return null;
  const ops: Op[] = [];
  let i = 0;
  let braces = 0;
  let parens = 0;
  let pending: { kind: OperationType | "fragment"; name: string | null; expectName: boolean } | null = null;
  const n = source.length;

  while (i < n) {
    const ch = source[i]!;
    if (ch === "#") {
      while (i < n && source[i] !== "\n" && source[i] !== "\r") i++;
      continue;
    }
    if (ch === '"') {
      if (source.startsWith('"""', i)) {
        i += 3;
        let closed = false;
        while (i < n) {
          if (source[i] === "\\" && source.startsWith('\\"""', i)) {
            i += 4;
            continue;
          }
          if (source.startsWith('"""', i)) {
            i += 3;
            closed = true;
            break;
          }
          i++;
        }
        if (!closed) return null;
      } else {
        i++;
        let closed = false;
        while (i < n) {
          const c = source[i]!;
          if (c === "\\") {
            i += 2;
            continue;
          }
          if (c === "\n" || c === "\r") return null;
          i++;
          if (c === '"') {
            closed = true;
            break;
          }
        }
        if (!closed) return null;
      }
      if (pending) pending.expectName = false;
      continue;
    }
    if (ch === "{") {
      if (braces === 0 && parens === 0) {
        if (!pending) ops.push({ type: "query", name: null }); // shorthand { ... }
        else if (pending.kind !== "fragment") ops.push({ type: pending.kind, name: pending.name });
        pending = null;
      }
      braces++;
      i++;
      continue;
    }
    if (ch === "}") {
      braces--;
      if (braces < 0) return null;
      i++;
      continue;
    }
    if (ch === "(") {
      parens++;
      i++;
      continue;
    }
    if (ch === ")") {
      parens--;
      if (parens < 0) return null;
      i++;
      continue;
    }
    if (NAME_START.test(ch)) {
      let j = i + 1;
      while (j < n && NAME_CHAR.test(source[j]!)) j++;
      const word = source.slice(i, j);
      i = j;
      if (braces === 0 && parens === 0) {
        if (pending?.expectName) {
          pending.name = word;
          pending.expectName = false;
        } else if (!pending && (word === "query" || word === "mutation" || word === "subscription" || word === "fragment")) {
          pending = { kind: word, name: null, expectName: true };
        } else if (!pending) {
          return null; // unexpected token at top level (e.g. "extend", type definitions)
        }
      }
      continue;
    }
    if (pending && braces === 0 && parens === 0 && ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r" && ch !== ",") {
      pending.expectName = false; // e.g. "$", "@", ":" before the selection set
    }
    i++;
  }
  if (braces !== 0 || parens !== 0 || pending) return null;
  return ops;
}

/**
 * The operation types that would execute for this request, or null if unknown.
 * With an operationName, only that operation; otherwise every operation in the
 * document (a server executes one, but we fail closed).
 */
export function operationTypes(query: string, operationName?: string | null): OperationType[] | null {
  const ops = parseOperations(query);
  if (!ops || ops.length === 0) return null;
  if (operationName) {
    const match = ops.filter((o) => o.name === operationName);
    return match.length ? match.map((o) => o.type) : null;
  }
  return ops.map((o) => o.type);
}

/** True only when every operation in every request of the payload is a query. */
export function isReadOnlyGraphQL(payload: unknown): boolean {
  const requests = Array.isArray(payload) ? payload : [payload];
  if (requests.length === 0) return false;
  return requests.every((r) => {
    if (!r || typeof r !== "object") return false;
    const { query, operationName } = r as { query?: unknown; operationName?: unknown };
    if (typeof query !== "string") return false; // persisted queries etc.: unknown, deny
    const types = operationTypes(query, typeof operationName === "string" ? operationName : null);
    return types !== null && types.every((t) => t === "query");
  });
}
