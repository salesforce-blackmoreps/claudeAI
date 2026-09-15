import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { EntitlementsService } from "../../entitlements/entitlements.service";
import type { AuthenticatedRequest } from "../../auth/jwt-auth.guard";

/**
 * Authoritative, server-side enforcement of the free-tier item cap (invariant
 * #6) — applied to POST /vault/items. Client-side UI gating in the extension
 * exists only for responsiveness; this guard is the real control and cannot
 * be bypassed by a modified client.
 */
@Injectable()
export class ItemCreationEntitlementGuard implements CanActivate {
  constructor(private readonly entitlements: EntitlementsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    try {
      await this.entitlements.assertCanCreateItem(req.userId);
      return true;
    } catch {
      throw new ForbiddenException("Item limit reached for your current plan. Upgrade to add more.");
    }
  }
}

/** Applied to POST /vault/items/:id/shares — enforces the per-item share-recipient cap. */
@Injectable()
export class ShareCreationEntitlementGuard implements CanActivate {
  constructor(private readonly entitlements: EntitlementsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest & { params: { id: string } }>();
    try {
      await this.entitlements.assertCanShareItem(req.params.id);
      return true;
    } catch {
      throw new ForbiddenException("Share limit reached for this item on your current plan. Upgrade to share with more people.");
    }
  }
}

/** Applied to POST /teams/:teamId/invites — enforces the team's member-count cap. */
@Injectable()
export class TeamInviteEntitlementGuard implements CanActivate {
  constructor(private readonly entitlements: EntitlementsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest & { params: { teamId: string } }>();
    try {
      await this.entitlements.assertCanInviteTeamMember(req.params.teamId);
      return true;
    } catch {
      throw new ForbiddenException("Team member limit reached for your current plan. Upgrade to invite more members.");
    }
  }
}
