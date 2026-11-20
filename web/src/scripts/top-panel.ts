import {
  api,
  genericMessage,
  getMe,
  isStatus,
  logout,
  type Group,
  type Invite,
  type User,
} from "../lib/api";
import { emitGroupChange, emitSession, redirectIfUnauthorized } from "../lib/app";
import { byId, setFieldError, startBusy } from "../lib/form";

type DirectoryUser = { id: string; username: string };

const STORAGE_KEY = "dzingel.group";
const SEARCH_DELAY_MS = 300;
const USERS_LIMIT = 20; // the API returns at most 20 matches

const el = {
  loading: byId<HTMLElement>("tp-loading"),
  username: byId<HTMLElement>("tp-username"),
  logout: byId<HTMLButtonElement>("tp-logout"),
  group: byId<HTMLSelectElement>("tp-group"),
  newGroup: byId<HTMLButtonElement>("tp-new-group"),
  inviteUser: byId<HTMLButtonElement>("tp-invite-user"),
  invites: byId<HTMLButtonElement>("tp-invites"),
  inviteCount: byId<HTMLElement>("tp-invite-count"),
  status: byId<HTMLElement>("tp-status"),
  error: byId<HTMLElement>("tp-error"),
  // New group dialog
  newGroupDialog: byId<HTMLDialogElement>("tp-new-group-dialog"),
  newGroupForm: byId<HTMLFormElement>("tp-new-group-form"),
  groupName: byId<HTMLInputElement>("tp-group-name"),
  newGroupSubmit: byId<HTMLButtonElement>("tp-new-group-submit"),
  // Invite someone dialog
  inviteDialog: byId<HTMLDialogElement>("tp-invite-dialog"),
  inviteGroup: byId<HTMLElement>("tp-invite-group"),
  userSearch: byId<HTMLInputElement>("tp-user-search"),
  userResultsStatus: byId<HTMLElement>("tp-user-results-status"),
  userResults: byId<HTMLUListElement>("tp-user-results"),
  inviteError: byId<HTMLElement>("tp-invite-error"),
  inviteStatus: byId<HTMLElement>("tp-invite-status"),
  // Pending invites dialog
  invitesDialog: byId<HTMLDialogElement>("tp-invites-dialog"),
  invitesClose: byId<HTMLButtonElement>("tp-invites-close"),
  invitesEmpty: byId<HTMLElement>("tp-invites-empty"),
  invitesList: byId<HTMLUListElement>("tp-invites-list"),
  invitesError: byId<HTMLElement>("tp-invites-error"),
  invitesStatus: byId<HTMLElement>("tp-invites-status"),
};

let groups: Group[] = [];
let current: Group | null = null;
let invites: Invite[] = [];

// --- Helpers -------------------------------------------------------------------------------

// localStorage can throw (privacy modes, disabled storage); the app must work without it.
function readStoredGroup(): number | null {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function storeGroup(id: number | null): void {
  try {
    if (id === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // ignore: only a convenience
  }
}

/** One message slot pair (status + alert): setting one clears the other. */
function say(status: HTMLElement, alert: HTMLElement, message: string, isError = false): void {
  status.textContent = isError ? "" : message;
  alert.textContent = isError ? message : "";
}
const panelSay = (message: string, isError = false) => say(el.status, el.error, message, isError);

function panelError(err: unknown): void {
  if (!redirectIfUnauthorized(err)) panelSay(genericMessage(err), true);
}

function button(label: string, className: string, accessibleName?: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  if (accessibleName) b.setAttribute("aria-label", accessibleName);
  return b;
}

const quoted = (s: string) => `“${s}”`;

// --- Groups --------------------------------------------------------------------------------

function selectGroup(id: number | null): void {
  current = groups.find((g) => g.id === id) ?? groups[0] ?? null;
  el.group.value = current ? String(current.id) : "";
  if (current) storeGroup(current.id);
  el.inviteUser.hidden = !current; // nothing to invite to without a group
  emitGroupChange(current);
}

async function loadGroups(preferred?: number): Promise<void> {
  groups = await api<Group[]>("/groups");
  el.group.replaceChildren(
    ...(groups.length
      ? groups.map((g) => new Option(g.name, String(g.id))) // Option() sets text, never HTML
      : [new Option("No groups yet", "")]),
  );
  el.group.disabled = groups.length === 0;
  selectGroup(preferred ?? current?.id ?? readStoredGroup());
}

el.group.addEventListener("change", () => selectGroup(Number(el.group.value)));

el.newGroup.addEventListener("click", () => {
  el.newGroupForm.reset();
  setFieldError(el.groupName, "");
  el.newGroupDialog.showModal();
});

el.newGroupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = el.groupName.value.trim();
  if (!name) {
    setFieldError(el.groupName, "Please enter a name for the group.");
    el.groupName.focus();
    return;
  }
  const done = startBusy(el.newGroupSubmit, "Creating…");
  if (!done) return;
  try {
    const group = await api<Group>("/groups", "POST", { name });
    done();
    el.newGroupDialog.close();
    await loadGroups(group.id);
    panelSay(`Group ${quoted(group.name)} created and selected.`);
  } catch (err) {
    done();
    if (redirectIfUnauthorized(err)) return;
    setFieldError(
      el.groupName,
      isStatus(err, 400) ? "Please enter a name of up to 100 characters." : genericMessage(err),
    );
    el.groupName.focus();
  }
});

