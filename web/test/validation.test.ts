// #7 #9 #10 Client-side rules (web/src/lib/validation.ts, web/src/lib/quote-form.ts) mirror the API.
// The constants are pinned to api/src/auth.ts by import, and the verdicts are compared with the
// real API (createApp on an in-memory node:sqlite DB) for the same inputs, so a change on either
// side that is not mirrored on the other fails here.
import { beforeAll, describe, expect, it } from "vitest";
import * as apiAuth from "../../api/src/auth";
import { createApp } from "../../api/src/app";
import { nodeDb } from "../../api/src/node-db";
import {
  checkQuoteContext,
  checkQuoteText,
  CONTEXT_MAX,
  QUOTE_MSG,
  TEXT_MAX,
} from "../src/lib/quote-form";
import {
  checkConfirm,
  checkPassword,
  checkUsername,
  PASSWORD_MAX,
  PASSWORD_MIN,
  REGISTER_MSG,
  USERNAME_RE,
} from "../src/lib/validation";

describe("#7 AC2 register constants are the API's", () => {
  it("USERNAME_RE, PASSWORD_MIN, PASSWORD_MAX equal api/src/auth.ts", () => {
    expect(USERNAME_RE.source).toBe(apiAuth.USERNAME_RE.source);
    expect(USERNAME_RE.flags).toBe(apiAuth.USERNAME_RE.flags);
    expect(PASSWORD_MIN).toBe(apiAuth.PASSWORD_MIN);
    expect(PASSWORD_MAX).toBe(apiAuth.PASSWORD_MAX);
    // and the ticket's numbers
    expect(PASSWORD_MIN).toBe(8);
    expect(USERNAME_RE.source).toBe("^[a-z0-9_.]{3,30}$");
  });

  it("messages state the same limits", () => {
    expect(REGISTER_MSG.passwordRule).toBe(`Use between ${apiAuth.PASSWORD_MIN} and ${apiAuth.PASSWORD_MAX} characters.`);
    expect(REGISTER_MSG.usernameRule).toMatch(/3 to 30/);
  });
});

describe("#7 AC2 checkUsername", () => {
  it.each(["abc", "a".repeat(30), "alex.dev", "alex_dev.01", "0123456789", "..._", "  alex.dev  ", "\talex.dev\n"])(
    "accepts %j",
    (v) => expect(checkUsername(v)).toBe(""),
  );

  it.each(["", " ", "\t\n", "   "])("empty/whitespace %j → 'choose a username'", (v) => {
    expect(checkUsername(v)).toBe(REGISTER_MSG.usernameEmpty);
  });

  it.each([
    "ab", "a".repeat(31), "Alex.Dev", "ALEX", "alex-dev", "alex dev", "alex.dev@example.org",
    "džingel", "alex🎵", "a' OR '1'='1", "<script>", "%_%", "alex dev", "ａｌｅｘ",
  ])("rejects %j with the rule message", (v) => {
    expect(checkUsername(v)).toBe(REGISTER_MSG.usernameRule);
  });
});

describe("#7 AC2 checkPassword", () => {
  it.each([
    ["exactly 8", "p".repeat(8)],
    ["exactly 128", "p".repeat(128)],
    ["8 spaces", " ".repeat(8)],
    ["unicode", "pässwörd🎵"],
  ])("accepts %s", (_l, v) => expect(checkPassword(v)).toBe(""));

  it("empty → 'choose a password'", () => expect(checkPassword("")).toBe(REGISTER_MSG.passwordEmpty));

  it.each([
    ["7 (one under)", "p".repeat(7)],
    ["129 (one over)", "p".repeat(129)],
    ["1 space", " "],
  ])("rejects %s with the rule message", (_l, v) => expect(checkPassword(v)).toBe(REGISTER_MSG.passwordRule));

  it("counts UTF-16 code units like the API (String.length): 4 emoji = 8 units passes", () => {
    expect("🎵🎵🎵🎵".length).toBe(8);
    expect(checkPassword("🎵🎵🎵🎵")).toBe("");
    expect(checkPassword("🎵🎵🎵")).toBe(REGISTER_MSG.passwordRule); // 6 units
  });
});

describe("#7 AC4 checkConfirm", () => {
  it("empty confirmation → 'type your password again'", () => {
    expect(checkConfirm("", "synthetic-pass-1")).toBe(REGISTER_MSG.confirmEmpty);
    expect(checkConfirm("", "")).toBe(REGISTER_MSG.confirmEmpty);
  });
  it("matching → ok", () => expect(checkConfirm("synthetic-pass-1", "synthetic-pass-1")).toBe(""));
  it.each([
    ["different", "synthetic-pass-2", "synthetic-pass-1"],
    ["trailing space", "synthetic-pass-1 ", "synthetic-pass-1"],
    ["case", "Synthetic-pass-1", "synthetic-pass-1"],
    ["unicode normalisation (NFD vs NFC)", "päss-word", "päss-word"],
  ])("mismatch (%s) → 'do not match'", (_l, confirm, password) => {
    expect(checkConfirm(confirm, password)).toBe(REGISTER_MSG.mismatch);
  });
});

