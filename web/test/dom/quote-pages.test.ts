// @vitest-environment happy-dom
// #9 Add quote page, #10 Edit quote page, and the quote list they return to (index.astro + main.ts).
import { describe, expect, it, vi } from "vitest";
import { QUOTE_MSG } from "../../src/lib/quote-form";
import {
  $,
  ALEX,
  BAND,
  CREW,
  describedBy,
  labelOf,
  loadPage,
  pageHtml,
  SCRIPT_SOURCES,
  settle,
  submit,
  text,
  type,
  type Handler,
} from "./dom";

const session = (over: Record<string, Handler> = {}): Record<string, Handler> => ({
  "GET /auth/me": [200, { user: ALEX }],
  "GET /groups": [200, [CREW, BAND]],
  "GET /invites": [200, []],
  ...over,
});

const QUOTE = {
  id: 5,
  group_id: CREW.id,
  text: "synthetic quote 1",
  context: "synthetic context 1",
  created_at: "2026-03-04 12:00:00",
  author: "sam.dev",
};

const quoteText = () => $<HTMLTextAreaElement>("quote-text");
const quoteContext = () => $<HTMLTextAreaElement>("quote-context");
const form = () => $<HTMLFormElement>("quote-form");
const fieldError = (id: string) => text(`${id}-error`);

/** Shared field checks (#9 AC1/AC2 and #10 AC2 "same validation as add"). */
function quoteFieldsAreLabelled(): void {
  expect(labelOf("quote-text")).toBe("Quote");
  expect(labelOf("quote-context")).toBe("Context (optional)");
  expect(quoteText().required).toBe(true);
  expect(quoteContext().required).toBe(false);
  expect(quoteText().maxLength).toBe(1000);
  expect(quoteContext().maxLength).toBe(2000);
  expect(describedBy(quoteText())).toEqual(["quote-text-hint", "quote-text-count", "quote-text-error"]);
  expect(describedBy(quoteContext())).toEqual(["quote-context-hint", "quote-context-count", "quote-context-error"]);
}

// ===========================================================================================
describe("#9 AC1 a dedicated page adds a quote to the current group (text required ≤1000, context optional ≤2000)", () => {
  it("/quotes/new has labelled text and context fields with the API limits and wires its script", async () => {
    for (const re of SCRIPT_SOURCES["quotes/new"]) expect(pageHtml("quotes/new")).toMatch(re);
    await loadPage("quotes/new", session());
    quoteFieldsAreLabelled();
    expect(text("quote-submit")).toBe("Save quote");
  });

  it("names the current group and posts to it; switching group changes the target", async () => {
    const { api } = await loadPage("quotes/new", session({ "POST /quotes": [201, { id: 9 }] }));
    await expect.poll(() => text("quote-group")).toBe("Test Crew");
    expect(form().hidden).toBe(false);
    const select = $<HTMLSelectElement>("tp-group");
    select.value = "2";
    select.dispatchEvent(new Event("change"));
    expect(text("quote-group")).toBe("Synthetic Band");
    type(quoteText(), "synthetic quote 1");
    submit(form());
    await expect.poll(() => api.calls.find((c) => c.method === "POST")?.body).toEqual({
      group_id: BAND.id,
      text: "synthetic quote 1",
      context: "",
    });
  });

  it("context is optional; exactly 1000 / 2000 characters are accepted", async () => {
    const { api } = await loadPage("quotes/new", session({ "POST /quotes": [201, { id: 9 }] }));
    await expect.poll(() => form().hidden).toBe(false);
    type(quoteText(), "q".repeat(1000));
    type(quoteContext(), "c".repeat(2000));
    submit(form());
    await expect.poll(() => api.calls.filter((c) => c.method === "POST").length).toBe(1);
    expect(fieldError("quote-text")).toBe("");
    expect(fieldError("quote-context")).toBe("");
  });

  it("user without a group: a text notice instead of the form", async () => {
    await loadPage("quotes/new", session({ "GET /groups": [200, []] }));
    await expect.poll(() => $("no-group").hidden).toBe(false);
    expect(form().hidden).toBe(true);
    expect(text("no-group")).toMatch(/not in a group yet/);
  });

  it("live character counter as text", async () => {
    await loadPage("quotes/new", session());
    type(quoteText(), "synthetic");
    expect(text("quote-text-count")).toBe("9 of 1000 characters used");
    type(quoteText(), "q".repeat(960));
    expect($("quote-text-count").getAttribute("aria-live")).toBe("polite");
  });
});

