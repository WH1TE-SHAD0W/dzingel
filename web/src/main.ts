// Quote list for the selected group. The group comes from the top panel (onGroupChange).
// Adding a quote happens on /quotes/new; editing and deleting on /quotes/edit?id=.
import { api, genericMessage, type Group, type Quote } from "./lib/api";
import { onGroupChange, redirectIfUnauthorized } from "./lib/app";
import { byId } from "./lib/form";
import { addedBy } from "./lib/quote-form";

const list = byId<HTMLUListElement>("list");
const search = byId<HTMLInputElement>("search");
const error = byId<HTMLElement>("app-error");
const noGroup = byId<HTMLElement>("no-group");
const groupContent = byId<HTMLElement>("group-content");
const listStatus = byId<HTMLElement>("list-status");

let group: Group | null = null;
let seq = 0; // drop responses from an older group/search

function fail(err: unknown): void {
  if (!redirectIfUnauthorized(err)) error.textContent = genericMessage(err);
}

async function loadQuotes(): Promise<void> {
  const mine = ++seq;
  error.textContent = "";
  listStatus.textContent = "";
  if (!group) {
    list.replaceChildren();
    return;
  }
  try {
    const quotes = await api<Quote[]>(
      `/quotes?group=${group.id}&q=${encodeURIComponent(search.value)}`,
    );
    if (mine !== seq) return;
    list.replaceChildren(...quotes.map(quoteItem));
    if (!quotes.length)
      listStatus.textContent = search.value.trim()
        ? "No quotes match your search."
        : "No quotes in this group yet. Use “Add quote” to add the first one.";
  } catch (err) {
    if (mine === seq) fail(err);
  }
}

function paragraph(className: string, text: string): HTMLParagraphElement {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  return p;
}

function quoteItem(quote: Quote): HTMLLIElement {
  const li = document.createElement("li");
  const text = paragraph("quote-text", `“${quote.text}”`);
  text.id = `quote-${quote.id}-text`;
  li.append(text);
  if (quote.context.trim()) li.append(paragraph("quote-context", quote.context));
  const meta = paragraph("quote-meta", "");
  meta.append(...addedBy(quote.author, quote.created_at));
  const edit = document.createElement("a");
  edit.className = "btn btn-secondary";
  edit.href = `/quotes/edit?id=${quote.id}`;
  edit.textContent = "Edit quote";
  edit.setAttribute("aria-describedby", text.id); // which quote, for screen readers
  li.append(meta, edit);
  return li;
}

onGroupChange((g) => {
  group = g;
  noGroup.hidden = g !== null;
  groupContent.hidden = g === null;
  loadQuotes();
});

search.addEventListener("input", loadQuotes);
