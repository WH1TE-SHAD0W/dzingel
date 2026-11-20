// Accessible form error helpers. Every input that can show an error has a sibling element with
// id `<input id>-error`, referenced from the input's aria-describedby.

export const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Show (or clear, with "") the inline error for one field. */
export function setFieldError(
  input: HTMLInputElement | HTMLTextAreaElement,
  message: string,
): void {
  const el = document.getElementById(`${input.id}-error`);
  if (el) el.textContent = message;
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}

/** Show (or clear) a form-level message in a role="alert" element. */
export function setFormError(el: HTMLElement, message: string): void {
  el.textContent = message;
}

/**
 * Guard against double submits without disabling the button (a disabled button drops keyboard
 * focus). Returns a function that ends the busy state.
 */
export function startBusy(button: HTMLButtonElement, busyLabel: string): (() => void) | null {
  if (button.getAttribute("aria-disabled") === "true") return null;
  const label = button.textContent;
  button.setAttribute("aria-disabled", "true");
  button.textContent = busyLabel;
  return () => {
    button.removeAttribute("aria-disabled");
    button.textContent = label;
  };
}
