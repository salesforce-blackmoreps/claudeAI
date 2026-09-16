import type { VaultItemDto } from "@password-manager/shared";
import { getVaultKeyMaterial } from "../vault-session";
import { getCachedItems, upsertItem } from "../../lib/storage/vault-cache";
import { vaultKeyFromBase64, encryptItemFields, decryptItemFields } from "../../lib/crypto/item-crypto";
import { generateEcdsaKeyPair, importEcdsaPrivateKey, signEcdsaRaw } from "../../lib/crypto/ecdsa";
import { rawP256SignatureToDer } from "../../lib/crypto/der";
import { isValidRpIdForOrigin } from "../../lib/webauthn/rp-id";
import { buildAttestationObject, buildAssertionAuthenticatorData } from "./native-authenticator";
import { randomBytes, bytesToBase64, base64ToBytes, bytesToBase64Url, utf8ToBytes, concatBytes } from "../../lib/crypto/encoding";
import { withFreshAccessToken } from "../../lib/with-fresh-access-token";
import { createVaultItem, updateVaultItem, ApiError } from "../../lib/api-client";
import type { PasskeyItemFields } from "../../lib/vault/passkey-fields";

function buildClientDataJson(type: "webauthn.create" | "webauthn.get", challengeB64: string, origin: string): Uint8Array {
  const challengeB64Url = bytesToBase64Url(base64ToBytes(challengeB64));
  const json = JSON.stringify({ type, challenge: challengeB64Url, origin, crossOrigin: false });
  return utf8ToBytes(json);
}

async function findPasskeyItemsForRp(
  rpId: string,
  vaultKeyRaw: Uint8Array,
): Promise<{ item: VaultItemDto; fields: PasskeyItemFields }[]> {
  const items = (await getCachedItems()).filter((item) => item.type === "passkey");
  const results: { item: VaultItemDto; fields: PasskeyItemFields }[] = [];
  for (const item of items) {
    const fields = await decryptItemFields<PasskeyItemFields>(vaultKeyRaw, item.encryptedData, item.encryptedItemKey);
    if (fields.rpId === rpId) {
      results.push({ item, fields });
    }
  }
  return results;
}

export interface CreateCeremonyRequest {
  origin: string;
  rpId: string;
  rpName: string;
  userIdB64: string;
  userName: string;
  userDisplayName: string;
  challengeB64: string;
}

export interface CreateCeremonyResult {
  credentialIdB64: string;
  attestationObjectB64: string;
  clientDataJSONB64: string;
}

/**
 * Handles a `navigator.credentials.create()` ceremony relayed from the page.
 * Generates a fresh ECDSA P-256 keypair, stores it as an encrypted vault item
 * (type: "passkey" — same envelope, sync, and backup path as every other
 * item), and returns the attestation the page's own JS is waiting on.
 */
export async function handleCreateCeremony(req: CreateCeremonyRequest): Promise<CreateCeremonyResult> {
  if (!isValidRpIdForOrigin(req.rpId, req.origin)) {
    throw new Error(`rpId "${req.rpId}" is not valid for origin "${req.origin}"`);
  }
  const material = await getVaultKeyMaterial();
  if (!material) throw new Error("Vault is locked");
  const vaultKeyRaw = vaultKeyFromBase64(material.vaultKeyRawB64);

  const keyPair = await generateEcdsaKeyPair();
  const credentialId = randomBytes(32);

  const clientDataJSON = buildClientDataJson("webauthn.create", req.challengeB64, req.origin);
  const attestationObject = await buildAttestationObject({
    rpId: req.rpId,
    credentialId,
    publicKeyRaw: keyPair.publicKeyRaw,
  });

  const fields: PasskeyItemFields = {
    rpId: req.rpId,
    rpName: req.rpName,
    userHandle: req.userIdB64,
    userName: req.userName,
    userDisplayName: req.userDisplayName,
    credentialId: bytesToBase64(credentialId),
    publicKeyRaw: bytesToBase64(keyPair.publicKeyRaw),
    privateKeyPkcs8: bytesToBase64(keyPair.privateKeyPkcs8),
    signCount: 0,
  };
  const envelope = await encryptItemFields(vaultKeyRaw, fields);
  const saved = await withFreshAccessToken((token) => createVaultItem(token, { type: "passkey", ...envelope }));
  await upsertItem(saved);

  return {
    credentialIdB64: fields.credentialId,
    attestationObjectB64: bytesToBase64(attestationObject),
    clientDataJSONB64: bytesToBase64(clientDataJSON),
  };
}

