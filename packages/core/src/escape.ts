/**
 * PostgreSQL identifier and literal escaping.
 *
 * This file is security-critical: every name and value that reaches generated
 * SQL passes through here. Identifiers are validated against a strict pattern
 * and then quoted anyway; literals are escaped so they are safe whatever
 * `standard_conforming_strings` is set to.
 */

import { IDENTIFIER_RE } from "./constants.js";

export class RouaInputError extends Error {
  override name = "RouaInputError";
}

/** Throw unless `name` is a plain identifier we are willing to generate SQL for. */
export function assertIdentifier(name: string, what = "identifier"): string {
  if (typeof name !== "string" || !IDENTIFIER_RE.test(name)) {
    throw new RouaInputError(
      `Invalid ${what} ${JSON.stringify(name)}: use letters, digits, _ or $, start with a letter or _, at most 63 characters.`,
    );
  }
  return name;
}

/** Quote a validated identifier: abc -> "abc". */
export function quoteIdent(name: string, what?: string): string {
  assertIdentifier(name, what);
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Quote any string as a SQL literal.
 * - Rejects NUL (PostgreSQL text cannot contain it).
 * - Doubles single quotes.
 * - If the value contains a backslash, emits an E'' literal with doubled
 *   backslashes, which means the same thing whether or not
 *   standard_conforming_strings is on.
 */
export function quoteLiteral(value: string): string {
  if (typeof value !== "string") throw new RouaInputError("Literal must be a string");
  if (value.includes("\u0000")) throw new RouaInputError("Literal must not contain NUL characters");
  const body = value.replace(/'/g, "''");
  if (body.includes("\\")) return `E'${body.replace(/\\/g, "\\\\")}'`;
  return `'${body}'`;
}

/** ARRAY['a','b']::text[] (or an empty text[]). */
export function textArray(values: readonly string[]): string {
  if (values.length === 0) return "ARRAY[]::text[]";
  return `ARRAY[${values.map(quoteLiteral).join(", ")}]::text[]`;
}

/** The dollar-quote tag used for DO blocks. Literals inside are checked against it. */
export const DOLLAR_TAG = "$roua$";

/** Throw if a value could terminate a $roua$ dollar-quoted body. */
export function assertNoDollarTag(value: string): void {
  if (value.includes(DOLLAR_TAG)) throw new RouaInputError(`Value must not contain ${DOLLAR_TAG}`);
}

/**
 * Convert a scope pattern like "public.*" or "sales.order_*" into an anchored
 * POSIX regex that matches "schema.table".
 */
export function globToRegex(pattern: string): string {
  if (!/^[A-Za-z0-9_$*]+\.[A-Za-z0-9_$*]+$/.test(pattern)) {
    throw new RouaInputError(`Invalid object pattern ${JSON.stringify(pattern)}: expected schema.table, * allowed`);
  }
  const escaped = pattern.replace(/[$.]/g, (c) => `\\${c}`).replace(/\*/g, "[^.]*");
  return `^${escaped}$`;
}
