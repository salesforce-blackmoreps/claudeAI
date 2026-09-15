/**
 * Message protocol between the popup/options UI (or content scripts, for the
 * AUTOFILL_* messages) and the background service worker. Every handler in
 * message-router.ts re-validates `sender.id` before acting (invariant #9) —
 * this file only defines the message shapes.
 */
export type BackgroundRequest =
  | { type: "VAULT_UNLOCK"; vaultKeyRawB64: string; privateKeyPkcs8B64: string; accessToken: string }
  | { type: "VAULT_LOCK" }
  | { type: "VAULT_STATUS" }
  | { type: "ACCESS_TOKEN_GET" }
  | { type: "ACCESS_TOKEN_SET"; accessToken: string }
  | { type: "VAULT_SYNC_NOW" }
  | { type: "AUTOFILL_QUERY_MATCHES"; origin: string }
  | { type: "AUTOFILL_GET_CREDENTIAL"; itemId: string }
  | { type: "AUTOFILL_SAVE_CREDENTIAL"; origin: string; title: string; username: string; password: string }
  | {
      type: "WEBAUTHN_CREATE";
      origin: string;
      rpId: string;
      rpName: string;
      userIdB64: string;
      userName: string;
      userDisplayName: string;
      challengeB64: string;
    }
  | {
      type: "WEBAUTHN_GET";
      origin: string;
      rpId: string;
      challengeB64: string;
      allowCredentialIdsB64: string[];
    };

export interface VaultStatusResponse {
  unlocked: boolean;
}

export interface AccessTokenResponse {
  accessToken: string | null;
}

export interface AutofillMatch {
  itemId: string;
  title: string;
  username: string;
}

export interface AutofillMatchesResponse {
  matches: AutofillMatch[];
}

export interface AutofillCredentialResponse {
  username: string;
  password: string;
}

export async function sendToBackground<T>(message: BackgroundRequest): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}
