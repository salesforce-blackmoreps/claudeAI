import { useState } from "react";
import { deriveLoginAuthMaterial, unlockVaultKeys } from "../../lib/crypto/vault-key";
import { bytesToBase64 } from "../../lib/crypto/encoding";
import { refreshSession, ApiError } from "../../lib/api-client";
import { updateTokens, clearSession, type StoredSession } from "../../lib/storage/local-store";
import { sendToBackground } from "../../background/messages";

interface UnlockProps {
  session: StoredSession;
  onUnlocked: () => void;
  onSessionInvalid: () => void;
}

export function Unlock({ session, onUnlocked, onSessionInvalid }: UnlockProps) {
  const [masterPassword, setMasterPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Fully offline: re-derive the master key and attempt to unwrap the
      // vault key using the locally cached ciphertext. A wrong password fails
      // the AES-GCM auth tag check inside unlockVaultKeys, never a network call.
      const { masterKey } = await deriveLoginAuthMaterial(masterPassword, session.kdfSalt, session.kdfParams);
      const unlocked = await unlockVaultKeys(masterKey, session.kdfSalt, session.encryptedVaultKey, session.encryptedPrivateKey);

      let accessToken: string;
      try {
        const refreshed = await refreshSession(session.refreshToken, session.refreshTokenFamilyId);
        await updateTokens(refreshed.refreshToken, refreshed.refreshTokenFamilyId);
        accessToken = refreshed.accessToken;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await clearSession();
          onSessionInvalid();
          return;
        }
        throw err;
      }

      await sendToBackground({
        type: "VAULT_UNLOCK",
        vaultKeyRawB64: bytesToBase64(unlocked.vaultKeyRaw),
        privateKeyPkcs8B64: bytesToBase64(unlocked.privateKeyPkcs8),
        accessToken,
      });

      onUnlocked();
    } catch {
      setError("Incorrect master password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <h1 style={{ fontSize: 16, margin: 0 }}>Unlock vault</h1>
      <p style={{ fontSize: 12, color: "#666", margin: 0 }}>{session.email}</p>
      <input
        type="password"
        autoFocus
        required
        placeholder="Master password"
        value={masterPassword}
        onChange={(e) => setMasterPassword(e.target.value)}
        style={{ display: "block", width: "100%" }}
      />
      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? "Unlocking…" : "Unlock"}
      </button>
    </form>
  );
}
