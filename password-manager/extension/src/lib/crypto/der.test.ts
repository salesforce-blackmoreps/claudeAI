import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign as nodeSign, verify as nodeVerify } from "node:crypto";
import { rawP256SignatureToDer } from "./der";

describe("rawP256SignatureToDer", () => {
  it("produces a DER signature that an independent verifier accepts", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const message = Buffer.from("webauthn assertion data");

    // Sign once in IEEE P1363 (raw r||s) form — this is the format
    // WebCrypto's ECDSA sign() returns in the real extension code path.
    const rawSignature = nodeSign("sha256", message, { key: privateKey, dsaEncoding: "ieee-p1363" });
    expect(rawSignature.length).toBe(64);

    const derSignature = rawP256SignatureToDer(new Uint8Array(rawSignature));

    // A real DER-format verifier (Node's default) must accept it.
    const isValid = nodeVerify("sha256", message, { key: publicKey, dsaEncoding: "der" }, Buffer.from(derSignature));
    expect(isValid).toBe(true);
  });

  it("rejects a signature over the wrong message", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const rawSignature = nodeSign("sha256", Buffer.from("original"), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    });
    const derSignature = rawP256SignatureToDer(new Uint8Array(rawSignature));

    const isValid = nodeVerify(
      "sha256",
      Buffer.from("tampered"),
      { key: publicKey, dsaEncoding: "der" },
      Buffer.from(derSignature),
    );
    expect(isValid).toBe(false);
  });

  it("handles signatures whose r or s has a high bit requiring a padding byte", () => {
    // Run several signatures to exercise the DER sign-byte-padding branch,
    // which only triggers when r or s's top byte has its high bit set.
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    for (let i = 0; i < 20; i++) {
      const message = Buffer.from(`message ${i}`);
      const rawSignature = nodeSign("sha256", message, { key: privateKey, dsaEncoding: "ieee-p1363" });
      const derSignature = rawP256SignatureToDer(new Uint8Array(rawSignature));
      expect(nodeVerify("sha256", message, { key: publicKey, dsaEncoding: "der" }, Buffer.from(derSignature))).toBe(
        true,
      );
    }
  });
});
