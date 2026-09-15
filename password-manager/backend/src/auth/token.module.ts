import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TokenService } from "./token.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

/**
 * Split out from AuthModule so DevicesModule can depend on just the
 * token/guard machinery without creating a module import cycle with
 * AuthModule (which itself depends on DevicesService).
 */
@Module({
  imports: [JwtModule.register({})],
  providers: [TokenService, JwtAuthGuard],
  exports: [TokenService, JwtAuthGuard],
})
export class TokenModule {}
