import type { Db } from "./db";

export function d1Db(d1: D1Database): Db {
  return {
    async all(sql, ...p) {
      return (await d1.prepare(sql).bind(...p).all()).results as never;
    },
    async run(sql, ...p) {
      const { meta } = await d1.prepare(sql).bind(...p).run();
      return { id: meta.last_row_id, changes: meta.changes };
    },
  };
}
