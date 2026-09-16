import { sendToBackground } from "../background/messages";
import type { AutofillMatchesResponse, AutofillCredentialResponse } from "../background/messages";
import { showMatchDropdown, hideDropdown, showSavePrompt } from "./autofill-ui";

/**
 * Isolated-world content script: detects login forms, offers saved
 * credentials via our own shadow-DOM UI, and prompts to save new ones. It
 * never trusts or relays anything the page's own JS sends it — every
 * background request here is triggered by our own DOM event handling
 * (focus/submit), not by page-supplied instructions. See invariant #9 and
 * message-router.ts.
 */

let activeUsernameField: HTMLInputElement | null = null;
let activePasswordField: HTMLInputElement | null = null;

document.addEventListener("focusin", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!isCandidateField(target)) return;

  const form = target.closest("form") ?? document;
  const passwordField = form.querySelector<HTMLInputElement>('input[type="password"]');
  if (!passwordField) return;

  const usernameField = findUsernameField(form, passwordField);
  activePasswordField = passwordField;
  activeUsernameField = usernameField;

  void requestMatchesAndShowDropdown(target);
});

document.addEventListener(
  "submit",
  (e) => {
    if (!(e.target instanceof HTMLFormElement)) return;
    const passwordField = e.target.querySelector<HTMLInputElement>('input[type="password"]');
    if (!passwordField || !passwordField.value) return;

    const usernameField = findUsernameField(e.target, passwordField);
    const username = usernameField?.value ?? "";
    const password = passwordField.value;
    if (!password) return;

    showSavePrompt(
      location.hostname,
      () => {
        void sendToBackground({
          type: "AUTOFILL_SAVE_CREDENTIAL",
          origin: location.origin,
          title: location.hostname,
          username,
          password,
        });
      },
      () => {
        /* dismissed for this page load — no persistent "never ask" yet (Phase 3 scope) */
      },
    );
  },
  true, // capture phase, so we see it even if the page's own submit handler stops propagation
);

document.addEventListener("focusout", (e) => {
  // Let a mousedown-triggered dropdown selection register before we hide it.
  setTimeout(() => {
    if (!document.activeElement || document.activeElement === document.body) {
      hideDropdown();
    }
  }, 150);
  void e;
});

function isCandidateField(el: HTMLInputElement): boolean {
  return el.type === "password" || el.type === "text" || el.type === "email" || el.type === "";
}

function findUsernameField(scope: ParentNode, passwordField: HTMLInputElement): HTMLInputElement | null {
  const candidates = Array.from(
    scope.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="email"], input:not([type])'),
  );
  // Prefer the field immediately preceding the password field in document order.
  const before = candidates.filter((el) => comparePosition(el, passwordField) < 0);
  return before[before.length - 1] ?? candidates[0] ?? null;
}

function comparePosition(a: Element, b: Element): number {
  const position = a.compareDocumentPosition(b);
  return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

async function requestMatchesAndShowDropdown(anchor: HTMLInputElement): Promise<void> {
  const response = await sendToBackground<AutofillMatchesResponse>({
    type: "AUTOFILL_QUERY_MATCHES",
    origin: location.origin,
  });

  if (response.matches.length === 0) return;

  showMatchDropdown(anchor, response.matches, (itemId) => {
    void fillCredential(itemId);
  });
}

async function fillCredential(itemId: string): Promise<void> {
  const credential = await sendToBackground<AutofillCredentialResponse | null>({
    type: "AUTOFILL_GET_CREDENTIAL",
    itemId,
  });
  if (!credential) return;

  if (activeUsernameField) setNativeValue(activeUsernameField, credential.username);
  if (activePasswordField) setNativeValue(activePasswordField, credential.password);
}

/**
 * Sets an <input>'s value via the native property setter and dispatches
 * `input`/`change` so frameworks with controlled inputs (React, Vue, etc.)
 * observe the change — a plain `el.value = x` assignment is invisible to
 * their virtual-DOM diffing.
 */
function setNativeValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
