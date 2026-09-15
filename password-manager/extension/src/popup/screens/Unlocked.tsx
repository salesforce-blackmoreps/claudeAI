import { useState } from "react";
import { sendToBackground } from "../../background/messages";
import { logout as apiLogout, ApiError } from "../../lib/api-client";
import { clearSession, loadSession } from "../../lib/storage/local-store";

interface UnlockedProps {
  email: string;
  onLocked: () => void;
  onLoggedOut: () => void;
}

// Phase 2 replaces this with the actual vault item list/CRUD UI.
export function Unlocked({ email, onLocked, onLoggedOut }: UnlockedProps) {
  const [busy, setBusy] = useState(false);

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

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <h1 style={{ fontSize: 16, margin: 0 }}>Vault</h1>
      <p style={{ fontSize: 12, color: "#666" }}>{email}</p>
      <p style={{ fontSize: 13, color: "#666" }}>Vault item list coming in Phase 2.</p>
      <button type="button" onClick={handleLock} disabled={busy}>
        Lock
      </button>
      <button type="button" onClick={handleLogout} disabled={busy}>
        Log out
      </button>
    </div>
  );
}
