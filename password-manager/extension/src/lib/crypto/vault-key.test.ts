import { describe, expect, it } from "vitest";
import { generateSignupCryptoMaterial, deriveLoginAuthMaterial, unlockVaultKeys } from "./vault-key";

// Low-cost KDF params for fast tests — production uses DEFAULT_KDF_PARAMS.
const TEST_KDF_PARAMS = { type: "argon2id" as const, memoryKib: 1024, iterations: 1, parallelism: 1 };

describe("vault key crypto roundtrip", () => {
  it("derives consistent auth hashes and unlocks the vault with the correct password", async () => {
    const material = await generateSignupCryptoMaterial("correct horse battery staple", TEST_KDF_PARAMS);

    const login = await deriveLoginAuthMaterial(
      "correct horse battery staple",
      material.kdfSalt,
      material.kdfParams,
    );
    expect(login.masterPasswordHash).toBe(material.masterPasswordHash);

    const unlocked = await unlockVaultKeys(
      login.masterKey,
      material.kdfSalt,
      material.encryptedVaultKey,
      material.encryptedPrivateKey,
    );
    expect(unlocked.masterPasswordHash).toBe(material.masterPasswordHash);
    expect(Array.from(unlocked.vaultKeyRaw)).toEqual(Array.from(material.vaultKeyRaw));
  });

  it("produces a different auth hash for the wrong password", async () => {
    const material = await generateSignupCryptoMaterial("correct horse battery staple", TEST_KDF_PARAMS);
    const wrongLogin = await deriveLoginAuthMaterial("incorrect password", material.kdfSalt, material.kdfParams);
    expect(wrongLogin.masterPasswordHash).not.toBe(material.masterPasswordHash);
  });

  it("fails to unwrap the vault key when given the wrong master key", async () => {
    const material = await generateSignupCryptoMaterial("correct horse battery staple", TEST_KDF_PARAMS);
    const wrongLogin = await deriveLoginAuthMaterial("incorrect password", material.kdfSalt, material.kdfParams);
    await expect(
      unlockVaultKeys(wrongLogin.masterKey, material.kdfSalt, material.encryptedVaultKey, material.encryptedPrivateKey),
    ).rejects.toThrow();
  });
});
