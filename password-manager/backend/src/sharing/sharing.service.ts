import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../common/redis/redis.service";
import { VAULT_CHANGED_CHANNEL_PREFIX } from "../vault/vault.service";
import type { CreateShareDto } from "./dto/create-share.dto";
import type { RotateItemKeyDto } from "./dto/rotate-item-key.dto";

@Injectable()
export class SharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async listShares(userId: string, itemId: string) {
    await this.assertIsOwner(userId, itemId);
    return this.prisma.share.findMany({
      where: { vaultItemId: itemId, revokedAt: null },
      include: { recipient: { select: { id: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async createShare(userId: string, itemId: string, dto: CreateShareDto) {
    await this.assertIsOwner(userId, itemId);

    const existing = await this.prisma.share.findUnique({
      where: { vaultItemId_recipientUserId: { vaultItemId: itemId, recipientUserId: dto.recipientUserId } },
    });
    if (existing && !existing.revokedAt) {
      throw new ConflictException("This item is already shared with that person.");
    }

    const share = existing
      ? await this.prisma.share.update({
          where: { id: existing.id },
          data: {
            encryptedItemKeyForRecipient: dto.encryptedItemKeyForRecipient,
            role: dto.role,
            grantedByUserId: userId,
            revokedAt: null,
          },
        })
      : await this.prisma.share.create({
          data: {
            vaultItemId: itemId,
            recipientUserId: dto.recipientUserId,
            encryptedItemKeyForRecipient: dto.encryptedItemKeyForRecipient,
            role: dto.role,
            grantedByUserId: userId,
          },
        });

    await this.notifyChanged(dto.recipientUserId);
    return share;
  }

  /**
   * Revokes a viewer share. This is the documented exception (invariant #5):
   * a viewer who already decrypted the item locally keeps that snapshot —
   * no key rotation happens for view-only revocation. Revoking an editor
   * share must go through rotateItemKey instead, which this method refuses.
   */
  async revokeViewerShare(userId: string, itemId: string, shareId: string): Promise<void> {
    await this.assertIsOwner(userId, itemId);
    const share = await this.prisma.share.findUnique({ where: { id: shareId } });
    if (!share || share.vaultItemId !== itemId || share.revokedAt) {
      throw new NotFoundException("Share not found");
    }
    if (share.role === "editor") {
      throw new ForbiddenException("Editor shares must be revoked via key rotation, not a plain revoke.");
    }
    await this.prisma.share.update({ where: { id: shareId }, data: { revokedAt: new Date() } });
    await this.notifyChanged(share.recipientUserId);
  }

  /**
   * Atomically re-encrypts the item under a fresh Item Key, revokes one
   * share, and re-wraps the new key for every remaining active recipient —
   * all client-computed (the server never sees plaintext or unwrapped keys),
   * submitted here as one transaction so there is no window where the old
   * and new keys are both partially valid.
   */
  async rotateItemKey(userId: string, itemId: string, dto: RotateItemKeyDto) {
    await this.assertIsOwner(userId, itemId);

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.vaultItem.findUniqueOrThrow({ where: { id: itemId } });
      if (item.rev !== dto.expectedRev) {
        throw new ConflictException("Item was modified elsewhere; refresh and try again.");
      }

      const revoked = await tx.share.findUnique({ where: { id: dto.revokeShareId } });
      if (!revoked || revoked.vaultItemId !== itemId) {
        throw new NotFoundException("Share to revoke not found");
      }

      const remainingShareIds = new Set(dto.remainingShares.map((s) => s.shareId));
      const activeShares = await tx.share.findMany({ where: { vaultItemId: itemId, revokedAt: null } });
      const expectedRemaining = new Set(activeShares.filter((s) => s.id !== dto.revokeShareId).map((s) => s.id));
      if (remainingShareIds.size !== expectedRemaining.size || [...expectedRemaining].some((id) => !remainingShareIds.has(id))) {
        throw new ConflictException("Remaining share set is out of date; refresh and try again.");
      }

      const updatedItem = await tx.vaultItem.update({
        where: { id: itemId },
        data: { encryptedData: dto.encryptedData, encryptedItemKey: dto.encryptedItemKey, rev: { increment: 1 } },
      });

      await tx.share.update({ where: { id: dto.revokeShareId }, data: { revokedAt: new Date() } });

      for (const remaining of dto.remainingShares) {
        await tx.share.update({
          where: { id: remaining.shareId },
          data: { encryptedItemKeyForRecipient: remaining.encryptedItemKeyForRecipient },
        });
      }

      await this.notifyChanged(revoked.recipientUserId);
      for (const share of activeShares) {
        if (share.id !== dto.revokeShareId) await this.notifyChanged(share.recipientUserId);
      }

      return updatedItem;
    });
  }

  /** Items shared with the current user (as opposed to items they own). */
  async listSharedWithMe(userId: string) {
    return this.prisma.share.findMany({
      where: { recipientUserId: userId, revokedAt: null },
      include: { vaultItem: true },
      orderBy: { createdAt: "desc" },
    });
  }

  private async assertIsOwner(userId: string, itemId: string): Promise<void> {
    const item = await this.prisma.vaultItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException("Item not found");
    if (item.ownerUserId !== userId) {
      throw new ForbiddenException("Only the item's owner can manage sharing");
    }
  }

  private async notifyChanged(userId: string): Promise<void> {
    await this.redis.publish(`${VAULT_CHANGED_CHANNEL_PREFIX}${userId}`, "changed");
  }
}
