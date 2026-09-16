import { useState } from "react";
import type { LoginItemFields } from "../../lib/vault/item-fields";

interface VaultItemFormProps {
  initial?: LoginItemFields;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (fields: LoginItemFields) => void;
}

export function VaultItemForm({ initial, busy, onCancel, onSubmit }: VaultItemFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");
  const [uri, setUri] = useState(initial?.uri ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ title, username, password, uri: uri || undefined, notes: notes || undefined });
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ fontSize: 15, margin: 0 }}>{initial ? "Edit item" : "New item"}</h2>
      <label>
        Title
        <input required value={title} onChange={(e) => setTitle(e.target.value)} style={{ display: "block", width: "100%" }} />
      </label>
      <label>
        Website
        <input value={uri} onChange={(e) => setUri(e.target.value)} style={{ display: "block", width: "100%" }} />
      </label>
      <label>
        Username
        <input value={username} onChange={(e) => setUsername(e.target.value)} style={{ display: "block", width: "100%" }} />
      </label>
      <label>
        Password
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ display: "block", width: "100%", fontFamily: "monospace" }}
        />
      </label>
      <label>
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ display: "block", width: "100%" }} />
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
