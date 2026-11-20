// #5 Group invites.
import { beforeEach, describe, expect, it } from "vitest";
import { harness, type Harness, type Invite, type User } from "./helpers";

let h: Harness;
let alex: User; // group member / inviter
let sam: User; // invitee
let kim: User; // bystander
let groupId: number;

beforeEach(async () => {
  h = harness();
  alex = await h.register("alex.dev");
  sam = await h.register("sam.dev");
  kim = await h.register("kim.dev");
  groupId = (await h.createGroup(alex, "Test Crew")).id;
});

const invite = (from: User, username: unknown, group = groupId) =>
  h.as(from).post(`/api/groups/${group}/invites`, { username });
const inviteOk = async (from: User, to: User, group = groupId) => {
  const res = await invite(from, to.username, group);
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: number }).id;
};
const pending = async (u: User) => (await (await h.as(u).get("/api/invites")).json()) as Invite[];
const status = async (id: number) =>
  (await h.db.all<{ status: string }>("SELECT status FROM group_invites WHERE id = ?", id))[0]?.status;
const isMember = async (u: User, g = groupId) =>
  (await h.db.all("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?", g, u.id)).length > 0;

describe("#5 AC1 migration adds group_invites", () => {
  it("has the required columns and only allows pending/accepted/declined", async () => {
    const cols = (await h.db.all<{ name: string }>("SELECT name FROM pragma_table_info('group_invites')")).map(
      (c) => c.name,
    );
    expect(cols).toEqual(
      expect.arrayContaining(["group_id", "inviter_id", "invitee_id", "status", "created_at"]),
    );
    await expect(
      h.db.run(
        "INSERT INTO group_invites (group_id, inviter_id, invitee_id, status) VALUES (?, ?, ?, 'bogus')",
        groupId, alex.id, sam.id,
      ),
    ).rejects.toThrow(/CHECK/);
  });
});

describe("#5 AC2 inviting by username", () => {
  it("a member invites a user: 201 with {id, group_id, invitee_id, status:'pending'}", async () => {
    const res = await invite(alex, "sam.dev");
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ id: expect.any(Number), group_id: groupId, invitee_id: sam.id, status: "pending" });
    expect(await status(body.id as number)).toBe("pending");
  });

  it("username is matched case-insensitively and trimmed", async () => {
    const res = await invite(alex, "  SAM.DEV ");
    expect(res.status).toBe(201);
    expect(((await res.json()) as { invitee_id: string }).invitee_id).toBe(sam.id);
  });

  it("non-member inviter: 403 and no invite is created", async () => {
    const res = await invite(kim, "sam.dev");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(await pending(sam)).toEqual([]);
  });

  it("non-member inviting to a group that does not exist also gets 403 (no existence leak)", async () => {
    const res = await invite(kim, "sam.dev", 99999);
    expect(res.status).toBe(403);
  });

  it("unknown username: 404", async () => {
    const res = await invite(alex, "nobody.here");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it("inviting yourself (already a member): 409", async () => {
    const res = await invite(alex, "alex.dev");
    expect(res.status).toBe(409);
  });

  it("invitee already a member: 409", async () => {
    await h.addMember(alex, groupId, sam);
    const res = await invite(alex, "sam.dev");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already a member or invited" });
  });

  it("invitee with a pending invite: 409 (also when another member invites)", async () => {
    await h.addMember(alex, groupId, kim);
    await inviteOk(alex, sam);
    expect((await invite(alex, "sam.dev")).status).toBe(409);
    expect((await invite(kim, "sam.dev")).status).toBe(409);
    expect(await pending(sam)).toHaveLength(1);
  });

  it("the same user can have pending invites to different groups", async () => {
    const other = await h.createGroup(alex, "Other Crew");
    await inviteOk(alex, sam);
    await inviteOk(alex, sam, other.id);
    expect((await pending(sam)).map((i) => i.group_name).sort()).toEqual(["Other Crew", "Test Crew"]);
  });

  it.each([
    ["missing username", undefined],
    ["empty username", ""],
    ["non-string username", 42],
    ["username over 30 chars", "a".repeat(31)],
    ["username with invalid chars", "sam dev!"],
    ["SQL payload", "' OR 1=1 --"],
  ])("%s: 400", async (_l, username) => {
    const res = await invite(alex, username);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid input" });
  });

  it.each(["abc", "0", "-1", "1.5"])("malformed group id %j: 400", async (bad) => {
    const res = await h.as(alex).post(`/api/groups/${bad}/invites`, { username: "sam.dev" });
    expect(res.status).toBe(400);
  });

  it("text/plain body: 400", async () => {
    const res = await h.req("POST", `/api/groups/${groupId}/invites`, {
      cookie: alex.cookie,
      headers: { "content-type": "text/plain" },
      body: { username: "sam.dev" },
    });
    expect(res.status).toBe(400);
  });
});

