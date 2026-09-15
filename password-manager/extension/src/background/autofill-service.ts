import type { AutofillMatch } from "./messages";
import { getVaultKeyMaterial } from "./vault-session";
import { getCachedItems, getItemById, upsertItem } from "../lib/storage/vault-cache";
import { vaultKeyFromBase64, encryptItemFields, decryptItemFields } from "../lib/crypto/item-crypto";
import { uriMatchesOrigin } from "../lib/domain-match";
import { withFreshAccessToken } from "../lib/with-fresh-access-token";
import { createVaultItem, ApiError } from "../lib/api-client";
import type { LoginItemFields } from "../lib/vault/item-fields";

/**
 * Backs the AUTOFILL_* background messages (see message-router.ts). Runs in
 * the background service worker, which is the only context holding the
 * unlocked vault key material — content scripts never receive it directly,
 * only the specific decrypted fields needed for one fill action.
 */
export async function queryAutofillMatches(origin: string): Promise<AutofillMatch[]> {
  const material = await getVaultKeyMaterial();
  if (!material) return [];
  const vaultKeyRaw = vaultKeyFromBase64(material.vaultKeyRawB64);

  const items = (await getCachedItems()).filter((item) => item.type === "login");
  const matches: AutofillMatch[] = [];

  for (const item of items) {
    const fields = await decryptItemFields<LoginItemFields>(vaultKeyRaw, item.encryptedData, item.encryptedItemKey);
    if (fields.uri && uriMatchesOrigin(fields.uri, origin)) {
      matches.push({ itemId: item.id, title: fields.title, username: fields.username });
    }
  }

  return matches;
}

export async function getAutofillCredential(itemId: string): Promise<{ username: string; password: string } | null> {
  const material = await getVaultKeyMaterial();
  if (!material) return null;
  const item = await getItemById(itemId);
  if (!item) return null;

  const vaultKeyRaw = vaultKeyFromBase64(material.vaultKeyRawB64);
  const fields = await decryptItemFields<LoginItemFields>(vaultKeyRaw, item.encryptedData, item.encryptedItemKey);
  return { username: fields.username, password: fields.password };
}

export async function saveAutofillCredential(
  origin: string,
  title: string,
  username: string,
  password: string,
): Promise<boolean> {
  const material = await getVaultKeyMaterial();
  if (!material) return false;
  const vaultKeyRaw = vaultKeyFromBase64(material.vaultKeyRawB64);

  const fields: LoginItemFields = { title, username, password, uri: origin };
  const envelope = await encryptItemFields(vaultKeyRaw, fields);

  try {
    const saved = await withFreshAccessToken((token) => createVaultItem(token, { type: "login", ...envelope }));
    await upsertItem(saved);
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return false; // item limit reached — fail quietly, popup already surfaces this
    }
    throw err;
  }
}
