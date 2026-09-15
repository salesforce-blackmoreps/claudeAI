import { useState } from "react";
import { generateSignupCryptoMaterial } from "../../lib/crypto/vault-key";
import { bytesToBase64 } from "../../lib/crypto/encoding";
import { signup, ApiError } from "../../lib/api-client";
import { saveSession } from "../../lib/storage/local-store";
import { getDeviceInfo } from "../../lib/device-info";
import { sendToBackground } from "../../background/messages";

interface SignupProps {
  onSignedUp: () => void;
  onSwitchToLogin: () => void;
}

const MIN_MASTER_PASSWORD_LENGTH = 12;

export function Signup({ onSignedUp, onSwitchToLogin }: SignupProps) {
  const [email, setEmail] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (masterPassword.length < MIN_MASTER_PASSWORD_LENGTH) {
      setError(`Master password must be at least ${MIN_MASTER_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (masterPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const material = await generateSignupCryptoMaterial(masterPassword);
      const { deviceName, devicePlatform } = getDeviceInfo();

      const session = await signup({
        email,
        masterPasswordHash: material.masterPasswordHash,
        kdfType: material.kdfType,
        kdfParams: material.kdfParams,
        kdfSalt: material.kdfSalt,
        encryptedVaultKey: material.encryptedVaultKey,
        publicKey: material.publicKey,
        encryptedPrivateKey: material.encryptedPrivateKey,
        deviceName,
        devicePlatform,
      });

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
        vaultKeyRawB64: bytesToBase64(material.vaultKeyRaw),
        privateKeyPkcs8B64: bytesToBase64(material.privateKeyPkcs8),
        accessToken: session.accessToken,
      });

      onSignedUp();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Signup failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <h1 style={{ fontSize: 16, margin: 0 }}>Create your account</h1>
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
      <label>
        Confirm master password
        <input
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <p style={{ fontSize: 12, color: "#666" }}>
        Your master password is never sent to our servers. If you forget it, your vault cannot be recovered.
      </p>
      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? "Creating account…" : "Sign up"}
      </button>
      <button type="button" onClick={onSwitchToLogin} disabled={busy}>
        Already have an account? Log in
      </button>
    </form>
  );
}
