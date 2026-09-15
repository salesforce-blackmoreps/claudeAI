import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { VaultItem } from "@prisma/client";
import type { VaultItemDto, VaultSyncResponseDto } from "@password-manager/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../common/redis/redis.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { AuditLogService, AUDIT_EVENTS } from "../common/audit-log/audit-log.service";
import type { CreateVaultItemDto } from "./dto/create-vault-item.dto";
import type { UpdateVaultItemDto } from "./dto/update-vault-item.dto";

export const VAULT_CHANGED_CHANNEL_PREFIX = "vault-changed:";
const SYNC_PAGE_SIZE = 500;

@Injectable()
export class VaultService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly entitlements: EntitlementsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(userId: string, dto: CreateVaultItemDto): Promise<VaultItemDto> {
    // Belt-and-suspenders: ItemCreationEntitlementGuard already checked this
    // at the route level, but re-check here too in case this service is ever
    // called from another path (e.g. an import flow in a later phase).
    await this.entitlements.assertCanCreateItem(userId);

    const item = await this.prisma.vaultItem.create({
      data: {
        ownerUserId: userId,
        type: dto.type,
        encryptedData: dto.encryptedData,
        encryptedItemKey: dto.encryptedItemKey,
        folderId: dto.folderId,
      },
    });

    await this.notifyChanged(userId);
    return toDto(item);
  }

  async get(userId: string, itemId: string): Promise<VaultItemDto> {
    const item = await this.findOwned(userId, itemId);
    return toDto(item);
  }

  async update(userId: string, itemId: string, dto: UpdateVaultItemDto): Promise<VaultItemDto> {
    const existing = await this.findOwned(userId, itemId);
    if (existing.rev !== dto.expectedRev) {
      throw new ConflictException("Item was modified elsewhere; refresh and try again.");
    }

    const updated = await this.prisma.vaultItem.update({
      where: { id: itemId },
      data: {
        encryptedData: dto.encryptedData,
        encryptedItemKey: dto.encryptedItemKey,
        folderId: dto.folderId,
        rev: { increment: 1 },
      },
    });

    await this.notifyChanged(userId);
    return toDto(updated);
  }

  async delete(userId: string, itemId: string): Promise<void> {
    await this.findOwned(userId, itemId);
    await this.prisma.vaultItem.update({
      where: { id: itemId },
      data: { deletedAt: new Date(), rev: { increment: 1 } },
    });
    await this.notifyChanged(userId);
    await this.auditLog.record({ actorUserId: userId, eventType: AUDIT_EVENTS.ITEM_DELETED, targetId: itemId });
  }

  /**
   * `since` omitted: returns all live (non-deleted) items — a fresh device's
   * first sync. `since` present: returns everything changed after that
   * cursor, tombstones included, so the client can prune deleted items too.
   *
   * Known tradeoff: items sharing the exact same `updatedAt` millisecond as
   * the cursor can be skipped on the next page. Acceptable at this scale;
   * a compound (timestamp, id) cursor would close this but isn't worth the
   * complexity yet — see docs/crypto-architecture.md's non-goals section for
   * the similar last-writer-wins tradeoff.
   */
  async sync(userId: string, since?: string): Promise<VaultSyncResponseDto> {
    const items = await this.prisma.vaultItem.findMany({
      where: {
        ownerUserId: userId,
        ...(since ? { updatedAt: { gt: new Date(since) } } : { deletedAt: null }),
      },
      orderBy: { updatedAt: "asc" },
      take: SYNC_PAGE_SIZE,
    });

    const cursor = items.length > 0 ? items[items.length - 1].updatedAt.toISOString() : (since ?? new Date(0).toISOString());

    return { items: items.map(toDto), cursor };
  }

  private async findOwned(userId: string, itemId: string): Promise<VaultItem> {
    const item = await this.prisma.vaultItem.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException("Item not found");
    }
    if (item.ownerUserId !== userId) {
      throw new ForbiddenException("You do not have access to this item");
    }
    return item;
  }

  private async notifyChanged(userId: string): Promise<void> {
    await this.redis.publish(`${VAULT_CHANGED_CHANNEL_PREFIX}${userId}`, "changed");
  }
}

function toDto(item: VaultItem): VaultItemDto {
  return {
    id: item.id,
    type: item.type,
    ownerUserId: item.ownerUserId,
    ownerTeamId: item.ownerTeamId,
    folderId: item.folderId,
    encryptedData: item.encryptedData,
    encryptedItemKey: item.encryptedItemKey,
    rev: item.rev,
    updatedAt: item.updatedAt.toISOString(),
    deletedAt: item.deletedAt?.toISOString() ?? null,
  };
}
