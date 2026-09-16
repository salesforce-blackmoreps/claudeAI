import { useEffect, useState } from "react";
import type { VaultItemDto } from "@password-manager/shared";
import {
  lookupUserByEmail,
  createShare,
  revokeShare,
  rotateItemKey,
  listShares,
  ApiError,
  type ShareDto,
} from "../../lib/api-client";
import { withFreshAccessToken } from "../../lib/with-fresh-access-token";
import { getVaultKeyMaterial } from "../../background/vault-session";
import {
  vaultKeyFromBase64,
  unwrapOwnedItemKey,
  decryptFieldsWithItemKey,
  encryptItemFieldsWithFreshKey,
} from "../../lib/crypto/item-crypto";
import { wrapItemKeyForRecipient } from "../../lib/crypto/share-wrap";

interface ShareItemPanelProps {
  item: VaultItemDto;
  onClose: () => void;
}

export function ShareItemPanel({ item, onClose }: ShareItemPanelProps) {
  const [shares, setShares] = useState<ShareDto[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentItem, setCurrentItem] = useState(item);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const result = await withFreshAccessToken((token) => listShares(token, currentItem.id));
    setShares(result);
  }

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const material = await getVaultKeyMaterial();
      if (!material) throw new Error("Vault is locked");
      const vaultKeyRaw = vaultKeyFromBase64(material.vaultKeyRawB64);
      const itemKey = await unwrapOwnedItemKey(vaultKeyRaw, currentItem.encryptedItemKey);

      const recipient = await withFreshAccessToken((token) => lookupUserByEmail(token, email));
      const envelope = await wrapItemKeyForRecipient(itemKey, recipient.publicKey);

      await withFreshAccessToken((token) =>
        createShare(token, currentItem.id, { recipientUserId: recipient.id, encryptedItemKeyForRecipient: envelope, role }),
      );
      setEmail("");
      setRole("viewer");
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("No account found for that email. They need to sign up first.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Share limit reached for this item on your current plan.");
      } else if (err instanceof ApiError && err.status === 409) {
        setError("Already shared with that person.");
      } else {
        setError("Could not share this item.");
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * Viewer revocation is a plain delete — a viewer who already decrypted the
   * item locally keeps that snapshot (invariant #5's documented exception).
   * Editor revocation instead rotates the item's key: decrypt with the
   * current key, re-encrypt under a brand new one, and re-wrap that new key
   * for every remaining recipient, so the removed editor's cached key can
   * never decrypt or author future changes.
   */
  async function handleRevoke(share: ShareDto) {
    setBusy(true);
    setError(null);
    try {
      if (share.role === "viewer") {
        await withFreshAccessToken((token) => revokeShare(token, currentItem.id, share.id));
      } else {
        await rotateAndRevokeEditor(share);
      }
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("This item changed elsewhere. Close and reopen sharing, then try again.");
      } else {
        setError("Could not revoke share.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function rotateAndRevokeEditor(shareToRevoke: ShareDto) {
    const material = await getVaultKeyMaterial();
    if (!material) throw new Error("Vault is locked");
    const vaultKeyRaw = vaultKeyFromBase64(material.vaultKeyRawB64);

    const oldItemKey = await unwrapOwnedItemKey(vaultKeyRaw, currentItem.encryptedItemKey);
    const fields = await decryptFieldsWithItemKey(oldItemKey, currentItem.encryptedData);
    const rotated = await encryptItemFieldsWithFreshKey(vaultKeyRaw, fields);

    const remaining = (shares ?? []).filter((s) => s.id !== shareToRevoke.id);
    const remainingShares = await Promise.all(
      remaining.map(async (s) => ({
        shareId: s.id,
        encryptedItemKeyForRecipient: await wrapItemKeyForRecipient(rotated.itemKeyRaw, s.recipient.publicKey),
      })),
    );

    const updated = await withFreshAccessToken((token) =>
      rotateItemKey(token, currentItem.id, {
        encryptedData: rotated.encryptedData,
        encryptedItemKey: rotated.encryptedItemKey,
        expectedRev: currentItem.rev,
        revokeShareId: shareToRevoke.id,
        remainingShares,
      }),
    );
    setCurrentItem(updated);
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ fontSize: 15, margin: 0 }}>Share item</h2>

      <form onSubmit={handleShare} style={{ display: "flex", gap: 4 }}>
        <input
          type="email"
          required
          placeholder="teammate@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1 }}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as "viewer" | "editor")}>
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
        </select>
        <button type="submit" disabled={busy}>
          Share
        </button>
      </form>
      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}

      <div>
        <h3 style={{ fontSize: 13, margin: "8px 0 4px" }}>Shared with</h3>
        {shares === null ? (
          <p style={{ fontSize: 12, color: "#666" }}>Loading…</p>
        ) : shares.length === 0 ? (
          <p style={{ fontSize: 12, color: "#666" }}>Not shared with anyone yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {shares.map((share) => (
              <li key={share.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                <span>
                  {share.recipient.email} ({share.role})
                </span>
                <button type="button" onClick={() => handleRevoke(share)} disabled={busy}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" onClick={onClose} disabled={busy}>
        Close
      </button>
    </div>
  );
}