export interface GetCeremonyRequest {
  origin: string;
  rpId: string;
  challengeB64: string;
  /** Credential IDs (base64) the relying party will accept; empty for a "discoverable credential" (usernameless) flow. */
  allowCredentialIdsB64: string[];
}

export interface GetCeremonyResult {
  credentialIdB64: string;
  authenticatorDataB64: string;
  clientDataJSONB64: string;
  signatureB64: string;
  userHandleB64: string;
}

/**
 * Handles a `navigator.credentials.get()` ceremony. Signs the RP's challenge
 * with the matching stored passkey's private key, which is decrypted only
 * in-memory here and never returned to the page — only the resulting
 * signature is.
 */
export async function handleGetCeremony(req: GetCeremonyRequest): Promise<GetCeremonyResult> {
  if (!isValidRpIdForOrigin(req.rpId, req.origin)) {
    throw new Error(`rpId "${req.rpId}" is not valid for origin "${req.origin}"`);
  }
  const material = await getVaultKeyMaterial();
  if (!material) throw new Error("Vault is locked");
  const vaultKeyRaw = vaultKeyFromBase64(material.vaultKeyRawB64);

  const candidates = await findPasskeyItemsForRp(req.rpId, vaultKeyRaw);
  const allowed =
    req.allowCredentialIdsB64.length > 0
      ? candidates.filter((c) => req.allowCredentialIdsB64.includes(c.fields.credentialId))
      : candidates;

  if (allowed.length === 0) {
    throw new Error("No matching passkey found for this site");
  }
  if (allowed.length > 1) {
    // A real picker UI (like the autofill dropdown) is a natural follow-up;
    // for now we deterministically pick the most recently created one.
    allowed.sort((a, b) => b.item.updatedAt.localeCompare(a.item.updatedAt));
  }
  const { item, fields } = allowed[0];

  const privateKey = await importEcdsaPrivateKey(base64ToBytes(fields.privateKeyPkcs8));
  const nextSignCount = fields.signCount + 1;
  const authenticatorData = await buildAssertionAuthenticatorData(req.rpId, nextSignCount);
  const clientDataJSON = buildClientDataJson("webauthn.get", req.challengeB64, req.origin);
  const clientDataHash = new Uint8Array(await crypto.subtle.digest("SHA-256", clientDataJSON.buffer as ArrayBuffer));

  const rawSignature = await signEcdsaRaw(privateKey, concatBytes(authenticatorData, clientDataHash));
  const signature = rawP256SignatureToDer(rawSignature);

  void bumpSignCount(item, fields, vaultKeyRaw, nextSignCount);

  return {
    credentialIdB64: fields.credentialId,
    authenticatorDataB64: bytesToBase64(authenticatorData),
    clientDataJSONB64: bytesToBase64(clientDataJSON),
    signatureB64: bytesToBase64(signature),
    userHandleB64: fields.userHandle,
  };
}

/**
 * Advisory only (see docs/crypto-architecture.md's non-goals): persists the
 * incremented sign count in the background, without blocking the assertion
 * response the page is waiting on. A conflict (409, another device updated
 * it first) is expected and harmless — sign count drift across synced
 * devices is an accepted tradeoff of a software authenticator.
 */
async function bumpSignCount(
  item: VaultItemDto,
  fields: PasskeyItemFields,
  vaultKeyRaw: Uint8Array,
  nextSignCount: number,
): Promise<void> {
  try {
    const envelope = await encryptItemFields(vaultKeyRaw, { ...fields, signCount: nextSignCount });
    const updated = await withFreshAccessToken((token) =>
      updateVaultItem(token, item.id, { ...envelope, expectedRev: item.rev }),
    );
    await upsertItem(updated);
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }
}
