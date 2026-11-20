// @vitest-environment happy-dom
// #8 Top panel (components/TopPanel.astro + scripts/top-panel.ts) on the app pages.
import { describe, expect, it, vi } from "vitest";
import type { PageName } from "./render-pages";
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
  type ApiRequest,
  type Handler,
} from "./dom";

const INV_BAND = { id: 7, group_id: BAND.id, group_name: BAND.name, inviter: "sam.dev", created_at: "2026-01-02 10:00:00" };
const INV_THIRD = { id: 8, group_id: 3, group_name: "Third Crew", inviter: null, created_at: "2026-01-01 10:00:00" };

/** A logged-in session with groups and invites, plus the quote list of index.astro. */
function session(over: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    "GET /auth/me": [200, { user: ALEX }],
    "GET /groups": [200, [CREW]],
    "GET /invites": [200, []],
    "GET /quotes": [200, []],
    ...over,
  };
}

const ready = () => expect.poll(() => $("tp-loading").hidden).toBe(true);
const options = () => [...$<HTMLSelectElement>("tp-group").options].map((o) => [o.value, o.text]);
const dialogOpen = (id: string) => $<HTMLDialogElement>(id).open;
const buttonByName = (root: ParentNode, name: string) =>
  [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === name);

describe("#8 AC1 every app page shows the top panel with all controls", () => {
  it.each(["index", "quotes/new", "quotes/edit"] as PageName[])("%s renders and wires the top panel", (name) => {
    const html = pageHtml(name);
    expect(html).toMatch(/<header class="topbar"/);
    for (const id of ["tp-username", "tp-group", "tp-new-group", "tp-invite-user", "tp-invites", "tp-invite-count", "tp-logout"]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toMatch(SCRIPT_SOURCES[name][0]);
  });

  it("login and register are not app pages: no top panel", () => {
    for (const name of ["login", "register"] as PageName[]) expect(pageHtml(name)).not.toContain('class="topbar"');
  });

  it("after the session check: logo/title, username, group switcher, create group, invites with count, logout", async () => {
    await loadPage("index", session({
      "GET /groups": [200, [CREW, BAND]],
      "GET /invites": [200, [INV_BAND, INV_THIRD]],
    }));
    await ready();
    const brand = document.querySelector<HTMLAnchorElement>(".topbar-brand");
    expect(brand?.textContent).toBe("džingel");
    expect(brand?.getAttribute("href")).toBe("/");
    expect(text("tp-username")).toBe("alex.dev");
    expect(labelOf("tp-group")).toBe("Group");
    expect(options()).toEqual([["1", "Test Crew"], ["2", "Synthetic Band"]]);
    expect($<HTMLSelectElement>("tp-group").value).toBe("1");
    expect(text("tp-new-group")).toBe("New group");
    expect(text("tp-invite-user")).toBe("Invite someone");
    expect($("tp-invite-user").hidden).toBe(false);
    await expect.poll(() => text("tp-invite-count")).toBe("2");
    expect(text("tp-invites")).toBe("Invites 2 pending");
    expect(text("tp-logout")).toBe("Log out");
    for (const el of document.querySelectorAll<HTMLElement>("[data-auth-content]")) expect(el.hidden).toBe(false);
  });

  it("panel content stays hidden until the session check succeeds", async () => {
    let resolve!: (r: [number, unknown]) => void;
    await loadPage("index", session({ "GET /auth/me": () => new Promise((r) => (resolve = r)) }));
    await settle();
    expect($("tp-loading").hidden).toBe(false);
    expect($("tp-logout").hidden).toBe(true);
    expect($("main").hidden).toBe(true);
    resolve([200, { user: ALEX }]);
    await ready();
    expect($("tp-logout").hidden).toBe(false);
  });

  it("group names and usernames are rendered as text, not HTML", async () => {
    await loadPage("index", session({
      "GET /auth/me": [200, { user: { id: "u1", username: "<img src=x onerror=alert(1)>" } }],
      "GET /groups": [200, [{ id: 1, name: "<b>Test Crew</b>" }]],
    }));
    await ready();
    expect(text("tp-username")).toBe("<img src=x onerror=alert(1)>");
    expect(options()).toEqual([["1", "<b>Test Crew</b>"]]);
    expect(document.querySelector(".topbar img, .topbar b")).toBeNull();
  });

  it("no groups: switcher disabled with a text placeholder, invite-someone hidden", async () => {
    await loadPage("index", session({ "GET /groups": [200, []] }));
    await ready();
    await expect.poll(options).toEqual([["", "No groups yet"]]);
    expect($<HTMLSelectElement>("tp-group").disabled).toBe(true);
    expect($("tp-invite-user").hidden).toBe(true);
    expect($("no-group").hidden).toBe(false);
  });

  it("group switcher: changing the group reloads the page content for it and remembers it", async () => {
    const { api } = await loadPage("index", session({ "GET /groups": [200, [CREW, BAND]] }));
    await ready();
    await expect.poll(() => api.lines()).toContain("GET /quotes?group=1&q=");
    const select = $<HTMLSelectElement>("tp-group");
    select.value = "2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await expect.poll(() => api.lines()).toContain("GET /quotes?group=2&q=");
    expect(localStorage.getItem("dzingel.group")).toBe("2");
  });

  it("the remembered group is selected on the next load", async () => {
    localStorage.setItem("dzingel.group", "2");
    const { api } = await loadPage("index", session({ "GET /groups": [200, [CREW, BAND]] }));
    await ready();
    await expect.poll(() => $<HTMLSelectElement>("tp-group").value).toBe("2");
    await expect.poll(() => api.lines()).toContain("GET /quotes?group=2&q=");
  });

  it("a remembered group the user left falls back to the first group", async () => {
    localStorage.setItem("dzingel.group", "99");
    await loadPage("index", session());
    await ready();
    await expect.poll(() => $<HTMLSelectElement>("tp-group").value).toBe("1");
  });

  it("create group: dialog with a labelled name field; empty name → text error; valid name → created and selected", async () => {
    const created = { id: 5, name: "Synthetic Club" };
    let groups = [CREW];
    const { api } = await loadPage("index", session({
      "GET /groups": () => [200, groups],
      "POST /groups": (req) => {
        groups = [CREW, created];
        return [201, { id: created.id, name: (req.body as { name: string }).name }];
      },
    }));
    await ready();
    $("tp-new-group").click();
    expect(dialogOpen("tp-new-group-dialog")).toBe(true);
    expect(labelOf("tp-group-name")).toBe("Group name");

    const name = $<HTMLInputElement>("tp-group-name");
    name.value = "   ";
    submit($<HTMLFormElement>("tp-new-group-form"));
    await settle();
    expect(text("tp-group-name-error")).toBe("Please enter a name for the group.");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy(name)).toContain("tp-group-name-error");
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);

    name.value = " Synthetic Club ";
    submit($<HTMLFormElement>("tp-new-group-form"));
    await expect.poll(() => text("tp-status")).toBe("Group “Synthetic Club” created and selected.");
    expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({ name: "Synthetic Club" });
    expect(dialogOpen("tp-new-group-dialog")).toBe(false);
    expect($<HTMLSelectElement>("tp-group").value).toBe("5");
    expect($("tp-status").getAttribute("role")).toBe("status");
  });

  it("create group: a 400 from the API is shown as text next to the name field", async () => {
    await loadPage("index", session({ "POST /groups": [400, { error: "invalid name" }] }));
    await ready();
    $("tp-new-group").click();
    $<HTMLInputElement>("tp-group-name").value = "x".repeat(100);
    submit($<HTMLFormElement>("tp-new-group-form"));
    await expect.poll(() => text("tp-group-name-error")).toBe("Please enter a name of up to 100 characters.");
    expect(dialogOpen("tp-new-group-dialog")).toBe(true);
  });

  it("logout: POST /api/auth/logout, forgets the group, goes to /login", async () => {
    localStorage.setItem("dzingel.group", "1");
    const { api, location } = await loadPage("index", session({ "POST /auth/logout": [200, { ok: true }] }));
    await ready();
    $("tp-logout").click();
    await expect.poll(() => location.replace.mock.calls).toEqual([["/login"]]);
    expect(api.lines()).toContain("POST /auth/logout");
    expect(localStorage.getItem("dzingel.group")).toBeNull();
  });

  it("logout failure (500): text error in the panel, stays on the page", async () => {
    const { location } = await loadPage("index", session({ "POST /auth/logout": [500, {}] }));
    await ready();
    $("tp-logout").click();
    await expect.poll(() => text("tp-error")).toBe("Could not log out. Please try again.");
    expect($("tp-error").getAttribute("role")).toBe("alert");
    expect(location.replace).not.toHaveBeenCalled();
  });
});