describe("#9 AC2 validation errors are accessible text next to the field", () => {
  it.each([
    ["empty text", "", "", "quote-text", QUOTE_MSG.textEmpty],
    ["whitespace-only text", "  \n\t ", "", "quote-text", QUOTE_MSG.textEmpty],
    ["1001-char text", "q".repeat(1001), "", "quote-text", QUOTE_MSG.textLong],
    ["2001-char context", "synthetic quote 1", "c".repeat(2001), "quote-context", QUOTE_MSG.contextLong],
  ])("%s: message in the field's error element, aria-invalid, focus, no request", async (_l, t, c, id, msg) => {
    const { api } = await loadPage("quotes/new", session());
    await expect.poll(() => form().hidden).toBe(false);
    type(quoteText(), t);
    type(quoteContext(), c);
    submit(form());
    await settle();
    expect(fieldError(id)).toBe(msg);
    expect($(id).getAttribute("aria-invalid")).toBe("true");
    expect(describedBy($(id))).toContain(`${id}-error`);
    expect(text("quote-error")).toBe("Please fix 1 problem below.");
    expect($("quote-error").getAttribute("role")).toBe("alert");
    expect(document.activeElement?.id).toBe(id);
    expect(api.calls.filter((x) => x.method === "POST")).toEqual([]);
  });

  it("both fields invalid: two messages, summary counts 2, focus on the first", async () => {
    await loadPage("quotes/new", session());
    await expect.poll(() => form().hidden).toBe(false);
    type(quoteText(), "");
    type(quoteContext(), "c".repeat(2001));
    submit(form());
    await settle();
    expect(fieldError("quote-text")).toBe(QUOTE_MSG.textEmpty);
    expect(fieldError("quote-context")).toBe(QUOTE_MSG.contextLong);
    expect(text("quote-error")).toBe("Please fix 2 problems below.");
    expect(document.activeElement?.id).toBe("quote-text");
  });

  it("correcting a flagged field clears its error while typing", async () => {
    await loadPage("quotes/new", session());
    await expect.poll(() => form().hidden).toBe(false);
    submit(form());
    await settle();
    expect(fieldError("quote-text")).toBe(QUOTE_MSG.textEmpty);
    type(quoteText(), "synthetic quote 1");
    expect(fieldError("quote-text")).toBe("");
    expect(quoteText().hasAttribute("aria-invalid")).toBe(false);
  });

  it.each([
    [400, QUOTE_MSG.serverRejected],
    [404, "You are no longer in this group. Choose another group at the top."],
    [500, "Something went wrong. Please try again."],
  ])("API %i on save: text message, stays on the page", async (status, msg) => {
    const { location } = await loadPage("quotes/new", session({ "POST /quotes": [status, { error: "x" }] }));
    await expect.poll(() => form().hidden).toBe(false);
    type(quoteText(), "synthetic quote 1");
    submit(form());
    await expect.poll(() => text("quote-error")).toBe(msg);
    expect(location.assign).not.toHaveBeenCalled();
    expect(quoteText().value).toBe("synthetic quote 1"); // input kept
  });

  it("401 on save: redirect to /login", async () => {
    const { location } = await loadPage("quotes/new", session({ "POST /quotes": [401, { error: "unauthorized" }] }));
    await expect.poll(() => form().hidden).toBe(false);
    type(quoteText(), "synthetic quote 1");
    submit(form());
    await expect.poll(() => location.replace.mock.calls).toEqual([["/login"]]);
  });
});

describe("#9 AC3 on save the user returns to the quote list and sees the new quote", () => {
  it("successful POST /api/quotes → location.assign('/')", async () => {
    const { api, location } = await loadPage("quotes/new", session({ "POST /quotes": [201, { id: 9 }] }));
    await expect.poll(() => form().hidden).toBe(false);
    type(quoteText(), "synthetic quote 1");
    type(quoteContext(), "synthetic context 1");
    submit(form());
    await expect.poll(() => location.assign.mock.calls).toEqual([["/"]]);
    expect(api.calls.find((c) => c.method === "POST")).toMatchObject({
      path: "/quotes",
      body: { group_id: CREW.id, text: "synthetic quote 1", context: "synthetic context 1" },
    });
  });

  it("the list page (/) shows the group's quotes, newest first as returned, as text", async () => {
    await loadPage("index", session({
      "GET /groups": [200, [CREW]],
      "GET /quotes": [200, [
        { ...QUOTE, id: 9, text: "synthetic quote 2", context: "" },
        QUOTE,
      ]],
    }));
    const list = $("list");
    await expect.poll(() => list.querySelectorAll("li").length).toBe(2);
    const items = [...list.querySelectorAll("li")];
    expect(items[0].querySelector(".quote-text")?.textContent).toBe("“synthetic quote 2”");
    expect(items[0].querySelector(".quote-context")).toBeNull(); // empty context not shown
    expect(items[1].querySelector(".quote-context")?.textContent).toBe("synthetic context 1");
    expect(items[1].querySelector(".quote-meta")?.textContent).toMatch(/^Added by sam\.dev on /);
  });

  it("quote text with HTML is shown as text", async () => {
    await loadPage("index", session({
      "GET /groups": [200, [CREW]],
      "GET /quotes": [200, [{ ...QUOTE, text: "<script>alert(1)</script>", context: "<img src=x>" }]],
    }));
    await expect.poll(() => $("list").querySelectorAll("li").length).toBe(1);
    expect($("list").querySelector("script, img")).toBeNull();
    expect($("list").querySelector(".quote-text")?.textContent).toBe("“<script>alert(1)</script>”");
  });
});

