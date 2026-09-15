import { Module } from "@nestjs/common";
import { TokenModule } from "../auth/token.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { VaultController } from "./vault.controller";
import { VaultService } from "./vault.service";
import { VaultGateway } from "./vault.gateway";

@Module({
  imports: [TokenModule, EntitlementsModule],
  controllers: [VaultController],
  providers: [VaultService, VaultGateway],
})
export class VaultModule {}