describe("#8 AC2 pending invites with Accept/Decline; list and count update afterwards", () => {
  function inviteApi(initial = [INV_BAND, INV_THIRD]) {
    let pending = [...initial];
    let groups = [CREW];
    return {
      routes: session({
        "GET /groups": () => [200, groups],
        "GET /invites": () => [200, pending],
        "POST /invites/7/accept": (req: ApiRequest) => {
          expect(req.body).toEqual({});
          pending = pending.filter((i) => i.id !== 7);
          groups = [CREW, BAND];
          return [200, { ok: true, group_id: BAND.id }];
        },
        "POST /invites/7/decline": (req: ApiRequest) => {
          expect(req.body).toEqual({});
          pending = pending.filter((i) => i.id !== 7);
          return [200, { ok: true }];
        },
      }),
    };
  }

  it("opening Invites shows each invite as text with labelled Accept and Decline buttons", async () => {
    await loadPage("index", inviteApi().routes);
    await ready();
    await expect.poll(() => text("tp-invite-count")).toBe("2");
    $("tp-invites").click();
    expect(dialogOpen("tp-invites-dialog")).toBe(true);
    const list = $("tp-invites-list");
    await expect.poll(() => list.querySelectorAll("li").length).toBe(2);
    const items = [...list.querySelectorAll("li")].map((li) => li.querySelector("p")?.textContent);
    expect(items).toEqual(["sam.dev invited you to join Synthetic Band", "Someone invited you to join Third Crew"]);
    expect(buttonByName(list, "Accept invite to Synthetic Band")?.textContent).toBe("Accept");
    expect(buttonByName(list, "Decline invite to Synthetic Band")?.textContent).toBe("Decline");
    expect($("tp-invites-empty").hidden).toBe(true);
  });

  it("Accept: POSTs {} to accept, joins and selects the group, list and count update", async () => {
    const { api } = await loadPage("index", inviteApi().routes);
    await ready();
    $("tp-invites").click();
    await expect.poll(() => $("tp-invites-list").querySelectorAll("li").length).toBe(2);
    buttonByName($("tp-invites-list"), "Accept invite to Synthetic Band")!.click();
    await expect.poll(() => text("tp-invites-status")).toBe("You joined “Synthetic Band”. It is now your selected group.");
    await expect.poll(() => text("tp-invite-count")).toBe("1");
    expect($("tp-invites-list").querySelectorAll("li")).toHaveLength(1);
    expect(options()).toEqual([["1", "Test Crew"], ["2", "Synthetic Band"]]);
    expect($<HTMLSelectElement>("tp-group").value).toBe("2");
    expect(api.lines()).toContain("POST /invites/7/accept");
    // Keyboard focus stays in the dialog, on the next invite.
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Accept invite to Third Crew");
  });

  it("Decline: POSTs {} to decline, list and count update, groups unchanged", async () => {
    const { api } = await loadPage("index", inviteApi([INV_BAND]).routes);
    await ready();
    $("tp-invites").click();
    await expect.poll(() => $("tp-invites-list").querySelectorAll("li").length).toBe(1);
    buttonByName($("tp-invites-list"), "Decline invite to Synthetic Band")!.click();
    await expect.poll(() => text("tp-invites-status")).toBe("Invite to “Synthetic Band” declined.");
    await expect.poll(() => text("tp-invite-count")).toBe("0");
    expect($("tp-invites-list").querySelectorAll("li")).toHaveLength(0);
    expect($("tp-invites-empty").hidden).toBe(false);
    expect(text("tp-invites-empty")).toBe("You have no pending invites.");
    expect(options()).toEqual([["1", "Test Crew"]]);
    expect(api.lines()).toContain("POST /invites/7/decline");
    // Last invite gone: focus moves to Close.
    expect(document.activeElement?.id).toBe("tp-invites-close");
  });

  it.each([404, 409])("an invite answered elsewhere (%i): text message, list refreshed", async (status) => {
    let pending = [INV_BAND];
    await loadPage("index", session({
      "GET /invites": () => [200, pending],
      "POST /invites/7/accept": () => {
        pending = [];
        return [status, { error: "x" }];
      },
    }));
    await ready();
    $("tp-invites").click();
    await expect.poll(() => $("tp-invites-list").querySelectorAll("li").length).toBe(1);
    buttonByName($("tp-invites-list"), "Accept invite to Synthetic Band")!.click();
    await expect.poll(() => text("tp-invites-error")).toBe("This invite is no longer available.");
    expect($("tp-invites-error").getAttribute("role")).toBe("alert");
    await expect.poll(() => text("tp-invite-count")).toBe("0");
  });

  it("invites that arrive while the tab is hidden are picked up when it becomes visible", async () => {
    let pending: (typeof INV_BAND)[] = [];
    await loadPage("index", session({ "GET /invites": () => [200, pending] }));
    await ready();
    await expect.poll(() => text("tp-invite-count")).toBe("0");
    pending = [INV_BAND];
    document.dispatchEvent(new Event("visibilitychange"));
    await expect.poll(() => text("tp-invite-count")).toBe("1");
  });
});