describe("#9 AC4 the inline add form on the list page is removed", () => {
  it("/ has no quote text/context fields or add form, only an 'Add quote' link to /quotes/new", async () => {
    await loadPage("index", session({ "GET /groups": [200, [CREW]], "GET /quotes": [200, []] }));
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.getElementById("quote-text")).toBeNull();
    expect(document.querySelectorAll("main form")).toHaveLength(0);
    const add = [...document.querySelectorAll<HTMLAnchorElement>("main a")].find((a) => a.textContent === "Add quote");
    expect(add?.getAttribute("href")).toBe("/quotes/new");
    await expect.poll(() => text("list-status")).toBe("No quotes in this group yet. Use “Add quote” to add the first one.");
  });
});

// ===========================================================================================
describe("#10 AC1 /quotes/edit?id= shows a form prefilled with the quote text and context", () => {
  it("GET /api/quotes/5 fills both fields, counters and the 'Added by' line", async () => {
    for (const re of SCRIPT_SOURCES["quotes/edit"]) expect(pageHtml("quotes/edit")).toMatch(re);
    const { api } = await loadPage("quotes/edit", session({ "GET /quotes/5": [200, QUOTE] }), { search: "?id=5" });
    await expect.poll(() => form().hidden).toBe(false);
    expect(quoteText().value).toBe("synthetic quote 1");
    expect(quoteContext().value).toBe("synthetic context 1");
    expect(text("quote-text-count")).toBe("17 of 1000 characters used");
    expect(text("quote-meta")).toMatch(/^Added by sam\.dev on /);
    expect($("quote-meta").querySelector("time")?.getAttribute("datetime")).toBe("2026-03-04 12:00:00");
    expect($("edit-loading").hidden).toBe(true);
    expect($("not-found").hidden).toBe(true);
    expect(api.lines()).toContain("GET /quotes/5");
    quoteFieldsAreLabelled();
  });

  it("a quote by a deleted user reads 'Added by a former member'", async () => {
    await loadPage("quotes/edit", session({ "GET /quotes/5": [200, { ...QUOTE, author: null }] }), { search: "?id=5" });
    await expect.poll(() => text("quote-meta")).toMatch(/^Added by a former member on /);
  });

  it("prefilled HTML-looking text stays text", async () => {
    await loadPage("quotes/edit", session({ "GET /quotes/5": [200, { ...QUOTE, text: "<b>bold</b>" }] }), { search: "?id=5" });
    await expect.poll(() => quoteText().value).toBe("<b>bold</b>");
    expect(form().querySelector("b")).toBeNull();
  });

  it("while loading: a text status, form hidden", async () => {
    let resolve!: (r: [number, unknown]) => void;
    await loadPage("quotes/edit", session({ "GET /quotes/5": () => new Promise((r) => (resolve = r)) }), { search: "?id=5" });
    await settle();
    expect(text("edit-loading")).toBe("Loading the quote…");
    expect($("edit-loading").getAttribute("role")).toBe("status");
    expect(form().hidden).toBe(true);
    resolve([200, QUOTE]);
    await expect.poll(() => form().hidden).toBe(false);
  });
});