// --- Invite someone to the current group ---------------------------------------------------

let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchSeq = 0; // ignore responses that arrive after a newer search started

el.inviteUser.addEventListener("click", () => {
  if (!current) return;
  el.inviteGroup.textContent = current.name;
  el.userSearch.value = "";
  el.userResults.replaceChildren();
  el.userResultsStatus.textContent = "";
  say(el.inviteStatus, el.inviteError, "");
  el.inviteDialog.showModal();
});

el.userSearch.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchUsers, SEARCH_DELAY_MS);
});
// Enter in the search box runs the search now instead of waiting for the delay.
el.userSearch.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  clearTimeout(searchTimer);
  searchUsers();
});

async function searchUsers(): Promise<void> {
  const q = el.userSearch.value.trim();
  const seq = ++searchSeq;
  if (!q) {
    el.userResults.replaceChildren();
    el.userResultsStatus.textContent = "";
    return;
  }
  try {
    const users = await api<DirectoryUser[]>(`/users?q=${encodeURIComponent(q)}`);
    if (seq !== searchSeq) return;
    el.userResults.replaceChildren(...users.map(userItem));
    el.userResultsStatus.textContent =
      users.length === 0 ? "No one found with that username."
      : users.length === 1 ? "1 person found."
      : users.length >= USERS_LIMIT ? `Showing the first ${users.length} people. Type more to narrow it down.`
      : `${users.length} people found.`;
  } catch (err) {
    if (seq !== searchSeq || redirectIfUnauthorized(err)) return;
    say(el.inviteStatus, el.inviteError, genericMessage(err), true);
  }
}

function userItem(user: DirectoryUser): HTMLLIElement {
  const li = document.createElement("li");
  const name = document.createElement("span");
  name.className = "username";
  name.textContent = user.username;
  const invite = button("Invite", "btn", `Invite ${user.username} to ${current?.name ?? "this group"}`);
  invite.addEventListener("click", () => sendInvite(user.username, invite));
  li.append(name, invite);
  return li;
}

async function sendInvite(username: string, btn: HTMLButtonElement): Promise<void> {
  const group = current;
  if (!group) return;
  const done = startBusy(btn, "Inviting…");
  if (!done) return;
  say(el.inviteStatus, el.inviteError, "");
  try {
    await api(`/groups/${group.id}/invites`, "POST", { username });
    done();
    btn.textContent = "Invited";
    btn.setAttribute("aria-disabled", "true"); // startBusy() treats this as "do nothing"
    say(el.inviteStatus, el.inviteError,
      `Invite sent to ${username}. They will see it next to “Invites” after they log in.`);
  } catch (err) {
    done();
    if (redirectIfUnauthorized(err)) return;
    const message =
      isStatus(err, 409) ? `${username} is already a member of ${quoted(group.name)} or already has an invite waiting.`
      : isStatus(err, 404) ? `There is no user called ${username}.`
      : isStatus(err, 403) ? `You are no longer a member of ${quoted(group.name)}, so you cannot invite people to it.`
      : isStatus(err, 400) ? "That username is not valid."
      : genericMessage(err);
    say(el.inviteStatus, el.inviteError, message, true);
  }
}

