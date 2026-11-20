// Shared DOM-test harness (happy-dom). Loads a server-rendered page into the document, stubs
// `fetch` with a tiny in-memory API and `location` with spies, then imports the page's real
// scripts. No network, no server, no build output.
import { afterEach, expect, inject, vi } from "vitest";
import type { PageName } from "./render-pages";

export type ApiReply = readonly [status: number, body?: unknown];
export type ApiRequest = { method: string; path: string; query: URLSearchParams; body: unknown };
export type Handler = ApiReply | ((req: ApiRequest) => ApiReply | Promise<ApiReply>);

export type FakeLocation = {
  href: string;
  origin: string;
  pathname: string;
  search: string;
  replace: ReturnType<typeof vi.fn>;
  assign: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
};

// The page script each page imports, in document order (top panel first on app pages).
const SCRIPTS: Record<PageName, (() => Promise<unknown>)[]> = {
  login: [() => import("../../src/scripts/login")],
  register: [() => import("../../src/scripts/register")],
  index: [() => import("../../src/scripts/top-panel"), () => import("../../src/main")],
  "quotes/new": [() => import("../../src/scripts/top-panel"), () => import("../../src/scripts/quote-new")],
  "quotes/edit": [() => import("../../src/scripts/top-panel"), () => import("../../src/scripts/quote-edit")],
};

/** The module script tags the rendered page carries (proves which component scripts it wires). */
export const SCRIPT_SOURCES: Record<PageName, RegExp[]> = {
  login: [/pages\/login\.astro\?astro&type=script/],
  register: [/pages\/register\.astro\?astro&type=script/],
  index: [/components\/TopPanel\.astro\?astro&type=script/, /pages\/index\.astro\?astro&type=script/],
  "quotes/new": [/components\/TopPanel\.astro\?astro&type=script/, /pages\/quotes\/new\.astro\?astro&type=script/],
  "quotes/edit": [/components\/TopPanel\.astro\?astro&type=script/, /pages\/quotes\/edit\.astro\?astro&type=script/],
};

export function pageHtml(name: PageName): string {
  return inject("pages")[name];
}

// --- document listener bookkeeping ---------------------------------------------------------
// The document object survives between tests of a file; scripts from an earlier test must not
// keep reacting to events (e.g. the group-change event) of the next one.
const added: [string, EventListenerOrEventListenerObject, unknown][] = [];
const realAdd = document.addEventListener.bind(document);
document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, opts?: unknown) => {
  added.push([type, listener, opts]);
  realAdd(type, listener, opts as AddEventListenerOptions);
}) as typeof document.addEventListener;

// happy-dom has no `Option` constructor (HTML spec: new Option(text, value)); the top panel uses
// it to build the group <select>. Test-environment shim with the spec's text/value semantics.
function OptionShim(text = "", value?: string): HTMLOptionElement {
  const o = document.createElement("option");
  o.text = text;
  if (value !== undefined) o.value = value;
  return o;
}

export type Api = {
  calls: ApiRequest[];
  /** Calls as "METHOD /path?query" strings. */
  lines(): string[];
  /** Change or add a route while the page is running. */
  route(key: string, handler: Handler): void;
};

export type Page = { api: Api; location: FakeLocation };

/**
 * Load `name` into the document, stub the API with `routes` ("GET /auth/me" → [status, body] or a
 * function), stub location (with `search`), import the page scripts and return the spies.
 * API responses are held until every script of the page has been evaluated, as in a browser,
 * where the deferred module scripts run back to back before any network response is handled.
 */
export async function loadPage(
  name: PageName,
  routes: Record<string, Handler>,
  opts: { search?: string } = {},
): Promise<Page> {
  const parsed = new DOMParser().parseFromString(pageHtml(name), "text/html");
  for (const s of parsed.querySelectorAll("script")) s.remove();
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  document.body.className = parsed.body.className;

  const table = new Map(Object.entries(routes));
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const calls: ApiRequest[] = [];
  const unmatched: string[] = [];

  vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, "http://localhost");
    const method = (init.method ?? "GET").toUpperCase();
    expect(url.pathname.startsWith("/api/"), `relative /api URL: ${input}`).toBe(true);
    const path = url.pathname.slice(4);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    const req: ApiRequest = { method, path, query: url.searchParams, body };
    calls.push(req);
    await gate;
    const handler = table.get(`${method} ${path}`);
    if (!handler) {
      unmatched.push(`${method} ${path}`);
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }
    const [status, data] = typeof handler === "function" ? await handler(req) : handler;
    return new Response(data === undefined ? "" : JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });
  });

  const href = `http://localhost/${name === "index" ? "" : name}${opts.search ?? ""}`;
  const u = new URL(href);
  const location: FakeLocation = {
    href,
    origin: u.origin,
    pathname: u.pathname,
    search: u.search,
    replace: vi.fn(),
    assign: vi.fn(),
    reload: vi.fn(),
  };
  vi.stubGlobal("location", location);
  vi.stubGlobal("Option", OptionShim);

  vi.resetModules();
  for (const load of SCRIPTS[name]) await load();
  release();

  current = { unmatched };
  return {
    api: {
      calls,
      lines: () => calls.map((c) => `${c.method} /${c.path.replace(/^\//, "")}${c.query.size ? `?${c.query}` : ""}`),
      route: (key, handler) => table.set(key, handler),
    },
    location,
  };
}

let current: { unmatched: string[] } | null = null;

// Never let a test reach the real network: happy-dom's own fetch would really request
// http://localhost:3000. Outside loadPage() (and after a test) fetch rejects like an offline browser.
const offline = () => Promise.reject(new TypeError("network disabled in tests"));
globalThis.fetch = offline as typeof fetch;

afterEach(async () => {
  // Let work a test did not wait for (e.g. the panel's invite count) finish against the stubs.
  for (let i = 0; i < 5; i++) await settle();
  for (const [type, listener, opts] of added.splice(0)) {
    document.removeEventListener(type, listener, opts as EventListenerOptions);
  }
  vi.unstubAllGlobals();
  globalThis.fetch = offline as typeof fetch;
  vi.useRealTimers();
  localStorage.clear();
  const leftover = current?.unmatched ?? [];
  current = null;
  expect(leftover, "requests without a stubbed route").toEqual([]);
});

// --- small helpers -------------------------------------------------------------------------

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};

/** Accessible name source: the <label for> text of a control. */
export function labelOf(id: string): string {
  const label = document.querySelector(`label[for="${id}"]`);
  return label?.textContent?.trim() ?? "";
}

/** IDs listed in aria-describedby. */
export const describedBy = (el: HTMLElement) => (el.getAttribute("aria-describedby") ?? "").split(/\s+/);

/** Set a field's value and fire `input`, as typing would. */
export function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Submit a form the way a user does: click its submit button. */
export function submit(form: HTMLFormElement): void {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) throw new Error("form has no submit button");
  button.click();
}

/** Let pending promise callbacks and zero-delay tasks run. */
export const settle = () => new Promise<void>((r) => setTimeout(r, 0));

export const text = (id: string) => ($(id).textContent ?? "").replace(/\s+/g, " ").trim();

export const ALEX = { id: "u-alex", username: "alex.dev" };
export const CREW = { id: 1, name: "Test Crew" };
export const BAND = { id: 2, name: "Synthetic Band" };
