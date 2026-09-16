/**
 * Splits the Master Key into independent, purpose-bound subkeys via HKDF-SHA256,
 * so the Stretched Master Key (which wraps the Symmetric Vault Key) and the
 * Master Password Hash (sent to the server as the auth credential) can never be
 * derived from one another. See docs/crypto-architecture.md.
 */
export async function hkdfDeriveBits(
  ikm: Uint8Array,
  salt: Uint8Array,
  infoLabel: string,
  lengthBits: number,
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey("raw", ikm.buffer as ArrayBuffer, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt.buffer as ArrayBuffer,
      info: new TextEncoder().encode(infoLabel),
    },
    baseKey,
    lengthBits,
  );
  return new Uint8Array(bits);
}

export const HKDF_INFO_VAULT_KEY_WRAP = "password-manager/vault-key-wrap/v1";
export const HKDF_INFO_AUTH_HASH = "password-manager/auth-hash/v1";
