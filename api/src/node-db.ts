import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import type { Db } from "./db";

const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);

/** Apply every `NNNN_*.sql` migration not yet recorded in `schema_migrations`, in order. */
export function migrate(sqlite: DatabaseSync): void {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const applied = new Set(
    (sqlite.prepare("SELECT name FROM schema_migrations").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );
  const pending = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f) && !applied.has(f))
    .sort();
  for (const name of pending) {
    sqlite.exec("BEGIN");
    try {
      sqlite.exec(readFileSync(new URL(name, MIGRATIONS_DIR), "utf8"));
      sqlite.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(name);
      sqlite.exec("COMMIT");
    } catch (err) {
      sqlite.exec("ROLLBACK");
      throw err;
    }
  }
}

/** node:sqlite adapter. `sqlite` is exposed so Better Auth can share the same connection. */
export type NodeDb = Db & { sqlite: DatabaseSync };

export function nodeDb(file = process.env.DB_FILE ?? "dzingel.sqlite"): NodeDb {
  const sqlite = new DatabaseSync(file);
  migrate(sqlite);
  return {
    sqlite,
    async all(sql, ...p) {
      return sqlite.prepare(sql).all(...(p as never[])) as never;
    },
    async run(sql, ...p) {
      const r = sqlite.prepare(sql).run(...(p as never[]));
      return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
  };
}
