// Behaviour for components/QuoteFields.astro: live character counters and validation that
// mirrors the API (api/src/app.ts). The server still validates everything (SEC-01).

import { byId, setFieldError, setFormError } from "./form";

export const TEXT_MAX = 1000;
export const CONTEXT_MAX = 2000;
/** From this many characters left, counter changes are announced to screen readers. */
const ANNOUNCE_LEFT = 50;

export const QUOTE_MSG = {
  textEmpty: "Please type the quote.",
  textLong: `The quote is too long. Use at most ${TEXT_MAX} characters.`,
  contextLong: `The context is too long. Use at most ${CONTEXT_MAX} characters.`,
  serverRejected: "The quote could not be saved. Please check both fields and try again.",
};

/** Quote text rule, as the API: non-blank after trimming, raw length within the limit. */
export function checkQuoteText(value: string): string {
  return !value.trim() ? QUOTE_MSG.textEmpty : value.length > TEXT_MAX ? QUOTE_MSG.textLong : "";
}

/** Quote context rule: optional, at most CONTEXT_MAX characters. */
export function checkQuoteContext(value: string): string {
  return value.length > CONTEXT_MAX ? QUOTE_MSG.contextLong : "";
}

/** SQLite CURRENT_TIMESTAMP ("YYYY-MM-DD HH:MM:SS", UTC) as a readable local date. */
export function formatDate(raw: string): string {
  const date = new Date(`${raw.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? raw.slice(0, 10)
    : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** "Added by <author> on <date>" as text nodes plus a <time> element. */
export function addedBy(author: string | null, createdAt: string): (string | HTMLElement)[] {
  const time = document.createElement("time");
  time.dateTime = createdAt;
  time.textContent = formatDate(createdAt);
  return [`Added by ${author ?? "a former member"} on `, time];
}

type Field = {
  el: HTMLTextAreaElement;
  counter: HTMLElement;
  max: number;
  check: () => string;
};

export type QuoteFields = {
  values(): { text: string; context: string };
  fill(text: string, context: string): void;
  /** Show inline errors and a summary; focus the first invalid field. True when valid. */
  validate(): boolean;
  /** The API answered 400 although the client checks passed. */
  serverRejected(): void;
};

export function setupQuoteFields(formError: HTMLElement): QuoteFields {
  const text = byId<HTMLTextAreaElement>("quote-text");
  const context = byId<HTMLTextAreaElement>("quote-context");

  const fields: Field[] = [
    {
      el: text,
      counter: byId("quote-text-count"),
      max: TEXT_MAX,
      check: () => checkQuoteText(text.value),
    },
    {
      el: context,
      counter: byId("quote-context-count"),
      max: CONTEXT_MAX,
      check: () => checkQuoteContext(context.value),
    },
  ];

  function updateCounter(f: Field): void {
    const used = f.el.value.length;
    f.counter.setAttribute("aria-live", f.max - used <= ANNOUNCE_LEFT ? "polite" : "off");
    f.counter.textContent = `${used} of ${f.max} characters used`;
  }

  for (const f of fields) {
    updateCounter(f);
    f.el.addEventListener("input", () => {
      updateCounter(f);
      // Once a field has been flagged, re-check it as the user corrects it.
      if (f.el.getAttribute("aria-invalid") === "true") setFieldError(f.el, f.check());
    });
  }

  return {
    values: () => ({ text: text.value, context: context.value }),
    fill(t, c) {
      text.value = t;
      context.value = c;
      for (const f of fields) updateCounter(f);
    },
    validate() {
      let first: HTMLTextAreaElement | null = null;
      let count = 0;
      for (const f of fields) {
        const message = f.check();
        setFieldError(f.el, message);
        if (message) {
          count++;
          first ??= f.el;
        }
      }
      if (!first) return true;
      setFormError(
        formError,
        count === 1 ? "Please fix 1 problem below." : `Please fix ${count} problems below.`,
      );
      first.focus();
      return false;
    },
    serverRejected() {
      setFormError(formError, QUOTE_MSG.serverRejected);
      text.focus();
    },
  };
}
