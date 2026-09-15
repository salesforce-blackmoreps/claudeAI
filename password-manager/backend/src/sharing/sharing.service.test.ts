import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { SharingService } from "./sharing.service";

function makeDeps(item: Record<string, unknown> | null) {
  const prisma = {
    vaultItem: {
      findUnique: jest.fn().mockResolvedValue(item),
      findUniqueOrThrow: jest.fn().mockResolvedValue(item),
      update: jest.fn(),
    },
    share: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma)),
  } as any;
  const redis = { publish: jest.fn().mockResolvedValue(1) } as any;
  return { prisma, redis };
}

const OWNED_ITEM = { id: "item-1", ownerUserId: "owner-1", rev: 2 };

describe("SharingService authorization", () => {
  it("refuses to create a share when the requester does not own the item", async () => {
    const { prisma, redis } = makeDeps(OWNED_ITEM);
    const service = new SharingService(prisma, redis);

    await expect(
      service.createShare("someone-else", "item-1", {
        recipientUserId: "recipient-1",
        encryptedItemKeyForRecipient: "enc",
        role: "viewer",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("refuses to revoke an editor share via the plain (non-rotating) revoke path", async () => {
    const { prisma, redis } = makeDeps(OWNED_ITEM);
    prisma.share.findUnique.mockResolvedValue({ id: "share-1", vaultItemId: "item-1", role: "editor", revokedAt: null });
    const service = new SharingService(prisma, redis);

    await expect(service.revokeViewerShare("owner-1", "item-1", "share-1")).rejects.toThrow(ForbiddenException);
  });

  it("refuses to revoke a share that doesn't belong to the given item", async () => {
    const { prisma, redis } = makeDeps(OWNED_ITEM);
    prisma.share.findUnique.mockResolvedValue({ id: "share-1", vaultItemId: "other-item", role: "viewer", revokedAt: null });
    const service = new SharingService(prisma, redis);

    await expect(service.revokeViewerShare("owner-1", "item-1", "share-1")).rejects.toThrow(NotFoundException);
  });

  it("rejects a key rotation whose expectedRev is stale", async () => {
    const { prisma, redis } = makeDeps(OWNED_ITEM);
    const service = new SharingService(prisma, redis);

    await expect(
      service.rotateItemKey("owner-1", "item-1", {
        encryptedData: "new",
        encryptedItemKey: "new-key",
        expectedRev: 1, // stale — current rev is 2
        revokeShareId: "share-1",
        remainingShares: [],
      }),
    ).rejects.toThrow(ConflictException);
  });
});
