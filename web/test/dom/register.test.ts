// @vitest-environment happy-dom
// #7 Register page: the rendered /register page with scripts/register.ts, against a stubbed API.
import { describe, expect, it } from "vitest";
import { REGISTER_MSG } from "../../src/lib/validation";
import { $, ALEX, describedBy, labelOf, loadPage, pageHtml, SCRIPT_SOURCES, settle, submit, type } from "./dom";

const NOT_LOGGED_IN = { "GET /auth/me": [401, { error: "unauthorized" }] } as const;
const PW = "synthetic-pass-1";

const form = () => $<HTMLFormElement>("register-form");
const username = () => $<HTMLInputElement>("reg-username");
const password = () => $<HTMLInputElement>("reg-password");
const confirm = () => $<HTMLInputElement>("reg-confirm");
const fieldError = (input: HTMLInputElement) => $(`${input.id}-error`).textContent ?? "";
const summary = () => $("register-error").textContent ?? "";
const registerCalls = (calls: { path: string }[]) => calls.filter((c) => c.path === "/auth/register");

function fill(u: string, p: string, c: string): void {
  type(username(), u);
  type(password(), p);
  type(confirm(), c);
}

describe("#7 AC1 /register has username, password and confirm password fields, all labelled", () => {
  it("three labelled inputs with hints linked by aria-describedby", async () => {
    await loadPage("register", { ...NOT_LOGGED_IN });
    expect(labelOf("reg-username")).toBe("Username");
    expect(labelOf("reg-password")).toBe("Password");
    expect(labelOf("reg-confirm")).toBe("Confirm password");
    expect(password().type).toBe("password");
    expect(confirm().type).toBe("password");
    for (const input of [username(), password(), confirm()]) {
      expect(describedBy(input)).toEqual([`${input.id}-hint`, `${input.id}-error`]);
    }
    expect(password().getAttribute("autocomplete")).toBe("new-password");
  });

  it("the page wires its register script", () => {
    for (const re of SCRIPT_SOURCES.register) expect(pageHtml("register")).toMatch(re);
  });
});

describe("#7 AC2 client validation mirrors the API rules", () => {
  it("HTML constraints match: username 3-30 [a-z0-9_.], password 8-128", async () => {
    await loadPage("register", { ...NOT_LOGGED_IN });
    expect(username().getAttribute("pattern")).toBe("[a-z0-9_.]{3,30}");
    expect(username().minLength).toBe(3);
    expect(username().maxLength).toBe(30);
    expect(password().minLength).toBe(8);
    expect(password().maxLength).toBe(128);
  });

  it.each([
    ["2 chars", "ab"],
    ["uppercase", "Alex.Dev"],
    ["hyphen", "alex-dev"],
    ["diacritics", "džingel"],
    ["emoji", "alex🎵"],
    ["31 chars", "a".repeat(31)],
  ])("invalid username (%s): field message, no request", async (_l, u) => {
    const { api } = await loadPage("register", { ...NOT_LOGGED_IN });
    fill(u, PW, PW);
    submit(form());
    await settle();
    expect(fieldError(username())).toBe(REGISTER_MSG.usernameRule);
    expect(registerCalls(api.calls)).toEqual([]);
  });

  it.each([
    ["7 chars", "p".repeat(7), REGISTER_MSG.passwordRule],
    ["empty", "", REGISTER_MSG.passwordEmpty],
  ])("invalid password (%s): field message, no request", async (_l, p, msg) => {
    const { api } = await loadPage("register", { ...NOT_LOGGED_IN });
    fill("alex.dev", p, p);
    submit(form());
    await settle();
    expect(fieldError(password())).toBe(msg);
    expect(registerCalls(api.calls)).toEqual([]);
  });

  it("129-char password (above the API max, typed around maxlength): field message, no request", async () => {
    const { api } = await loadPage("register", { ...NOT_LOGGED_IN });
    const long = "p".repeat(129);
    fill("alex.dev", long, long);
    submit(form());
    await settle();
    expect(fieldError(password())).toBe(REGISTER_MSG.passwordRule);
    expect(registerCalls(api.calls)).toEqual([]);
  });

  it("boundary values pass: 3-char username, exactly 8-char password", async () => {
    const { api } = await loadPage("register", { ...NOT_LOGGED_IN, "POST /auth/register": [201, { user: ALEX }] });
    fill("abc", "p".repeat(8), "p".repeat(8));
    submit(form());
    await expect.poll(() => registerCalls(api.calls).length).toBe(1);
  });
});

