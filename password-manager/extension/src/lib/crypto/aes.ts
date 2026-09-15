import { bytesToBase64, base64ToBytes, concatBytes, randomBytes } from "./encoding";

const GCM_NONCE_LENGTH = 12;

/**
 * Encrypts `plaintext` under a raw 256-bit AES key with a fresh random nonce per
 * call, and returns `base64(nonce || ciphertext_with_tag)` as a single opaque
 * blob — this is the on-the-wire/on-disk envelope for every encrypted_* column
 * and chrome.storage.local cache entry. See docs/crypto-architecture.md.
 */
export async function aesGcmEncrypt(rawKey: Uint8Array, plaintext: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", rawKey.buffer as ArrayBuffer, "AES-GCM", false, [
    "encrypt",
  ]);
  const nonce = randomBytes(GCM_NONCE_LENGTH);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce.buffer as ArrayBuffer }, key, plaintext.buffer as ArrayBuffer),
  );
  return bytesToBase64(concatBytes(nonce, ciphertext));
}

export async function aesGcmDecrypt(rawKey: Uint8Array, blobB64: string): Promise<Uint8Array> {
  const blob = base64ToBytes(blobB64);
  const nonce = blob.slice(0, GCM_NONCE_LENGTH);
  const ciphertext = blob.slice(GCM_NONCE_LENGTH);
  const key = await crypto.subtle.importKey("raw", rawKey.buffer as ArrayBuffer, "AES-GCM", false, [
    "decrypt",
  ]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce.buffer as ArrayBuffer },
    key,
    ciphertext.buffer as ArrayBuffer,
  );
  return new Uint8Array(plaintext);
}
