import type { KdfParams } from "@password-manager/shared";
import { bytesToBase64, base64ToBytes, randomBytes } from "./encoding";
import { deriveMasterKey, DEFAULT_KDF_PARAMS } from "./kdf";
import { hkdfDeriveBits, HKDF_INFO_VAULT_KEY_WRAP, HKDF_INFO_AUTH_HASH } from "./hkdf";
import { aesGcmEncrypt, aesGcmDecrypt } from "./aes";
import { generateEcKeyPair, encodePublicKey } from "./ec";

const VAULT_KEY_LENGTH_BYTES = 32;
const KDF_SALT_LENGTH_BYTES = 16;

export interface SignupCryptoMaterial {
  kdfType: "argon2id";
  kdfParams: KdfParams;
  kdfSalt: string;
  masterPasswordHash: string;
  encryptedVaultKey: string;
  publicKey: string;
  encryptedPrivateKey: string;
  /** Kept only in memory by the caller (vault-session), never persisted as-is. */
  vaultKeyRaw: Uint8Array;
  /** Kept only in memory by the caller (vault-session), never persisted as-is. */
  privateKeyPkcs8: Uint8Array;
}

/**
 * Runs the full client-side key generation for a new account: derives the
 * Master Key from the chosen master password, splits it via HKDF into the
 * Stretched Master Key (wraps the new random Symmetric Vault Key) and the
 * Master Password Hash (the only thing sent to the server), and generates the
 * user's EC P-256 keypair for receiving shares. Nothing here is transmitted or
 * stored except the fields on the returned object other than `vaultKeyRaw`.
 * See docs/crypto-architecture.md.
 */
export async function generateSignupCryptoMaterial(
  masterPassword: string,
  kdfParams: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<SignupCryptoMaterial> {
  const kdfSaltBytes = randomBytes(KDF_SALT_LENGTH_BYTES);
  const kdfSalt = bytesToBase64(kdfSaltBytes);

  const masterKey = await deriveMasterKey(masterPassword, kdfSalt, kdfParams);
  const stretchedMasterKey = await hkdfDeriveBits(masterKey, kdfSaltBytes, HKDF_INFO_VAULT_KEY_WRAP, 256);
  const masterPasswordHashBytes = await hkdfDeriveBits(masterKey, kdfSaltBytes, HKDF_INFO_AUTH_HASH, 256);

  const vaultKeyRaw = randomBytes(VAULT_KEY_LENGTH_BYTES);
  const encryptedVaultKey = await aesGcmEncrypt(stretchedMasterKey, vaultKeyRaw);

  const ecKeyPair = await generateEcKeyPair();
  const encryptedPrivateKey = await aesGcmEncrypt(vaultKeyRaw, ecKeyPair.privateKeyPkcs8);

  return {
    kdfType: "argon2id",
    kdfParams,
    kdfSalt,
    masterPasswordHash: bytesToBase64(masterPasswordHashBytes),
    encryptedVaultKey,
    publicKey: encodePublicKey(ecKeyPair.publicKeyRaw),
    encryptedPrivateKey,
    vaultKeyRaw,
    privateKeyPkcs8: ecKeyPair.privateKeyPkcs8,
  };
}

export interface UnlockedVaultMaterial {
  masterPasswordHash: string;
  vaultKeyRaw: Uint8Array;
  privateKeyPkcs8: Uint8Array;
}

/**
 * Re-derives the Master Key from an entered master password plus the account's
 * stored KDF parameters, recomputes the auth hash to send to the server, and
 * (once the server confirms it and returns the encrypted blobs) unwraps the
 * Symmetric Vault Key and EC private key. This is "unlocking" the vault.
 */
export async function deriveLoginAuthMaterial(
  masterPassword: string,
  kdfSalt: string,
  kdfParams: KdfParams,
): Promise<{ masterPasswordHash: string; masterKey: Uint8Array }> {
  const kdfSaltBytes = base64ToBytes(kdfSalt);
  const masterKey = await deriveMasterKey(masterPassword, kdfSalt, kdfParams);
  const masterPasswordHashBytes = await hkdfDeriveBits(masterKey, kdfSaltBytes, HKDF_INFO_AUTH_HASH, 256);
  return { masterPasswordHash: bytesToBase64(masterPasswordHashBytes), masterKey };
}

export async function unlockVaultKeys(
  masterKey: Uint8Array,
  kdfSalt: string,
  encryptedVaultKey: string,
  encryptedPrivateKey: string,
): Promise<UnlockedVaultMaterial> {
  const kdfSaltBytes = base64ToBytes(kdfSalt);
  const stretchedMasterKey = await hkdfDeriveBits(masterKey, kdfSaltBytes, HKDF_INFO_VAULT_KEY_WRAP, 256);
  const masterPasswordHashBytes = await hkdfDeriveBits(masterKey, kdfSaltBytes, HKDF_INFO_AUTH_HASH, 256);
  const vaultKeyRaw = await aesGcmDecrypt(stretchedMasterKey, encryptedVaultKey);
  const privateKeyPkcs8 = await aesGcmDecrypt(vaultKeyRaw, encryptedPrivateKey);
  return {
    masterPasswordHash: bytesToBase64(masterPasswordHashBytes),
    vaultKeyRaw,
    privateKeyPkcs8,
  };
}
