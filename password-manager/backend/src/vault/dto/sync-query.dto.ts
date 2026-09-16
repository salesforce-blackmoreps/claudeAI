import { IsISO8601, IsOptional } from "class-validator";

export class SyncQueryDto {
  @IsOptional()
  @IsISO8601()
  since?: string;
}
