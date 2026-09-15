import type { PlanTier } from "@password-manager/shared";

/**
 * Maps a Stripe Price ID to our internal plan tier and back. Configured via
 * env vars rather than hardcoded so the same code works against a test-mode
 * and live-mode Stripe account (which have different price IDs) without a
 * deploy — see shared/src/constants/plan-limits.ts for what each tier
 * actually unlocks.
 */
const PAID_TIERS: PlanTier[] = ["team_5", "team_20", "team_100"];

function envVarForTier(tier: PlanTier): string {
  return `STRIPE_PRICE_${tier.toUpperCase()}`;
}

export function priceIdForTier(tier: PlanTier): string {
  if (tier === "free") {
    throw new Error("priceIdForTier: the free tier has no Stripe price");
  }
  const priceId = process.env[envVarForTier(tier)];
  if (!priceId) {
    throw new Error(`Missing environment variable ${envVarForTier(tier)} for plan tier "${tier}"`);
  }
  return priceId;
}

export function tierForPriceId(priceId: string): PlanTier | null {
  for (const tier of PAID_TIERS) {
    if (process.env[envVarForTier(tier)] === priceId) return tier;
  }
  return null;
}
