import { Module } from "@nestjs/common";
import { TokenModule } from "../auth/token.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { TeamsController } from "./teams.controller";
import { TeamsService } from "./teams.service";

@Module({
  imports: [TokenModule, EntitlementsModule],
  controllers: [TeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
