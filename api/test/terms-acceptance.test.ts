// #23 Terms acceptance: server-side enforcement on POST /api/auth/register (SEC-02).
import { describe, expect, it } from "vitest";
import { harness, PASSWORD } from "./helpers";

const userCount = async (h: ReturnType<typeof harness>) =>
  (await h.db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM "user"`))[0].n;

const reg = (h: ReturnType<typeof harness>, body: Record<string, unknown>) =>
  h.req("POST", "/api/auth/register", { body });

describe("#23 AC5 register requires acceptTerms === true", () => {
  it.each([
    ["missing", undefined],
    ["false", false],
    ['string "true"', "true"],
    ["number 1", 1],
    ["null", null],
    ["string yes", "yes"],
    ["array [true]", [true]],
    ["object", { accepted: true }],
  ])("acceptTerms %s -> 400 with fields.acceptTerms and no user created", async (_l, value) => {
    const h = harness();
    const body: Record<string, unknown> = { username: "alex.dev", password: PASSWORD };
    if (value !== undefined) body.acceptTerms = value;
    const res = await reg(h, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid input", fields: { acceptTerms: "must be accepted" } });
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(await userCount(h)).toBe(0);
  });

  it("acceptTerms true -> 201 as before, user created, session cookie set", async () => {
    const h = harness();
    const res = await reg(h, { username: "alex.dev", password: PASSWORD, acceptTerms: true });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: Record<string, unknown> };
    expect(Object.keys(body.user).sort()).toEqual(["id", "username"]);
    expect(res.headers.getSetCookie().join(";")).toMatch(/session_token=/);
    expect(await userCount(h)).toBe(1);
  });

  it("a refused attempt does not burn the username: retry with acceptance succeeds", async () => {
    const h = harness();
    expect((await reg(h, { username: "alex.dev", password: PASSWORD })).status).toBe(400);
    expect((await reg(h, { username: "alex.dev", password: PASSWORD, acceptTerms: true })).status).toBe(201);
  });
});

describe("#23 edge: acceptance merges with other field errors", () => {
  it("invalid username, short password and missing acceptance are all reported", async () => {
    const h = harness();
    const res = await reg(h, { username: "A", password: "short" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fields: Record<string, string> };
    expect(Object.keys(body.fields).sort()).toEqual(["acceptTerms", "password", "username"]);
    expect(await userCount(h)).toBe(0);
  });

  it("invalid password with acceptance true does not report acceptTerms", async () => {
    const h = harness();
    const res = await reg(h, { username: "alex.dev", password: "short", acceptTerms: true });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { fields: object }).fields).toEqual({
      password: expect.any(String),
    });
  });

  it("acceptance alone does not rescue an invalid username (400, no user)", async () => {
    const h = harness();
    const res = await reg(h, { username: "Alex Dev", password: PASSWORD, acceptTerms: true });
    expect(res.status).toBe(400);
    expect(await userCount(h)).toBe(0);
  });

  it("a taken username with acceptance true is still 409", async () => {
    const h = harness();
    await h.register("alex.dev");
    const res = await reg(h, { username: "alex.dev", password: PASSWORD, acceptTerms: true });
    expect(res.status).toBe(409);
  });
});

describe("#23 AC7 the 400 body echoes no input", () => {
  it("submitted username, password and a hostile acceptTerms value never come back", async () => {
    const h = harness();
    const hostile = "<script>synthetic</script>";
    const res = await reg(h, { username: "alex.dev", password: "pw-secret-synthetic-1", acceptTerms: hostile });
    const raw = await res.text();
    expect(res.status).toBe(400);
    expect(raw).not.toContain("alex.dev");
    expect(raw).not.toContain("pw-secret-synthetic-1");
    expect(raw).not.toContain("script");
    expect(JSON.parse(raw)).toEqual({ error: "invalid input", fields: { acceptTerms: "must be accepted" } });
  });

  it("the acceptance is not stored or exposed: the user directory has only id and username", async () => {
    const h = harness();
    const alex = await h.register("alex.dev");
    await h.register("sam.dev");
    const res = await h.as(alex).get("/api/users?q=sam");
    expect(res.status).toBe(200);
    const list = (await res.json()) as Record<string, unknown>[];
    expect(list.length).toBe(1);
    expect(Object.keys(list[0]).sort()).toEqual(["id", "username"]);
  });
});
