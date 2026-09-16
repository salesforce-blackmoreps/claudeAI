import { describe, expect, it } from "vitest";
import { decodeFirstSync } from "cbor";
import { createHash } from "node:crypto";
import { buildCoseP256PublicKey, buildAttestationObject, PROVIDER_AAGUID } from "./native-authenticator";

function fakeUncompressedPoint(): { point: Uint8Array; x: Uint8Array; y: Uint8Array } {
  const x = new Uint8Array(32).fill(0xaa);
  const y = new Uint8Array(32).fill(0xbb);
  const point = new Uint8Array(65);
  point[0] = 0x04;
  point.set(x, 1);
  point.set(y, 33);
  return { point, x, y };
}

describe("buildCoseP256PublicKey", () => {
  it("encodes a decodable COSE_Key with the expected EC2/ES256/P-256 fields", () => {
    const { point, x, y } = fakeUncompressedPoint();
    const cose = buildCoseP256PublicKey(point);
    const decoded = decodeFirstSync(Buffer.from(cose)) as Map<number, unknown>;

    expect(decoded.get(1)).toBe(2); // kty: EC2
    expect(decoded.get(3)).toBe(-7); // alg: ES256
    expect(decoded.get(-1)).toBe(1); // crv: P-256
    expect(decoded.get(-2)).toEqual(Buffer.from(x));
    expect(decoded.get(-3)).toEqual(Buffer.from(y));
  });

  it("rejects a public key that isn't an uncompressed SEC1 point", () => {
    expect(() => buildCoseP256PublicKey(new Uint8Array(64))).toThrow();
  });
});

describe("buildAttestationObject", () => {
  it("produces an attestationObject whose authData matches the WebAuthn spec layout", async () => {
    const { point, x, y } = fakeUncompressedPoint();
    const credentialId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const rpId = "example.com";

    const attestationObject = await buildAttestationObject({ rpId, credentialId, publicKeyRaw: point });
    // The `cbor` package decodes an all-string-keyed CBOR map to a plain JS
    // object (not a Map) — unlike the integer-keyed COSE_Key maps above.
    const decoded = decodeFirstSync(Buffer.from(attestationObject)) as { fmt: string; attStmt: object; authData: Buffer };

    expect(decoded.fmt).toBe("none");
    expect(decoded.attStmt).toEqual({});

    const authData = decoded.authData;
    const expectedRpIdHash = createHash("sha256").update(rpId).digest();
    expect(authData.subarray(0, 32)).toEqual(expectedRpIdHash);

    const flags = authData[32];
    expect(flags & 0x01).toBe(0x01); // UP
    expect(flags & 0x04).toBe(0x04); // UV
    expect(flags & 0x40).toBe(0x40); // AT (attested credential data present)

    const signCount = authData.readUInt32BE(33);
    expect(signCount).toBe(0);

    const aaguid = authData.subarray(37, 53);
    expect(aaguid).toEqual(Buffer.from(PROVIDER_AAGUID));

    const credentialIdLength = authData.readUInt16BE(53);
    expect(credentialIdLength).toBe(credentialId.length);

    const embeddedCredentialId = authData.subarray(55, 55 + credentialIdLength);
    expect(embeddedCredentialId).toEqual(Buffer.from(credentialId));

    const coseKeyBytes = authData.subarray(55 + credentialIdLength);
    const coseKey = decodeFirstSync(coseKeyBytes) as Map<number, unknown>;
    expect(coseKey.get(-2)).toEqual(Buffer.from(x));
    expect(coseKey.get(-3)).toEqual(Buffer.from(y));
  });

  it("omits attested credential data (AT flag clear) is not produced by this function — always registration-shaped", async () => {
    // buildAttestationObject is only ever used for create(); get() uses
    // buildAssertionAuthenticatorData instead, which has no attested data.
    const { point } = fakeUncompressedPoint();
    const attestationObject = await buildAttestationObject({
      rpId: "example.com",
      credentialId: new Uint8Array([1]),
      publicKeyRaw: point,
    });
    const decoded = decodeFirstSync(Buffer.from(attestationObject)) as { authData: Buffer };
    const authData = decoded.authData;
    expect(authData[32] & 0x40).toBe(0x40);
  });
});
