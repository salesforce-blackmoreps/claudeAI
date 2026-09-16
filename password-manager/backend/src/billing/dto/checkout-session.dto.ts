import { IsIn, IsString } from "class-validator";

export class CreateCheckoutSessionDto {
  @IsString()
  teamId!: string;

  @IsIn(["team_5", "team_20", "team_100"])
  tier!: "team_5" | "team_20" | "team_100";
}

export class CreatePortalSessionDto {
  @IsString()
  teamId!: string;
}
