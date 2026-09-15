export type VaultItemType = "login" | "passkey" | "note";

/**
 * Wire representation of a vault item. `encryptedData` and `encryptedItemKey` are
 * opaque base64 ciphertext blobs the server never inspects or decrypts — see
 * docs/crypto-architecture.md for the envelope format.
 */
export interface VaultItemDto {
  id: string;
  type: VaultItemType;
  ownerUserId: string | null;
  ownerTeamId: string | null;
  folderId: string | null;
  encryptedData: string;
  encryptedItemKey: string;
  rev: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface VaultSyncResponseDto {
  items: VaultItemDto[];
  cursor: string;
}
