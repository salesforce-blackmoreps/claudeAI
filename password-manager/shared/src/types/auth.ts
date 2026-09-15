export interface KdfParams {
  type: "argon2id";
  memoryKib: number;
  iterations: number;
  parallelism: number;
}

/**
 * Body of POST /auth/signup. masterPasswordHash is the client-derived auth value
 * (see docs/crypto-architecture.md) — never the master password itself.
 */
export interface SignupRequestDto {
  email: string;
  masterPasswordHash: string;
  kdfType: "argon2id";
  kdfParams: KdfParams;
  kdfSalt: string;
  encryptedVaultKey: string;
  publicKey: string;
  encryptedPrivateKey: string;
}

export interface LoginRequestDto {
  email: string;
  masterPasswordHash: string;
}

export interface LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  encryptedVaultKey: string;
  encryptedPrivateKey: string;
  kdfType: "argon2id";
  kdfParams: KdfParams;
  kdfSalt: string;
  mfaRequired: boolean;
}

export interface KdfLookupResponseDto {
  kdfType: "argon2id";
  kdfParams: KdfParams;
  kdfSalt: string;
}
