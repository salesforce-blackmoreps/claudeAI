import Stripe from "stripe";
import { BillingService } from "./billing.service";

const WEBHOOK_SECRET = "whsec_test_secret";

function signPayload(payload: string): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
}

function makeSubscriptionEvent(overrides: Partial<Stripe.Subscription> = {}): { payload: string; subscription: Stripe.Subscription } {
  const subscription = {
    id: "sub_123",
    object: "subscription",
    status: "active",
    customer: "cus_123",
    current_period_end: 1893456000,
    items: { object: "list", data: [{ price: { id: "price_team20" } }], has_more: false, url: "" },
    ...overrides,
  } as unknown as Stripe.Subscription;

  const event = {
    id: "evt_123",
    object: "event",
    type: "customer.subscription.updated",
    data: { object: subscription },
  };
  return { payload: JSON.stringify(event), subscription };
}

function makeDeps(existingSubscription: { teamId: string } | null) {
  const prisma = {
    subscription: {
      findUnique: jest.fn().mockResolvedValue(existingSubscription),
      upsert: jest.fn(),
    },
    team: { update: jest.fn() },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
  } as any;
  const redis = {
    set: jest.fn().mockResolvedValue("OK"), // first call: not seen before
  } as any;
  return { prisma, redis };
}

describe("BillingService.handleWebhook", () => {
  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.STRIPE_PRICE_TEAM_20 = "price_team20";
  });

  it("rejects a webhook with an invalid signature", async () => {
    const { prisma, redis } = makeDeps(null);
    const service = new BillingService(prisma, redis);
    const { payload } = makeSubscriptionEvent();

    await expect(service.handleWebhook(Buffer.from(payload), "t=1,v1=bogus")).rejects.toThrow();
  });

  it("updates the team's subscription tier from a valid subscription.updated event", async () => {
    const { prisma, redis } = makeDeps({ teamId: "team-1" });
    const service = new BillingService(prisma, redis);
    const { payload } = makeSubscriptionEvent({ status: "active" });

    await service.handleWebhook(Buffer.from(payload), signPayload(payload));

    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId: "team-1" },
        update: expect.objectContaining({ tier: "team_20", status: "active" }),
      }),
    );
  });

  it("reverts the team to the free tier when the subscription is canceled", async () => {
    const { prisma, redis } = makeDeps({ teamId: "team-1" });
    const service = new BillingService(prisma, redis);
    const { payload } = makeSubscriptionEvent({ status: "canceled" });

    await service.handleWebhook(Buffer.from(payload), signPayload(payload));

    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ tier: "free", status: "canceled" }),
      }),
    );
  });

  it("ignores an event for a subscription we have no record of", async () => {
    const { prisma, redis } = makeDeps(null);
    const service = new BillingService(prisma, redis);
    const { payload } = makeSubscriptionEvent();

    await service.handleWebhook(Buffer.from(payload), signPayload(payload));

    expect(prisma.subscription.upsert).not.toHaveBeenCalled();
  });

  it("is idempotent: a redelivered event (same event id) is processed only once", async () => {
    const { prisma, redis } = makeDeps({ teamId: "team-1" });
    const service = new BillingService(prisma, redis);
    const { payload } = makeSubscriptionEvent();
    const signature = signPayload(payload);

    redis.set.mockResolvedValueOnce("OK").mockResolvedValueOnce(null); // second call: already seen

    await service.handleWebhook(Buffer.from(payload), signature);
    await service.handleWebhook(Buffer.from(payload), signature);

    expect(prisma.subscription.upsert).toHaveBeenCalledTimes(1);
  });
});
