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
