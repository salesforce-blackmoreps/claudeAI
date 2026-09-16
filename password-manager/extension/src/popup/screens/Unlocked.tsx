import { useEffect, useState } from "react";
import type { VaultItemDto } from "@password-manager/shared";
import { sendToBackground } from "../../background/messages";
import { getVaultKeyMaterial } from "../../background/vault-session";
import {
  logout as apiLogout,
  createVaultItem,
  updateVaultItem,
  deleteVaultItem,
  getEntitlements,
  listSharedWithMe,
  ApiError,
} from "../../lib/api-client";
import { withFreshAccessToken } from "../../lib/with-fresh-access-token";
import { clearSession, loadSession } from "../../lib/storage/local-store";
import { getCachedItems, upsertItem, removeItem } from "../../lib/storage/vault-cache";
import { vaultKeyFromBase64, encryptItemFields, decryptItemFields, decryptFieldsWithItemKey } from "../../lib/crypto/item-crypto";
import { unwrapItemKeyFromSender } from "../../lib/crypto/share-wrap";
import { base64ToBytes } from "../../lib/crypto/encoding";
import type { LoginItemFields } from "../../lib/vault/item-fields";
import { VaultItemForm } from "../components/VaultItemForm";
import { VaultItemList, type DecryptedItem } from "../components/VaultItemList";
import { ShareItemPanel } from "../components/ShareItemPanel";

interface UnlockedProps {
  email: string;
  onLocked: () => void;
  onLoggedOut: () => void;
}

type FormState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; entry: DecryptedItem }
  | { mode: "share"; entry: DecryptedItem };

