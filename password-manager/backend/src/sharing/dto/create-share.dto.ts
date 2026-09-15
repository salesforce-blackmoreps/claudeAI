import { IsIn, IsString } from "class-validator";

export class CreateShareDto {
  @IsString()
  recipientUserId!: string;

  /** ECIES-wrapped Item Key for this specific recipient — see docs/crypto-architecture.md. Never decrypted server-side. */
  @IsString()
  encryptedItemKeyForRecipient!: string;

  @IsIn(["viewer", "editor"])
  role!: "viewer" | "editor";
}
