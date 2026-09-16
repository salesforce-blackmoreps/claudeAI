import { Controller, Delete, Get, Param, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { DevicesService } from "./devices.service";
import { TokenService } from "../auth/token.service";

@Controller("devices")
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly tokens: TokenService,
  ) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.devices.listForUser(req.userId);
  }

  @Delete(":id")
  async revoke(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const revoked = await this.devices.revoke(req.userId, id);
    if (revoked) {
      await this.tokens.revokeFamily(revoked.refreshTokenFamilyId);
    }
    return { revoked: Boolean(revoked) };
  }
}
