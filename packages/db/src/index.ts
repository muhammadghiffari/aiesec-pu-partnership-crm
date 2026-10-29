/**
 * @crm/db — schema, repositories and migrations.
 *
 * SCHEMA-LOCKED: the PostgreSQL schema and typed migrations are owned by M1-01 and
 * subsequent appended migrations (one schema-changing PR at a time). No ORM and no second
 * schema definition.
 */

export const DB_PACKAGE_NAME = "@crm/db" as const;

export * from "./audit-store";
export * from "./migrate";
export * from "./migrations/index";
export * from "./partners";
export * from "./sessions";
