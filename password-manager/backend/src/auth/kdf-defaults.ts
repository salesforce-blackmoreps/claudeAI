import type { KdfParams } from "@password-manager/shared";

/**
 * Returned by the KDF lookup endpoint for an email that has no account, so the
 * response is indistinguishable in shape from a real account's KDF params —
 * only the (secret) server pepper lets the fake salt be told apart from a real
 * one. Matches the client's DEFAULT_KDF_PARAMS in
 * extension/src/lib/crypto/kdf.ts.
 */
export const DEFAULT_KDF_PARAMS_FOR_ENUMERATION_RESISTANCE: KdfParams = {
  type: "argon2id",
  memoryKib: 65536,
  iterations: 3,
  parallelism: 4,
};
