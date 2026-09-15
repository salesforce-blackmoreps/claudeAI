import { Module } from "@nestjs/common";
import { TokenModule } from "./token.module";
import { DevicesModule } from "../devices/devices.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { MfaService } from "./mfa.service";

@Module({
  imports: [TokenModule, DevicesModule],
  controllers: [AuthController],
  providers: [AuthService, MfaService],
  exports: [AuthService],
})
export class AuthModule {}
