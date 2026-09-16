# Chrome Web Store Permissions Justification

Chrome Web Store review requires a written justification for every permission
in `manifest.json`, entered in the Developer Dashboard's "Privacy practices"
tab. This is the source-of-truth draft — copy each justification into the
corresponding field when submitting. Keep this file updated if `manifest.json`
changes; a mismatch between requested permissions and their stated purpose is
one of the most common causes of Chrome Web Store rejection.

Current `manifest.json` permissions (as of this writing):

```json
"permissions": ["storage", "alarms"],
"host_permissions": ["http://*/*", "https://*/*"]
```

## `storage`

**Justification:** Used to cache the user's encrypted vault (ciphertext only)
in `chrome.storage.local` so it is available offline and loads instantly on
popup open, and to hold short-lived session state (the unlocked vault key, in
memory / `chrome.storage.session`) needed for autofill and passkey operations
during an active session. No unencrypted vault content is ever written to
disk. See `docs/crypto-architecture.md` invariant #10.

## `alarms`

**Justification:** Manifest V3 background service workers are terminated
after a short idle period and cannot hold a persistent timer. `chrome.alarms`
lets the extension periodically wake itself to pull vault changes made on
other devices (`background/sync-engine.ts`), so multi-device sync doesn't
depend on the service worker happening to be alive. This does not access any
data outside the extension's own backend API.

## Host permissions: `http://*/*`, `https://*/*`

This is the broadest permission the extension requests and the one Chrome
reviewers scrutinize hardest. It is required for two distinct, narrow
features — **not** for general web browsing access, ad targeting, or content
collection:

1. **Autofill.** A content script (`content-scripts/autofill.ts`) detects
   login form fields on the page so it can offer to fill saved credentials
   and offer to save new ones. It runs on all sites because a password
   manager's entire value is working on whatever site the user is logging
   into — there is no fixed, enumerable list of sites users have accounts on.
2. **Passkey (WebAuthn) provider.** The extension acts as a software FIDO2
   authenticator so users can create and use passkeys stored in their vault
   instead of a device-bound platform authenticator. This requires
   intercepting `navigator.credentials.create()`/`.get()` (`content-
   scripts/webauthn-page-world.ts`, `webauthn-injector.ts`) on every origin,
   since any site can call the WebAuthn API and rpId must be validated
   against the real calling origin (`lib/webauthn/rp-id.ts`) before any
   credential is created or asserted — this validation is the mechanism that
   prevents a malicious page from creating a passkey under another site's
   identity, and it can only happen if the extension is present to observe
   the call on that origin.

**What these content scripts do *not* do:** they do not read page content
other than form-field metadata (field type/name/autocomplete attributes) and
WebAuthn API calls; they do not transmit page content to our backend; they do
not track browsing history or run on a schedule independent of user action.

**Why not `activeTab` instead:** `activeTab` only grants access after an
explicit user action (e.g. clicking the extension icon) and does not persist
across page loads, which breaks both features — autofill needs to detect
login forms as the page loads without the user first clicking the extension
icon (defeating the point of autofill), and passkey interception must be
present before the page's own script calls `navigator.credentials`, which
happens well before any user gesture the extension could react to.

**Mitigations already in place, worth stating in the review submission:**
- Extension CSP is locked down (`script-src 'self' 'wasm-unsafe-eval';
  object-src 'self'`) — no remote code execution.
- Content script UI (autofill dropdown) renders inside a **closed shadow
  DOM**, which the host page's own script cannot read or style, and which
  browser automation tooling using standard DOM APIs cannot pierce either —
  verified during manual testing.
- Every message between the content script, the MAIN-world injector, and the
  background service worker validates sender identity/origin before acting
  (`docs/crypto-architecture.md` invariant #9).
- rpId is always validated against the real calling origin before any
  passkey is created or asserted (invariant #8).

## If reviewers push back on the broad host permission

Chrome's reviewers sometimes ask password managers to justify `<all_urls>`-
equivalent permissions specifically, since it's the highest-scrutiny
permission class. If this happens:
- Point to Bitwarden, 1Password, and Dashlane's own store listings — all
  request the same class of permission for the same reason (autofill + form
  detection must work on arbitrary sites).
- Emphasize the closed-shadow-DOM isolation and origin-validated messaging
  above; reviewers are specifically checking that broad access isn't paired
  with weak internal isolation.
- If reviewers still object, the fallback is splitting into two extensions
  (autofill-only vs. full passkey provider) so each requests a narrower
  permission set — a larger scope of work, not attempted here.

## Remote code / eval

None. `content_security_policy.extension_pages` disallows `eval` and remote
script sources (`'wasm-unsafe-eval'` is only for the pinned, locally-bundled
Argon2id WASM module — see `docs/crypto-architecture.md` invariant #12 on
pinning that dependency).

## Data usage disclosure (separate Chrome Web Store form)

The Developer Dashboard also has a "Data usage" questionnaire, separate from
the permissions justification above. Based on what this extension actually
does (see `docs/privacy-policy.md`), answer it roughly as follows — verify
against the current dashboard's exact wording before submitting:

| Question | Answer | Why |
|---|---|---|
| Does this item collect or use user data? | Yes | Email, encrypted vault data, device metadata |
| Personally identifiable information | Yes (email) | Account identification |
| Authentication information | Yes (passwords) | **But** encrypted client-side before transmission — clarify this in the free-text field, since the form's checkboxes don't distinguish "collected" from "collected as ciphertext we cannot read" |
| Website content | No | Content scripts inspect form structure, not page content, and transmit nothing about page content to the backend |
| Is data sold to third parties? | No | |
| Is data used for purposes unrelated to the item's core functionality? | No | |
| Is data used to determine creditworthiness or for lending? | No | |

[This table is a starting point, not a substitute for reading the actual
current Chrome Web Store dashboard questionnaire at submission time — its
exact questions change occasionally.]
