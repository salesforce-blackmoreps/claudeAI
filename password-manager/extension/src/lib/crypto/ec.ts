import { bytesToBase64, base64ToBytes } from "./encoding";

/**
 * Per-user EC P-256 keypair used for receiving shared vault items (ECDH key
 * agreement in the sharing flow, Phase 5). The public key is stored server-side
 * in the clear; the private key is wrapped under the Symmetric Vault Key before
 * it ever leaves this module. See docs/crypto-architecture.md.
 */
export interface EcKeyPairBytes {
  publicKeyRaw: Uint8Array;
  privateKeyPkcs8: Uint8Array;
}

export async function generateEcKeyPair(): Promise<EcKeyPairBytes> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );
  const [publicKeyRaw, privateKeyPkcs8] = await Promise.all([
    crypto.subtle.exportKey("raw", keyPair.publicKey),
    crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
  ]);
  return {
    publicKeyRaw: new Uint8Array(publicKeyRaw),
    privateKeyPkcs8: new Uint8Array(privateKeyPkcs8),
  };
}

export function encodePublicKey(publicKeyRaw: Uint8Array): string {
  return bytesToBase64(publicKeyRaw);
}

export async function importPrivateKey(privateKeyPkcs8: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    privateKeyPkcs8.buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey", "deriveBits"],
  );
}

export async function importPublicKey(publicKeyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    base64ToBytes(publicKeyB64).buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}
