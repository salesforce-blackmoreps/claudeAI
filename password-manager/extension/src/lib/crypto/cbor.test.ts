import { describe, expect, it } from "vitest";
import { decodeFirstSync } from "cbor";
import { cborSmallInt, cborTextString, cborByteString, cborMapHeader } from "./cbor";
import { concatBytes } from "./encoding";

// Cross-checked against the `cbor` package (a trusted, independent CBOR
// implementation) rather than only hand-verified byte literals — this is the
// strongest check available for a hand-rolled encoder without a live
// WebAuthn relying party to test against.
describe("cbor primitives", () => {
  it("encodes small non-negative and negative integers matching known byte vectors", () => {
    expect(cborSmallInt(2)).toEqual(Uint8Array.of(0x02));
    expect(cborSmallInt(-7)).toEqual(Uint8Array.of(0x26));
    expect(decodeFirstSync(Buffer.from(cborSmallInt(2)))).toBe(2);
    expect(decodeFirstSync(Buffer.from(cborSmallInt(-7)))).toBe(-7);
  });

  it("encodes text strings decodable by an independent CBOR implementation", () => {
    const encoded = cborTextString("fmt");
    expect(decodeFirstSync(Buffer.from(encoded))).toBe("fmt");
  });

  it("encodes byte strings of varying lengths correctly", () => {
    const short = new Uint8Array([1, 2, 3]);
    const long = new Uint8Array(200).fill(7);
    expect(decodeFirstSync(Buffer.from(cborByteString(short)))).toEqual(Buffer.from(short));
    expect(decodeFirstSync(Buffer.from(cborByteString(long)))).toEqual(Buffer.from(long));
  });

  it("encodes a definite map with mixed key/value primitives, matching a COSE-EC2-key-shaped structure", () => {
    const x = new Uint8Array(32).fill(1);
    const y = new Uint8Array(32).fill(2);
    const coseKey = concatBytes(
      cborMapHeader(5),
      cborSmallInt(1),
      cborSmallInt(2), // kty: EC2
      cborSmallInt(3),
      cborSmallInt(-7), // alg: ES256
      cborSmallInt(-1),
      cborSmallInt(1), // crv: P-256
      cborSmallInt(-2),
      cborByteString(x),
      cborSmallInt(-3),
      cborByteString(y),
    );

    const decoded = decodeFirstSync(Buffer.from(coseKey)) as Map<number, unknown>;
    expect(decoded.get(1)).toBe(2);
    expect(decoded.get(3)).toBe(-7);
    expect(decoded.get(-1)).toBe(1);
    expect(decoded.get(-2)).toEqual(Buffer.from(x));
    expect(decoded.get(-3)).toEqual(Buffer.from(y));
  });
});
