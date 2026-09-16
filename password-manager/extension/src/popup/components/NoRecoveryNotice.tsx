import { useState } from "react";

/**
 * Zero-knowledge encryption means the server never has the means to decrypt
 * a vault or reset a master password — see docs/crypto-architecture.md's
 * "Account recovery policy". This is the one place that tradeoff is
 * explained to the user, shown on Login/Unlock as a "Forgot your master
 * password?" disclosure rather than a fake reset flow that can't exist.
 */
export function NoRecoveryNotice() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ fontSize: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ background: "none", border: "none", padding: 0, color: "#666", textDecoration: "underline", cursor: "pointer" }}
      >
        Forgot your master password?
      </button>
      {open && (
        <p style={{ color: "#666", margin: "4px 0 0" }}>
          Your master password never leaves your device, so we have no way to reset it or recover your vault — this
          is the tradeoff that keeps your data unreadable to anyone but you, including us. If you can't remember it,
          the only option is creating a new account; the old vault's contents can't be brought over.
        </p>
      )}
    </div>
  );
}
