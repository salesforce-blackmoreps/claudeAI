import { concatBytes, utf8ToBytes } from "../crypto/encoding";

/** WebAuthn authenticatorData flag bits (see spec §6.1). */
const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED_CREDENTIAL_DATA = 0x40;

export interface AttestedCredentialData {
  /** 16-byte AAGUID identifying this authenticator "model" — a fixed value for our provider, not per-credential. */
  aaguid: Uint8Array;
  credentialId: Uint8Array;
  /** CBOR-encoded COSE_Key bytes (see native-authenticator.ts). */
  credentialPublicKeyCose: Uint8Array;
}

export interface BuildAuthenticatorDataOptions {
  rpId: string;
  signCount: number;
  attestedCredentialData?: AttestedCredentialData;
}

/**
 * Builds the `authData` bytes embedded in both the attestationObject
 * (registration) and the assertion (authentication) — see WebAuthn spec
 * §6.1. We always report the user as present and verified: unlocking the
 * vault with the master password (or biometric-gated OS unlock, on top of
 * that) already establishes that, so there is no separate UI prompt beyond
 * "pick which saved passkey to use" in ceremony-handler.ts.
 */
export async function buildAuthenticatorData(options: BuildAuthenticatorDataOptions): Promise<Uint8Array> {
  const rpIdHash = new Uint8Array(await crypto.subtle.digest("SHA-256", utf8ToBytes(options.rpId)));

  let flags = FLAG_USER_PRESENT | FLAG_USER_VERIFIED;
  const signCountBytes = new Uint8Array(4);
  new DataView(signCountBytes.buffer).setUint32(0, options.signCount, false);

  let attestedBytes = new Uint8Array(0);
  if (options.attestedCredentialData) {
    flags |= FLAG_ATTESTED_CREDENTIAL_DATA;
    const { aaguid, credentialId, credentialPublicKeyCose } = options.attestedCredentialData;
    if (aaguid.length !== 16) throw new Error("buildAuthenticatorData: aaguid must be 16 bytes");
    const credentialIdLength = new Uint8Array(2);
    new DataView(credentialIdLength.buffer).setUint16(0, credentialId.length, false);
    attestedBytes = concatBytes(aaguid, credentialIdLength, credentialId, credentialPublicKeyCose);
  }

  return concatBytes(rpIdHash, Uint8Array.of(flags), signCountBytes, attestedBytes);
}
