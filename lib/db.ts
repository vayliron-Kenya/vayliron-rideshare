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
  migrate(conn);

  instance = conn;
  (globalThis as { __vayliron_db?: Database.Database }).__vayliron_db = conn;
  return conn;
}

export function readSchema(): string {
  return fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8");
}

/**
 * Columns added after the first release.
 *
 * `CREATE TABLE IF NOT EXISTS` silently leaves an older table alone, so a
 * database seeded before these columns existed would keep working right up
 * until something selected one. Adding them here keeps an existing local
 * database usable without a reseed.
 */
const ADDED_COLUMNS: { table: string; column: string; definition: string }[] = [
  { table: "drivers", column: "email", definition: "TEXT" },
  { table: "drivers", column: "active", definition: "INTEGER NOT NULL DEFAULT 1" },
  { table: "trips", column: "delay_minutes", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "trips", column: "cancel_reason", definition: "TEXT" },
  // The fleet became owner-submitted rather than Vayliron's own.
  { table: "vehicles", column: "owner_id", definition: "TEXT REFERENCES owners(id)" },
  { table: "vehicles", column: "body_type", definition: "TEXT NOT NULL DEFAULT 'bus'" },
  { table: "vehicles", column: "status", definition: "TEXT NOT NULL DEFAULT 'approved'" },
  { table: "vehicles", column: "submitted_at", definition: "TEXT" },
  { table: "vehicles", column: "reviewed_at", definition: "TEXT" },
  { table: "vehicles", column: "reviewed_by", definition: "TEXT" },
  { table: "vehicles", column: "review_note", definition: "TEXT" },
];

function migrate(conn: Database.Database): void {
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const columns = conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.length === 0) continue;
    if (columns.some((c) => c.name === column)) continue;
    conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** Wraps a unit of work in a transaction. Rolls back if the callback throws. */
export function tx<T>(fn: (conn: Database.Database) => T): T {
  const conn = db();
  return conn.transaction(fn)(conn);
}
