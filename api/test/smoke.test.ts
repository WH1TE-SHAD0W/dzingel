// #1 smoke tests, updated to the authenticated contract from #2/#3: every data route needs a
// session cookie; bad ids/JSON/missing group answer 400; unknown or non-member resources 404.
import { beforeEach, describe, expect, it } from "vitest";
import { harness, makeApp, type Harness, type User } from "./helpers";

let h: Harness;
let alex: User;

// Fresh in-memory DB (real migration SQL) and a fresh signed-in user for every test.
beforeEach(async () => {
  h = harness();
  alex = await h.register("alex.dev");
});

const groups = async (u: User = alex) => (await (await h.as(u).get("/api/groups")).json()) as unknown[];

describe("#1 test setup", () => {
  it("builds the app on nodeDb(':memory:') with the migrations applied", async () => {
    const res = await h.as(alex).get("/api/groups");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("does not share state between tests (part 1: write)", async () => {
    await h.createGroup(alex, "Test Crew isolation");
    expect(await groups()).toHaveLength(1);
  });

  it("does not share state between tests (part 2: fresh DB is empty)", async () => {
    expect(await groups()).toEqual([]);
  });

  it("separate nodeDb(':memory:') instances are independent", async () => {
    await h.createGroup(alex, "Test Crew A");
    const other = harness();
    // The same username is free in the other DB, and that user sees no groups.
    const alex2 = await other.register("alex.dev");
    expect(await (await other.as(alex2).get("/api/groups")).json()).toEqual([]);
  });

  it("makeApp() without a session answers 401 on data routes", async () => {
    const { app } = makeApp();
    expect((await app.request("/api/groups")).status).toBe(401);
  });
});

describe("#1 smoke: groups", () => {
  it("POST /api/groups creates a group (201) and returns id + trimmed name", async () => {
    const res = await h.as(alex).post("/api/groups", { name: "  Test Crew  " });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: number; name: string };
    expect(Number.isInteger(body.id)).toBe(true);
    expect(body.name).toBe("Test Crew");
  });

  it("GET /api/groups lists groups ordered by name", async () => {
    await h.createGroup(alex, "Zeta Crew");
    await h.createGroup(alex, "Alpha Crew");
    const list = (await groups()) as { name: string }[];
    expect(list.map((g) => g.name)).toEqual(["Alpha Crew", "Zeta Crew"]);
  });

  it("stores unicode / diacritics / HTML as plain text", async () => {
    const name = "džingel 🎵 <script>alert(1)</script>";
    const { id } = await h.createGroup(alex, name);
    expect(await groups()).toEqual([{ id, name }]);
  });

  it.each([
    ["missing name", {}],
    ["empty name", { name: "" }],
    ["whitespace-only name", { name: "   " }],
    ["non-string name", { name: 42 }],
    ["name over 100 chars", { name: "a".repeat(101) }],
  ])("POST /api/groups rejects %s with 400", async (_label, body) => {
    const res = await h.as(alex).post("/api/groups", body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid name" });
    expect(await groups()).toEqual([]);
  });

  it("POST /api/groups rejects a non-JSON body with 400", async () => {
    const res = await h.req("POST", "/api/groups", {
      cookie: alex.cookie,
      headers: { "content-type": "text/plain" },
      body: { name: "Test Crew" },
    });
    expect(res.status).toBe(400);
    expect(await groups()).toEqual([]);
  });

  it("POST /api/groups accepts a name of exactly 100 chars", async () => {
    const name = "a".repeat(100);
    expect((await h.createGroup(alex, name)).name).toBe(name);
  });
});

describe("#1 smoke: quotes", () => {
  let groupId: number;

  beforeEach(async () => {
    groupId = (await h.createGroup(alex, "Test Crew")).id;
  });

  it("POST /api/quotes creates a quote (201) and GET lists it for the group", async () => {
    const { id } = await h.createQuote(alex, groupId, "  synthetic quote 1  ", "synthetic context 1");
    expect(Number.isInteger(id)).toBe(true);
    const quotes = await h.listQuotes(alex, groupId);
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
    await h.createQuote(alex, groupId, "synthetic quote 1");
    const [q] = await h.listQuotes(alex, groupId);
    expect(q.context).toBe("");
  });

  it("GET /api/quotes only returns quotes of the requested group, newest first", async () => {
    const other = (await h.createGroup(alex, "Other Crew")).id;
    const a = await h.createQuote(alex, groupId, "synthetic quote 1");
    const b = await h.createQuote(alex, groupId, "synthetic quote 2");
    await h.createQuote(alex, other, "synthetic quote other");
    const quotes = await h.listQuotes(alex, groupId);
    expect(quotes.map((q) => q.id)).toEqual([b.id, a.id]);
  });

  it("GET /api/quotes?q= searches text and context", async () => {
    const t = await h.createQuote(alex, groupId, "synthetic banana quote", "");
    const c = await h.createQuote(alex, groupId, "synthetic quote 2", "said near the banana stand");
    await h.createQuote(alex, groupId, "synthetic quote 3", "unrelated");
    const hits = await h.listQuotes(alex, groupId, "banana");
    expect(hits.map((q) => q.id).sort()).toEqual([t.id, c.id].sort());
    expect(await h.listQuotes(alex, groupId, "no-such-keyword")).toEqual([]);
  });

  it("GET /api/quotes?q= treats SQL metacharacters as data (no injection)", async () => {
    await h.createQuote(alex, groupId, "synthetic quote 1");
    expect(await h.listQuotes(alex, groupId, "' OR 1=1 --")).toEqual([]);
    expect(await h.listQuotes(alex, groupId)).toHaveLength(1); // table still intact
  });

  it("GET /api/quotes?q= treats LIKE wildcards % _ and \\ literally (#3 change)", async () => {
    const pct = await h.createQuote(alex, groupId, "synthetic 100% quote");
    const und = await h.createQuote(alex, groupId, "synthetic snake_case quote");
    const bsl = await h.createQuote(alex, groupId, "synthetic back\\slash quote");
    await h.createQuote(alex, groupId, "synthetic plain quote");
    expect((await h.listQuotes(alex, groupId, "%")).map((q) => q.id)).toEqual([pct.id]);
    expect((await h.listQuotes(alex, groupId, "_")).map((q) => q.id)).toEqual([und.id]);
    expect((await h.listQuotes(alex, groupId, "\\")).map((q) => q.id)).toEqual([bsl.id]);
  });

  it("GET /api/quotes?q= matches diacritics", async () => {
    const { id } = await h.createQuote(alex, groupId, "synthetic džingel quote");
    expect((await h.listQuotes(alex, groupId, "džingel")).map((q) => q.id)).toEqual([id]);
  });

  it("GET /api/quotes?q= accepts exactly 100 chars and rejects 101 with 400 (#3 change)", async () => {
    expect((await h.as(alex).get(`/api/quotes?group=${groupId}&q=${"a".repeat(100)}`)).status).toBe(200);
    const res = await h.as(alex).get(`/api/quotes?group=${groupId}&q=${"a".repeat(101)}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid input" });
  });

  it.each([
    ["missing group", "/api/quotes"],
    ["empty group", "/api/quotes?group="],
    ["non-numeric group", "/api/quotes?group=abc"],
    ["negative group", "/api/quotes?group=-1"],
    ["zero group", "/api/quotes?group=0"],
    ["fractional group", "/api/quotes?group=1.5"],
  ])("GET /api/quotes with %s answers 400 (#3 change)", async (_label, path) => {
    const res = await h.as(alex).get(path);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid input" });
  });

  it("GET /api/quotes for an unknown group answers 404 (#3 change)", async () => {
    const res = await h.as(alex).get("/api/quotes?group=99999");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it.each([
    ["missing text", (g: number) => ({ group_id: g })],
    ["empty text", (g: number) => ({ group_id: g, text: "" })],
    ["whitespace-only text", (g: number) => ({ group_id: g, text: "  \n\t " })],
    ["text over 1000 chars", (g: number) => ({ group_id: g, text: "a".repeat(1001) })],
    ["missing group_id", () => ({ text: "synthetic quote 1" })],
    ["string group_id", (g: number) => ({ group_id: String(g), text: "synthetic quote 1" })],
    ["non-integer group_id", () => ({ group_id: 1.5, text: "synthetic quote 1" })],
    ["negative group_id", () => ({ group_id: -1, text: "synthetic quote 1" })],
  ])("POST /api/quotes rejects %s with 400", async (_label, makeBody) => {
    const res = await h.as(alex).post("/api/quotes", makeBody(groupId));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid input" });
    expect(await h.listQuotes(alex, groupId)).toEqual([]);
  });

  it.each([
    ["malformed JSON", "application/json", "{not json"],
    ["text/plain body", "text/plain", JSON.stringify({ group_id: 1, text: "synthetic quote 1" })],
    ["JSON array", "application/json", "[]"],
  ])("POST /api/quotes rejects %s with 400 (#3 change)", async (_label, type, raw) => {
    const res = await h.app.request("/api/quotes", {
      method: "POST",
      headers: { "content-type": type, cookie: alex.cookie },
      body: raw,
    });
    expect(res.status).toBe(400);
    expect(await h.listQuotes(alex, groupId)).toEqual([]);
  });

  it("POST /api/quotes accepts text of exactly 1000 chars", async () => {
    const text = "a".repeat(1000);
    await h.createQuote(alex, groupId, text);
    const [q] = await h.listQuotes(alex, groupId);
    expect(q.text).toBe(text);
  });

  it("POST /api/quotes truncates context to 2000 chars", async () => {
    await h.createQuote(alex, groupId, "synthetic quote 1", "c".repeat(2000) + "OVERFLOW");
    const [q] = await h.listQuotes(alex, groupId);
    expect(q.context).toBe("c".repeat(2000));
  });

  it("POST /api/quotes for an unknown group answers 404", async () => {
    const res = await h.as(alex).post("/api/quotes", { group_id: 99999, text: "synthetic quote 1" });
    expect(res.status).toBe(404);
  });

  it("PUT /api/quotes/:id updates text and context", async () => {
    const { id } = await h.createQuote(alex, groupId, "synthetic quote 1", "old context");
    const res = await h.as(alex).put(`/api/quotes/${id}`, {
      text: "  synthetic quote 1 edited ",
      context: "new context",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [q] = await h.listQuotes(alex, groupId);
    expect(q).toMatchObject({ id, text: "synthetic quote 1 edited", context: "new context" });
  });

  it("PUT /api/quotes/:id rejects invalid text with 400 and leaves the quote unchanged", async () => {
    const { id } = await h.createQuote(alex, groupId, "synthetic quote 1");
    for (const text of ["", "   ", "a".repeat(1001), undefined]) {
      const res = await h.as(alex).put(`/api/quotes/${id}`, { text });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid input" });
    }
    const [q] = await h.listQuotes(alex, groupId);
    expect(q.text).toBe("synthetic quote 1");
  });

  it("PUT /api/quotes/:id returns 404 for an unknown id", async () => {
    const res = await h.as(alex).put("/api/quotes/99999", { text: "synthetic quote 1" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it.each(["abc", "0", "-1", "1.5", "1e3"])(
    "PUT and DELETE /api/quotes/%s answer 400 for a malformed id (#3 change)",
    async (bad) => {
      expect((await h.as(alex).put(`/api/quotes/${bad}`, { text: "synthetic quote 1" })).status).toBe(400);
      expect((await h.as(alex).del(`/api/quotes/${bad}`)).status).toBe(400);
    },
  );

  it("DELETE /api/quotes/:id removes the quote", async () => {
    const keep = await h.createQuote(alex, groupId, "synthetic quote keep");
    const gone = await h.createQuote(alex, groupId, "synthetic quote delete");
    const res = await h.as(alex).del(`/api/quotes/${gone.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await h.listQuotes(alex, groupId)).map((q) => q.id)).toEqual([keep.id]);
  });

  it("DELETE /api/quotes/:id answers 404 for an unknown id and for a second delete (#3 change)", async () => {
    expect((await h.as(alex).del("/api/quotes/99999")).status).toBe(404);
    const { id } = await h.createQuote(alex, groupId, "synthetic quote 1");
    expect((await h.as(alex).del(`/api/quotes/${id}`)).status).toBe(200);
    expect((await h.as(alex).del(`/api/quotes/${id}`)).status).toBe(404);
  });
});
