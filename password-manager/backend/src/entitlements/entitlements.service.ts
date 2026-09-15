import { Injectable } from "@nestjs/common";
import { PLAN_LIMITS, PlanLimits, type EntitlementsDto } from "@password-manager/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The single authoritative source of a user's current usage vs. their plan
 * limits. Used by EntitlementGuard (server-side enforcement) and exposed via
 * GET /billing/entitlements for client-side UX gating — see invariant #6:
 * client gating is UX only, this service is the real control.
 *
 * Phase 2/5 scope: personal item ownership and direct item sharing are
 * always resolved against the free tier (no per-user subscription concept
 * exists — sharing a credential with a few people doesn't require a paid
 * team). Team membership caps resolve the *team's* subscription tier once
 * one exists (Phase 6 wires up Stripe to actually change it from free).
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

  /** Direct item sharing is always evaluated against the free tier's share cap for now — see class doc. */
  async assertCanShareItem(vaultItemId: string): Promise<void> {
    const limits = PLAN_LIMITS.free;
    const currentShareCount = await this.prisma.share.count({
      where: { vaultItemId, revokedAt: null },
    });
    if (currentShareCount >= limits.maxShareMembers) {
      throw new ShareLimitExceededError(limits.maxShareMembers);
    }
  }

  async getPlanLimitsForTeam(teamId: string): Promise<PlanLimits> {
    const subscription = await this.prisma.subscription.findUnique({ where: { teamId } });
    return PLAN_LIMITS[subscription?.tier ?? "free"];
  }

  async assertCanInviteTeamMember(teamId: string): Promise<void> {
    const limits = await this.getPlanLimitsForTeam(teamId);
    const currentMemberCount = await this.prisma.teamMember.count({
      where: { teamId, status: { in: ["pending", "active"] } },
    });
    if (currentMemberCount >= limits.maxTeamMembers) {
      throw new TeamMemberLimitExceededError(limits.maxTeamMembers);
    }
  }
}

export class ItemLimitExceededError extends Error {
  constructor(public readonly limit: number) {
    super(`Item limit of ${limit} reached for your current plan`);
  }
}

export class ShareLimitExceededError extends Error {
  constructor(public readonly limit: number) {
    super(`Share limit of ${limit} recipients reached for your current plan`);
  }
}

export class TeamMemberLimitExceededError extends Error {
  constructor(public readonly limit: number) {
    super(`Team member limit of ${limit} reached for your current plan`);
  }
}