describe("#9 #10 checkQuoteText / checkQuoteContext", () => {
  it("limits are 1000 and 2000 (the ticket's numbers)", () => {
    expect(TEXT_MAX).toBe(1000);
    expect(CONTEXT_MAX).toBe(2000);
  });

  it.each([
    ["one char", "q"],
    ["exactly 1000", "q".repeat(1000)],
    ["unicode", "džingel 🎵"],
    ["HTML stays text", "<script>alert(1)</script>"],
    ["surrounding spaces, ≤1000 raw", ` ${"q".repeat(998)} `],
  ])("text ok: %s", (_l, v) => expect(checkQuoteText(v)).toBe(""));

  it.each(["", " ", "\n\t ", " "])("text empty/whitespace %j → required", (v) => {
    expect(checkQuoteText(v)).toBe(QUOTE_MSG.textEmpty);
  });

  it.each([
    ["1001", "q".repeat(1001)],
    ["1000 + surrounding spaces (raw length counts, like the API)", ` ${"q".repeat(1000)} `],
  ])("text too long: %s", (_l, v) => expect(checkQuoteText(v)).toBe(QUOTE_MSG.textLong));

  it.each([["empty", ""], ["exactly 2000", "c".repeat(2000)], ["whitespace", "   "]])("context ok: %s", (_l, v) => {
    expect(checkQuoteContext(v)).toBe("");
  });

  it("context 2001 → too long", () => expect(checkQuoteContext("c".repeat(2001))).toBe(QUOTE_MSG.contextLong));

  it("messages name the limits", () => {
    expect(QUOTE_MSG.textLong).toContain("1000");
    expect(QUOTE_MSG.contextLong).toContain("2000");
  });
});

// --- Same verdict as the real API ----------------------------------------------------------

describe("#7 #9 #10 client verdicts agree with the real API", () => {
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let groupId = 0;

  // Register calls go without the cookie: a cookie-bearing auth POST would need an Origin header.
  const req = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(cookie && path !== "/api/auth/register" ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  beforeAll(async () => {
    const db = nodeDb(":memory:");
    app = createApp(db, apiAuth.createAuth(db.sqlite, { secret: "test-secret-".padEnd(48, "x"), rateLimit: false }));
    const res = await req("POST", "/api/auth/register", { username: "alex.dev", password: "synthetic-pass-1", acceptTerms: true });
    expect(res.status).toBe(201);
    cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    groupId = ((await (await req("POST", "/api/groups", { name: "Test Crew" })).json()) as { id: number }).id;
  });

  let n = 0;
  it.each([
    "abc", "a".repeat(30), "ab", "a".repeat(31), "Alex.Dev", "alex-dev", "džingel", "alex🎵", "..._", "%_%",
  ])("username %j: client ok ⇔ API accepts", async (username) => {
    // Each valid username appears once in this file, so the API cannot answer 409 here.
    const clientOk = checkUsername(username) === "";
    const res = await req("POST", "/api/auth/register", { username, password: "synthetic-pass-1", acceptTerms: true });
    expect(res.status).toBe(clientOk ? 201 : 400);
  });

  it.each([
    ["7", "p".repeat(7)], ["8", "p".repeat(8)], ["128", "p".repeat(128)], ["129", "p".repeat(129)],
    ["4 emoji (8 units)", "🎵🎵🎵🎵"], ["3 emoji (6 units)", "🎵🎵🎵"],
  ])("password of %s: client ok ⇔ API accepts", async (_l, password) => {
    const clientOk = checkPassword(password) === "";
    const res = await req("POST", "/api/auth/register", { username: `pw.check${n++}`, password, acceptTerms: true });
    expect(res.status).toBe(clientOk ? 201 : 400);
  });

  it.each([
    ["1 char", "q"], ["1000", "q".repeat(1000)], ["1001", "q".repeat(1001)], ["empty", ""],
    ["whitespace", "  \n "], ["NBSP only", " "], ["1000 + spaces", ` ${"q".repeat(1000)} `],
  ])("quote text %s: client ok ⇔ API POST and PUT accept", async (_l, text) => {
    const clientOk = checkQuoteText(text) === "";
    const post = await req("POST", "/api/quotes", { group_id: groupId, text, context: "" });
    expect(post.status).toBe(clientOk ? 201 : 400);
    const { id } = (await (await req("POST", "/api/quotes", { group_id: groupId, text: "synthetic quote 1" })).json()) as { id: number };
    const put = await req("PUT", `/api/quotes/${id}`, { text, context: "" });
    expect(put.status).toBe(clientOk ? 200 : 400);
  });

  it("quote context 2000: both accept and the API stores it whole", async () => {
    expect(checkQuoteContext("c".repeat(2000))).toBe("");
    const res = await req("POST", "/api/quotes", { group_id: groupId, text: "synthetic quote 1", context: "c".repeat(2000) });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: number };
    const q = (await (await req("GET", `/api/quotes/${id}`)).json()) as { context: string };
    expect(q.context).toHaveLength(2000);
  });

  // Documents a known difference: the client blocks 2001 characters, the API does not reject them
  // but silently keeps the first 2000 (api/src/app.ts: `b.context.slice(0, 2000)`).
  it("quote context 2001: client rejects; API answers 201 and truncates to 2000 (difference)", async () => {
    expect(checkQuoteContext("c".repeat(2001))).toBe(QUOTE_MSG.contextLong);
    const res = await req("POST", "/api/quotes", { group_id: groupId, text: "synthetic quote 1", context: "c".repeat(2001) });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: number };
    const q = (await (await req("GET", `/api/quotes/${id}`)).json()) as { context: string };
    expect(q.context).toHaveLength(2000);
  });
});
