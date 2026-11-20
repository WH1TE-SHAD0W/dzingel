// @vitest-environment happy-dom
// #6 Login page: the rendered /login page with scripts/login.ts, against a stubbed API.
import { describe, expect, it } from "vitest";
import { $, ALEX, describedBy, labelOf, loadPage, pageHtml, SCRIPT_SOURCES, settle, submit, type } from "./dom";

const NOT_LOGGED_IN = { "GET /auth/me": [401, { error: "unauthorized" }] } as const;

const form = () => $<HTMLFormElement>("login-form");
const username = () => $<HTMLInputElement>("login-username");
const password = () => $<HTMLInputElement>("login-password");
const error = () => $("login-error");

describe("#6 AC1 /login has labelled username and password fields", () => {
  it("each field has a visible <label for> with a clear name and the right input type", async () => {
    await loadPage("login", { ...NOT_LOGGED_IN });
    expect(labelOf("login-username")).toBe("Username");
    expect(labelOf("login-password")).toBe("Password");
    expect(username().type).toBe("text");
    expect(password().type).toBe("password");
    expect(username().getAttribute("autocomplete")).toBe("username");
    expect(password().getAttribute("autocomplete")).toBe("current-password");
    expect($("login-submit").textContent?.trim()).toBe("Log in");
    expect(document.querySelector("h1")?.textContent).toBe("Log in");
  });

  it("the page wires its login script", () => {
    const html = pageHtml("login");
    for (const re of SCRIPT_SOURCES.login) expect(html).toMatch(re);
  });
});

describe("#6 AC2 valid credentials log in and go to the quotes page", () => {
  it("POSTs {username, password} to /api/auth/login and replaces location with /", async () => {
    const { api, location } = await loadPage("login", {
      ...NOT_LOGGED_IN,
      "POST /auth/login": [200, { user: ALEX }],
    });
    type(username(), "alex.dev");
    type(password(), "synthetic-pass-1");
    submit(form());
    await expect.poll(() => location.replace.mock.calls).toEqual([["/"]]);
    const login = api.calls.find((c) => c.path === "/auth/login");
    expect(login?.body).toEqual({ username: "alex.dev", password: "synthetic-pass-1" });
    expect(error().textContent).toBe("");
  });

  it("forgives capitals and surrounding spaces in the username (usernames are lowercase)", async () => {
    const { api, location } = await loadPage("login", {
      ...NOT_LOGGED_IN,
      "POST /auth/login": [200, { user: ALEX }],
    });
    type(username(), "  Alex.Dev ");
    type(password(), "synthetic-pass-1");
    submit(form());
    await expect.poll(() => location.replace.mock.calls.length).toBe(1);
    expect(api.calls.find((c) => c.path === "/auth/login")?.body).toEqual({
      username: "alex.dev",
      password: "synthetic-pass-1",
    });
  });

  it("an already logged-in visitor is sent to / straight away", async () => {
    const { location } = await loadPage("login", { "GET /auth/me": [200, { user: ALEX }] });
    await expect.poll(() => location.replace.mock.calls).toEqual([["/"]]);
  });

  it("a visitor without a session stays on /login", async () => {
    const { location } = await loadPage("login", { ...NOT_LOGGED_IN });
    await settle();
    expect(location.replace).not.toHaveBeenCalled();
  });
});

