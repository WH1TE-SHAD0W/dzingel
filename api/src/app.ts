import { Hono } from "hono";
import type { Db } from "./db";

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null;

export function createApp(db: Db) {
const app = new Hono();

app.get("/api/groups", async (c) => c.json(await db.all("SELECT * FROM groups ORDER BY name")));

app.post("/api/groups", async (c) => {
  const name = str((await c.req.json()).name, 100);
  if (!name) return c.json({ error: "invalid name" }, 400);
  const { id } = await db.run("INSERT INTO groups (name) VALUES (?)", name);
  return c.json({ id, name }, 201);
});

// ?group=<id>&q=<keyword>
app.get("/api/quotes", async (c) => {
  const group = Number(c.req.query("group"));
  const q = `%${c.req.query("q") ?? ""}%`;
  return c.json(
    await db.all(
      `SELECT * FROM quotes WHERE group_id = ? AND (text LIKE ? OR context LIKE ?)
       ORDER BY created_at DESC, id DESC`,
      group, q, q,
    ),
  );
});

app.post("/api/quotes", async (c) => {
  const b = await c.req.json();
  const text = str(b.text, 1000);
  const context = typeof b.context === "string" ? b.context.slice(0, 2000) : "";
  if (!text || !Number.isInteger(b.group_id)) return c.json({ error: "invalid input" }, 400);
  const { id } = await db.run(
    "INSERT INTO quotes (group_id, text, context) VALUES (?, ?, ?)",
    b.group_id, text, context,
  );
  return c.json({ id }, 201);
});

app.put("/api/quotes/:id", async (c) => {
  const b = await c.req.json();
  const text = str(b.text, 1000);
  const context = typeof b.context === "string" ? b.context.slice(0, 2000) : "";
  if (!text) return c.json({ error: "invalid input" }, 400);
  const { changes } = await db.run(
    "UPDATE quotes SET text = ?, context = ? WHERE id = ?", text, context, c.req.param("id"),
  );
  return changes ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

app.delete("/api/quotes/:id", async (c) => {
  await db.run("DELETE FROM quotes WHERE id = ?", c.req.param("id"));
  return c.json({ ok: true });
});

return app;
}