describe("#10 AC2 save updates the quote (same validation as add) and returns to the list", () => {
  it("PUT /api/quotes/5 with the edited fields, then location.assign('/')", async () => {
    const { api, location } = await loadPage("quotes/edit", session({
      "GET /quotes/5": [200, QUOTE],
      "PUT /quotes/5": [200, { ok: true }],
    }), { search: "?id=5" });
    await expect.poll(() => form().hidden).toBe(false);
    type(quoteText(), "synthetic quote 1 (edited)");
    type(quoteContext(), "");
    submit(form());
    await expect.poll(() => location.assign.mock.calls).toEqual([["/"]]);
    expect(api.calls.find((c) => c.method === "PUT")?.body).toEqual({ text: "synthetic quote 1 (edited)", context: "" });
  });

  it.each([
    ["empty text", "", "", "quote-text", QUOTE_MSG.textEmpty],
    ["whitespace-only text", "   ", "", "quote-text", QUOTE_MSG.textEmpty],
    ["1001-char text", "q".repeat(1001), "", "quote-text", QUOTE_MSG.textLong],
    ["2001-char context", "ok", "c".repeat(2001), "quote-context", QUOTE_MSG.contextLong],
  ])("%s: same inline error as on the add page, no PUT", async (_l, t, c, id, msg) => {
    const { api, location } = await loadPage("quotes/edit", session({ "GET /quotes/5": [200, QUOTE] }), { search: "?id=5" });
    await expect.poll(() => form().hidden).toBe(false);
    type(quoteText(), t);
    type(quoteContext(), c);
    submit(form());
    await settle();
    expect(fieldError(id)).toBe(msg);
    expect($(id).getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement?.id).toBe(id);
    expect(api.calls.filter((x) => x.method === "PUT")).toEqual([]);
    expect(location.assign).not.toHaveBeenCalled();
  });

  it("API 400 on save: server-rejected message; API 404: not-found message with focus", async () => {
    const page = await loadPage("quotes/edit", session({
      "GET /quotes/5": [200, QUOTE],
      "PUT /quotes/5": [400, { error: "invalid input" }],
    }), { search: "?id=5" });
    await expect.poll(() => form().hidden).toBe(false);
    submit(form());
    await expect.poll(() => text("quote-error")).toBe(QUOTE_MSG.serverRejected);

    page.api.route("PUT /quotes/5", [404, { error: "not found" }]);
    submit(form());
    await expect.poll(() => $("not-found").hidden).toBe(false);
    expect(form().hidden).toBe(true);
    expect(document.activeElement?.id).toBe("not-found-title");
  });

  it("Cancel is a link back to the list", async () => {
    await loadPage("quotes/edit", session({ "GET /quotes/5": [200, QUOTE] }), { search: "?id=5" });
    const cancel = [...form().querySelectorAll("a")].find((a) => a.textContent === "Cancel");
    expect(cancel?.getAttribute("href")).toBe("/");
  });
});

