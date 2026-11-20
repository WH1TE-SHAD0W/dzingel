// #3 Group membership schema and members-only quotes.
import { beforeEach, describe, expect, it } from "vitest";
import { harness, type Harness, type Quote, type User } from "./helpers";

let h: Harness;
let alex: User; // member / creator
let sam: User; // outsider
let groupId: number;

beforeEach(async () => {
  h = harness();
  alex = await h.register("alex.dev");
  sam = await h.register("sam.dev");
  groupId = (await h.createGroup(alex, "Test Crew")).id;
});

const columns = async (table: string) =>
  (await h.db.all<{ name: string }>(`SELECT name FROM pragma_table_info(?)`, table)).map((c) => c.name);

describe("#3 AC1 migration adds group_members and created_by", () => {
  it("group_members has group_id, user_id, joined_at with a unique (group_id, user_id) pair", async () => {
    expect(await columns("group_members")).toEqual(
      expect.arrayContaining(["group_id", "user_id", "joined_at"]),
    );
    await expect(
      h.db.run("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", groupId, alex.id),
    ).rejects.toThrow(/UNIQUE/);
  });

  it("groups and quotes have a created_by column", async () => {
    expect(await columns("groups")).toContain("created_by");
    expect(await columns("quotes")).toContain("created_by");
  });
});

describe("#3 AC2 creating a group makes the creator a member", () => {
  it("adds exactly one membership row for the creator and stores created_by", async () => {
    const members = await h.db.all<{ user_id: string; joined_at: string }>(
      "SELECT user_id, joined_at FROM group_members WHERE group_id = ?",
      groupId,
    );
    expect(members.map((m) => m.user_id)).toEqual([alex.id]);
    expect(typeof members[0].joined_at).toBe("string");
    const [g] = await h.db.all<{ created_by: string }>("SELECT created_by FROM groups WHERE id = ?", groupId);
    expect(g.created_by).toBe(alex.id);
  });

  it("the creator can immediately use the group", async () => {
    await h.createQuote(alex, groupId, "synthetic quote 1");
    expect(await h.listQuotes(alex, groupId)).toHaveLength(1);
  });
});

describe("#3 AC3 GET /api/groups lists only the caller's groups", () => {
  it("each user sees only groups they are a member of", async () => {
    const samGroup = await h.createGroup(sam, "Sam Crew");
    expect(await (await h.as(alex).get("/api/groups")).json()).toEqual([{ id: groupId, name: "Test Crew" }]);
    expect(await (await h.as(sam).get("/api/groups")).json()).toEqual([samGroup]);
  });

  it("a user with no groups gets []", async () => {
    const kim = await h.register("kim.dev");
    expect(await (await h.as(kim).get("/api/groups")).json()).toEqual([]);
  });

  it("a legacy group without members (created_by NULL) is visible to nobody", async () => {
    await h.db.run("INSERT INTO groups (name) VALUES ('Legacy Crew')");
    for (const u of [alex, sam]) {
      const names = ((await (await h.as(u).get("/api/groups")).json()) as { name: string }[]).map((g) => g.name);
      expect(names).not.toContain("Legacy Crew");
    }
  });

  it("an invited-and-accepted member sees the group too", async () => {
    await h.addMember(alex, groupId, sam);
    const names = ((await (await h.as(sam).get("/api/groups")).json()) as { name: string }[]).map((g) => g.name);
    expect(names).toEqual(["Test Crew"]);
  });
});

describe("#3 AC4 members can list, search, create, edit and delete quotes", () => {
  it("a second member (via invite) can do every quote operation on the group", async () => {
    await h.addMember(alex, groupId, sam);
    const a = await h.createQuote(alex, groupId, "synthetic quote by alex");
    const s = await h.createQuote(sam, groupId, "synthetic quote by sam", "synthetic context");

    expect((await h.listQuotes(sam, groupId)).map((q) => q.id)).toEqual([s.id, a.id]);
    expect((await h.listQuotes(sam, groupId, "by alex")).map((q) => q.id)).toEqual([a.id]);
    expect((await h.as(sam).get(`/api/quotes/${a.id}`)).status).toBe(200);

    // Any member may edit/delete any quote of the group (no author-only rule in the ticket).
    expect((await h.as(sam).put(`/api/quotes/${a.id}`, { text: "synthetic quote edited" })).status).toBe(200);
    expect((await h.listQuotes(alex, groupId, "edited")).map((q) => q.id)).toEqual([a.id]);
    expect((await h.as(alex).del(`/api/quotes/${s.id}`)).status).toBe(200);
    expect((await h.listQuotes(sam, groupId)).map((q) => q.id)).toEqual([a.id]);
  });
});

