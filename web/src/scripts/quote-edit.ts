// /quotes/edit?id=: load one quote, save changes (PUT) or delete it after an in-page
// confirmation (native <dialog>), then return to the list.
import { api, genericMessage, isStatus, type Quote } from "../lib/api";
import { redirectIfUnauthorized } from "../lib/app";
import { byId, setFormError, startBusy } from "../lib/form";
import { addedBy, setupQuoteFields } from "../lib/quote-form";

const loading = byId<HTMLElement>("edit-loading");
const loadError = byId<HTMLElement>("edit-load-error");
const notFound = byId<HTMLElement>("not-found");
const notFoundTitle = byId<HTMLElement>("not-found-title");
const form = byId<HTMLFormElement>("quote-form");
const meta = byId<HTMLElement>("quote-meta");
const error = byId<HTMLElement>("quote-error");
const submit = byId<HTMLButtonElement>("quote-submit");
const deleteButton = byId<HTMLButtonElement>("quote-delete");
const dialog = byId<HTMLDialogElement>("delete-dialog");
const deleteError = byId<HTMLElement>("delete-error");
const deleteConfirm = byId<HTMLButtonElement>("delete-confirm");
const deleteCancel = byId<HTMLButtonElement>("delete-cancel");

const fields = setupQuoteFields(error);

// Same id rule as the API (positive integer); anything else cannot exist.
const rawId = new URLSearchParams(location.search).get("id") ?? "";
const id = /^[1-9]\d{0,14}$/.test(rawId) ? Number(rawId) : null;

/** Unknown, deleted or inaccessible quote. Focus moves to the message after a user action. */
function showNotFound(moveFocus: boolean): void {
  loading.hidden = true;
  form.hidden = true;
  if (dialog.open) dialog.close();
  notFound.hidden = false;
  if (moveFocus) notFoundTitle.focus();
}

async function load(): Promise<void> {
  if (id === null) return showNotFound(false);
  try {
    const quote = await api<Quote>(`/quotes/${id}`);
    fields.fill(quote.text, quote.context);
    meta.replaceChildren(...addedBy(quote.author, quote.created_at));
    loading.hidden = true;
    form.hidden = false;
  } catch (err) {
    if (redirectIfUnauthorized(err)) return;
    if (isStatus(err, 404) || isStatus(err, 400)) return showNotFound(false);
    loading.hidden = true;
    setFormError(loadError, `${genericMessage(err)} You can reload the page to try again.`);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setFormError(error, "");
  if (id === null || !fields.validate()) return;
  const done = startBusy(submit, "Saving…");
  if (!done) return;
  try {
    await api(`/quotes/${id}`, "PUT", fields.values());
    location.assign("/");
  } catch (err) {
    done();
    if (redirectIfUnauthorized(err)) return;
    if (isStatus(err, 404)) showNotFound(true);
    else if (isStatus(err, 400)) fields.serverRejected();
    else setFormError(error, genericMessage(err));
  }
});

deleteButton.addEventListener("click", () => {
  setFormError(deleteError, "");
  dialog.showModal(); // focus goes to "Keep quote" (autofocus); Escape closes
});

deleteCancel.addEventListener("click", () => dialog.close());

deleteConfirm.addEventListener("click", async () => {
  if (id === null) return;
  const done = startBusy(deleteConfirm, "Deleting…");
  if (!done) return;
  setFormError(deleteError, "");
  try {
    await api(`/quotes/${id}`, "DELETE");
    location.assign("/");
  } catch (err) {
    done();
    if (redirectIfUnauthorized(err)) return;
    if (isStatus(err, 404)) showNotFound(true);
    else setFormError(deleteError, genericMessage(err));
  }
});

load();
