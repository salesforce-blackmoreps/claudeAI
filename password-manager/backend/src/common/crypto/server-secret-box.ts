import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-level encryption for the handful of server-side secrets that
 * genuinely must be readable in plaintext by the backend itself (e.g. the TOTP
 * seed used to verify account-login 2FA codes — this is NOT part of the
 * zero-knowledge vault crypto in docs/crypto-architecture.md, which the server
 * never has plaintext access to under any circumstance). This is defense in
 * depth against a raw DB dump: it does not protect against a compromised
 * application server that also holds SERVER_SECRET_KEY.
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const keyB64 = process.env.SERVER_SECRET_KEY;
  if (!keyB64) {
    throw new Error("SERVER_SECRET_KEY environment variable is not set");
  }
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) {
    throw new Error("SERVER_SECRET_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export function encryptServerSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

export function decryptServerSecret(blobB64: string): string {
  const blob = Buffer.from(blobB64, "base64");
  const iv = blob.subarray(0, IV_LENGTH);
  const authTag = blob.subarray(blob.length - 16);
  const ciphertext = blob.subarray(IV_LENGTH, blob.length - 16);
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
