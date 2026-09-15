import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class UpdateVaultItemDto {
  @IsString()
  encryptedData!: string;

  @IsString()
  encryptedItemKey!: string;

  @IsOptional()
  @IsString()
  folderId?: string;

  /** Optimistic concurrency: must match the item's current `rev` or the update is rejected with 409. */
  @IsInt()
  @Min(1)
  expectedRev!: number;
}
