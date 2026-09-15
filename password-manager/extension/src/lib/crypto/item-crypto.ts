import { aesGcmEncrypt, aesGcmDecrypt } from "./aes";
import { base64ToBytes, randomBytes, utf8ToBytes, bytesToUtf8 } from "./encoding";

/**
 * Per-item encryption: every vault item gets its own random AES-256 Item Key,
 * which is itself wrapped under the owner's Symmetric Vault Key. See
 * docs/crypto-architecture.md's "Item encryption" section.
 */
export interface EncryptedItemEnvelope {
  encryptedData: string;
  encryptedItemKey: string;
}

export async function encryptItemFields<T extends object>(
  vaultKeyRaw: Uint8Array,
  fields: T,
): Promise<EncryptedItemEnvelope> {
  const itemKey = randomBytes(32);
  const plaintext = utf8ToBytes(JSON.stringify(fields));
  const encryptedData = await aesGcmEncrypt(itemKey, plaintext);
  const encryptedItemKey = await aesGcmEncrypt(vaultKeyRaw, itemKey);
  return { encryptedData, encryptedItemKey };
}

export async function decryptItemFields<T = Record<string, unknown>>(
  vaultKeyRaw: Uint8Array,
  encryptedData: string,
  encryptedItemKey: string,
): Promise<T> {
  const itemKey = await aesGcmDecrypt(vaultKeyRaw, encryptedItemKey);
  return decryptFieldsWithItemKey<T>(itemKey, encryptedData);
}

/**
 * Decrypts item fields when the Item Key is already known in the clear —
 * used for items shared with this user, where the key comes from ECIES-
 * unwrapping a Share row (see share-wrap.ts) rather than from the owner's
 * Symmetric Vault Key.
 */
export async function decryptFieldsWithItemKey<T = Record<string, unknown>>(
  itemKey: Uint8Array,
  encryptedData: string,
): Promise<T> {
  const plaintext = await aesGcmDecrypt(itemKey, encryptedData);
  return JSON.parse(bytesToUtf8(plaintext)) as T;
}

export function vaultKeyFromBase64(vaultKeyRawB64: string): Uint8Array {
  return base64ToBytes(vaultKeyRawB64);
}

/** Unwraps just the Item Key (without decrypting the item's data) — needed to re-wrap it for a new share recipient. */
export async function unwrapOwnedItemKey(vaultKeyRaw: Uint8Array, encryptedItemKey: string): Promise<Uint8Array> {
  return aesGcmDecrypt(vaultKeyRaw, encryptedItemKey);
}
