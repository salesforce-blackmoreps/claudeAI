import { IsIn, IsOptional, IsString } from "class-validator";

export class CreateVaultItemDto {
  @IsIn(["login", "passkey", "note"])
  type!: "login" | "passkey" | "note";

  @IsString()
  encryptedData!: string;

  @IsString()
  encryptedItemKey!: string;

  @IsOptional()
  @IsString()
  folderId?: string;
}
