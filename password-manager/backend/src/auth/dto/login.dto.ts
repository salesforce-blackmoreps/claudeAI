import { IsEmail, IsString } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  masterPasswordHash!: string;

  @IsString()
  deviceName!: string;

  @IsString()
  devicePlatform!: string;
}

export class MfaVerifyDto {
  @IsString()
  loginTicket!: string;

  @IsString()
  code!: string;

  @IsString()
  deviceName!: string;

  @IsString()
  devicePlatform!: string;
}

export class ConfirmMfaDto {
  @IsString()
  code!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;

  @IsString()
  refreshTokenFamilyId!: string;
}
