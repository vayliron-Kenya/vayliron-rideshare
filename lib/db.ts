import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.VAYLIRON_DB ?? path.join(DB_DIR, "vayliron.db");

let instance: Database.Database | null = null;

/**
 * Opens (and on first call, migrates) the SQLite database.
 *
 * Next.js re-evaluates modules on hot reload, so the handle is cached on
 * globalThis to avoid piling up file descriptors in dev.
 */
export function db(): Database.Database {
  if (instance) return instance;

  const cached = (globalThis as { __vayliron_db?: Database.Database }).__vayliron_db;
  if (cached) {
    instance = cached;
    return instance;
  }

  if (DB_PATH !== ":memory:") {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }

  const conn = new Database(DB_PATH);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.exec(readSchema());

  instance = conn;
  (globalThis as { __vayliron_db?: Database.Database }).__vayliron_db = conn;
  return conn;
}

export function readSchema(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8");
}

/** Wraps a unit of work in a transaction. Rolls back if the callback throws. */
export function tx<T>(fn: (conn: Database.Database) => T): T {
  const conn = db();
  return conn.transaction(fn)(conn);
}
