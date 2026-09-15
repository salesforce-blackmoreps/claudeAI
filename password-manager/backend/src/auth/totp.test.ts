import { generateBase32Secret, generateTotp, verifyTotp } from "./totp";

describe("totp", () => {
  it("verifies a code generated for the same secret and time", () => {
    const secret = generateBase32Secret();
    const now = Math.floor(Date.now() / 1000);
    const code = generateTotp(secret, { timeSeconds: now });
    expect(verifyTotp(code, secret, { timeSeconds: now })).toBe(true);
  });

  it("tolerates one period of clock drift", () => {
    const secret = generateBase32Secret();
    const now = Math.floor(Date.now() / 1000);
    const code = generateTotp(secret, { timeSeconds: now });
    expect(verifyTotp(code, secret, { timeSeconds: now + 30 })).toBe(true);
    expect(verifyTotp(code, secret, { timeSeconds: now - 30 })).toBe(true);
  });

  it("rejects a code once outside the drift window", () => {
    const secret = generateBase32Secret();
    const now = Math.floor(Date.now() / 1000);
    const code = generateTotp(secret, { timeSeconds: now });
    expect(verifyTotp(code, secret, { timeSeconds: now + 90 })).toBe(false);
  });

  it("rejects a code generated from a different secret", () => {
    const secretA = generateBase32Secret();
    const secretB = generateBase32Secret();
    const now = Math.floor(Date.now() / 1000);
    const code = generateTotp(secretA, { timeSeconds: now });
    expect(verifyTotp(code, secretB, { timeSeconds: now })).toBe(false);
  });
});
