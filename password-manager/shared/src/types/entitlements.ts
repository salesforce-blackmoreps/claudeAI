import type { PlanTier } from "../constants/plan-limits";

export interface EntitlementsDto {
  tier: PlanTier;
  status: "active" | "past_due" | "canceled" | "over_limit";
  maxItemsPerUser: number;
  maxShareMembers: number;
  maxTeamMembers: number;
  currentItemCount: number;
  currentTeamMemberCount: number;
}