describe("#10 AC3 delete asks for confirmation in-page (accessible, no confirm/prompt), then removes", () => {
  async function editPage(over: Record<string, Handler> = {}) {
    const page = await loadPage("quotes/edit", session({ "GET /quotes/5": [200, QUOTE], ...over }), { search: "?id=5" });
    await expect.poll(() => form().hidden).toBe(false);
    return page;
  }
  const dialog = () => $<HTMLDialogElement>("delete-dialog");

  it("Delete opens a labelled, described native <dialog>; nothing is deleted yet; confirm/prompt/alert never used", async () => {
    const { api } = await editPage({ "DELETE /quotes/5": [200, { ok: true }] });
    const native = { confirm: vi.fn(), prompt: vi.fn(), alert: vi.fn() };
    for (const [k, fn] of Object.entries(native)) vi.stubGlobal(k, fn);
    expect($("quote-delete").getAttribute("aria-haspopup")).toBe("dialog");
    $("quote-delete").click();
    expect(dialog().open).toBe(true);
    expect(dialog().tagName).toBe("DIALOG");
    expect(text(dialog().getAttribute("aria-labelledby")!)).toBe("Delete this quote?");
    expect(text(dialog().getAttribute("aria-describedby")!)).toBe(
      "The quote will be removed for everyone in the group. This cannot be undone.",
    );
    expect(text("delete-confirm")).toBe("Yes, delete quote");
    expect(text("delete-cancel")).toBe("Keep quote");
    // The safe choice is the one focused when the dialog opens (autofocus attribute).
    expect($("delete-cancel").hasAttribute("autofocus")).toBe(true);
    expect(api.calls.filter((c) => c.method === "DELETE")).toEqual([]);
    $("delete-confirm").click(); // and confirming does not use them either
    await settle();
    for (const fn of Object.values(native)) expect(fn).not.toHaveBeenCalled();
  });

  it("Keep quote closes the dialog without deleting", async () => {
    const { api } = await editPage();
    $("quote-delete").click();
    $("delete-cancel").click();
    expect(dialog().open).toBe(false);
    await settle();
    expect(api.calls.filter((c) => c.method === "DELETE")).toEqual([]);
  });

  it("Yes, delete quote → DELETE /api/quotes/5 → back to the list", async () => {
    const { api, location } = await editPage({ "DELETE /quotes/5": [200, { ok: true }] });
    $("quote-delete").click();
    $("delete-confirm").click();
    await expect.poll(() => location.assign.mock.calls).toEqual([["/"]]);
    expect(api.lines()).toContain("DELETE /quotes/5");
  });

  it("delete failure (500): text error inside the dialog, dialog stays open", async () => {
    const { location } = await editPage({ "DELETE /quotes/5": [500, {}] });
    $("quote-delete").click();
    $("delete-confirm").click();
    await expect.poll(() => text("delete-error")).toBe("Something went wrong. Please try again.");
    expect($("delete-error").getAttribute("role")).toBe("alert");
    expect(dialog().open).toBe(true);
    expect(location.assign).not.toHaveBeenCalled();
  });

  it("quote already gone (404) on delete: dialog closes, not-found message focused", async () => {
    await editPage({ "DELETE /quotes/5": [404, { error: "not found" }] });
    $("quote-delete").click();
    $("delete-confirm").click();
    await expect.poll(() => $("not-found").hidden).toBe(false);
    expect(dialog().open).toBe(false);
    expect(document.activeElement?.id).toBe("not-found-title");
  });

  it("a double click on Yes sends one DELETE", async () => {
    let resolve!: () => void;
    const { api } = await editPage({
      "DELETE /quotes/5": () => new Promise((r) => (resolve = () => r([500, {}]))),
    });
    $("quote-delete").click();
    $("delete-confirm").click();
    $("delete-confirm").click();
    await settle();
    expect(api.calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
    resolve();
  });
});

describe("#10 AC4 an unknown or inaccessible id shows a clear message, not a blank page", () => {
  it.each([
    ["unknown/inaccessible id (API 404)", "?id=99999", [404, { error: "not found" }]],
    ["API 400", "?id=5", [400, { error: "invalid input" }]],
  ] as [string, string, [number, unknown]][])("%s: 'Quote not found' with explanation and a way back", async (_l, search, reply) => {
    await loadPage("quotes/edit", session({ "GET /quotes/99999": reply, "GET /quotes/5": reply }), { search });
    await expect.poll(() => $("not-found").hidden).toBe(false);
    expect(text("not-found-title")).toBe("Quote not found");
    expect(text("not-found")).toMatch(/does not exist, has been deleted, or belongs to a group you are not in/);
    expect($("not-found").querySelector("a")?.getAttribute("href")).toBe("/");
    expect(form().hidden).toBe(true);
    expect($("edit-loading").hidden).toBe(true);
    expect($("main").hidden).toBe(false);
  });

  it.each(["", "?id=", "?id=abc", "?id=0", "?id=-1", "?id=1.5", "?id=1e3", "?id=%20", "?id=1234567890123456"])(
    "malformed id %j: not-found message without calling the API",
    async (search) => {
      const { api } = await loadPage("quotes/edit", session(), { search });
      await expect.poll(() => $("not-found").hidden).toBe(false);
      expect(api.calls.filter((c) => c.path.startsWith("/quotes"))).toEqual([]);
    },
  );

  it("a server error while loading: a text error with a hint to reload, not a blank page", async () => {
    await loadPage("quotes/edit", session({ "GET /quotes/5": [500, {}] }), { search: "?id=5" });
    await expect.poll(() => text("edit-load-error")).toBe(
      "Something went wrong. Please try again. You can reload the page to try again.",
    );
    expect($("edit-load-error").getAttribute("role")).toBe("alert");
    expect($("edit-loading").hidden).toBe(true);
  });
});

describe("#10 AC5 the prompt()-based editing on the list page is removed", () => {
  it("each list item has an 'Edit quote' link to /quotes/edit?id=, described by its quote; no prompt", async () => {
    const prompt = vi.fn();
    vi.stubGlobal("prompt", prompt);
    await loadPage("index", session({ "GET /groups": [200, [CREW]], "GET /quotes": [200, [QUOTE]] }));
    await expect.poll(() => $("list").querySelectorAll("li").length).toBe(1);
    const li = $("list").querySelector("li")!;
    const edit = li.querySelector("a")!;
    expect(edit.textContent).toBe("Edit quote");
    expect(edit.getAttribute("href")).toBe("/quotes/edit?id=5");
    expect(edit.getAttribute("aria-describedby")).toBe("quote-5-text");
    expect(text("quote-5-text")).toBe("“synthetic quote 1”");
    expect(li.querySelectorAll("button")).toHaveLength(0); // no inline edit/delete actions
    expect(prompt).not.toHaveBeenCalled();
  });
});
