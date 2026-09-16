import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import Stripe from "stripe";
import type { PlanTier, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../common/redis/redis.service";
import { priceIdForTier, tierForPriceId } from "./stripe-price-map";

const WEBHOOK_EVENT_DEDUPE_TTL_SECONDS = 60 * 60 * 24; // 24h — comfortably longer than Stripe's redelivery window

function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  return new Stripe(secretKey);
}

@Injectable()
export class BillingService {
  private readonly stripe = getStripeClient();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createCheckoutSession(userId: string, teamId: string, tier: PlanTier): Promise<{ url: string }> {
    await this.assertIsAdminOrOwner(userId, teamId);
    if (tier === "free") throw new BadRequestException("Cannot check out for the free tier");

    const team = await this.prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    const successUrl = process.env.BILLING_SUCCESS_URL ?? "https://example.com/billing/success";
    const cancelUrl = process.env.BILLING_CANCEL_URL ?? "https://example.com/billing/cancel";

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: teamId,
      customer: team.stripeCustomerId ?? undefined,
      line_items: [{ price: priceIdForTier(tier), quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) throw new Error("Stripe did not return a Checkout Session URL");
    return { url: session.url };
  }

  async createPortalSession(userId: string, teamId: string): Promise<{ url: string }> {
    await this.assertIsAdminOrOwner(userId, teamId);
    const team = await this.prisma.team.findUniqueOrThrow({ where: { id: teamId } });
    if (!team.stripeCustomerId) {
      throw new NotFoundException("This team has no billing account yet — subscribe to a paid plan first.");
    }

    const returnUrl = process.env.BILLING_PORTAL_RETURN_URL ?? "https://example.com/billing";
    const session = await this.stripe.billingPortal.sessions.create({
      customer: team.stripeCustomerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  /**
   * Verifies the Stripe signature, dedupes by event id (Stripe redelivers
   * events, sometimes more than once and out of order), and re-derives our
   * stored subscription state from the event's *current* subscription
   * object rather than incrementally trusting event sequencing.
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set");

    const event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    const dedupeKey = `stripe-event:${event.id}`;
    const isNew = await this.redis.set(dedupeKey, "1", "EX", WEBHOOK_EVENT_DEDUPE_TTL_SECONDS, "NX");
    if (!isNew) return; // already processed this exact event

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const teamId = session.client_reference_id;
        if (!teamId || !session.subscription || !session.customer) break;
        const subscription = await this.stripe.subscriptions.retrieve(session.subscription as string);
        await this.upsertSubscriptionFromStripe(teamId, subscription, session.customer as string);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const existing = await this.prisma.subscription.findUnique({
          where: { stripeSubscriptionId: subscription.id },
        });
        if (!existing) break;
        await this.upsertSubscriptionFromStripe(existing.teamId, subscription, subscription.customer as string);
        break;
      }
      default:
        break;
    }
  }

  private async upsertSubscriptionFromStripe(
    teamId: string,
    subscription: Stripe.Subscription,
    stripeCustomerId: string,
  ): Promise<void> {
    const priceId = subscription.items.data[0]?.price.id;
    const isCanceled = subscription.status === "canceled" || subscription.status === "incomplete_expired";
    const tier: PlanTier = isCanceled ? "free" : (priceId && tierForPriceId(priceId)) || "free";
    const status: SubscriptionStatus = mapStripeStatus(subscription.status);
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

    await this.prisma.$transaction([
      this.prisma.team.update({ where: { id: teamId }, data: { stripeCustomerId } }),
      this.prisma.subscription.upsert({
        where: { teamId },
        create: {
          teamId,
          stripeSubscriptionId: subscription.id,
          tier,
          status,
          currentPeriodEnd,
        },
        update: {
          stripeSubscriptionId: subscription.id,
          tier,
          status,
          currentPeriodEnd,
        },
      }),
    ]);
  }

  private async assertIsAdminOrOwner(userId: string, teamId: string): Promise<void> {
    const member = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
    if (!member || member.status !== "active" || (member.role !== "owner" && member.role !== "admin")) {
      throw new ForbiddenException("You do not have permission to manage billing for this team");
    }
  }
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    default:
      return "canceled";
  }
}
