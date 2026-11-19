import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Db } from "./db";

export function nodeDb(file = process.env.DB_FILE ?? "dzingel.sqlite"): Db {
  const sqlite = new DatabaseSync(file);
  sqlite.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
  return {
    async all(sql, ...p) {
      return sqlite.prepare(sql).all(...(p as never[])) as never;
    },
    async run(sql, ...p) {
      const r = sqlite.prepare(sql).run(...(p as never[]));
      return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
  };
}