describe("#3 AC5 non-members get 404 for any operation on the group, nothing leaked", () => {
  let quoteId: number;
  beforeEach(async () => {
    quoteId = (await h.createQuote(alex, groupId, "synthetic secret quote", "synthetic secret context")).id;
  });

  const expectNotFound = async (res: Response) => {
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "not found" });
    expect(text).not.toMatch(/synthetic secret|Test Crew/);
  };

  it("list and search: 404", async () => {
    await expectNotFound(await h.as(sam).get(`/api/quotes?group=${groupId}`));
    await expectNotFound(await h.as(sam).get(`/api/quotes?group=${groupId}&q=secret`));
  });

  it("create: 404 and no quote is added", async () => {
    await expectNotFound(await h.as(sam).post("/api/quotes", { group_id: groupId, text: "synthetic intruder" }));
    expect(await h.listQuotes(alex, groupId)).toHaveLength(1);
  });

  it("GET /api/quotes/:id: 404", async () => {
    await expectNotFound(await h.as(sam).get(`/api/quotes/${quoteId}`));
  });

  it("update: 404 and the quote is unchanged", async () => {
    await expectNotFound(await h.as(sam).put(`/api/quotes/${quoteId}`, { text: "synthetic hijack" }));
    const [q] = await h.listQuotes(alex, groupId);
    expect(q.text).toBe("synthetic secret quote");
  });

  it("delete: 404 and the quote still exists", async () => {
    await expectNotFound(await h.as(sam).del(`/api/quotes/${quoteId}`));
    expect(await h.listQuotes(alex, groupId)).toHaveLength(1);
  });

  it("a non-member's response is identical to one for a group/quote that does not exist", async () => {
    const forbidden = await h.as(sam).get(`/api/quotes?group=${groupId}`);
    const missing = await h.as(sam).get(`/api/quotes?group=99999`);
    expect([forbidden.status, await forbidden.text()]).toEqual([missing.status, await missing.text()]);
    const fq = await h.as(sam).get(`/api/quotes/${quoteId}`);
    const mq = await h.as(sam).get(`/api/quotes/99999`);
    expect([fq.status, await fq.text()]).toEqual([mq.status, await mq.text()]);
  });

  it("a member of another group cannot move a quote by editing (no group_id change via PUT)", async () => {
    await h.addMember(alex, groupId, sam);
    const samGroup = await h.createGroup(sam, "Sam Crew");
    const res = await h.as(sam).put(`/api/quotes/${quoteId}`, {
      text: "synthetic moved",
      group_id: samGroup.id,
    });
    expect(res.status).toBe(200);
    expect(await h.listQuotes(sam, samGroup.id)).toEqual([]);
    expect((await h.listQuotes(alex, groupId)).map((q) => q.id)).toEqual([quoteId]);
  });
});

describe("#3 AC6 quotes store created_by; list returns the author username", () => {
  it("stores the creator's id and returns author on list and on GET by id", async () => {
    await h.addMember(alex, groupId, sam);
    const a = await h.createQuote(alex, groupId, "synthetic quote 1");
    const s = await h.createQuote(sam, groupId, "synthetic quote 2");
    const rows = await h.db.all<{ id: number; created_by: string }>("SELECT id, created_by FROM quotes ORDER BY id");
    expect(rows).toEqual([
      { id: a.id, created_by: alex.id },
      { id: s.id, created_by: sam.id },
    ]);
    const list = await h.listQuotes(alex, groupId);
    expect(Object.fromEntries(list.map((q) => [q.id, q.author]))).toEqual({
      [a.id]: "alex.dev",
      [s.id]: "sam.dev",
    });
    // Only these fields are returned; no user id / created_by leak.
    expect(Object.keys(list[0]).sort()).toEqual(
      ["author", "context", "created_at", "group_id", "id", "text"].sort(),
    );
  });

  it("an editor does not become the author", async () => {
    await h.addMember(alex, groupId, sam);
    const { id } = await h.createQuote(alex, groupId, "synthetic quote 1");
    await h.as(sam).put(`/api/quotes/${id}`, { text: "synthetic quote 1 edited" });
    const [q] = await h.listQuotes(alex, groupId);
    expect(q.author).toBe("alex.dev");
  });

  it("a legacy quote with created_by NULL is listed with author null", async () => {
    await h.db.run("INSERT INTO quotes (group_id, text) VALUES (?, 'synthetic legacy quote')", groupId);
    const [q] = (await h.listQuotes(alex, groupId)) as Quote[];
    expect(q).toMatchObject({ text: "synthetic legacy quote", author: null });
  });

  it("ignores a client-supplied created_by / author", async () => {
    const res = await h.as(alex).post("/api/quotes", {
      group_id: groupId,
      text: "synthetic quote 1",
      created_by: sam.id,
      author: "sam.dev",
    });
    expect(res.status).toBe(201);
    const [q] = await h.listQuotes(alex, groupId);
    expect(q.author).toBe("alex.dev");
  });
});

describe("#3 AC7 unauthenticated requests return 401", () => {
  it.each([
    ["GET", "/api/groups"],
    ["POST", "/api/groups"],
    ["GET", "/api/quotes?group=1"],
    ["POST", "/api/quotes"],
    ["PUT", "/api/quotes/1"],
    ["DELETE", "/api/quotes/1"],
  ])("%s %s: 401", async (method, path) => {
    const body = method === "GET" ? undefined : { name: "Test Crew", group_id: 1, text: "synthetic" };
    const res = await h.req(method, path, { body });
    expect(res.status).toBe(401);
  });
});
