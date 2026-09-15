/**
 * Holds the unlocked vault key material for the current browser session.
 * Backed by chrome.storage.session (in-memory only, cleared on browser
 * close — never written to disk) rather than a plain JS variable, since the
 * MV3 service worker can be evicted after ~30s idle and a bare variable would
 * be lost, forcing an unnecessary re-unlock on every eviction. See
 * docs/crypto-architecture.md and invariant #10.
 */
const SESSION_KEY = "vault-session";
const AUTO_LOCK_ALARM = "vault-auto-lock";
const AUTO_LOCK_MINUTES = 15;

interface StoredVaultSession {
  vaultKeyRawB64: string;
  privateKeyPkcs8B64: string;
  accessToken: string;
  unlockedAtMs: number;
}

export async function unlockVaultSession(
  vaultKeyRawB64: string,
  privateKeyPkcs8B64: string,
  accessToken: string,
): Promise<void> {
  const session: StoredVaultSession = {
    vaultKeyRawB64,
    privateKeyPkcs8B64,
    accessToken,
    unlockedAtMs: Date.now(),
  };
  await chrome.storage.session.set({ [SESSION_KEY]: session });
  chrome.alarms.create(AUTO_LOCK_ALARM, { delayInMinutes: AUTO_LOCK_MINUTES });
}

export async function lockVaultSession(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY);
  chrome.alarms.clear(AUTO_LOCK_ALARM);
}

export async function isVaultUnlocked(): Promise<boolean> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  return Boolean(result[SESSION_KEY]);
}

export async function getAccessToken(): Promise<string | null> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  const session = result[SESSION_KEY] as StoredVaultSession | undefined;
  return session?.accessToken ?? null;
}

export async function setAccessToken(accessToken: string): Promise<void> {
  const result = await chrome.storage.session.get(SESSION_KEY);
  const session = result[SESSION_KEY] as StoredVaultSession | undefined;
  if (!session) return;
  await chrome.storage.session.set({ [SESSION_KEY]: { ...session, accessToken } });
}

export function registerAutoLockAlarm(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AUTO_LOCK_ALARM) {
      void lockVaultSession();
    }
  });
}
