import { genericMessage, isStatus, login, redirectIfLoggedIn } from "../lib/api";
import { byId, setFormError, startBusy } from "../lib/form";

redirectIfLoggedIn();

const form = byId<HTMLFormElement>("login-form");
const username = byId<HTMLInputElement>("login-username");
const password = byId<HTMLInputElement>("login-password");
const submit = byId<HTMLButtonElement>("login-submit");
const error = byId<HTMLElement>("login-error");

// One message for every credential failure: never reveal which field was wrong.
const BAD_CREDENTIALS = "That username and password do not match. Please try again.";

function fail(err: unknown): void {
  if (isStatus(err, 401) || isStatus(err, 400)) {
    setFormError(error, BAD_CREDENTIALS);
    username.setAttribute("aria-invalid", "true");
    password.setAttribute("aria-invalid", "true");
    password.value = "";
    password.focus();
  } else {
    setFormError(error, genericMessage(err)); // network, rate limit, server error: keep input
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setFormError(error, "");
  // Usernames are always lowercase; forgive capitals and stray spaces from phone keyboards.
  const name = username.value.trim().toLowerCase();
  if (!name || !password.value) {
    setFormError(error, "Please enter your username and your password.");
    (name ? password : username).focus();
    return;
  }
  const done = startBusy(submit, "Logging in…");
  if (!done) return;
  try {
    await login(name, password.value);
    location.replace("/");
  } catch (err) {
    done();
    fail(err);
  }
});

for (const input of [username, password]) {
  input.addEventListener("input", () => {
    username.removeAttribute("aria-invalid");
    password.removeAttribute("aria-invalid");
  });
}