describe("#8 AC3 invite to the current group: username search, errors as text", () => {
  const SAM = { id: "u-sam", username: "sam.dev" };

  async function openInvite(over: Record<string, Handler> = {}) {
    const page = await loadPage("index", session({ "GET /users": [200, [SAM]], ...over }));
    await ready();
    $("tp-invite-user").click();
    return page;
  }

  async function search(q: string) {
    const input = $<HTMLInputElement>("tp-user-search");
    input.value = q;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }

  it("the dialog names the current group and has a labelled search field", async () => {
    await openInvite();
    expect(dialogOpen("tp-invite-dialog")).toBe(true);
    expect(text("tp-invite-title")).toBe("Invite to Test Crew");
    expect(labelOf("tp-user-search")).toBe("Search for a username");
    expect($("tp-user-search").getAttribute("aria-controls")).toBe("tp-user-results");
  });

  it("Enter searches the user directory and lists results with a labelled Invite button", async () => {
    const { api } = await openInvite();
    await search("  sam ");
    await expect.poll(() => $("tp-user-results").querySelectorAll("li").length).toBe(1);
    expect(api.lines()).toContain("GET /users?q=sam");
    expect($("tp-user-results").querySelector(".username")?.textContent).toBe("sam.dev");
    expect(buttonByName($("tp-user-results"), "Invite sam.dev to Test Crew")?.textContent).toBe("Invite");
    expect(text("tp-user-results-status")).toBe("1 person found.");
  });

  it("typing searches after a 300 ms pause (debounced), not on every key", async () => {
    const { api } = await openInvite();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const input = $<HTMLInputElement>("tp-user-search");
    for (const q of ["s", "sa", "sam"]) {
      input.value = q;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(api.calls.filter((c) => c.path === "/users")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    vi.useRealTimers();
    expect(api.lines().filter((l) => l.startsWith("GET /users"))).toEqual(["GET /users?q=sam"]);
  });

  it.each([
    [[], "No one found with that username."],
    [[SAM, { id: "u2", username: "sam.dev2" }], "2 people found."],
    [Array.from({ length: 20 }, (_, i) => ({ id: `u${i}`, username: `sam.dev${i}` })), "Showing the first 20 people. Type more to narrow it down."],
  ])("result count is announced as text (%#)", async (users, message) => {
    await openInvite({ "GET /users": [200, users] });
    await search("sam");
    await expect.poll(() => text("tp-user-results-status")).toBe(message);
  });

  it("Invite: POSTs the username to the current group's invites, then confirms as text", async () => {
    const { api } = await openInvite({
      "POST /groups/1/invites": [201, { id: 9, group_id: 1, invitee_id: SAM.id, status: "pending" }],
    });
    await search("sam");
    await expect.poll(() => $("tp-user-results").querySelectorAll("li").length).toBe(1);
    const btn = buttonByName($("tp-user-results"), "Invite sam.dev to Test Crew")!;
    btn.click();
    await expect.poll(() => text("tp-invite-status")).toBe(
      "Invite sent to sam.dev. They will see it next to “Invites” after they log in.",
    );
    expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({ username: "sam.dev" });
    expect(btn.textContent).toBe("Invited");
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    btn.click(); // no second invite
    await settle();
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it.each([
    [409, "sam.dev is already a member of “Test Crew” or already has an invite waiting."],
    [404, "There is no user called sam.dev."],
    [403, "You are no longer a member of “Test Crew”, so you cannot invite people to it."],
    [400, "That username is not valid."],
    [500, "Something went wrong. Please try again."],
  ])("Invite error %i is shown as text in a role=alert", async (status, message) => {
    await openInvite({ "POST /groups/1/invites": [status, { error: "x" }] });
    await search("sam");
    await expect.poll(() => $("tp-user-results").querySelectorAll("li").length).toBe(1);
    buttonByName($("tp-user-results"), "Invite sam.dev to Test Crew")!.click();
    await expect.poll(() => text("tp-invite-error")).toBe(message);
    expect($("tp-invite-error").getAttribute("role")).toBe("alert");
    expect(text("tp-invite-status")).toBe("");
  });

  it("invites go to the group selected at the time (after switching groups)", async () => {
    const { api } = await loadPage("index", session({
      "GET /groups": [200, [CREW, BAND]],
      "GET /users": [200, [SAM]],
      "POST /groups/2/invites": [201, { id: 9 }],
    }));
    await ready();
    const select = $<HTMLSelectElement>("tp-group");
    select.value = "2";
    select.dispatchEvent(new Event("change"));
    $("tp-invite-user").click();
    expect(text("tp-invite-title")).toBe("Invite to Synthetic Band");
    await search("sam");
    await expect.poll(() => $("tp-user-results").querySelectorAll("li").length).toBe(1);
    buttonByName($("tp-user-results"), "Invite sam.dev to Synthetic Band")!.click();
    await expect.poll(() => api.lines()).toContain("POST /groups/2/invites");
  });

  it("usernames from the directory are rendered as text", async () => {
    await openInvite({ "GET /users": [200, [{ id: "u9", username: "<img src=x>" }]] });
    await search("img");
    await expect.poll(() => $("tp-user-results").querySelectorAll("li").length).toBe(1);
    expect($("tp-user-results").querySelector("img")).toBeNull();
    expect($("tp-user-results").querySelector(".username")?.textContent).toBe("<img src=x>");
  });
});

describe("#8 AC4 unauthenticated visitors to app pages are redirected to /login", () => {
  it.each([
    ["index", ""],
    ["quotes/new", ""],
    ["quotes/edit", "?id=1"],
  ] as [PageName, string][])("%s with GET /api/auth/me → 401: location.replace('/login'), content stays hidden", async (name, search) => {
    const { location } = await loadPage(name, {
      "GET /auth/me": [401, { error: "unauthorized" }],
      "GET /quotes/1": [401, { error: "unauthorized" }],
    }, { search });
    await expect.poll(() => location.replace.mock.calls.length).toBeGreaterThan(0);
    await settle();
    // quotes/edit loads the quote in parallel, so both scripts may redirect; only ever to /login.
    expect(new Set(location.replace.mock.calls.map((c) => c[0]))).toEqual(new Set(["/login"]));
    expect(location.assign).not.toHaveBeenCalled();
    expect($("main").hidden).toBe(true);
    expect($("tp-logout").hidden).toBe(true);
  });

  it("a session that expires later (401 on /groups) also redirects to /login", async () => {
    const { location } = await loadPage("index", session({ "GET /groups": [401, { error: "unauthorized" }] }));
    await expect.poll(() => location.replace.mock.calls).toContainEqual(["/login"]);
  });

  it("a network failure on the session check shows a text error instead of redirecting", async () => {
    const { location } = await loadPage("index", session({ "GET /auth/me": [500, {}] }));
    await expect.poll(() => text("tp-error")).toBe("Something went wrong. Please try again.");
    expect(location.replace).not.toHaveBeenCalled();
  });
});

describe("#8 AC5 keyboard-operable and accessible (static and focus checks)", () => {
  it("every control is a native button/select/input/link; no positive tabindex", async () => {
    await loadPage("index", session());
    await ready();
    const header = document.querySelector("header.topbar")!;
    for (const el of header.querySelectorAll<HTMLElement>("[id^='tp-']")) {
      if (el.matches("button")) expect((el as HTMLButtonElement).type).toBe("button");
    }
    expect(document.querySelectorAll("[tabindex]:not([tabindex='-1'])")).toHaveLength(0);
    expect(document.querySelector("[onclick]")).toBeNull();
  });

  it("buttons that open dialogs say so (aria-haspopup); every dialog has an accessible name", async () => {
    await loadPage("index", session());
    for (const id of ["tp-new-group", "tp-invite-user", "tp-invites"]) {
      expect($(id).getAttribute("aria-haspopup")).toBe("dialog");
    }
    for (const id of ["tp-new-group-dialog", "tp-invite-dialog", "tp-invites-dialog"]) {
      const d = $(id);
      expect(d.tagName).toBe("DIALOG");
      const titleId = d.getAttribute("aria-labelledby")!;
      expect(text(titleId)).not.toBe("");
    }
  });

  it("every dialog has a keyboard-reachable Close/Cancel button that closes it", async () => {
    await loadPage("index", session());
    await ready();
    for (const [open, dialog] of [["tp-new-group", "tp-new-group-dialog"], ["tp-invite-user", "tp-invite-dialog"], ["tp-invites", "tp-invites-dialog"]]) {
      $(open).click();
      expect(dialogOpen(dialog)).toBe(true);
      const close = $(dialog).querySelector<HTMLButtonElement>("[data-close]")!;
      expect(close.textContent?.trim()).toMatch(/^(Close|Cancel)$/);
      close.click();
      expect(dialogOpen(dialog)).toBe(false);
    }
  });

  it("the invite count has a text label for screen readers, not colour alone", async () => {
    await loadPage("index", session({ "GET /invites": [200, [INV_BAND]] }));
    await ready();
    await expect.poll(() => $("tp-invites").classList.contains("has-invites")).toBe(true);
    expect(text("tp-invites")).toBe("Invites 1 pending");
  });
});
