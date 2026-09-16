import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { ShareCreationEntitlementGuard } from "../common/guards/entitlement.guard";
import { SharingService } from "./sharing.service";
import { CreateShareDto } from "./dto/create-share.dto";
import { RotateItemKeyDto } from "./dto/rotate-item-key.dto";

@Controller()
@UseGuards(JwtAuthGuard)
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  @Get("vault/items/:id/shares")
  list(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.sharing.listShares(req.userId, id);
  }

  @Post("vault/items/:id/shares")
  @UseGuards(ShareCreationEntitlementGuard)
  create(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() dto: CreateShareDto) {
    return this.sharing.createShare(req.userId, id, dto);
  }

  @Delete("vault/items/:id/shares/:shareId")
  async revoke(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Param("shareId") shareId: string) {
    await this.sharing.revokeViewerShare(req.userId, id, shareId);
    return { revoked: true };
  }

  @Post("vault/items/:id/rotate-key")
  rotateKey(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() dto: RotateItemKeyDto) {
    return this.sharing.rotateItemKey(req.userId, id, dto);
  }

  @Get("shares/shared-with-me")
  sharedWithMe(@Req() req: AuthenticatedRequest) {
    return this.sharing.listSharedWithMe(req.userId);
  }
}
