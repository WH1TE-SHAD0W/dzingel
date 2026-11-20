// Quote list for the selected group. The group comes from the top panel (onGroupChange).
// Adding a quote happens on /quotes/new. Edit/delete still use the browser dialogs (#10).
import { api, genericMessage, type Group, type Quote } from "./lib/api";
import { onGroupChange, redirectIfUnauthorized } from "./lib/app";
import { byId } from "./lib/form";

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

/** SQLite CURRENT_TIMESTAMP ("YYYY-MM-DD HH:MM:SS", UTC) as a readable local date. */
function formatDate(raw: string): string {
  const date = new Date(`${raw.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? raw.slice(0, 10)
    : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
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
  const time = document.createElement("time");
  time.dateTime = quote.created_at;
  time.textContent = formatDate(quote.created_at);
  const meta = paragraph("quote-meta", `Added by ${quote.author ?? "a former member"} on `);
  meta.append(time);
  const edit = document.createElement("button");
  edit.className = "btn btn-secondary";
  edit.textContent = "Edit";
  edit.onclick = async () => {
    const t = prompt("Quote", quote.text);
    if (!t) return;
    const c = prompt("Context", quote.context) ?? quote.context;
    await api(`/quotes/${quote.id}`, "PUT", { text: t, context: c }).catch(fail);
    loadQuotes();
  };
  const del = document.createElement("button");
  del.className = "btn btn-secondary";
  del.textContent = "Delete";
  del.onclick = async () => {
    if (confirm("Delete?")) {
      await api(`/quotes/${quote.id}`, "DELETE").catch(fail);
      loadQuotes();
    }
  };
  li.append(text);
  if (quote.context.trim()) li.append(paragraph("quote-context", quote.context));
  li.append(meta, edit, " ", del);
  return li;
}

onGroupChange((g) => {
  group = g;
  noGroup.hidden = g !== null;
  groupContent.hidden = g === null;
  loadQuotes();
});

search.addEventListener("input", loadQuotes);
