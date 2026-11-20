// /quotes/new: add a quote to the group selected in the top panel, then return to the list.
import { api, genericMessage, isStatus, type Group } from "../lib/api";
import { onGroupChange, redirectIfUnauthorized } from "../lib/app";
import { byId, setFormError, startBusy } from "../lib/form";
import { setupQuoteFields } from "../lib/quote-form";

const form = byId<HTMLFormElement>("quote-form");
const submit = byId<HTMLButtonElement>("quote-submit");
const error = byId<HTMLElement>("quote-error");
const groupName = byId<HTMLElement>("quote-group");
const noGroup = byId<HTMLElement>("no-group");

const fields = setupQuoteFields(error);
let group: Group | null = null;

onGroupChange((g) => {
  group = g;
  groupName.textContent = g?.name ?? "";
  form.hidden = g === null;
  noGroup.hidden = g !== null;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setFormError(error, "");
  if (!group || !fields.validate()) return;
  const done = startBusy(submit, "Saving…");
  if (!done) return;
  try {
    await api<{ id: number }>("/quotes", "POST", { group_id: group.id, ...fields.values() });
    location.assign("/");
  } catch (err) {
    done();
    if (redirectIfUnauthorized(err)) return;
    if (isStatus(err, 400)) fields.serverRejected();
    else if (isStatus(err, 404))
      setFormError(error, "You are no longer in this group. Choose another group at the top.");
    else setFormError(error, genericMessage(err));
  }
});
