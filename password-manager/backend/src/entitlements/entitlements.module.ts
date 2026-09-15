import { Module } from "@nestjs/common";
import { TokenModule } from "../auth/token.module";
import { ItemCreationEntitlementGuard } from "../common/guards/entitlement.guard";
import { EntitlementsController } from "./entitlements.controller";
import { EntitlementsService } from "./entitlements.service";

@Module({
  imports: [TokenModule],
  controllers: [EntitlementsController],
  providers: [EntitlementsService, ItemCreationEntitlementGuard],
  exports: [EntitlementsService, ItemCreationEntitlementGuard],
})
export class EntitlementsModule {}
