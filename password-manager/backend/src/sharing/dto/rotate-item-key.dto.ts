import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsString, Min, ValidateNested } from "class-validator";

class RemainingShareDto {
  @IsString()
  shareId!: string;

  @IsString()
  encryptedItemKeyForRecipient!: string;
}

/**
 * Atomically rotates a vault item's Item Key: re-encrypts the item under a
 * fresh key, revokes one share (the one being removed), and re-wraps the new
 * key for every remaining active recipient — all in one transaction, so a
 * revoked editor's cached key can never author further changes. See
 * docs/crypto-architecture.md's sharing revocation rules and invariant #5.
 */
export class RotateItemKeyDto {
  @IsString()
  encryptedData!: string;

  @IsString()
  encryptedItemKey!: string;

  @IsInt()
  @Min(1)
  expectedRev!: number;

  @IsString()
  revokeShareId!: string;

  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => RemainingShareDto)
  remainingShares!: RemainingShareDto[];
}
