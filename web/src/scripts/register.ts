import { genericMessage, isStatus, redirectIfLoggedIn, register } from "../lib/api";
import { byId, setFieldError, setFormError, startBusy } from "../lib/form";
import { checkConfirm, checkPassword, checkUsername, REGISTER_MSG as MSG } from "../lib/validation";

redirectIfLoggedIn();

const form = byId<HTMLFormElement>("register-form");
const username = byId<HTMLInputElement>("reg-username");
const password = byId<HTMLInputElement>("reg-password");
const confirm = byId<HTMLInputElement>("reg-confirm");
const terms = byId<HTMLInputElement>("reg-terms");
const submit = byId<HTMLButtonElement>("register-submit");
const error = byId<HTMLElement>("register-error");

const validators: [HTMLInputElement, () => string][] = [
  [username, () => checkUsername(username.value)],
  [password, () => checkPassword(password.value)],
  [confirm, () => checkConfirm(confirm.value, password.value)],
  [terms, () => (terms.checked ? "" : MSG.termsRequired)],
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
    await register(username.value.trim(), password.value, terms.checked);
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
      if (fields.acceptTerms) setFieldError(terms, MSG.termsRequired);
      summarise(Object.keys(fields).length);
      (fields.username ? username : fields.password ? password : terms).focus();
    } else {
      setFormError(error, genericMessage(err));
    }
  }
});

// Once a field has been flagged, re-check it as the user corrects it.
for (const [input, check] of validators) {
  input.addEventListener(input === terms ? "change" : "input", () => {
    if (input.getAttribute("aria-invalid") === "true") setFieldError(input, check());
  });
}
// Changing the password can fix (or break) a confirmation that was already flagged.
password.addEventListener("input", () => {
  if (confirm.getAttribute("aria-invalid") === "true") setFieldError(confirm, validators[2][1]());
});
