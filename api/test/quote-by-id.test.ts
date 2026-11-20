// #10 Edit quote page — API addition GET /api/quotes/:id (prefills the edit form).
import { beforeEach, describe, expect, it } from "vitest";
import { harness, type Harness, type User } from "./helpers";

let h: Harness;
let alex: User;
let sam: User;
let groupId: number;

beforeEach(async () => {
  h = harness();
  alex = await h.register("alex.dev");
  sam = await h.register("sam.dev");
  groupId = (await h.createGroup(alex, "Test Crew")).id;
});

describe("#10 GET /api/quotes/:id", () => {
  it("200 for a member: same shape as a list item, incl. author", async () => {
    const { id } = await h.createQuote(alex, groupId, "synthetic quote 1", "synthetic context 1");
    const res = await h.as(alex).get(`/api/quotes/${id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id,
      group_id: groupId,
      text: "synthetic quote 1",
      context: "synthetic context 1",
      created_at: expect.any(String),
      author: "alex.dev",
    });
    const [listed] = await h.listQuotes(alex, groupId);
    expect(body).toEqual(listed);
  });

  it("returns HTML / unicode text verbatim (prefill is plain text)", async () => {
    const text = "džingel 🎵 <img src=x onerror=alert(1)>";
    const { id } = await h.createQuote(alex, groupId, text, "<script>synthetic</script>");
    const body = (await (await h.as(alex).get(`/api/quotes/${id}`)).json()) as { text: string; context: string };
    expect(body.text).toBe(text);
    expect(body.context).toBe("<script>synthetic</script>");
  });

  it("reflects an edit (save then reload)", async () => {
    const { id } = await h.createQuote(alex, groupId, "synthetic quote 1");
    await h.as(alex).put(`/api/quotes/${id}`, { text: "synthetic quote 1 edited", context: "added" });
    const body = (await (await h.as(alex).get(`/api/quotes/${id}`)).json()) as { text: string; context: string };
    expect([body.text, body.context]).toEqual(["synthetic quote 1 edited", "added"]);
  });

  it.each(["abc", "0", "-1", "1.5", "1e3", "01", "9".repeat(16)])("400 for malformed id %j", async (bad) => {
    const res = await h.as(alex).get(`/api/quotes/${bad}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid input" });
  });

  it("404 for an unknown id", async () => {
    const res = await h.as(alex).get("/api/quotes/99999");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it("404 after the quote was deleted", async () => {
    const { id } = await h.createQuote(alex, groupId, "synthetic quote 1");
    await h.as(alex).del(`/api/quotes/${id}`);
    expect((await h.as(alex).get(`/api/quotes/${id}`)).status).toBe(404);
  });

  it("404 for a non-member, with no quote data in the body", async () => {
    const { id } = await h.createQuote(alex, groupId, "synthetic secret quote");
    const res = await h.as(sam).get(`/api/quotes/${id}`);
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "not found" });
    expect(text).not.toContain("synthetic secret");
  });

  it("200 for a member who joined via invite", async () => {
    const { id } = await h.createQuote(alex, groupId, "synthetic quote 1");
    await h.addMember(alex, groupId, sam);
    expect((await h.as(sam).get(`/api/quotes/${id}`)).status).toBe(200);
  });

  it("401 without a session (before id validation)", async () => {
    expect((await h.req("GET", "/api/quotes/1")).status).toBe(401);
    expect((await h.req("GET", "/api/quotes/abc")).status).toBe(401);
  });
});
