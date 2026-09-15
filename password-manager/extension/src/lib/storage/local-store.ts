import type { KdfParams } from "@password-manager/shared";

/**
 * Persisted across restarts in chrome.storage.local. Everything here is
 * either ciphertext, a token, or non-secret metadata — never a decrypted key.
 * See docs/crypto-architecture.md and invariant #10.
 */
export interface StoredSession {
  email: string;
  deviceId: string;
  refreshToken: string;
  refreshTokenFamilyId: string;
  encryptedVaultKey: string;
  encryptedPrivateKey: string;
  publicKey: string;
  kdfType: "argon2id";
  kdfParams: KdfParams;
  kdfSalt: string;
}

const STORAGE_KEY = "session";

export async function saveSession(session: StoredSession): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: session });
}

export async function loadSession(): Promise<StoredSession | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as StoredSession | undefined) ?? null;
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

export async function updateTokens(refreshToken: string, refreshTokenFamilyId: string): Promise<void> {
  const current = await loadSession();
  if (!current) return;
  await saveSession({ ...current, refreshToken, refreshTokenFamilyId });
}
