import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { EntitlementsService } from "./entitlements.service";

@Controller("billing")
@UseGuards(JwtAuthGuard)
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementsService) {}

  @Get("entitlements")
  get(@Req() req: AuthenticatedRequest) {
    return this.entitlements.getEntitlementsForUser(req.userId);
  }
}
