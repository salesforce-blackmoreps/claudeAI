import type { BackgroundRequest, VaultStatusResponse, AccessTokenResponse } from "./messages";
import { unlockVaultSession, lockVaultSession, isVaultUnlocked, getAccessToken, setAccessToken } from "./vault-session";
import { pullChanges, connectRealtimeSync, disconnectRealtimeSync, registerPeriodicSync } from "./sync-engine";

/**
 * Every handler here only ever runs for messages from this extension's own
 * popup/options pages — `sender.id` is checked against our own extension id
 * before any message is acted on, and this extension does not declare
 * `externally_connectable`, so no other extension or web page can reach this
 * listener at all. See invariant #9.
 */
export function registerMessageRouter(): void {
  chrome.runtime.onMessage.addListener((message: BackgroundRequest, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) {
      return false;
    }

    handleMessage(message).then(sendResponse);
    return true; // keep the message channel open for the async response
  });
}

async function handleMessage(message: BackgroundRequest): Promise<unknown> {
  switch (message.type) {
    case "VAULT_UNLOCK":
      await unlockVaultSession(message.vaultKeyRawB64, message.privateKeyPkcs8B64, message.accessToken);
      registerPeriodicSync();
      void connectRealtimeSync();
      void pullChanges();
      return { unlocked: true } satisfies VaultStatusResponse;
    case "VAULT_LOCK":
      await lockVaultSession();
      disconnectRealtimeSync();
      return { unlocked: false } satisfies VaultStatusResponse;
    case "VAULT_STATUS":
      return { unlocked: await isVaultUnlocked() } satisfies VaultStatusResponse;
    case "ACCESS_TOKEN_GET":
      return { accessToken: await getAccessToken() } satisfies AccessTokenResponse;
    case "ACCESS_TOKEN_SET":
      await setAccessToken(message.accessToken);
      return { accessToken: message.accessToken } satisfies AccessTokenResponse;
    case "VAULT_SYNC_NOW":
      await pullChanges();
      return { synced: true };
    default:
      return null;
  }
}