describe("#6 AC3 failure: text error tied to the form, not revealing which field was wrong", () => {
  it("401: one generic text message in a role=alert that describes the form; both fields aria-invalid", async () => {
    const { location } = await loadPage("login", {
      ...NOT_LOGGED_IN,
      "POST /auth/login": [401, { error: "invalid credentials" }],
    });
    type(username(), "alex.dev");
    type(password(), "wrong-pass-9");
    submit(form());
    await expect.poll(() => error().textContent).toBe(
      "That username and password do not match. Please try again.",
    );
    expect(error().getAttribute("role")).toBe("alert");
    expect(describedBy(form())).toContain("login-error");
    // Neither field is singled out.
    expect(username().getAttribute("aria-invalid")).toBe("true");
    expect(password().getAttribute("aria-invalid")).toBe("true");
    expect(error().textContent).not.toMatch(/unknown|not exist|wrong password|no user/i);
    // Password cleared, focus on it for a retry; username kept.
    expect(password().value).toBe("");
    expect(username().value).toBe("alex.dev");
    expect(document.activeElement).toBe(password());
    expect(location.replace).not.toHaveBeenCalled();
  });

  it("unknown user gives exactly the same message as a wrong password", async () => {
    const messages: string[] = [];
    for (const name of ["alex.dev", "nobody.here"]) {
      await loadPage("login", { ...NOT_LOGGED_IN, "POST /auth/login": [401, { error: "invalid credentials" }] });
      type(username(), name);
      type(password(), "wrong-pass-9");
      submit(form());
      await expect.poll(() => error().textContent).not.toBe("");
      messages.push(error().textContent ?? "");
    }
    expect(messages[0]).toBe(messages[1]);
  });

  it("typing again clears aria-invalid", async () => {
    await loadPage("login", { ...NOT_LOGGED_IN, "POST /auth/login": [401, { error: "invalid credentials" }] });
    type(username(), "alex.dev");
    type(password(), "wrong-pass-9");
    submit(form());
    await expect.poll(() => password().getAttribute("aria-invalid")).toBe("true");
    type(password(), "s");
    expect(username().hasAttribute("aria-invalid")).toBe(false);
    expect(password().hasAttribute("aria-invalid")).toBe(false);
  });

  it.each([
    ["both empty", "", "", "login-username"],
    ["whitespace-only username", "   ", "synthetic-pass-1", "login-username"],
    ["empty password", "alex.dev", "", "login-password"],
  ])("%s: text message, no request, focus on the missing field", async (_l, u, p, focusId) => {
    const { api } = await loadPage("login", { ...NOT_LOGGED_IN });
    type(username(), u);
    type(password(), p);
    submit(form());
    await settle();
    expect(error().textContent).toBe("Please enter your username and your password.");
    expect(api.calls.filter((c) => c.path === "/auth/login")).toEqual([]);
    expect(document.activeElement?.id).toBe(focusId);
  });

  it.each([
    [429, /too many attempts/i],
    [500, /something went wrong/i],
  ])("%i: plain-language message, input kept", async (status, re) => {
    await loadPage("login", { ...NOT_LOGGED_IN, "POST /auth/login": [status, { error: "x" }] });
    type(username(), "alex.dev");
    type(password(), "synthetic-pass-1");
    submit(form());
    await expect.poll(() => error().textContent).toMatch(re);
    expect(password().value).toBe("synthetic-pass-1");
  });

  it("a double submit sends only one request (busy guard)", async () => {
    let resolve!: () => void;
    const { api } = await loadPage("login", {
      ...NOT_LOGGED_IN,
      "POST /auth/login": () => new Promise((r) => (resolve = () => r([401, {}]))),
    });
    type(username(), "alex.dev");
    type(password(), "synthetic-pass-1");
    submit(form());
    submit(form());
    await settle();
    expect(api.calls.filter((c) => c.path === "/auth/login")).toHaveLength(1);
    expect($("login-submit").getAttribute("aria-disabled")).toBe("true");
    resolve();
    await expect.poll(() => $("login-submit").getAttribute("aria-disabled")).toBe(null);
  });
});

describe("#6 AC4 a link to the register page is present", () => {
  it("has a link with text to /register", async () => {
    await loadPage("login", { ...NOT_LOGGED_IN });
    const link = [...document.querySelectorAll<HTMLAnchorElement>("a")].find(
      (a) => a.getAttribute("href") === "/register",
    );
    expect(link?.textContent?.trim()).toBe("Create an account");
  });
});

describe("#6 AC5 accessible and keyboard-operable (static checks)", () => {
  it("native form controls only, no positive tabindex, form has an accessible name, skip link", async () => {
    await loadPage("login", { ...NOT_LOGGED_IN });
    expect(form().getAttribute("aria-labelledby")).toBe("login-title");
    expect(document.querySelectorAll("[tabindex]:not([tabindex='-1'])")).toHaveLength(0);
    expect(document.querySelector("a.skip-link")?.getAttribute("href")).toBe("#main");
    expect(pageHtml("login")).toMatch(/<html lang="en">/);
    expect($("login-submit").tagName).toBe("BUTTON");
  });
});
