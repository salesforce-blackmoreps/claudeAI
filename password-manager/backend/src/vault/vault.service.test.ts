import { ForbiddenException, ConflictException, NotFoundException } from "@nestjs/common";
import { VaultService } from "./vault.service";

function makeDeps(item: Record<string, unknown> | null) {
  const prisma = {
    vaultItem: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "new-id", rev: 1, updatedAt: new Date(), deletedAt: null, ownerTeamId: null, ...data })),
      findUnique: jest.fn().mockResolvedValue(item),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...item, ...data, rev: data.rev?.increment ? (item as any).rev + data.rev.increment : (item as any)?.rev }),
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    // create() runs inside $transaction(cb) to serialize the entitlement
    // check against the insert (see vault.service.ts) — the mock just runs
    // the callback against this same stub, which also stands in as `tx`.
    $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
  } as any;
  const redis = { publish: jest.fn().mockResolvedValue(1) } as any;
  const entitlements = { assertCanCreateItem: jest.fn().mockResolvedValue(undefined) } as any;
  const auditLog = { record: jest.fn().mockResolvedValue(undefined) } as any;
  return { prisma, redis, entitlements, auditLog };
}

const OWNED_ITEM = {
  id: "item-1",
  ownerUserId: "user-1",
  ownerTeamId: null,
  type: "login",
  encryptedData: "enc",
  encryptedItemKey: "enc-key",
  folderId: null,
  rev: 3,
  deletedAt: null,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("VaultService", () => {
  it("creates an item, checks entitlements, and notifies via redis", async () => {
    const { prisma, redis, entitlements, auditLog } = makeDeps(null);
    const service = new VaultService(prisma, redis, entitlements, auditLog);

    const result = await service.create("user-1", {
      type: "login",
      encryptedData: "enc",
      encryptedItemKey: "enc-key",
    });

    expect(entitlements.assertCanCreateItem).toHaveBeenCalledWith("user-1", prisma);
    expect(prisma.vaultItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ownerUserId: "user-1" }) }),
    );
    expect(redis.publish).toHaveBeenCalledWith("vault-changed:user-1", "changed");
    expect(result.id).toBe("new-id");
  });

  it("denies access to an item owned by a different user", async () => {
    const { prisma, redis, entitlements, auditLog } = makeDeps(OWNED_ITEM);
    const service = new VaultService(prisma, redis, entitlements, auditLog);

    await expect(service.get("someone-else", "item-1")).rejects.toThrow(ForbiddenException);
  });

  it("throws NotFound for a nonexistent item", async () => {
    const { prisma, redis, entitlements, auditLog } = makeDeps(null);
    const service = new VaultService(prisma, redis, entitlements, auditLog);

    await expect(service.get("user-1", "missing")).rejects.toThrow(NotFoundException);
  });

  it("rejects an update whose expectedRev is stale", async () => {
    const { prisma, redis, entitlements, auditLog } = makeDeps(OWNED_ITEM);
    const service = new VaultService(prisma, redis, entitlements, auditLog);

    await expect(
      service.update("user-1", "item-1", {
        encryptedData: "new",
        encryptedItemKey: "new-key",
        expectedRev: 1, // stale — current rev is 3
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("applies an update and bumps rev when expectedRev matches", async () => {
    const { prisma, redis, entitlements, auditLog } = makeDeps(OWNED_ITEM);
    const service = new VaultService(prisma, redis, entitlements, auditLog);

    const result = await service.update("user-1", "item-1", {
      encryptedData: "new",
      encryptedItemKey: "new-key",
      expectedRev: 3,
    });

    expect(result.rev).toBe(4);
    expect(redis.publish).toHaveBeenCalledWith("vault-changed:user-1", "changed");
  });

  it("soft-deletes an owned item", async () => {
    const { prisma, redis, entitlements, auditLog } = makeDeps(OWNED_ITEM);
    const service = new VaultService(prisma, redis, entitlements, auditLog);

    await service.delete("user-1", "item-1");

    expect(prisma.vaultItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item-1" },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });
});
