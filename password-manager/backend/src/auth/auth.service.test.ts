import { UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service";

function makeDeps(user: Record<string, unknown> | null) {
  const redisStore = new Map<string, string>();
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
  } as any;
  const redis = {
    get: jest.fn().mockImplementation((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
    set: jest.fn().mockImplementation((key: string, value: string) => {
      redisStore.set(key, value);
      return Promise.resolve("OK");
    }),
    del: jest.fn().mockImplementation((key: string) => {
      redisStore.delete(key);
      return Promise.resolve(1);
    }),
  } as any;
  const devices = { register: jest.fn().mockResolvedValue({ id: "device-1" }) } as any;
  const tokens = {
    issueTokens: jest.fn().mockResolvedValue({ accessToken: "at", refreshToken: "rt", refreshTokenFamilyId: "fam-1" }),
  } as any;
  const mfa = {} as any;
  const auditLog = { record: jest.fn().mockResolvedValue(undefined) } as any;
  return { prisma, redis, devices, tokens, mfa, auditLog };
}

const BASE_USER = {
  id: "user-1",
  email: "alice@example.com",
  masterPasswordHash: "",
  mfaEnabled: false,
  kdfType: "argon2id",
  kdfParams: { type: "argon2id", memoryKib: 1024, iterations: 1, parallelism: 1 },
  kdfSalt: "salt",
  encryptedVaultKey: "evk",
  encryptedPrivateKey: "epk",
  publicKey: "pub",
};

describe("AuthService login lockout", () => {
  beforeAll(() => {
    process.env.SERVER_SECRET_KEY = "dGVzdC1wZXBwZXItMzItYnl0ZXMtbG9uZy1rZXkh";
  });

  it("locks the account out after 10 failed attempts, before even checking the password", async () => {
    const correctHash = await argon2.hash("actual-correct-hash");
    const deps = makeDeps({ ...BASE_USER, masterPasswordHash: correctHash });
    const service = new AuthService(deps.prisma, deps.redis, deps.devices, deps.tokens, deps.mfa, deps.auditLog);

    for (let i = 0; i < 10; i++) {
      await expect(
        service.login({ email: "alice@example.com", masterPasswordHash: "wrong", deviceName: "d", devicePlatform: "p" }),
      ).rejects.toThrow(UnauthorizedException);
    }

    // The 11th attempt is rejected as locked out even with the *correct*
    // password — if the lockout check didn't short-circuit before
    // verification, this would instead succeed and return a session.
    await expect(
      service.login({ email: "alice@example.com", masterPasswordHash: "actual-correct-hash", deviceName: "d", devicePlatform: "p" }),
    ).rejects.toThrow("Too many failed attempts");
  });

  it("resets the failure counter on a successful login", async () => {
    const correctHash = await argon2.hash("correct-hash");
    const deps = makeDeps({ ...BASE_USER, masterPasswordHash: correctHash });
    const service = new AuthService(deps.prisma, deps.redis, deps.devices, deps.tokens, deps.mfa, deps.auditLog);

    await expect(
      service.login({ email: "alice@example.com", masterPasswordHash: "wrong", deviceName: "d", devicePlatform: "p" }),
    ).rejects.toThrow(UnauthorizedException);

    await service.login({ email: "alice@example.com", masterPasswordHash: "correct-hash", deviceName: "d", devicePlatform: "p" });

    // Counter reset means several more wrong attempts are each treated as
    // fresh failures, not immediately hitting the lockout threshold.
    await expect(
      service.login({ email: "alice@example.com", masterPasswordHash: "wrong", deviceName: "d", devicePlatform: "p" }),
    ).rejects.toThrow("Invalid email or master password");
  });
});