// --- Pending invites -----------------------------------------------------------------------

async function loadInvites(): Promise<void> {
  invites = await api<Invite[]>("/invites");
  el.inviteCount.textContent = String(invites.length);
  el.invites.classList.toggle("has-invites", invites.length > 0);
  el.invitesEmpty.hidden = invites.length > 0;
  el.invitesList.replaceChildren(...invites.map(inviteItem));
}

function inviteItem(invite: Invite): HTMLLIElement {
  const li = document.createElement("li");
  const text = document.createElement("p");
  const who = document.createElement("strong");
  who.textContent = invite.inviter ?? "Someone";
  const group = document.createElement("strong");
  group.textContent = invite.group_name;
  text.append(who, " invited you to join ", group);

  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  const accept = button("Accept", "btn", `Accept invite to ${invite.group_name}`);
  const decline = button("Decline", "btn btn-secondary", `Decline invite to ${invite.group_name}`);
  accept.addEventListener("click", () => answer(invite, "accept", accept));
  decline.addEventListener("click", () => answer(invite, "decline", decline));
  actions.append(accept, decline);

  li.append(text, actions);
  return li;
}

async function answer(invite: Invite, action: "accept" | "decline", btn: HTMLButtonElement) {
  const done = startBusy(btn, action === "accept" ? "Joining…" : "Declining…");
  if (!done) return;
  say(el.invitesStatus, el.invitesError, "");
  const position = invites.indexOf(invite);
  try {
    await api(`/invites/${invite.id}/${action}`, "POST");
    if (action === "accept") {
      await loadGroups(invite.group_id);
      say(el.invitesStatus, el.invitesError,
        `You joined ${quoted(invite.group_name)}. It is now your selected group.`);
    } else {
      say(el.invitesStatus, el.invitesError, `Invite to ${quoted(invite.group_name)} declined.`);
    }
  } catch (err) {
    if (redirectIfUnauthorized(err)) return;
    say(el.invitesStatus, el.invitesError,
      isStatus(err, 404) || isStatus(err, 409) ? "This invite is no longer available."
      : genericMessage(err), true);
  }
  done();
  try {
    await loadInvites();
  } catch (err) {
    if (redirectIfUnauthorized(err)) return;
    say(el.invitesStatus, el.invitesError, genericMessage(err), true);
  }
  // The answered item is gone: keep keyboard focus on the next invite, or the Close button.
  const items = el.invitesList.querySelectorAll<HTMLLIElement>("li");
  const next = items[Math.min(position, items.length - 1)];
  (next?.querySelector("button") ?? el.invitesClose).focus();
}

el.invites.addEventListener("click", () => {
  say(el.invitesStatus, el.invitesError, "");
  el.invitesDialog.showModal();
  loadInvites().catch((err) => {
    if (!redirectIfUnauthorized(err)) say(el.invitesStatus, el.invitesError, genericMessage(err), true);
  });
});

// --- Dialogs, logout, start-up -------------------------------------------------------------

for (const close of document.querySelectorAll<HTMLButtonElement>("dialog [data-close]")) {
  close.addEventListener("click", () => close.closest("dialog")?.close());
}

el.logout.addEventListener("click", async () => {
  const done = startBusy(el.logout, "Logging out…");
  if (!done) return;
  try {
    await logout();
  } catch (err) {
    if (!isStatus(err, 401)) { // 401: already logged out, carry on
      done();
      panelSay("Could not log out. Please try again.", true);
      return;
    }
  }
  storeGroup(null);
  location.replace("/login");
});

// Pick up invites that arrived while the tab was in the background.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && el.loading.hidden) {
    loadInvites().catch(panelError);
  }
});

async function init(): Promise<void> {
  let user: User;
  try {
    user = await getMe();
  } catch (err) {
    if (redirectIfUnauthorized(err)) return;
    el.loading.textContent = "";
    panelError(err);
    return;
  }
  el.username.textContent = user.username;
  for (const node of document.querySelectorAll<HTMLElement>("[data-auth-content]")) node.hidden = false;
  el.loading.hidden = true;
  emitSession(user);
  try {
    await loadGroups();
  } catch (err) {
    panelError(err);
  }
  loadInvites().catch(panelError);
}

init();
