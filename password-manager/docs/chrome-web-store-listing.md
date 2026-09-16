# Chrome Web Store Listing — Draft

Everything in this file goes into the Chrome Web Store Developer Dashboard's
"Store Listing" tab. Replace bracketed placeholders before submitting.
Character limits below are Chrome's current hard limits — copy that exceeds
them will be rejected at submission time.

## Product name

[PRODUCT NAME] — placeholder used throughout this repo's docs is "Password
Manager" (see `manifest.json`), which is too generic to trademark or to stand
out in store search. Pick a real product name before publishing; check:
- Availability as a Chrome Web Store listing name (no exact collision)
- Domain availability for your support/marketing site
- Basic trademark clearance (a full search is a legal task, not something to
  skip based on this checklist alone)

## Short description (≤ 132 characters)

> Secure password manager with team sharing, passkeys, and zero-knowledge encryption. We can't read your vault — only you can.

(131 characters — adjust once [PRODUCT NAME] is finalized, since a bare
tagline like this may want the name folded in.)

## Detailed description (≤ 16,000 characters, no HTML)

```
[PRODUCT NAME] is a password manager that stores your logins, notes, and
passkeys, encrypted end-to-end so that even we can't read them.

ZERO-KNOWLEDGE ENCRYPTION
Your master password never leaves your device. Everything else — your
saved logins, secure notes, and passkeys — is encrypted with your own key
before it's ever sent to our servers. We store ciphertext, not your data.
If our servers were ever breached, there would be nothing readable to steal.

WORKS EVERYWHERE YOU LOG IN
Autofill detects login forms automatically and offers your saved
credentials — no copy-pasting. Save new logins with one click as you sign up
for new sites.

PASSKEYS, BUILT IN
[PRODUCT NAME] can create and store passkeys directly, so you can use
passwordless sign-in on sites that support it, synced across your devices
just like your passwords.

SYNC ACROSS ALL YOUR DEVICES
Sign up once, then log in from any device running [PRODUCT NAME] — your
vault stays in sync automatically.

SHARE SECURELY WITH YOUR TEAM
Share a login with a teammate without ever exposing the underlying
encryption key in the clear — each share is individually encrypted for its
recipient. Free accounts can share with up to 3 people; paid team plans
support larger teams (5, 20, or 100 members) with centralized management.

FREE TO START
Store up to 10 logins and share with up to 3 people for free. Upgrade to a
team plan for larger teams and higher limits.

IMPORTANT: BECAUSE OF ZERO-KNOWLEDGE ENCRYPTION, WE CANNOT RESET A FORGOTTEN
MASTER PASSWORD. There is no "forgot password" recovery — this is the
tradeoff that keeps your vault unreadable to anyone but you. Please store
your master password somewhere safe.

Questions or feedback: [SUPPORT EMAIL]
Privacy policy: [PRIVACY POLICY URL]
```

## Category

Productivity (Chrome Web Store's closest fit for password managers;
alternatively "Tools" depending on current taxonomy — check the dashboard's
current category list at submission time).

## Language

English (add additional listing languages/localized descriptions if you plan
to target non-English markets — out of scope here).

## Graphic assets needed (not producible from this repo alone)

Chrome Web Store requires, at minimum:
- **Icon**: 128×128 PNG. [Needs actual product branding/logo — nothing in
  this repo provides one; `manifest.json` doesn't even declare an `icons`
  field yet, which itself needs to be added before packaging.]
- **At least one screenshot**, 1280×800 or 640×400 PNG/JPEG. Recommended set,
  based on what's actually built and demoable per the live demo run earlier
  in this project:
  1. The vault list (populated with a few sample items)
  2. The autofill dropdown appearing on a real login form
  3. The share panel (showing viewer/editor roles)
  4. The Teams panel (invite flow)
  5. A passkey creation moment on a real relying-party test page
- **Optional promotional images** (small tile 440×280, marquee 1400×560) —
  needed only if you want featured placement; not required to publish.

None of these can be generated from code — they need real screenshots of the
built extension (the earlier live-demo session in this project already
produced comparable screenshots in a scratch directory; recreate clean ones
against final branding before submitting) and a designed icon/logo.

## Support

- **Support email** (required): [FILL IN]
- **Support/homepage URL** (recommended): [FILL IN]

## Pricing

Chrome Web Store listing itself is free to publish; in-extension billing
(Stripe) is separate and unaffected by the Web Store listing type. List as
"Free" in the Web Store (the extension itself has no upfront cost — paid
tiers are handled in-app via Stripe Checkout, not through Chrome's own
in-app-purchase API).

## Before you submit — checklist

- [ ] `manifest.json` needs an `icons` field (16/48/128px) — currently
      missing entirely.
- [ ] Privacy policy published at a real, stable URL (`docs/privacy-policy.md`
      is the draft; it needs to be hosted, not just committed to this repo).
- [ ] Account deletion flow — flagged as missing in `docs/privacy-policy.md`;
      most privacy regulations and Chrome Web Store policy both expect one.
- [ ] Real screenshots taken against production (or a stable staging) build,
      not the local dev/demo environment.
- [ ] `docs/permissions-justification.md` content pasted into the Developer
      Dashboard's privacy practices tab, and the data-usage questionnaire
      answered.
- [ ] A $5 one-time Chrome Web Store developer registration fee, paid via
      the Developer Dashboard (per-account, not per-extension).
- [ ] Decide and disclose final company/developer name, matching what's in
      the privacy policy and the store listing's "About the developer"
      section.
