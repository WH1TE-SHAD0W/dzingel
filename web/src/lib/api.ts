// Typed client for the džingel API. Same-origin relative URLs only; the session lives in an
// HttpOnly cookie, so the browser sends it automatically.

export type User = { id: string; username: string };
export type Group = { id: number; name: string };
export type Quote = {
  id: number;
  group_id: number;
  text: string;
  context: string;
  created_at: string;
  author: string | null;
};
export type Invite = {
  id: number;
  group_id: number;
  group_name: string;
  inviter: string | null;
  created_at: string;
};

export type ApiErrorBody = { error?: string; fields?: Record<string, string> };

/** A failed API call. `status` is 0 when the server could not be reached. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.error ?? `request failed (${status})`);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

export async function api<T>(path: string, method: Method = "GET", body?: unknown): Promise<T> {
  // POST/PUT always carry a JSON body: the API requires application/json, and it keeps every
  // state-changing request out of the "simple request" class browsers send cross-site.
  const payload = method === "POST" || method === "PUT" ? JSON.stringify(body ?? {}) : undefined;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: payload === undefined ? undefined : { "content-type": "application/json" },
      body: payload,
    });
  } catch {
    throw new ApiError(0, { error: "network error" });
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data && typeof data === "object" ? (data as ApiErrorBody) : {});
  }
  return data as T;
}

export const isStatus = (err: unknown, status: number): err is ApiError =>
  err instanceof ApiError && err.status === status;

/** Plain-language message for errors that are not specific to one form. */
export function genericMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "Could not reach the server. Check your connection and try again.";
    if (err.status === 429) return "Too many attempts. Please wait a minute and try again.";
  }
  return "Something went wrong. Please try again.";
}

// --- Endpoints -----------------------------------------------------------------------------

export const getMe = () => api<{ user: User }>("/auth/me").then((r) => r.user);
export const login = (username: string, password: string) =>
  api<{ user: User }>("/auth/login", "POST", { username, password }).then((r) => r.user);
export const register = (username: string, password: string) =>
  api<{ user: User }>("/auth/register", "POST", { username, password }).then((r) => r.user);
export const logout = () => api<{ ok: true }>("/auth/logout", "POST");

/** Send an already-logged-in visitor of /login or /register to the app. */
export function redirectIfLoggedIn(): void {
  getMe().then(
    () => location.replace("/"),
    () => {}, // 401 (or offline): stay on the page
  );
}
