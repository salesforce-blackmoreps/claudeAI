import { Injectable } from "@nestjs/common";
import { PLAN_LIMITS, type EntitlementsDto } from "@password-manager/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The single authoritative source of a user's current usage vs. their plan
 * limits. Used by EntitlementGuard (server-side enforcement) and exposed via
 * GET /billing/entitlements for client-side UX gating — see invariant #6:
 * client gating is UX only, this service is the real control.
 *
 * Phase 2 scope: every user is on the free tier (no teams/subscriptions
 * exist yet). Phase 5/6 extend this to resolve a real team subscription tier
 * once the user owns or belongs to a team.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEntitlementsForUser(userId: string): Promise<EntitlementsDto> {
    const limits = PLAN_LIMITS.free;

    const currentItemCount = await this.prisma.vaultItem.count({
      where: { ownerUserId: userId, deletedAt: null },
    });

    return {
      tier: limits.tier,
      status: "active",
      maxItemsPerUser: limits.maxItemsPerUser,
      maxShareMembers: limits.maxShareMembers,
      maxTeamMembers: limits.maxTeamMembers,
      currentItemCount,
      currentTeamMemberCount: 0,
    };
  }

  async assertCanCreateItem(userId: string): Promise<void> {
    const entitlements = await this.getEntitlementsForUser(userId);
    if (entitlements.currentItemCount >= entitlements.maxItemsPerUser) {
      throw new ItemLimitExceededError(entitlements.maxItemsPerUser);
    }
  }
}

export class ItemLimitExceededError extends Error {
  constructor(public readonly limit: number) {
    super(`Item limit of ${limit} reached for your current plan`);
  }
}