describe("#5 AC3 GET /api/invites lists the caller's pending invites", () => {
  it("returns id, group_id, group_name, inviter username, created_at; newest first", async () => {
    const other = await h.createGroup(alex, "Other Crew");
    const first = await inviteOk(alex, sam);
    const second = await inviteOk(alex, sam, other.id);
    const list = await pending(sam);
    expect(list.map((i) => i.id)).toEqual([second, first]);
    expect(list[1]).toEqual({
      id: first,
      group_id: groupId,
      group_name: "Test Crew",
      inviter: "alex.dev",
      created_at: expect.any(String),
    });
    for (const i of list) {
      expect(Object.keys(i).sort()).toEqual(["created_at", "group_id", "group_name", "id", "inviter"]);
    }
  });

  it("shows only invites addressed to the caller, and only pending ones", async () => {
    const toSam = await inviteOk(alex, sam);
    const toKim = await inviteOk(alex, kim);
    expect((await pending(kim)).map((i) => i.id)).toEqual([toKim]);
    expect(await pending(alex)).toEqual([]);
    await h.as(sam).post(`/api/invites/${toSam}/decline`);
    expect(await pending(sam)).toEqual([]);
  });

  it("group names are returned as plain text (HTML/unicode)", async () => {
    const g = await h.createGroup(alex, "džingel <b>Crew</b> 🎵");
    await inviteOk(alex, sam, g.id);
    expect((await pending(sam))[0].group_name).toBe("džingel <b>Crew</b> 🎵");
  });
});

describe("#5 AC4 accept and decline", () => {
  it("accept: 200 {ok, group_id}, invite accepted, invitee becomes a member and sees quotes", async () => {
    await h.createQuote(alex, groupId, "synthetic quote 1");
    const id = await inviteOk(alex, sam);
    const res = await h.as(sam).post(`/api/invites/${id}/accept`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, group_id: groupId });
    expect(await status(id)).toBe("accepted");
    expect(await isMember(sam)).toBe(true);
    expect((await h.listQuotes(sam, groupId)).map((q) => q.text)).toEqual(["synthetic quote 1"]);
    expect(((await (await h.as(sam).get("/api/groups")).json()) as { id: number }[]).map((g) => g.id)).toEqual([
      groupId,
    ]);
    expect(await pending(sam)).toEqual([]);
    const [{ responded_at }] = await h.db.all<{ responded_at: string | null }>(
      "SELECT responded_at FROM group_invites WHERE id = ?",
      id,
    );
    expect(responded_at).not.toBeNull();
  });

  it("decline: 200 {ok}, invite declined, invitee is not a member", async () => {
    const id = await inviteOk(alex, sam);
    const res = await h.as(sam).post(`/api/invites/${id}/decline`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await status(id)).toBe("declined");
    expect(await isMember(sam)).toBe(false);
    expect((await h.as(sam).get(`/api/quotes?group=${groupId}`)).status).toBe(404);
  });

  it("re-invite after decline: 201 and a new pending invite", async () => {
    const first = await inviteOk(alex, sam);
    await h.as(sam).post(`/api/invites/${first}/decline`);
    const res = await invite(alex, "sam.dev");
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: number };
    expect(id).not.toBe(first);
    expect((await pending(sam)).map((i) => i.id)).toEqual([id]);
  });

  it("a new member can invite others", async () => {
    await h.addMember(alex, groupId, sam);
    expect((await invite(sam, "kim.dev")).status).toBe(201);
  });
});

describe("#5 AC5 only the invitee can respond; non-pending → 409", () => {
  it.each(["accept", "decline"])("%s by the inviter or a bystander: 404, invite stays pending", async (action) => {
    const id = await inviteOk(alex, sam);
    for (const u of [alex, kim]) {
      const res = await h.as(u).post(`/api/invites/${id}/${action}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not found" });
    }
    expect(await status(id)).toBe("pending");
    expect(await isMember(kim)).toBe(false);
  });

  it.each(["accept", "decline"])("%s an unknown invite id: 404", async (action) => {
    expect((await h.as(sam).post(`/api/invites/99999/${action}`)).status).toBe(404);
  });

  it.each(["abc", "0", "-1"])("malformed invite id %j: 400", async (bad) => {
    expect((await h.as(sam).post(`/api/invites/${bad}/accept`)).status).toBe(400);
    expect((await h.as(sam).post(`/api/invites/${bad}/decline`)).status).toBe(400);
  });

  it.each([
    ["accepted", "accept", "accept"],
    ["accepted", "accept", "decline"],
    ["declined", "decline", "accept"],
    ["declined", "decline", "decline"],
  ])("responding to an %s invite (%s then %s): 409, state unchanged", async (_s, first, second) => {
    const id = await inviteOk(alex, sam);
    expect((await h.as(sam).post(`/api/invites/${id}/${first}`)).status).toBe(200);
    const res = await h.as(sam).post(`/api/invites/${id}/${second}`);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "invite already answered" });
    expect(await status(id)).toBe(first === "accept" ? "accepted" : "declined");
    expect(await isMember(sam)).toBe(first === "accept");
  });

  it("concurrent accept + decline: exactly one succeeds", async () => {
    const id = await inviteOk(alex, sam);
    const results = await Promise.all([
      h.as(sam).post(`/api/invites/${id}/accept`),
      h.as(sam).post(`/api/invites/${id}/decline`),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});

describe("#5 AC6 unauthenticated requests return 401", () => {
  it.each([
    ["POST", "/api/groups/1/invites"],
    ["GET", "/api/invites"],
    ["POST", "/api/invites/1/accept"],
    ["POST", "/api/invites/1/decline"],
  ])("%s %s: 401", async (method, path) => {
    const res = await h.req(method, path, { body: method === "GET" ? undefined : { username: "sam.dev" } });
    expect(res.status).toBe(401);
  });
});
