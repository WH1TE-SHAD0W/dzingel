// @vitest-environment happy-dom
// #23 Terms and Privacy pages: static, public, draft-marked, accessible, linked from every page.
import { describe, expect, it } from "vitest";
import type { PageName } from "./render-pages";
import { pageHtml } from "./dom";

const LEGAL: PageName[] = ["terms", "privacy"];
const ALL: PageName[] = ["index", "login", "register", "quotes/new", "quotes/edit", "terms", "privacy"];

function doc(name: PageName): Document {
  return new DOMParser().parseFromString(pageHtml(name), "text/html");
}

describe("#23 AC1 Terms and Privacy pages exist and need no login", () => {
  it.each(LEGAL)("%s renders a full page with a main landmark and no session-dependent script", (name) => {
    const d = doc(name);
    expect(d.querySelector("main")).not.toBeNull();
    expect(d.title.length).toBeGreaterThan(3);
    // Static: no page script, hence no /api call and no redirect for anonymous visitors.
    expect(d.querySelectorAll("script").length).toBe(0);
    expect(pageHtml(name)).not.toMatch(/auth\/me|\/api\//);
  });

  it("titles identify the pages", () => {
    expect(doc("terms").querySelector("h1")?.textContent).toBe("Terms and Conditions");
    expect(doc("privacy").querySelector("h1")?.textContent).toBe("Privacy notice");
  });
});

describe("#23 AC2 static plain text, no third parties, marked DRAFT", () => {
  it.each(LEGAL)("%s has a DRAFT / not legal advice note", (name) => {
    const note = doc(name).querySelector('[role="note"]');
    expect(note?.textContent).toMatch(/DRAFT/);
    expect(note?.textContent).toMatch(/not legal advice/i);
  });

  it.each(LEGAL)("%s makes no external requests (no absolute URLs, fonts, scripts, iframes, images)", (name) => {
    const d = doc(name);
    const html = pageHtml(name);
    expect(html).not.toMatch(/https?:\/\//i);
    expect(d.querySelectorAll("script, iframe, img, link[rel=stylesheet], link[rel=preconnect]").length).toBe(0);
    expect(html).not.toMatch(/@import|fonts\.(googleapis|gstatic)|googletagmanager|gtag\(/i);
  });

  it.each(LEGAL)("%s shows operator details (placeholders when unset)", (name) => {
    const text = doc(name).body.textContent ?? "";
    expect(text).toMatch(/Operated by/);
    expect(text).toMatch(/Contact:/);
    expect(text).toMatch(/Effective:/);
  });
});

describe("#23 AC3 footer links to both pages on every page", () => {
  it.each(ALL)("%s has a Legal nav with descriptive links", (name) => {
    const nav = doc(name).querySelector('footer nav[aria-label="Legal"]');
    expect(nav).not.toBeNull();
    const links = [...nav!.querySelectorAll("a")].map((a) => [a.textContent?.trim(), a.getAttribute("href")]);
    expect(links).toEqual([
      ["Terms and Conditions", "/terms"],
      ["Privacy notice", "/privacy"],
    ]);
  });

  it("Terms and Privacy cross-link, and both link back to registration", () => {
    expect(doc("terms").querySelector('main a[href="/privacy"]')).not.toBeNull();
    expect(doc("privacy").querySelector('main a[href="/terms"]')).not.toBeNull();
    for (const n of LEGAL) expect(doc(n).querySelector('main a[href="/register"]')).not.toBeNull();
  });
});

describe("#23 AC8 accessibility basics of the new pages", () => {
  it.each(LEGAL)("%s: lang, one h1 first, h2 sections, no skipped heading levels", (name) => {
    const d = doc(name);
    expect(d.documentElement.getAttribute("lang")).toBe("en");
    const levels = [...d.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(1);
    expect(levels.filter((l) => l === 1).length).toBe(1);
    expect(levels.filter((l) => l === 2).length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
  });

  it.each(LEGAL)("%s: links have text, one main landmark with id, no inline colour or font-size", (name) => {
    const d = doc(name);
    for (const a of d.querySelectorAll("a")) expect(a.textContent?.trim().length).toBeGreaterThan(0);
    expect(d.querySelectorAll("main").length).toBe(1);
    expect(d.querySelector("main")?.id).toBe("main");
    expect(pageHtml(name)).not.toMatch(/style="[^"]*(color|font-size)/i);
  });

  it("register form: every input has a label for/id, checkbox included", () => {
    const d = doc("register");
    const inputs = [...d.querySelectorAll("form input")];
    expect(inputs.map((i) => i.id)).toContain("reg-terms");
    for (const input of inputs) {
      expect(d.querySelector(`label[for="${input.id}"]`), input.id).not.toBeNull();
    }
  });
});
