import { IsEmail } from "class-validator";

export class KdfLookupQueryDto {
  @IsEmail()
  email!: string;
}
