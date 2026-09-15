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
  deviceName: string;
  devicePlatform: string;
}

export interface LoginRequestDto {
  email: string;
  masterPasswordHash: string;
  deviceName: string;
  devicePlatform: string;
}

/** Returned by signup/login/mfa-verify once a session is actually established. */
export interface AuthSessionDto {
  accessToken: string;
  refreshToken: string;
  refreshTokenFamilyId: string;
  deviceId: string;
  encryptedVaultKey: string;
  encryptedPrivateKey: string;
  publicKey: string;
  kdfType: "argon2id";
  kdfParams: KdfParams;
  kdfSalt: string;
}

/** Returned by POST /auth/login when the account has MFA enabled. */
export interface MfaRequiredResponseDto {
  mfaRequired: true;
  loginTicket: string;
}

export type LoginResponseDto = AuthSessionDto | MfaRequiredResponseDto;

export interface MfaVerifyRequestDto {
  loginTicket: string;
  code: string;
  deviceName: string;
  devicePlatform: string;
}

export interface RefreshRequestDto {
  refreshToken: string;
  refreshTokenFamilyId: string;
}

export interface RefreshResponseDto {
  accessToken: string;
  refreshToken: string;
  refreshTokenFamilyId: string;
}

export interface KdfLookupResponseDto {
  kdfType: "argon2id";
  kdfParams: KdfParams;
  kdfSalt: string;
}

export interface MfaEnrollResponseDto {
  secret: string;
  otpAuthUri: string;
}
