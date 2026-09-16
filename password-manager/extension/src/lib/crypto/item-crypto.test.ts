import { describe, expect, it } from "vitest";
import { randomBytes } from "./encoding";
import { encryptItemFields, decryptItemFields } from "./item-crypto";

describe("item-crypto roundtrip", () => {
  it("encrypts and decrypts item fields under the vault key", async () => {
    const vaultKeyRaw = randomBytes(32);
    const fields = { username: "alice@example.com", password: "hunter2", notes: "" };

    const envelope = await encryptItemFields(vaultKeyRaw, fields);
    expect(envelope.encryptedData).not.toContain("hunter2");

    const decrypted = await decryptItemFields<typeof fields>(
      vaultKeyRaw,
      envelope.encryptedData,
      envelope.encryptedItemKey,
    );
    expect(decrypted).toEqual(fields);
  });

  it("fails to decrypt with the wrong vault key", async () => {
    const vaultKeyRaw = randomBytes(32);
    const wrongKey = randomBytes(32);
    const envelope = await encryptItemFields(vaultKeyRaw, { username: "a", password: "b" });

    await expect(decryptItemFields(wrongKey, envelope.encryptedData, envelope.encryptedItemKey)).rejects.toThrow();
  });

  it("uses a distinct item key per item, even for identical plaintext", async () => {
    const vaultKeyRaw = randomBytes(32);
    const fields = { username: "same", password: "same" };
    const a = await encryptItemFields(vaultKeyRaw, fields);
    const b = await encryptItemFields(vaultKeyRaw, fields);
    expect(a.encryptedItemKey).not.toBe(b.encryptedItemKey);
    expect(a.encryptedData).not.toBe(b.encryptedData);
  });
});
