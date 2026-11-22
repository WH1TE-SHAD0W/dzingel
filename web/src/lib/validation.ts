// Register-form rules as pure functions (no DOM), so they can be unit tested. They mirror the API
// rules (api/src/auth.ts); the server still validates everything (SEC-01). Each check returns the
// message to show, or "" when the value is valid.

export const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const REGISTER_MSG = {
  usernameEmpty: "Please choose a username.",
  usernameRule:
    "Use 3 to 30 characters: lowercase letters a–z, numbers 0–9, underscore (_) or dot (.).",
  usernameTaken: "This username is already taken. Please try another one.",
  passwordEmpty: "Please choose a password.",
  passwordRule: `Use between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.`,
  confirmEmpty: "Please type your password again.",
  mismatch: "The two passwords do not match.",
  termsRequired: "Please tick the box to accept the Terms.",
};

/** Username as typed; surrounding whitespace is ignored (the form submits it trimmed). */
export function checkUsername(value: string): string {
  const v = value.trim();
  return !v ? REGISTER_MSG.usernameEmpty : USERNAME_RE.test(v) ? "" : REGISTER_MSG.usernameRule;
}

export function checkPassword(value: string): string {
  const n = value.length;
  return n === 0
    ? REGISTER_MSG.passwordEmpty
    : n < PASSWORD_MIN || n > PASSWORD_MAX
      ? REGISTER_MSG.passwordRule
      : "";
}

/** The "type your password again" field. */
export function checkConfirm(confirm: string, password: string): string {
  return !confirm ? REGISTER_MSG.confirmEmpty : confirm !== password ? REGISTER_MSG.mismatch : "";
}
