import { randomBytes } from "node:crypto";
import { encryptServerSecret, decryptServerSecret } from "./server-secret-box";

describe("server-secret-box", () => {
  beforeAll(() => {
    process.env.SERVER_SECRET_KEY = randomBytes(32).toString("base64");
  });

  it("round-trips a plaintext secret", () => {
    const ciphertext = encryptServerSecret("JBSWY3DPEHPK3PXP");
    expect(ciphertext).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptServerSecret(ciphertext)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("fails to decrypt with a different key", () => {
    const ciphertext = encryptServerSecret("some-secret");
    process.env.SERVER_SECRET_KEY = randomBytes(32).toString("base64");
    expect(() => decryptServerSecret(ciphertext)).toThrow();
  });
});
