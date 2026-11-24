/** Example values and help text per engine, filled in when you switch databases. */
import type { Engine } from "@roua-dev/core";

export interface EngineDefaults {
  values: Record<string, string>;
  schemasHelp: string;
  objectsHelp: string;
  excludeHelp: string;
  allowedHelp: string;
  columnPlaceholder: string;
  scopeNote: string;
}

const sqlScope = "Tables and views that exist when you run setup. Tables created later stay closed until you run setup again.";

export const ENGINE_DEFAULTS: Record<Engine, EngineDefaults> = {
  postgresql: {
    values: { database: "appdb", schemas: "public", exclude: "public.salaries public.api_keys", objects: "", columnsDeny: "", allowedSources: "" },
    schemasHelp: "Space or comma separated.",
    objectsHelp: "schema.table, * allowed.",
    excludeHelp: "schema.table, * allowed. Space or comma separated.",
    allowedHelp: "Printed as pg_hba.conf lines to add.",
    columnPlaceholder: "public.users.national_id",
    scopeNote: "",
  },
  mysql: {
    values: { schemas: "appdb", exclude: "appdb.salaries appdb.api_keys", objects: "appdb.products appdb.categories", columnsDeny: "", allowedSources: "%" },
    schemasHelp: "The databases to read from.",
    objectsHelp: "database.table, * allowed.",
    excludeHelp: "database.table, * allowed.",
    allowedHelp: "Host pattern, as in 'user'@'host'. % means anywhere; 10.0.% narrows it.",
    columnPlaceholder: "appdb.users.national_id",
    scopeNote: sqlScope,
  },
  mariadb: {
    values: { schemas: "appdb", exclude: "appdb.salaries appdb.api_keys", objects: "appdb.products appdb.categories", columnsDeny: "", allowedSources: "%" },
    schemasHelp: "The databases to read from.",
    objectsHelp: "database.table, * allowed.",
    excludeHelp: "database.table, * allowed.",
    allowedHelp: "Host pattern, as in 'user'@'host'. % means anywhere; 10.0.% narrows it.",
    columnPlaceholder: "appdb.users.national_id",
    scopeNote: sqlScope,
  },
  sqlserver: {
    values: { database: "appdb", schemas: "dbo", exclude: "dbo.salaries dbo.api_keys", objects: "dbo.products dbo.categories", columnsDeny: "" },
    schemasHelp: "Schemas inside the database, usually dbo.",
    objectsHelp: "schema.table, * allowed.",
    excludeHelp: "schema.table, * allowed.",
    allowedHelp: "",
    columnPlaceholder: "dbo.users.national_id",
    scopeNote: sqlScope,
  },
  oracle: {
    values: { schemas: "APP", exclude: "APP.SALARIES APP.API_KEYS", objects: "APP.PRODUCTS APP.CATEGORIES", columnsDeny: "" },
    schemasHelp: "The users (schemas) that own the tables.",
    objectsHelp: "OWNER.TABLE, * allowed.",
    excludeHelp: "OWNER.TABLE, * allowed.",
    allowedHelp: "",
    columnPlaceholder: "APP.USERS.NATIONAL_ID",
    scopeNote: "Oracle cannot grant read on single columns, so tables with hidden columns are skipped and listed. Expose them through a view.",
  },
  mongodb: {
    values: { database: "appdb", exclude: "salaries api_keys", objects: "products categories", allowedSources: "" },
    schemasHelp: "",
    objectsHelp: "Collection names, * allowed.",
    excludeHelp: "Collection names, * allowed.",
    allowedHelp: "CIDR ranges, for example 10.0.0.0/24. Leave empty to allow any client.",
    columnPlaceholder: "",
    scopeNote: "Collections that exist when you run setup. MongoDB cannot hide single fields: leave out collections with secrets, or list a view that $projects them away.",
  },
  redis: {
    values: { objects: "app:* cache:*" },
    schemasHelp: "",
    objectsHelp: "Key patterns the account may read, for example app:*. Avoid * (every key).",
    excludeHelp: "",
    allowedHelp: "",
    columnPlaceholder: "",
    scopeNote: "Read commands only, on these key patterns only.",
  },
  snowflake: {
    values: { database: "ANALYTICS", schemas: "PUBLIC", exclude: "PUBLIC.SALARIES", objects: "PUBLIC.PRODUCTS PUBLIC.CATEGORIES", columnsDeny: "", allowedSources: "" },
    schemasHelp: "Schemas inside the database.",
    objectsHelp: "SCHEMA.TABLE, * allowed.",
    excludeHelp: "SCHEMA.TABLE, * allowed.",
    allowedHelp: "CIDR ranges for a network policy. Leave empty to allow any IP.",
    columnPlaceholder: "PUBLIC.USERS.NATIONAL_ID",
    scopeNote: "Point-in-time grants, no future grants. Tables with secret-looking columns are skipped.",
  },
  bigquery: {
    values: { database: "my-project-id", schemas: "analytics", exclude: "analytics.salaries", objects: "analytics.products analytics.categories", columnsDeny: "", location: "US" },
    schemasHelp: "Datasets in the project.",
    objectsHelp: "dataset.table, * allowed.",
    excludeHelp: "dataset.table, * allowed.",
    allowedHelp: "",
    columnPlaceholder: "analytics.users.national_id",
    scopeNote: "Table-level grants for tables that exist now. Tables with secret-looking columns are skipped.",
  },
};
