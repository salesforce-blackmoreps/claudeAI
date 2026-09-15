import { Type } from "class-transformer";
import { IsEmail, IsIn, IsInt, IsString, Min, ValidateNested } from "class-validator";

class KdfParamsDto {
  @IsInt()
  @Min(16384)
  memoryKib!: number;

  @IsInt()
  @Min(1)
  iterations!: number;

  @IsInt()
  @Min(1)
  parallelism!: number;
}

export class SignupDto {
  @IsEmail()
  email!: string;

  /** Client-derived auth value (see docs/crypto-architecture.md) — never the master password itself. */
  @IsString()
  masterPasswordHash!: string;

  @IsIn(["argon2id"])
  kdfType!: "argon2id";

  @ValidateNested()
  @Type(() => KdfParamsDto)
  kdfParams!: KdfParamsDto;

  @IsString()
  kdfSalt!: string;

  @IsString()
  encryptedVaultKey!: string;

  @IsString()
  publicKey!: string;

  @IsString()
  encryptedPrivateKey!: string;

  @IsString()
  deviceName!: string;

  @IsString()
  devicePlatform!: string;
}
