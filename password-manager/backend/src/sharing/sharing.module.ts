import { Module } from "@nestjs/common";
import { TokenModule } from "../auth/token.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { SharingController } from "./sharing.controller";
import { SharingService } from "./sharing.service";

@Module({
  imports: [TokenModule, EntitlementsModule],
  controllers: [SharingController],
  providers: [SharingService],
})
export class SharingModule {}
