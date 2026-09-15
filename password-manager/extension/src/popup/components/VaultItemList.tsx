import { useState } from "react";
import type { VaultItemDto } from "@password-manager/shared";
import type { LoginItemFields } from "../../lib/vault/item-fields";

export interface DecryptedItem {
  item: VaultItemDto;
  fields: LoginItemFields;
}

interface VaultItemListProps {
  entries: DecryptedItem[];
  onEdit: (entry: DecryptedItem) => void;
  onDelete: (entry: DecryptedItem) => void;
}

export function VaultItemList({ entries, onEdit, onDelete }: VaultItemListProps) {
  if (entries.length === 0) {
    return <p style={{ fontSize: 13, color: "#666", padding: "0 16px" }}>No items yet. Add your first one above.</p>;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {entries.map((entry) => (
        <VaultItemRow key={entry.item.id} entry={entry} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </ul>
  );
}

function VaultItemRow({ entry, onEdit, onDelete }: { entry: DecryptedItem } & Omit<VaultItemListProps, "entries">) {
  const [revealed, setRevealed] = useState(false);

  async function copyPassword() {
    await navigator.clipboard.writeText(entry.fields.password);
  }

  return (
    <li style={{ padding: "8px 16px", borderBottom: "1px solid #eee" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{entry.fields.title}</div>
          <div style={{ fontSize: 12, color: "#666" }}>{entry.fields.username}</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button type="button" onClick={() => setRevealed((r) => !r)}>
            {revealed ? "Hide" : "Show"}
          </button>
          <button type="button" onClick={copyPassword}>
            Copy
          </button>
          <button type="button" onClick={() => onEdit(entry)}>
            Edit
          </button>
          <button type="button" onClick={() => onDelete(entry)}>
            Delete
          </button>
        </div>
      </div>
      {revealed && (
        <div style={{ fontFamily: "monospace", fontSize: 12, marginTop: 4 }}>{entry.fields.password}</div>
      )}
    </li>
  );
}
