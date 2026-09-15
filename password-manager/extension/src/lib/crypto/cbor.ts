import { concatBytes, utf8ToBytes } from "./encoding";

/**
 * A minimal, purpose-built CBOR encoder — not a general-purpose CBOR library.
 * It covers exactly the primitives WebAuthn's attestationObject and COSE_Key
 * structures need: small integers (map keys/values in COSE_Key are always in
 * -7..2 for our ES256/P-256 case), text strings, byte strings, and definite
 * maps with at most a handful of entries. See
 * extension/src/background/webauthn/native-authenticator.ts for how these
 * compose into the actual attestationObject.
 */

const MAJOR_UNSIGNED_INT = 0b000;
const MAJOR_NEGATIVE_INT = 0b001;
const MAJOR_BYTE_STRING = 0b010;
const MAJOR_TEXT_STRING = 0b011;
const MAJOR_MAP = 0b101;

function head(major: number, length: number): Uint8Array {
  if (length < 24) {
    return new Uint8Array([(major << 5) | length]);
  }
  if (length < 256) {
    return new Uint8Array([(major << 5) | 24, length]);
  }
  if (length < 65536) {
    return new Uint8Array([(major << 5) | 25, (length >> 8) & 0xff, length & 0xff]);
  }
  throw new Error("cbor: length exceeds this encoder's supported range (64KiB)");
}

/** Encodes an integer in the range -24..23 (the only range this codebase needs). */
export function cborSmallInt(n: number): Uint8Array {
  if (n >= 0) {
    if (n > 23) throw new Error("cbor: cborSmallInt only supports 0..23 for non-negative values");
    return head(MAJOR_UNSIGNED_INT, n);
  }
  const encoded = -1 - n;
  if (encoded > 23) throw new Error("cbor: cborSmallInt only supports -24..-1 for negative values");
  return head(MAJOR_NEGATIVE_INT, encoded);
}

export function cborTextString(value: string): Uint8Array {
  const bytes = utf8ToBytes(value);
  return concatBytes(head(MAJOR_TEXT_STRING, bytes.length), bytes);
}

export function cborByteString(bytes: Uint8Array): Uint8Array {
  return concatBytes(head(MAJOR_BYTE_STRING, bytes.length), bytes);
}

export function cborMapHeader(entryCount: number): Uint8Array {
  if (entryCount > 23) throw new Error("cbor: cborMapHeader only supports up to 23 entries");
  return head(MAJOR_MAP, entryCount);
}
