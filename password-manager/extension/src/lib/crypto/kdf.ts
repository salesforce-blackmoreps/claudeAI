import { argon2id } from "hash-wasm";
import type { KdfParams } from "@password-manager/shared";
import { base64ToBytes } from "./encoding";

/**
 * Default Argon2id parameters for the Master Key derivation, per
 * docs/crypto-architecture.md. Chosen to comfortably exceed OWASP's minimum
 * Argon2id recommendation while staying under ~1s on typical hardware; tune via
 * benchmarking on low-end devices before launch (see Phase 1 risk notes).
 */
export const DEFAULT_KDF_PARAMS: KdfParams = {
  type: "argon2id",
  memoryKib: 65536, // 64 MiB
  iterations: 3,
  parallelism: 4,
};

/**
 * Derives the 256-bit Master Key from the user's master password. The master
 * password itself never leaves this function's stack frame — callers only ever
 * see the derived key material. Uses hash-wasm's Argon2id, which embeds its
 * WASM binary as a base64 string with no bundler-specific configuration
 * needed and no runtime fetch of a separate asset (offline-safe, and
 * satisfies the extension's CSP).
 */
export async function deriveMasterKey(
  masterPassword: string,
  kdfSaltB64: string,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<Uint8Array> {
  const hash = await argon2id({
    password: masterPassword,
    salt: base64ToBytes(kdfSaltB64),
    iterations: params.iterations,
    memorySize: params.memoryKib,
    parallelism: params.parallelism,
    hashLength: 32,
    outputType: "binary",
  });
  return hash;
}
