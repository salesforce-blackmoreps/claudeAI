import { BadRequestException, Body, Controller, Headers, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard, AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { BillingService } from "./billing.service";
import { CreateCheckoutSessionDto, CreatePortalSessionDto } from "./dto/checkout-session.dto";

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post("checkout-session")
  @UseGuards(JwtAuthGuard)
  createCheckoutSession(@Req() req: AuthenticatedRequest, @Body() dto: CreateCheckoutSessionDto) {
    return this.billing.createCheckoutSession(req.userId, dto.teamId, dto.tier);
  }

  @Post("portal-session")
  @UseGuards(JwtAuthGuard)
  createPortalSession(@Req() req: AuthenticatedRequest, @Body() dto: CreatePortalSessionDto) {
    return this.billing.createPortalSession(req.userId, dto.teamId);
  }

  /**
   * No JwtAuthGuard — Stripe calls this directly. Authenticity is instead
   * verified via the Stripe-Signature header against the raw request body
   * (see main.ts's bodyParser: false + express.json({verify}) setup, which
   * preserves req.rawBody specifically so this signature check has the exact
   * bytes Stripe signed, not a re-serialized copy).
   */
  @Post("webhook")
  async webhook(@Req() req: RequestWithRawBody, @Headers("stripe-signature") signature?: string) {
    if (!signature || !req.rawBody) {
      throw new BadRequestException("Missing Stripe signature or raw body");
    }
    await this.billing.handleWebhook(req.rawBody, signature);
    return { received: true };
  }
}