export function Unlocked({ email, onLocked, onLoggedOut }: UnlockedProps) {
  const [entries, setEntries] = useState<DecryptedItem[] | null>(null);
  const [sharedWithMe, setSharedWithMe] = useState<DecryptedItem[] | null>(null);
  const [usage, setUsage] = useState<{ current: number; max: number } | null>(null);
  const [form, setForm] = useState<FormState>({ mode: "closed" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshAll();
  }, []);

  async function refreshAll() {
    await sendToBackground({ type: "VAULT_SYNC_NOW" });
    await loadAndDecrypt();
    await loadUsage();
    await loadSharedWithMe();
  }

  async function loadSharedWithMe() {
    const material = await getVaultKeyMaterial();
    if (!material) return;
    try {
      const shares = await withFreshAccessToken((token) => listSharedWithMe(token));
      const privateKeyPkcs8 = base64ToBytes(material.privateKeyPkcs8B64);
      const decrypted = await Promise.all(
        shares
          .filter((share) => share.vaultItem.type === "login")
          .map(async (share) => {
            const itemKey = await unwrapItemKeyFromSender(share.encryptedItemKeyForRecipient, privateKeyPkcs8);
            const fields = await decryptFieldsWithItemKey<LoginItemFields>(itemKey, share.vaultItem.encryptedData);
            return { item: share.vaultItem, fields };
          }),
      );
      setSharedWithMe(decrypted);
    } catch {
      // Non-fatal — "shared with me" section just won't populate this refresh.
    }
  }

  async function loadAndDecrypt() {
    const material = await getVaultKeyMaterial();
    if (!material) return;
    const vaultKeyRaw = vaultKeyFromBase64(material.vaultKeyRawB64);
    const items = await getCachedItems();
    const decrypted = await Promise.all(
      items
        .filter((item) => item.type === "login")
        .map(async (item) => ({
          item,
          fields: await decryptItemFields<LoginItemFields>(vaultKeyRaw, item.encryptedData, item.encryptedItemKey),
        })),
    );
    setEntries(decrypted);
  }

  async function loadUsage() {
    try {
      const entitlements = await withFreshAccessToken((token) => getEntitlements(token));
      setUsage({ current: entitlements.currentItemCount, max: entitlements.maxItemsPerUser });
    } catch {
      // Non-fatal — usage banner just won't show.
    }
  }

  async function handleSave(fields: LoginItemFields) {
    setBusy(true);
    setError(null);
    try {
      const material = await getVaultKeyMaterial();
      if (!material) throw new Error("Vault is locked");
      const vaultKeyRaw = vaultKeyFromBase64(material.vaultKeyRawB64);
      const envelope = await encryptItemFields(vaultKeyRaw, fields);

      const saved = await withFreshAccessToken((token) => {
        if (form.mode === "edit") {
          return updateVaultItem(token, form.entry.item.id, { ...envelope, expectedRev: form.entry.item.rev });
        }
        return createVaultItem(token, { type: "login", ...envelope });
      });

      await upsertItem(saved as VaultItemDto);
      setForm({ mode: "closed" });
      await loadAndDecrypt();
      await loadUsage();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("You've reached your plan's item limit. Upgrade to add more.");
      } else if (err instanceof ApiError && err.status === 409) {
        setError("This item changed elsewhere. Refreshing…");
        await refreshAll();
      } else {
        setError("Could not save item.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(entry: DecryptedItem) {
    setBusy(true);
    try {
      await withFreshAccessToken((token) => deleteVaultItem(token, entry.item.id));
      await removeItem(entry.item.id);
      await loadAndDecrypt();
      await loadUsage();
    } catch {
      setError("Could not delete item.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLock() {
    await sendToBackground({ type: "VAULT_LOCK" });
    onLocked();
  }

  async function handleLogout() {
    setBusy(true);
    try {
      const session = await loadSession();
      const tokenResponse = await sendToBackground<{ accessToken: string | null }>({ type: "ACCESS_TOKEN_GET" });
      if (session && tokenResponse.accessToken) {
        await apiLogout(tokenResponse.accessToken, session.refreshTokenFamilyId).catch((err) => {
          if (!(err instanceof ApiError)) throw err;
        });
      }
    } finally {
      await sendToBackground({ type: "VAULT_LOCK" });
      await clearSession();
      setBusy(false);
      onLoggedOut();
    }
  }

  if (form.mode === "share") {
    return <ShareItemPanel item={form.entry.item} onClose={() => setForm({ mode: "closed" })} />;
  }

  if (form.mode !== "closed") {
    return (
      <VaultItemForm
        initial={form.mode === "edit" ? form.entry.fields : undefined}
        busy={busy}
        onCancel={() => setForm({ mode: "closed" })}
        onSubmit={handleSave}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ padding: "16px 16px 0" }}>
        <h1 style={{ fontSize: 16, margin: 0 }}>Vault</h1>
        <p style={{ fontSize: 12, color: "#666", margin: "2px 0" }}>{email}</p>
        {usage && (
          <p style={{ fontSize: 12, color: usage.current >= usage.max ? "crimson" : "#666" }}>
            {usage.current}/{usage.max} items used
          </p>
        )}
        {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
        <button type="button" onClick={() => setForm({ mode: "create" })} disabled={busy || (usage ? usage.current >= usage.max : false)}>
          + Add item
        </button>
      </div>

      {entries === null ? (
        <p style={{ padding: "0 16px", fontSize: 13, color: "#666" }}>Loading…</p>
      ) : (
        <VaultItemList
          entries={entries}
          onEdit={(entry) => setForm({ mode: "edit", entry })}
          onDelete={handleDelete}
          onShare={(entry) => setForm({ mode: "share", entry })}
        />
      )}

      {sharedWithMe && sharedWithMe.length > 0 && (
        <div style={{ padding: "0 16px" }}>
          <h2 style={{ fontSize: 13, color: "#666", margin: "8px 0 4px" }}>Shared with you</h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {sharedWithMe.map((entry) => (
              <li key={entry.item.id} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid #eee" }}>
                <div style={{ fontWeight: 600 }}>{entry.fields.title}</div>
                <div style={{ color: "#666", fontSize: 12 }}>{entry.fields.username}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ padding: 16, display: "flex", gap: 8 }}>
        <button type="button" onClick={handleLock} disabled={busy}>
          Lock
        </button>
        <button type="button" onClick={handleLogout} disabled={busy}>
          Log out
        </button>
      </div>
    </div>
  );
}
