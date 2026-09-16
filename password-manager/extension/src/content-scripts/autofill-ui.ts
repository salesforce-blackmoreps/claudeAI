import type { AutofillMatch } from "../background/messages";

/**
 * All autofill UI is rendered inside a closed shadow root: `mode: "closed"`
 * means the host page's own JS cannot obtain a reference via
 * `element.shadowRoot` even if it tries, so it can neither read nor restyle
 * our dropdown/banner. We keep the only reference to the shadow root
 * ourselves. A <style> tag scoped to the shadow root keeps the host page's
 * CSS from bleeding in either direction.
 */
const HOST_ID = "password-manager-autofill-host";

function getOrCreateShadowRoot(): ShadowRoot {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .pm-dropdown {
        position: absolute;
        z-index: 2147483647;
        background: #fff;
        border: 1px solid #ccc;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        font-family: system-ui, sans-serif;
        font-size: 13px;
        min-width: 200px;
        max-width: 320px;
        overflow: hidden;
      }
      .pm-dropdown-item { padding: 8px 10px; cursor: pointer; }
      .pm-dropdown-item:hover { background: #f0f4ff; }
      .pm-dropdown-username { color: #666; font-size: 11px; }
      .pm-banner {
        position: fixed;
        top: 12px;
        right: 12px;
        z-index: 2147483647;
        background: #fff;
        border: 1px solid #ccc;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        font-family: system-ui, sans-serif;
        font-size: 13px;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      button { font: inherit; cursor: pointer; }
    `;
    shadow.appendChild(style);
    shadowRootRef = shadow;
  }
  if (!shadowRootRef) {
    throw new Error("Shadow root not initialized");
  }
  return shadowRootRef;
}

let shadowRootRef: ShadowRoot | null = null;

export function showMatchDropdown(
  anchor: HTMLElement,
  matches: AutofillMatch[],
  onSelect: (itemId: string) => void,
): void {
  hideDropdown();
  if (matches.length === 0) return;

  const shadow = getOrCreateShadowRoot();
  const rect = anchor.getBoundingClientRect();

  const dropdown = document.createElement("div");
  dropdown.className = "pm-dropdown";
  dropdown.style.top = `${window.scrollY + rect.bottom + 4}px`;
  dropdown.style.left = `${window.scrollX + rect.left}px`;

  for (const match of matches) {
    const item = document.createElement("div");
    item.className = "pm-dropdown-item";
    item.innerHTML = `<div>${escapeHtml(match.title)}</div><div class="pm-dropdown-username">${escapeHtml(match.username)}</div>`;
    item.addEventListener("mousedown", (e) => {
      // mousedown (not click) so this fires before the field's blur handler.
      e.preventDefault();
      onSelect(match.itemId);
      hideDropdown();
    });
    dropdown.appendChild(item);
  }

  dropdown.id = "pm-active-dropdown";
  shadow.appendChild(dropdown);
}

export function hideDropdown(): void {
  shadowRootRef?.getElementById("pm-active-dropdown")?.remove();
}

export function showSavePrompt(originLabel: string, onSave: () => void, onDismiss: () => void): void {
  hideSavePrompt();
  const shadow = getOrCreateShadowRoot();

  const banner = document.createElement("div");
  banner.className = "pm-banner";
  banner.id = "pm-save-banner";
  banner.innerHTML = `<span>Save password for ${escapeHtml(originLabel)}?</span>`;

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () => {
    onSave();
    hideSavePrompt();
  });

  const dismissBtn = document.createElement("button");
  dismissBtn.textContent = "Not now";
  dismissBtn.addEventListener("click", () => {
    onDismiss();
    hideSavePrompt();
  });

  banner.appendChild(saveBtn);
  banner.appendChild(dismissBtn);
  shadow.appendChild(banner);
}

export function hideSavePrompt(): void {
  shadowRootRef?.getElementById("pm-save-banner")?.remove();
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
