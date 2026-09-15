# Crypto Architecture Spec (v1)

This is the canonical, authoritative description of the encryption envelope and key
hierarchy. Any code implementing crypto (`extension/src/lib/crypto/*`,
`backend/src/auth/*`, `backend/src/sharing/*`) must conform to this document. Changing
this spec after Phase 1 ships is expensive (requires a migration path for every
existing user's data) — review changes carefully.

## Design goal: zero-knowledge

The backend must never be able to derive plaintext vault content, the master
password, or any private key, even with full access to its own database. It stores
and distributes ciphertext and non-secret metadata only.

## Primitives

| Purpose | Algorithm |
|---|---|
| Password-based key derivation | Argon2id (memory ≥ 64 MiB, iterations ≥ 3, parallelism ≥ 4) |
| Key splitting | HKDF-SHA256 |
| Symmetric encryption | AES-256-GCM (96-bit random nonce per encryption, 128-bit auth tag) |
| Asymmetric keypair (per user) | EC P-256 |
| Key wrapping for sharing | ECIES: ephemeral ECDH (P-256) + HKDF-SHA256 + AES-256-GCM |
| Server-side re-hash of auth value | Argon2id (independent parameters from client KDF) |

All primitives are implemented via the browser's native `crypto.subtle` (WebCrypto)
except Argon2id, for which WebCrypto has no native implementation — a single pinned
WASM build is used client-side (exact version + subresource hash locked in
`package-lock.json`; any version bump requires an explicit review, per invariant #12
in the plan).

## Key hierarchy

```
masterPassword (never leaves the client, never stored, never logged)
        │
        ▼ Argon2id(masterPassword, kdfSalt, kdfParams)
   Master Key
        │
        ▼ HKDF-SHA256, two independent output contexts
        ├── "vault-key-wrap"   → Stretched Master Key ─┐
        └── "auth-hash"        → Master Password Hash ─┼─ sent to server at
                                                         │  login; server re-hashes
                                                         │  with Argon2id/bcrypt
                                                         │  before storing
   Stretched Master Key
        │
        ▼ unwraps (AES-256-GCM)
   Symmetric Vault Key  (random 256-bit, generated once at signup)
        │
        ├─▼ unwraps  →  per-item Item Key (random 256-bit, one per vault item)
        │                     │
        │                     ▼ AES-256-GCM
        │               Item ciphertext (username/password/notes/TOTP seed/passkey private key)
        │
        └─▼ unwraps  →  User's EC P-256 private key (public key stored in the clear)
```

## Signup flow (client-side steps, in order)

1. Client generates `kdfSalt` (random, or derived from normalized email — random is
   preferred to avoid cross-user salt reuse patterns).
2. Client computes `Master Key = Argon2id(masterPassword, kdfSalt, kdfParams)`.
3. Client derives `Stretched Master Key` and `Master Password Hash` via HKDF from the
   Master Key (see hierarchy above).
4. Client generates a random `Symmetric Vault Key` (AES-256) and wraps it with the
   Stretched Master Key → `encryptedVaultKey`.
5. Client generates an EC P-256 keypair; wraps the private key with the Symmetric
   Vault Key → `encryptedPrivateKey`. Public key stored as-is.
6. Client sends to `POST /auth/signup`: `{ email, masterPasswordHash, kdfType,
   kdfParams, kdfSalt, encryptedVaultKey, publicKey, encryptedPrivateKey }`.
7. Server re-hashes `masterPasswordHash` (Argon2id/bcrypt, independent salt/params)
   before persisting it. The server never sees `masterPassword`,
   `Master Key`, `Stretched Master Key`, `Symmetric Vault Key`, or the EC private key
   in plaintext at any point.

## Login / unlock flow

1. Client re-derives `Master Key` → `Master Password Hash` from the entered
   `masterPassword` and the account's stored `kdfSalt`/`kdfParams` (fetched by email
   pre-auth, unauthenticated lookup limited to KDF parameters only).
2. `POST /auth/login` with `{ email, masterPasswordHash }`. Server verifies against
   its re-hashed value, issues JWT access token + refresh token.
3. Server response includes `encryptedVaultKey` and `encryptedPrivateKey`.
4. Client re-derives `Stretched Master Key` (same as step 3 of signup) and unwraps
   `Symmetric Vault Key` and the EC private key locally. This is "unlocking" — the
   decrypted keys live only in service-worker memory (`vault-session.ts`) from this
   point, never written to `chrome.storage.local`.

## Item encryption

- Every vault item has its own random `Item Key`.
- `Item Key` is wrapped under the owner's `Symmetric Vault Key` (`encrypted_item_key`
  column) for personally-owned items.
- Item fields (username, password, URIs, notes, TOTP seed, or — for `type: passkey`
  items — the passkey's private key and metadata) are serialized and encrypted as one
  AES-256-GCM ciphertext blob under the `Item Key`.

## Sharing (team case)

1. Sharer's client decrypts the target item's `Item Key` locally (it already has
   access as owner or existing editor).
2. For each recipient, the client performs ECIES wrapping: generate an ephemeral EC
   P-256 keypair, ECDH with the recipient's public key, HKDF-SHA256 to derive a
   one-time AES-256 key, encrypt the `Item Key` with AES-256-GCM. The ephemeral public
   key + ciphertext + nonce + tag form `encrypted_item_key_for_recipient`.
3. This wrapped value is uploaded as one `shares` row per recipient. It is never
   reused across recipients and the unwrapped `Item Key` is never transmitted.
4. Revoking **edit** access: delete the `shares` row AND rotate the `Item Key` (new
   random key, item ciphertext re-encrypted under it, re-wrapped for every remaining
   authorized party). This prevents the removed editor's cached key from authoring
   further changes.
5. Revoking **view-only** access: deleting the `shares` row stops future distribution
   of the item, but a viewer who already decrypted the item locally retains that
   snapshot — key rotation on view-only revoke is NOT performed by default (documented
   deliberate exception; requires explicit product/security sign-off before launch,
   per plan invariant #5).

## What the backend stores vs. never stores

**Stores (ciphertext / non-secret only):**
- `encrypted_vault_key`, `encrypted_private_key`, `public_key`
- `encrypted_data`, `encrypted_item_key` per vault item
- `encrypted_item_key_for_recipient` per share
- `master_password_hash` (server-side re-hash, itself not reversible to the client's
  original hash, let alone the master password)
- Metadata: emails, timestamps, revision numbers, item types, folder ids, team
  membership, plan/subscription state

**Never stores, transmits to, or logs on the server, under any circumstance:**
- The master password itself
- The Master Key, Stretched Master Key, or Symmetric Vault Key in plaintext
- Any vault item's plaintext fields
- Any private key in plaintext (EC user keypair or passkey keypairs)

## Algorithm agility

`kdf_type` and `kdf_params` are stored per-user (not globally hardcoded) specifically
so the KDF can be upgraded in the future (e.g. Argon2id parameter increases as
hardware improves) without breaking existing accounts — a re-derivation/migration
happens transparently on the user's next successful login with their old parameters,
then re-wraps under new parameters.

## Non-goals / accepted tradeoffs (v1)

- No hardware-backed attestation for passkeys created by this extension (software/
  self-attestation only — see Phase 4 plan). Documented, matches Bitwarden's own
  tradeoff.
- WebAuthn signature counters are treated as advisory, not strictly monotonic
  (unavoidable once a passkey is synced across multiple devices).
- Conflict resolution on concurrent multi-device edits is last-writer-wins with a
  surfaced conflict prompt, not a CRDT merge.
