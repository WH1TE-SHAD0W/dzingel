// Quote list for the selected group. The group comes from the top panel (onGroupChange).
// Edit/delete still use the browser dialogs; they are replaced in #9/#10.
import { api, genericMessage, type Group, type Quote } from "./lib/api";
import { onGroupChange, redirectIfUnauthorized } from "./lib/app";
import { byId } from "./lib/form";

const list = byId<HTMLUListElement>("list");
const search = byId<HTMLInputElement>("search");
const form = byId<HTMLFormElement>("form");
const error = byId<HTMLElement>("app-error");
const noGroup = byId<HTMLElement>("no-group");
const groupContent = byId<HTMLElement>("group-content");

let group: Group | null = null;
let seq = 0; // drop responses from an older group/search

function fail(err: unknown): void {
  if (!redirectIfUnauthorized(err)) error.textContent = genericMessage(err);
}

async function loadQuotes(): Promise<void> {
  const mine = ++seq;
  error.textContent = "";
  if (!group) {
    list.replaceChildren();
    return;
  }
  try {
    const quotes = await api<Quote[]>(
      `/quotes?group=${group.id}&q=${encodeURIComponent(search.value)}`,
    );
    if (mine === seq) list.replaceChildren(...quotes.map(quoteItem));
  } catch (err) {
    if (mine === seq) fail(err);
  }
}

function quoteItem(quote: Quote): HTMLLIElement {
  const li = document.createElement("li");
  const text = document.createElement("div");
  text.textContent = `“${quote.text}”`;
  const ctx = document.createElement("small");
  ctx.textContent = `${quote.context} (${quote.created_at.slice(0, 10)})`;
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
  li.append(text, ctx, edit, " ", del);
  return li;
}

onGroupChange((g) => {
  group = g;
  noGroup.hidden = g !== null;
  groupContent.hidden = g === null;
  loadQuotes();
});

search.addEventListener("input", loadQuotes);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!group) return;
  try {
    await api("/quotes", "POST", {
      group_id: group.id,
      text: byId<HTMLInputElement>("text").value,
      context: byId<HTMLTextAreaElement>("context").value,
    });
    form.reset();
    loadQuotes();
  } catch (err) {
    fail(err);
  }
});
