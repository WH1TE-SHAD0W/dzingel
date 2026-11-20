// Vitest global setup: render every page with Astro's Container API (server-side, from source,
// so no `astro build` and no stale web/dist) and hand the HTML to the DOM tests via inject().
// Rendering happens here, in Node, because importing an .astro file inside a happy-dom test is
// transformed for the client and would run the page script before any DOM exists.
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { TestProject } from "vitest/node";

export type PageName = "index" | "login" | "register" | "quotes/new" | "quotes/edit";

declare module "vitest" {
  export interface ProvidedContext {
    pages: Record<PageName, string>;
  }
}

export default async function setup(project: TestProject): Promise<void> {
  const container = await AstroContainer.create();
  const modules: Record<PageName, () => Promise<{ default: unknown }>> = {
    index: () => import("../../src/pages/index.astro"),
    login: () => import("../../src/pages/login.astro"),
    register: () => import("../../src/pages/register.astro"),
    "quotes/new": () => import("../../src/pages/quotes/new.astro"),
    "quotes/edit": () => import("../../src/pages/quotes/edit.astro"),
  };
  const pages = {} as Record<PageName, string>;
  for (const [name, load] of Object.entries(modules) as [PageName, (typeof modules)[PageName]][]) {
    const page = (await load()).default as Parameters<typeof container.renderToString>[0];
    pages[name] = await container.renderToString(page);
  }
  project.provide("pages", pages);
}
