// Glue between the top panel and the page scripts of app pages.
//
// The top panel (components/TopPanel.astro) checks the session, loads the groups and then
// announces the selected group with a DOM event. Page scripts subscribe at module top level,
// which always runs before the panel's first fetch resolves.

import { isStatus, type Group, type User } from "./api";

const GROUP_EVENT = "dzingel:group";
const SESSION_EVENT = "dzingel:session";

export function emitGroupChange(group: Group | null): void {
  document.dispatchEvent(new CustomEvent<Group | null>(GROUP_EVENT, { detail: group }));
}

/** Called with the selected group (null when the user has none) on load and on every switch. */
export function onGroupChange(cb: (group: Group | null) => void): void {
  document.addEventListener(GROUP_EVENT, (e) => cb((e as CustomEvent<Group | null>).detail));
}

export function emitSession(user: User): void {
  document.dispatchEvent(new CustomEvent<User>(SESSION_EVENT, { detail: user }));
}

/** Called once with the logged-in user after the session check succeeds. */
export function onSession(cb: (user: User) => void): void {
  document.addEventListener(SESSION_EVENT, (e) => cb((e as CustomEvent<User>).detail), {
    once: true,
  });
}

/** If the error is a 401 (no or expired session), go to /login and return true. */
export function redirectIfUnauthorized(err: unknown): boolean {
  if (!isStatus(err, 401)) return false;
  location.replace("/login");
  return true;
}
