export type PlanTier = "free" | "team_5" | "team_20" | "team_100";

export interface PlanLimits {
  tier: PlanTier;
  /** Max vault items a single user may own. */
  maxItemsPerUser: number;
  /** Max distinct recipients a single item can be shared with. */
  maxShareMembers: number;
  /** Max members in a team on this tier. */
  maxTeamMembers: number;
  /** Monthly price in USD cents. 0 for the free tier. */
  monthlyPriceUsdCents: number;
}

/**
 * Single source of truth for plan limits. Both the backend's entitlement guard
 * (`backend/src/common/guards/entitlement.guard.ts`) and the extension's UI gating
 * import this file (via the shared workspace package) so client and server can never
 * drift out of sync on what a tier allows. The server remains authoritative;
 * seed the equivalent `plan_limits` DB rows from this table so it can also be
 * tuned by an admin without a deploy.
 */
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    tier: "free",
    maxItemsPerUser: 10,
    maxShareMembers: 3,
    maxTeamMembers: 1,
    monthlyPriceUsdCents: 0,
  },
  team_5: {
    tier: "team_5",
    maxItemsPerUser: 500,
    maxShareMembers: 5,
    maxTeamMembers: 5,
    monthlyPriceUsdCents: 1900,
  },
  team_20: {
    tier: "team_20",
    maxItemsPerUser: 1000,
    maxShareMembers: 20,
    maxTeamMembers: 20,
    monthlyPriceUsdCents: 5900,
  },
  team_100: {
    tier: "team_100",
    maxItemsPerUser: 5000,
    maxShareMembers: 100,
    maxTeamMembers: 100,
    monthlyPriceUsdCents: 19900,
  },
};
