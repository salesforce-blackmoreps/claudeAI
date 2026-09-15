/**
 * Message protocol between the popup/options UI and the background service
 * worker. Every handler in message-router.ts re-validates `sender.id` before
 * acting (invariant #9) — this file only defines the message shapes.
 */
export type BackgroundRequest =
  | { type: "VAULT_UNLOCK"; vaultKeyRawB64: string; privateKeyPkcs8B64: string; accessToken: string }
  | { type: "VAULT_LOCK" }
  | { type: "VAULT_STATUS" }
  | { type: "ACCESS_TOKEN_GET" }
  | { type: "ACCESS_TOKEN_SET"; accessToken: string };

export interface VaultStatusResponse {
  unlocked: boolean;
}

export interface AccessTokenResponse {
  accessToken: string | null;
}

export async function sendToBackground<T>(message: BackgroundRequest): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}
