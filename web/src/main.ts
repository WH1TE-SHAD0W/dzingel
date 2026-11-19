type Group = { id: number; name: string };
type Quote = { id: number; text: string; context: string; created_at: string };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const groupSel = $<HTMLSelectElement>("group");

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? r.statusText);
  return r.json();
}

async function loadGroups() {
  const groups = await api<Group[]>("/groups");
  const prev = groupSel.value;
  groupSel.replaceChildren(...groups.map((g) => new Option(g.name, String(g.id))));
  if (prev) groupSel.value = prev;
  await loadQuotes();
}

async function loadQuotes() {
  const list = $("list");
  list.replaceChildren();
  if (!groupSel.value) return;
  const q = $<HTMLInputElement>("search").value;
  const quotes = await api<Quote[]>(`/quotes?group=${groupSel.value}&q=${encodeURIComponent(q)}`);
  for (const quote of quotes) {
    const li = document.createElement("li");
    const text = document.createElement("div");
    text.textContent = `“${quote.text}”`;
    const ctx = document.createElement("small");
    ctx.textContent = `${quote.context} (${quote.created_at.slice(0, 10)})`;
    const edit = document.createElement("button");
    edit.textContent = "edit";
    edit.onclick = async () => {
      const t = prompt("Quote", quote.text);
      if (!t) return;
      const c = prompt("Context", quote.context) ?? quote.context;
      await api(`/quotes/${quote.id}`, "PUT", { text: t, context: c });
      loadQuotes();
    };
    const del = document.createElement("button");
    del.textContent = "delete";
    del.onclick = async () => {
      if (confirm("Delete?")) {
        await api(`/quotes/${quote.id}`, "DELETE");
        loadQuotes();
      }
    };
    li.append(text, ctx, edit, " ", del);
    list.append(li);
  }
}

$("newGroup").onclick = async () => {
  const name = prompt("Group name");
  if (!name) return;
  const g = await api<Group>("/groups", "POST", { name });
  await loadGroups();
  groupSel.value = String(g.id);
  loadQuotes();
};
groupSel.onchange = loadQuotes;
$("search").oninput = loadQuotes;
$<HTMLFormElement>("form").onsubmit = async (e) => {
  e.preventDefault();
  if (!groupSel.value) return alert("Create a group first");
  await api("/quotes", "POST", {
    group_id: Number(groupSel.value),
    text: $<HTMLInputElement>("text").value,
    context: $<HTMLTextAreaElement>("context").value,
  });
  (e.target as HTMLFormElement).reset();
  loadQuotes();
};

loadGroups().catch((e) => alert(e.message));
