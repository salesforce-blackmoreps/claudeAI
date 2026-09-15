import { concatBytes } from "./encoding";

/**
 * WebCrypto's ECDSA `sign()` returns the IEEE P1363 fixed-width format
 * (r || s, 32 bytes each for P-256). WebAuthn requires the ASN.1 DER
 * SEQUENCE{ INTEGER r, INTEGER s } encoding instead — this converts between
 * them. Only encoding is needed: this authenticator only ever produces
 * signatures, never verifies third-party ones.
 */
export function rawP256SignatureToDer(raw: Uint8Array): Uint8Array {
  if (raw.length !== 64) {
    throw new Error("rawP256SignatureToDer: expected a 64-byte raw P-256 signature (r||s)");
  }
  const r = derInteger(raw.slice(0, 32));
  const s = derInteger(raw.slice(32, 64));
  const body = concatBytes(r, s);
  // Short-form DER length always suffices here: r/s are each at most 33
  // bytes post-padding + 2-byte tag/length, so the SEQUENCE body is at most
  // ~70 bytes — nowhere near the 128-byte threshold for long-form length.
  if (body.length >= 128) {
    throw new Error("rawP256SignatureToDer: unexpectedly large signature body");
  }
  return concatBytes(Uint8Array.of(0x30, body.length), body);
}

function derInteger(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  let trimmed = bytes.slice(i);
  // DER INTEGER is signed two's complement; if the high bit is set, the
  // value would be misread as negative, so prepend a 0x00 sign byte.
  if (trimmed[0] & 0x80) {
    trimmed = concatBytes(Uint8Array.of(0), trimmed);
  }
  return concatBytes(Uint8Array.of(0x02, trimmed.length), trimmed);
}
