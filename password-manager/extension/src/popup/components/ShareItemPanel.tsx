import { useEffect, useState } from "react";
import type { VaultItemDto } from "@password-manager/shared";
import {
  lookupUserByEmail,
  createShare,
  revokeShare,
  listShares,
  ApiError,
  type ShareDto,
} from "../../lib/api-client";
import { withFreshAccessToken } from "../../lib/with-fresh-access-token";
import { getVaultKeyMaterial } from "../../background/vault-session";
import { vaultKeyFromBase64, unwrapOwnedItemKey } from "../../lib/crypto/item-crypto";
import { wrapItemKeyForRecipient } from "../../lib/crypto/share-wrap";

interface ShareItemPanelProps {
  item: VaultItemDto;
  onClose: () => void;
}

/**
 * Only handles viewer shares (see docs/crypto-architecture.md revocation
 * rules — viewer revocation needs no key rotation, unlike editor). Creating
 * editor shares and the rotate-on-revoke flow are fully implemented and
 * tested server-side (sharing.service.ts) but not yet exposed in this UI —
 * a deliberate Phase 5 scope cut, not a crypto limitation.
 */
export function ShareItemPanel({ item, onClose }: ShareItemPanelProps) {
  const [shares, setShares] = useState<ShareDto[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const result = await withFreshAccessToken((token) => listShares(token, item.id));
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
      const itemKey = await unwrapOwnedItemKey(vaultKeyRaw, item.encryptedItemKey);

      const recipient = await withFreshAccessToken((token) => lookupUserByEmail(token, email));
      const envelope = await wrapItemKeyForRecipient(itemKey, recipient.publicKey);

      await withFreshAccessToken((token) =>
        createShare(token, item.id, { recipientUserId: recipient.id, encryptedItemKeyForRecipient: envelope, role: "viewer" }),
      );
      setEmail("");
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

  async function handleRevoke(shareId: string) {
    setBusy(true);
    try {
      await withFreshAccessToken((token) => revokeShare(token, item.id, shareId));
      await refresh();
    } catch {
      setError("Could not revoke share.");
    } finally {
      setBusy(false);
    }
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
                {share.role === "viewer" && (
                  <button type="button" onClick={() => handleRevoke(share.id)} disabled={busy}>
                    Revoke
                  </button>
                )}
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
