// #4 User directory for inviting: GET /api/users?q=
import { beforeEach, describe, expect, it } from "vitest";
import { harness, type Harness, type User } from "./helpers";

let h: Harness;
let alex: User;

beforeEach(async () => {
  h = harness();
  alex = await h.register("alex.dev");
});

const search = async (q: string | null, u: User = alex) => {
  const path = q === null ? "/api/users" : `/api/users?q=${encodeURIComponent(q)}`;
  return h.as(u).get(path);
};
const names = async (q: string, u: User = alex) =>
  ((await (await search(q, u)).json()) as { username: string }[]).map((x) => x.username);

describe("#4 AC1 substring search, sorted, limited to 20, caller excluded", () => {
  it("matches a substring anywhere in the username (not only prefix)", async () => {
    await h.register("sam.dev");
    await h.register("kim.ops");
    await h.register("devon_x");
    expect(await names("dev")).toEqual(["devon_x", "sam.dev"]);
    expect(await names("sam")).toEqual(["sam.dev"]);
    expect(await names("ops")).toEqual(["kim.ops"]);
  });

  it("returns {id, username} pairs whose ids are the users' ids", async () => {
    const sam = await h.register("sam.dev");
    expect(await (await search("sam")).json()).toEqual([{ id: sam.id, username: "sam.dev" }]);
  });

  it("is sorted by username", async () => {
    for (const u of ["zed.user", "amy.user", "max.user"]) await h.register(u);
    expect(await names("user")).toEqual(["amy.user", "max.user", "zed.user"]);
  });

  it("returns at most 20 results (25 matching users)", async () => {
    for (let i = 0; i < 25; i++) await h.register(`member${String(i).padStart(2, "0")}`);
    const list = await names("member");
    expect(list).toHaveLength(20);
    expect(list[0]).toBe("member00");
    expect(list[19]).toBe("member19");
  });

  it("excludes the caller", async () => {
    await h.register("alex.ops");
    expect(await names("alex")).toEqual(["alex.ops"]);
  });

  it("treats % _ and \\ in q literally (wildcards escaped)", async () => {
    await h.register("sam_dev");
    await h.register("samxdev");
    expect(await names("_")).toEqual(["sam_dev"]);
    expect(await names("%")).toEqual([]);
    expect(await names("\\")).toEqual([]);
    expect(await names("m_d")).toEqual(["sam_dev"]);
  });

  it("treats SQL metacharacters as data", async () => {
    await h.register("sam.dev");
    expect(await names("' OR 1=1 --")).toEqual([]);
    expect(await names("sam")).toEqual(["sam.dev"]);
  });

  it("trims surrounding whitespace in q", async () => {
    await h.register("sam.dev");
    expect(await names("  sam  ")).toEqual(["sam.dev"]);
  });

  it("is case-insensitive for ASCII (usernames are lowercase; uppercase q still matches)", async () => {
    await h.register("sam.dev");
    expect(await names("SAM")).toEqual(["sam.dev"]);
  });

  it("returns [] when nothing matches, including unicode/emoji queries", async () => {
    await h.register("sam.dev");
    expect(await names("nomatch")).toEqual([]);
    expect(await names("džingel")).toEqual([]);
    expect(await names("🎵")).toEqual([]);
  });
});

describe("#4 AC2 requires a session", () => {
  it("answers 401 without a cookie", async () => {
    const res = await h.req("GET", "/api/users?q=alex");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });
});

describe("#4 AC3 returns no other personal fields", () => {
  it("each result has exactly id and username; no email, hash, timestamps", async () => {
    await h.register("sam.dev");
    const res = await search("sam");
    const raw = await res.text();
    const list = JSON.parse(raw) as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]).sort()).toEqual(["id", "username"]);
    expect(raw).not.toMatch(/email|password|createdAt|updatedAt|dzingel\.invalid|"name"/i);
  });
});

describe("#4 AC4 empty q returns [], over-long q returns 400", () => {
  beforeEach(async () => {
    await h.register("sam.dev");
  });

  it.each([
    ["missing q", null],
    ["empty q", ""],
    ["whitespace-only q", "   "],
  ])("%s returns []", async (_l, q) => {
    const res = await search(q);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("q of exactly 30 chars is accepted", async () => {
    const res = await search("a".repeat(30));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("q of 31 chars returns 400", async () => {
    const res = await search("a".repeat(31));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid input" });
  });

  it("30 chars plus surrounding spaces is accepted (length is checked after trimming)", async () => {
    expect((await search(`  ${"a".repeat(30)}  `)).status).toBe(200);
  });
});
