import { useState } from "react";
import type { AuthSessionDto } from "@password-manager/shared";
import { deriveLoginAuthMaterial, unlockVaultKeys } from "../../lib/crypto/vault-key";
import { bytesToBase64 } from "../../lib/crypto/encoding";
import { fetchKdfParams, login, verifyMfa, ApiError } from "../../lib/api-client";
import { saveSession } from "../../lib/storage/local-store";
import { getDeviceInfo } from "../../lib/device-info";
import { sendToBackground } from "../../background/messages";
import { NoRecoveryNotice } from "../components/NoRecoveryNotice";

interface LoginProps {
  onLoggedIn: () => void;
  onSwitchToSignup: () => void;
}

export function Login({ onLoggedIn, onSwitchToSignup }: LoginProps) {
  const [email, setEmail] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [loginTicket, setLoginTicket] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finishLogin(session: AuthSessionDto, masterKey: Uint8Array) {
    const unlocked = await unlockVaultKeys(masterKey, session.kdfSalt, session.encryptedVaultKey, session.encryptedPrivateKey);

    await saveSession({
      email,
      deviceId: session.deviceId,
      refreshToken: session.refreshToken,
      refreshTokenFamilyId: session.refreshTokenFamilyId,
      encryptedVaultKey: session.encryptedVaultKey,
      encryptedPrivateKey: session.encryptedPrivateKey,
      publicKey: session.publicKey,
      kdfType: session.kdfType,
      kdfParams: session.kdfParams,
      kdfSalt: session.kdfSalt,
    });

    await sendToBackground({
      type: "VAULT_UNLOCK",
      vaultKeyRawB64: bytesToBase64(unlocked.vaultKeyRaw),
      privateKeyPkcs8B64: bytesToBase64(unlocked.privateKeyPkcs8),
      accessToken: session.accessToken,
    });

    onLoggedIn();
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const kdf = await fetchKdfParams(email);
      const { masterPasswordHash, masterKey } = await deriveLoginAuthMaterial(masterPassword, kdf.kdfSalt, kdf.kdfParams);
      const { deviceName, devicePlatform } = getDeviceInfo();

      const response = await login({ email, masterPasswordHash, deviceName, devicePlatform });

      if ("mfaRequired" in response) {
        setLoginTicket(response.loginTicket);
      } else {
        await finishLogin(response, masterKey);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed. Please check your credentials.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!loginTicket) return;
    setError(null);
    setBusy(true);
    try {
      const kdf = await fetchKdfParams(email);
      const { masterKey } = await deriveLoginAuthMaterial(masterPassword, kdf.kdfSalt, kdf.kdfParams);
      const { deviceName, devicePlatform } = getDeviceInfo();
      const session = await verifyMfa({ loginTicket, code: mfaCode, deviceName, devicePlatform });
      await finishLogin(session, masterKey);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loginTicket) {
    return (
      <form onSubmit={handleMfaSubmit} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 style={{ fontSize: 16, margin: 0 }}>Enter your 2FA code</h1>
        <input
          inputMode="numeric"
          autoFocus
          required
          value={mfaCode}
          onChange={(e) => setMfaCode(e.target.value)}
          style={{ display: "block", width: "100%" }}
        />
        {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Verifying…" : "Verify"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handlePasswordSubmit} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <h1 style={{ fontSize: 16, margin: 0 }}>Log in</h1>
      <label>
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <label>
        Master password
        <input
          type="password"
          required
          value={masterPassword}
          onChange={(e) => setMasterPassword(e.target.value)}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? "Logging in…" : "Log in"}
      </button>
      <button type="button" onClick={onSwitchToSignup} disabled={busy}>
        Need an account? Sign up
      </button>
      <NoRecoveryNotice />
    </form>
  );
}
