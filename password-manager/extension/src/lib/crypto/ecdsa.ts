/**
 * EC P-256 ECDSA keypairs for WebAuthn passkey credentials — distinct from
 * ec.ts's ECDH keypairs (used for vault-item sharing), since WebAuthn
 * assertions are ECDSA signatures, not a key-agreement scheme.
 */
export interface EcdsaKeyPairBytes {
  /** Uncompressed SEC1 point: 0x04 || x(32) || y(32), 65 bytes. */
  publicKeyRaw: Uint8Array;
  privateKeyPkcs8: Uint8Array;
}

export async function generateEcdsaKeyPair(): Promise<EcdsaKeyPairBytes> {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const [publicKeyRaw, privateKeyPkcs8] = await Promise.all([
    crypto.subtle.exportKey("raw", keyPair.publicKey),
    crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
  ]);
  return { publicKeyRaw: new Uint8Array(publicKeyRaw), privateKeyPkcs8: new Uint8Array(privateKeyPkcs8) };
}

export async function importEcdsaPrivateKey(privateKeyPkcs8: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    privateKeyPkcs8.buffer as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** Signs `data` with ECDSA/SHA-256, returning the raw (IEEE P1363, r||s) signature. */
export async function signEcdsaRaw(privateKey: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    data.buffer as ArrayBuffer,
  );
  return new Uint8Array(signature);
}
