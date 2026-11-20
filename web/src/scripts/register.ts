import { genericMessage, isStatus, redirectIfLoggedIn, register } from "../lib/api";
import { byId, setFieldError, setFormError, startBusy } from "../lib/form";

redirectIfLoggedIn();

// Mirrors the API rules (api/src/auth.ts); the server still validates everything.
const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

const MSG = {
  usernameEmpty: "Please choose a username.",
  usernameRule:
    "Use 3 to 30 characters: lowercase letters a–z, numbers 0–9, underscore (_) or dot (.).",
  usernameTaken: "This username is already taken. Please try another one.",
  passwordEmpty: "Please choose a password.",
  passwordRule: `Use between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.`,
  confirmEmpty: "Please type your password again.",
  mismatch: "The two passwords do not match.",
};

const form = byId<HTMLFormElement>("register-form");
const username = byId<HTMLInputElement>("reg-username");
const password = byId<HTMLInputElement>("reg-password");
const confirm = byId<HTMLInputElement>("reg-confirm");
const submit = byId<HTMLButtonElement>("register-submit");
const error = byId<HTMLElement>("register-error");

const validators: [HTMLInputElement, () => string][] = [
  [username, () => {
    const v = username.value.trim();
    return !v ? MSG.usernameEmpty : USERNAME_RE.test(v) ? "" : MSG.usernameRule;
  }],
  [password, () => {
    const n = password.value.length;
    return n === 0 ? MSG.passwordEmpty : n < PASSWORD_MIN || n > PASSWORD_MAX ? MSG.passwordRule : "";
  }],
  [confirm, () =>
    !confirm.value ? MSG.confirmEmpty : confirm.value !== password.value ? MSG.mismatch : ""],
];

/** Validate all fields; show inline errors and return the first invalid input, if any. */
function validate(): HTMLInputElement | null {
  let first: HTMLInputElement | null = null;
  for (const [input, check] of validators) {
    const message = check();
    setFieldError(input, message);
    if (message && !first) first = input;
  }
  return first;
}

function summarise(count: number): void {
  setFormError(error, count === 1 ? "Please fix 1 problem below." : `Please fix ${count} problems below.`);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setFormError(error, "");
  const invalid = validate();
  if (invalid) {
    summarise(validators.filter(([input]) => input.getAttribute("aria-invalid") === "true").length);
    invalid.focus();
    return;
  }
  const done = startBusy(submit, "Creating account…");
  if (!done) return;
  try {
    await register(username.value.trim(), password.value);
    location.replace("/");
  } catch (err) {
    done();
    if (isStatus(err, 409)) {
      setFieldError(username, MSG.usernameTaken);
      summarise(1);
      username.focus();
    } else if (isStatus(err, 400) && err.body.fields) {
      // Server-side validation disagreed; show it next to the fields it names.
      const fields = err.body.fields;
      if (fields.username) setFieldError(username, MSG.usernameRule);
      if (fields.password) setFieldError(password, MSG.passwordRule);
      summarise(Object.keys(fields).length);
      (fields.username ? username : password).focus();
    } else {
      setFormError(error, genericMessage(err));
    }
  }
});

// Once a field has been flagged, re-check it as the user corrects it.
for (const [input, check] of validators) {
  input.addEventListener("input", () => {
    if (input.getAttribute("aria-invalid") === "true") setFieldError(input, check());
  });
}
// Changing the password can fix (or break) a confirmation that was already flagged.
password.addEventListener("input", () => {
  if (confirm.getAttribute("aria-invalid") === "true") setFieldError(confirm, validators[2][1]());
});
