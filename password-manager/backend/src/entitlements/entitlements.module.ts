import { Module } from "@nestjs/common";
import { TokenModule } from "../auth/token.module";
import {
  ItemCreationEntitlementGuard,
  ShareCreationEntitlementGuard,
  TeamInviteEntitlementGuard,
} from "../common/guards/entitlement.guard";
import { EntitlementsController } from "./entitlements.controller";
import { EntitlementsService } from "./entitlements.service";

@Module({
  imports: [TokenModule],
  controllers: [EntitlementsController],
  providers: [EntitlementsService, ItemCreationEntitlementGuard, ShareCreationEntitlementGuard, TeamInviteEntitlementGuard],
  exports: [EntitlementsService, ItemCreationEntitlementGuard, ShareCreationEntitlementGuard, TeamInviteEntitlementGuard],
})
export class EntitlementsModule {}
