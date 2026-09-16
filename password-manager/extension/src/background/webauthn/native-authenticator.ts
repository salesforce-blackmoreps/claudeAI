import { cborMapHeader, cborSmallInt, cborTextString, cborByteString } from "../../lib/crypto/cbor";
import { concatBytes } from "../../lib/crypto/encoding";
import { buildAuthenticatorData, type AttestedCredentialData } from "../../lib/webauthn/authenticator-data";

// COSE key type / algorithm / curve identifiers (RFC 9053 / RFC 8152).
const COSE_KTY_EC2 = 2;
const COSE_ALG_ES256 = -7;
const COSE_CRV_P256 = 1;

/** A fixed AAGUID identifying "this extension" as an authenticator model — not per-credential, not a secret. */
export const PROVIDER_AAGUID = new Uint8Array([
  0x70, 0x77, 0x2d, 0x6d, 0x67, 0x72, 0x2d, 0x70, 0x61, 0x73, 0x73, 0x6b, 0x65, 0x79, 0x30, 0x31,
]);

/** Builds a CBOR-encoded COSE_Key (EC2/ES256/P-256) from an uncompressed SEC1 public key point. */
export function buildCoseP256PublicKey(publicKeyRaw: Uint8Array): Uint8Array {
  if (publicKeyRaw.length !== 65 || publicKeyRaw[0] !== 0x04) {
    throw new Error("buildCoseP256PublicKey: expected an uncompressed SEC1 point (0x04 || x || y)");
  }
  const x = publicKeyRaw.slice(1, 33);
  const y = publicKeyRaw.slice(33, 65);

  return concatBytes(
    cborMapHeader(5),
    cborSmallInt(1),
    cborSmallInt(COSE_KTY_EC2),
    cborSmallInt(3),
    cborSmallInt(COSE_ALG_ES256),
    cborSmallInt(-1),
    cborSmallInt(COSE_CRV_P256),
    cborSmallInt(-2),
    cborByteString(x),
    cborSmallInt(-3),
    cborByteString(y),
  );
}

/**
 * Builds the full attestationObject returned from a `create()` ceremony,
 * using "none" attestation (self-attestation, no hardware-backed attestation
 * chain) — the same tradeoff Bitwarden's software authenticator makes; see
 * docs/crypto-architecture.md's non-goals section.
 */
export async function buildAttestationObject(options: {
  rpId: string;
  credentialId: Uint8Array;
  publicKeyRaw: Uint8Array;
}): Promise<Uint8Array> {
  const attestedCredentialData: AttestedCredentialData = {
    aaguid: PROVIDER_AAGUID,
    credentialId: options.credentialId,
    credentialPublicKeyCose: buildCoseP256PublicKey(options.publicKeyRaw),
  };
  const authData = await buildAuthenticatorData({
    rpId: options.rpId,
    signCount: 0,
    attestedCredentialData,
  });

  return concatBytes(
    cborMapHeader(3),
    cborTextString("fmt"),
    cborTextString("none"),
    cborTextString("attStmt"),
    cborMapHeader(0),
    cborTextString("authData"),
    cborByteString(authData),
  );
}

/** Builds the authenticatorData for a `get()` assertion (no attested credential data). */
export async function buildAssertionAuthenticatorData(rpId: string, signCount: number): Promise<Uint8Array> {
  return buildAuthenticatorData({ rpId, signCount });
}
