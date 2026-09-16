import { priceIdForTier, tierForPriceId } from "./stripe-price-map";

describe("stripe-price-map", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.STRIPE_PRICE_TEAM_5 = "price_team5";
    process.env.STRIPE_PRICE_TEAM_20 = "price_team20";
    process.env.STRIPE_PRICE_TEAM_100 = "price_team100";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("resolves a tier to its configured price id and back", () => {
    expect(priceIdForTier("team_20")).toBe("price_team20");
    expect(tierForPriceId("price_team20")).toBe("team_20");
  });

  it("returns null for an unrecognized price id", () => {
    expect(tierForPriceId("price_unknown")).toBeNull();
  });

  it("throws for the free tier, which has no Stripe price", () => {
    expect(() => priceIdForTier("free")).toThrow();
  });

  it("throws when the env var for a tier is missing", () => {
    delete process.env.STRIPE_PRICE_TEAM_5;
    expect(() => priceIdForTier("team_5")).toThrow();
  });
});
