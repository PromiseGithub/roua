import pg from "pg";
import type { Executor } from "@roua/core";

export class UsageError extends Error {
  override name = "UsageError";
}

/**
 * Connection strings come ONLY from environment variables (named by flags),
 * never from argv, so they do not end up in shell history or `ps` output.
 */
export function urlFromEnv(envName: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName)) throw new UsageError(`Invalid environment variable name: ${envName}`);
  const url = process.env[envName];
  if (!url) throw new UsageError(`Set ${envName} to a PostgreSQL connection string (postgres://user:pass@host:5432/db).`);
  return url;
}

export interface Connection {
  exec: Executor;
  script: (sql: string) => Promise<void>;
  close: () => Promise<void>;
  client: pg.Client;
}

export async function connect(url: string, opts: { onNotice?: (msg: string) => void } = {}): Promise<Connection> {
  const client = new pg.Client({ connectionString: url, application_name: "roua-cli" });
  if (opts.onNotice) client.on("notice", (n) => opts.onNotice!(n.message ?? String(n)));
  await client.connect();
  return {
    client,
    exec: async (sql) => (await client.query(sql)).rows as Record<string, unknown>[],
    script: async (sql) => {
      await client.query(sql);
    },
    close: () => client.end(),
  };
}

/** Same server and database as `adminUrl`, but logging in as another user. */
export function urlForUser(adminUrl: string, user: string, password: string): string {
  const u = new URL(adminUrl);
  u.username = encodeURIComponent(user);
  u.password = encodeURIComponent(password);
  return u.toString();
}

/** Remove credentials from a URL before printing it. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "****";
    return u.toString();
  } catch {
    return "<connection string>";
  }
}
