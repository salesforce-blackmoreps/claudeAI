import { generateEcKeyPair, importPrivateKey, importPublicKey } from "./ec";
import { hkdfDeriveBits } from "./hkdf";
import { aesGcmEncrypt, aesGcmDecrypt } from "./aes";
import { bytesToBase64, base64ToBytes } from "./encoding";

/**
 * ECIES-style wrapping of a vault item's Item Key for a specific recipient,
 * used by team sharing (Phase 5) — see docs/crypto-architecture.md's
 * "Sharing" section. For each recipient we generate a fresh ephemeral EC
 * P-256 keypair, ECDH it against the recipient's public key, derive a
 * one-time AES-256 key via HKDF, and wrap the Item Key with that. The
 * ephemeral keypair is discarded after use; only its public key travels with
 * the envelope (the recipient needs it to redo the ECDH on their end).
 *
 * The envelope format is `base64(ephemeralPublicKeyRaw).base64(nonce||ciphertext)`
 * — two dot-separated base64 fields, versioned implicitly by
 * HKDF_INFO_SHARE_WRAP below (bump the info string if the envelope format
 * ever changes).
 */
const HKDF_INFO_SHARE_WRAP = "password-manager/share-wrap/v1";

export async function wrapItemKeyForRecipient(itemKeyRaw: Uint8Array, recipientPublicKeyB64: string): Promise<string> {
  const ephemeral = await generateEcKeyPair();
  const recipientPublicKey = await importPublicKey(recipientPublicKeyB64);
  const ephemeralPrivateKey = await importPrivateKey(ephemeral.privateKeyPkcs8);

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: recipientPublicKey }, ephemeralPrivateKey, 256),
  );
  // The ephemeral public key is not secret, but binding it into the HKDF
  // salt gives each exchange a distinct derived key even if (hypothetically)
  // the same shared secret bytes ever recurred.
  const wrapKey = await hkdfDeriveBits(sharedSecret, ephemeral.publicKeyRaw, HKDF_INFO_SHARE_WRAP, 256);

  const wrappedItemKey = await aesGcmEncrypt(wrapKey, itemKeyRaw);
  return `${bytesToBase64(ephemeral.publicKeyRaw)}.${wrappedItemKey}`;
}

export async function unwrapItemKeyFromSender(envelope: string, myPrivateKeyPkcs8: Uint8Array): Promise<Uint8Array> {
  const separatorIndex = envelope.indexOf(".");
  if (separatorIndex === -1) throw new Error("unwrapItemKeyFromSender: malformed envelope");
  const ephemeralPublicKeyB64 = envelope.slice(0, separatorIndex);
  const wrappedItemKey = envelope.slice(separatorIndex + 1);

  const ephemeralPublicKeyRaw = base64ToBytes(ephemeralPublicKeyB64);
  const ephemeralPublicKey = await importPublicKey(ephemeralPublicKeyB64);
  const myPrivateKey = await importPrivateKey(myPrivateKeyPkcs8);

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: ephemeralPublicKey }, myPrivateKey, 256),
  );
  const wrapKey = await hkdfDeriveBits(sharedSecret, ephemeralPublicKeyRaw, HKDF_INFO_SHARE_WRAP, 256);

  return aesGcmDecrypt(wrapKey, wrappedItemKey);
}
