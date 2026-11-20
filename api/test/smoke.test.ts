import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { nodeDb } from "../src/node-db";

type App = ReturnType<typeof createApp>;

let app: App;

// Fresh in-memory DB (real migration SQL) for every test: no shared state.
beforeEach(() => {
  app = createApp(nodeDb(":memory:"));
});

const send = (method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const createGroup = async (name = "Test Crew") => {
  const res = await send("POST", "/api/groups", { name });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: number; name: string };
};

const createQuote = async (group_id: number, text: string, context?: string) => {
  const res = await send("POST", "/api/quotes", { group_id, text, context });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: number };
};

type Quote = { id: number; group_id: number; text: string; context: string; created_at: string };

const listQuotes = async (group: number, q?: string) => {
  const qs = new URLSearchParams({ group: String(group) });
  if (q !== undefined) qs.set("q", q);
  const res = await app.request(`/api/quotes?${qs}`);
  expect(res.status).toBe(200);
  return (await res.json()) as Quote[];
};

describe("#1 test setup", () => {
  it("builds the app on nodeDb(':memory:') with the migration applied", async () => {
    const res = await app.request("/api/groups");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("does not share state between tests (part 1: write)", async () => {
    await createGroup("Test Crew isolation");
    const res = await app.request("/api/groups");
    expect(await res.json()).toHaveLength(1);
  });

  it("does not share state between tests (part 2: fresh DB is empty)", async () => {
    const res = await app.request("/api/groups");
    expect(await res.json()).toEqual([]);
  });

  it("separate nodeDb(':memory:') instances are independent", async () => {
    const other = createApp(nodeDb(":memory:"));
    await createGroup("Test Crew A");
    const res = await other.request("/api/groups");
    expect(await res.json()).toEqual([]);
  });
});

describe("#1 smoke: groups", () => {
  it("POST /api/groups creates a group (201) and returns id + trimmed name", async () => {
    const res = await send("POST", "/api/groups", { name: "  Test Crew  " });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: number; name: string };
    expect(Number.isInteger(body.id)).toBe(true);
    expect(body.name).toBe("Test Crew");
  });

  it("GET /api/groups lists groups ordered by name", async () => {
    await createGroup("Zeta Crew");
    await createGroup("Alpha Crew");
    const res = await app.request("/api/groups");
    expect(res.status).toBe(200);
    const groups = (await res.json()) as { name: string }[];
    expect(groups.map((g) => g.name)).toEqual(["Alpha Crew", "Zeta Crew"]);
  });

  it("stores unicode / diacritics / HTML as plain text", async () => {
    const name = "džingel 🎵 <script>alert(1)</script>";
    const { id } = await createGroup(name);
    const groups = (await (await app.request("/api/groups")).json()) as { id: number; name: string }[];
    expect(groups).toEqual([{ id, name }]);
  });

  it.each([
    ["missing name", {}],
    ["empty name", { name: "" }],
    ["whitespace-only name", { name: "   " }],
    ["non-string name", { name: 42 }],
    ["name over 100 chars", { name: "a".repeat(101) }],
  ])("POST /api/groups rejects %s with 400", async (_label, body) => {
    const res = await send("POST", "/api/groups", body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid name" });
    const list = await (await app.request("/api/groups")).json();
    expect(list).toEqual([]);
  });

  it("POST /api/groups accepts a name of exactly 100 chars", async () => {
    const name = "a".repeat(100);
    const g = await createGroup(name);
    expect(g.name).toBe(name);
  });
});

describe("#1 smoke: quotes", () => {
  let groupId: number;

  beforeEach(async () => {
    groupId = (await createGroup("Test Crew")).id;
  });

  it("POST /api/quotes creates a quote (201) and GET lists it for the group", async () => {
    const { id } = await createQuote(groupId, "  synthetic quote 1  ", "synthetic context 1");
    expect(Number.isInteger(id)).toBe(true);
    const quotes = await listQuotes(groupId);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({
      id,
      group_id: groupId,
      text: "synthetic quote 1",
      context: "synthetic context 1",
    });
    expect(typeof quotes[0].created_at).toBe("string");
  });

  it("POST /api/quotes defaults context to empty string", async () => {
    await createQuote(groupId, "synthetic quote 1");
    const [q] = await listQuotes(groupId);
    expect(q.context).toBe("");
  });

  it("GET /api/quotes only returns quotes of the requested group, newest first", async () => {
    const other = (await createGroup("Other Crew")).id;
    const a = await createQuote(groupId, "synthetic quote 1");
    const b = await createQuote(groupId, "synthetic quote 2");
    await createQuote(other, "synthetic quote other");
    const quotes = await listQuotes(groupId);
    expect(quotes.map((q) => q.id)).toEqual([b.id, a.id]);
  });

  it("GET /api/quotes?q= searches text and context", async () => {
    const t = await createQuote(groupId, "synthetic banana quote", "");
    const c = await createQuote(groupId, "synthetic quote 2", "said near the banana stand");
    await createQuote(groupId, "synthetic quote 3", "unrelated");
    const hits = await listQuotes(groupId, "banana");
    expect(hits.map((q) => q.id).sort()).toEqual([t.id, c.id].sort());
    expect(await listQuotes(groupId, "no-such-keyword")).toEqual([]);
  });

  it("GET /api/quotes?q= treats SQL metacharacters as data (no injection)", async () => {
    await createQuote(groupId, "synthetic quote 1");
    const hits = await listQuotes(groupId, "' OR 1=1 --");
    expect(hits).toEqual([]);
    // table still intact
    expect(await listQuotes(groupId)).toHaveLength(1);
  });

  it("GET /api/quotes?q= matches diacritics", async () => {
    const { id } = await createQuote(groupId, "synthetic džingel quote");
    const hits = await listQuotes(groupId, "džingel");
    expect(hits.map((q) => q.id)).toEqual([id]);
  });

  it.each([
    ["missing text", (g: number) => ({ group_id: g })],
    ["empty text", (g: number) => ({ group_id: g, text: "" })],
    ["whitespace-only text", (g: number) => ({ group_id: g, text: "  \n\t " })],
    ["text over 1000 chars", (g: number) => ({ group_id: g, text: "a".repeat(1001) })],
    ["missing group_id", () => ({ text: "synthetic quote 1" })],
    ["string group_id", (g: number) => ({ group_id: String(g), text: "synthetic quote 1" })],
    ["non-integer group_id", () => ({ group_id: 1.5, text: "synthetic quote 1" })],
  ])("POST /api/quotes rejects %s with 400", async (_label, makeBody) => {
    const res = await send("POST", "/api/quotes", makeBody(groupId));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid input" });
    expect(await listQuotes(groupId)).toEqual([]);
  });

  it("POST /api/quotes accepts text of exactly 1000 chars", async () => {
    const text = "a".repeat(1000);
    await createQuote(groupId, text);
    const [q] = await listQuotes(groupId);
    expect(q.text).toBe(text);
  });

  it("POST /api/quotes truncates context to 2000 chars", async () => {
    await createQuote(groupId, "synthetic quote 1", "c".repeat(2000) + "OVERFLOW");
    const [q] = await listQuotes(groupId);
    expect(q.context).toBe("c".repeat(2000));
  });

  it("PUT /api/quotes/:id updates text and context", async () => {
    const { id } = await createQuote(groupId, "synthetic quote 1", "old context");
    const res = await send("PUT", `/api/quotes/${id}`, {
      text: "  synthetic quote 1 edited ",
      context: "new context",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [q] = await listQuotes(groupId);
    expect(q).toMatchObject({ id, text: "synthetic quote 1 edited", context: "new context" });
  });

  it("PUT /api/quotes/:id rejects invalid text with 400 and leaves the quote unchanged", async () => {
    const { id } = await createQuote(groupId, "synthetic quote 1");
    for (const text of ["", "   ", "a".repeat(1001), undefined]) {
      const res = await send("PUT", `/api/quotes/${id}`, { text });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid input" });
    }
    const [q] = await listQuotes(groupId);
    expect(q.text).toBe("synthetic quote 1");
  });

  it("PUT /api/quotes/:id returns 404 for an unknown id", async () => {
    const res = await send("PUT", "/api/quotes/99999", { text: "synthetic quote 1" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it("DELETE /api/quotes/:id removes the quote", async () => {
    const keep = await createQuote(groupId, "synthetic quote keep");
    const gone = await createQuote(groupId, "synthetic quote delete");
    const res = await send("DELETE", `/api/quotes/${gone.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await listQuotes(groupId)).map((q) => q.id)).toEqual([keep.id]);
  });
});
