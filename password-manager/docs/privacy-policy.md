# Privacy Policy

**Effective date:** [FILL IN BEFORE PUBLISHING]
**Product:** [PRODUCT NAME] (browser extension), by [YOUR COMPANY / DEVELOPER NAME]
**Contact:** [SUPPORT EMAIL — required by the Chrome Web Store]

> This document is a draft prepared from the actual code paths in this
> repository (`password-manager/extension` and `password-manager/backend`).
> Every claim below is meant to be checked against the implementation before
> publishing — see the "Where this is implemented" notes. Replace bracketed
> placeholders, have counsel review before publishing, and keep this file in
> sync with the code: if the crypto architecture or data model changes (see
> `docs/crypto-architecture.md`), this policy must be updated in the same
> change.

## Summary

[PRODUCT NAME] is a password manager built so that **we cannot read your
vault, even if we wanted to and even if compelled to.** Your master password
never leaves your device. Everything we store on our servers is encrypted
before it reaches us, using keys we never have access to. This is called
zero-knowledge encryption, and it is the central design constraint of this
product — see `docs/crypto-architecture.md` for the full technical
specification.

## What we collect and store

| Data | Purpose | Can [COMPANY] read it? |
|---|---|---|
| Email address | Account identification, login | Yes (plaintext) |
| Master password | — | **No — never transmitted or stored.** Only a client-derived, server-re-hashed authentication value is stored (`auth.service.ts`: `masterPasswordHash`, itself re-hashed with Argon2id server-side). |
| Vault items (logins, notes, passkeys) | Sync across your devices | **No.** Stored as AES-256-GCM ciphertext only (`vault_items.encrypted_data`). We cannot decrypt it. |
| Item encryption keys | Per-item key wrapping | **No.** Wrapped under your Vault Key, which is itself wrapped under a key derived from your master password. We never have the unwrapped key. |
| Your public key (EC P-256) | Lets others share items with you | Yes — public keys are not secret by design. |
| Device name/platform, login timestamps | Session management, security (device list, revocation) | Yes (metadata only) |
| Security audit log (login success/failure, share granted/revoked, item deleted, etc.) | Abuse detection, security investigations | Yes — **metadata only** (who, what type of event, when — see `audit-log.service.ts`, invariant #3 in `docs/crypto-architecture.md`: never decrypted content). |
| Billing information (if you subscribe to a paid team plan) | Payment processing | Handled entirely by Stripe; we store only your Stripe customer/subscription IDs and plan tier, never card details. |

We do not sell your data. We do not have advertising or an ad SDK in this
extension.

## What we cannot do (by design, not by policy)

Because of the zero-knowledge architecture:
- We cannot read the contents of any vault item you store — usernames,
  passwords, secure notes, or passkey private keys.
- We cannot reset your master password. If you forget it, your vault cannot
  be recovered by us or by anyone — see the in-product warning at signup and
  `docs/crypto-architecture.md`'s "Account recovery policy" section.
- We cannot decrypt anything shared between users. Sharing uses per-recipient
  key wrapping (ECIES); we relay ciphertext, we do not have a key that opens
  it.
- Law enforcement or a data breach of our servers would expose only
  ciphertext and metadata (email, device info, event log), never vault
  contents or master passwords.

## Browser permissions and what they're used for

The extension requests the following permissions in `manifest.json`. Full
justification (for the Chrome Web Store's permissions review) is in
`docs/permissions-justification.md`; the summary for users:

- **`storage`** — caches your encrypted vault locally so it's available
  offline and loads instantly; never stores anything unencrypted.
- **`alarms`** — periodically checks for vault updates from other devices,
  since the browser doesn't allow a persistent background timer.
- **Access to web pages (`host_permissions` / content scripts)** — needed for
  two features: (1) detecting login forms to offer autofill, and (2) acting
  as your browser's passkey (WebAuthn) provider. We do not read, collect, or
  transmit the content of pages you visit; the content scripts only look for
  login form fields and WebAuthn API calls. See
  `docs/permissions-justification.md` for the detailed, per-permission
  breakdown the Chrome Web Store's review process asks for.

## Third parties

- **[CLOUD HOSTING PROVIDER]** — hosts our backend and database. They have
  infrastructure-level access to the encrypted database, not to any
  decryption key.
- **Stripe** — processes payments for paid team plans. See
  [Stripe's privacy policy](https://stripe.com/privacy). We never see your
  full card number.
- We do not use third-party analytics or advertising SDKs in the extension.
  [UPDATE THIS if you add one — it would need to be disclosed here and in
  the Chrome Web Store's data-use disclosure form.]

## Data retention and deletion

- [FILL IN: how does a user delete their account? Is there an account
  deletion endpoint yet? As of this writing, `backend/src/auth` does not
  expose one — this needs to be built before publishing, since Chrome Web
  Store policy and most privacy laws (GDPR/CCPA) require a way for users to
  delete their account and data.]
- Deleted vault items are soft-deleted (`deletedAt`) for sync-conflict
  correctness, then [FILL IN: hard-deletion schedule — needs to be decided
  and implemented].
- Audit log entries: [FILL IN retention period].

## Children's privacy

[PRODUCT NAME] is not directed at children under 13 (or the relevant age in
your jurisdiction), and we do not knowingly collect data from them.

## Changes to this policy

We will update this policy when our data practices change, and note the
effective date above. [Add a mechanism for notifying existing users of
material changes if required in your target markets, e.g. EU.]

## Contact

Questions about this policy: [SUPPORT EMAIL]