describe("#7 AC3 on success the user is logged in and redirected to the quotes page", () => {
  it("POSTs the trimmed username and the password, then replaces location with /", async () => {
    const { api, location } = await loadPage("register", {
      ...NOT_LOGGED_IN,
      "POST /auth/register": [201, { user: ALEX }],
    });
    fill("  alex.dev ", PW, PW);
    submit(form());
    await expect.poll(() => location.replace.mock.calls).toEqual([["/"]]);
    expect(registerCalls(api.calls)[0]).toMatchObject({ method: "POST", body: { username: "alex.dev", password: PW } });
    // The confirmation is never sent.
    expect(JSON.stringify(api.calls)).not.toMatch(/confirm/);
  });

  it("an already logged-in visitor is sent to /", async () => {
    const { location } = await loadPage("register", { "GET /auth/me": [200, { user: ALEX }] });
    await expect.poll(() => location.replace.mock.calls).toEqual([["/"]]);
  });
});

describe("#7 AC4 errors are accessible text next to the relevant field", () => {
  it("taken username (409): message in the username's own error element, aria-invalid, focus", async () => {
    const { location } = await loadPage("register", {
      ...NOT_LOGGED_IN,
      "POST /auth/register": [409, { error: "username taken", fields: { username: "is already taken" } }],
    });
    fill("alex.dev", PW, PW);
    submit(form());
    await expect.poll(() => fieldError(username())).toBe(REGISTER_MSG.usernameTaken);
    expect(username().getAttribute("aria-invalid")).toBe("true");
    expect(describedBy(username())).toContain("reg-username-error");
    expect(summary()).toBe("Please fix 1 problem below.");
    expect($("register-error").getAttribute("role")).toBe("alert");
    expect(document.activeElement).toBe(username());
    expect(location.replace).not.toHaveBeenCalled();
  });

  it("password mismatch: message next to the confirm field only", async () => {
    const { api } = await loadPage("register", { ...NOT_LOGGED_IN });
    fill("alex.dev", PW, PW + "x");
    submit(form());
    await settle();
    expect(fieldError(confirm())).toBe(REGISTER_MSG.mismatch);
    expect(confirm().getAttribute("aria-invalid")).toBe("true");
    expect(fieldError(username())).toBe("");
    expect(fieldError(password())).toBe("");
    expect(username().hasAttribute("aria-invalid")).toBe(false);
    expect(document.activeElement).toBe(confirm());
    expect(registerCalls(api.calls)).toEqual([]);
  });

  it("several problems: each next to its field, count in the summary, focus on the first", async () => {
    await loadPage("register", { ...NOT_LOGGED_IN });
    fill("A", "short", "");
    submit(form());
    await settle();
    expect(fieldError(username())).toBe(REGISTER_MSG.usernameRule);
    expect(fieldError(password())).toBe(REGISTER_MSG.passwordRule);
    expect(fieldError(confirm())).toBe(REGISTER_MSG.confirmEmpty);
    expect(summary()).toBe("Please fix 3 problems below.");
    expect(document.activeElement).toBe(username());
  });

  it("server-side 400 with fields: shown next to the named fields", async () => {
    await loadPage("register", {
      ...NOT_LOGGED_IN,
      "POST /auth/register": [400, { error: "invalid input", fields: { password: "must be 8-128 characters" } }],
    });
    fill("alex.dev", PW, PW);
    submit(form());
    await expect.poll(() => fieldError(password())).toBe(REGISTER_MSG.passwordRule);
    expect(fieldError(username())).toBe("");
    expect(document.activeElement).toBe(password());
  });

  it("fixing a flagged field clears its error as the user types; changing the password re-checks confirm", async () => {
    await loadPage("register", { ...NOT_LOGGED_IN });
    fill("alex.dev", PW, "different-pass");
    submit(form());
    await settle();
    expect(fieldError(confirm())).toBe(REGISTER_MSG.mismatch);
    type(password(), "different-pass");
    expect(fieldError(confirm())).toBe("");
    expect(confirm().hasAttribute("aria-invalid")).toBe(false);
  });

  it("429 / network error: plain-language form message", async () => {
    await loadPage("register", { ...NOT_LOGGED_IN, "POST /auth/register": [429, { error: "too many requests" }] });
    fill("alex.dev", PW, PW);
    submit(form());
    await expect.poll(summary).toMatch(/too many attempts/i);
  });

  it("server error text is never echoed (only the page's own messages)", async () => {
    await loadPage("register", {
      ...NOT_LOGGED_IN,
      "POST /auth/register": [400, { error: "invalid input", fields: { username: "<b>raw server text</b>" } }],
    });
    fill("alex.dev", PW, PW);
    submit(form());
    await expect.poll(() => fieldError(username())).toBe(REGISTER_MSG.usernameRule);
    expect(document.body.innerHTML).not.toContain("raw server text");
  });
});

describe("#7 AC5 a link to the login page is present", () => {
  it("has a link with text to /login", async () => {
    await loadPage("register", { ...NOT_LOGGED_IN });
    const link = [...document.querySelectorAll<HTMLAnchorElement>("a")].find(
      (a) => a.getAttribute("href") === "/login",
    );
    expect(link?.textContent?.trim()).toBe("Log in");
  });
});
