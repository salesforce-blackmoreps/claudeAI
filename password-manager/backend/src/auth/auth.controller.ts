import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { SignupDto } from "./dto/signup.dto";
import { ConfirmMfaDto, LoginDto, MfaVerifyDto, RefreshDto } from "./dto/login.dto";
import { KdfLookupQueryDto } from "./dto/kdf-lookup-query.dto";
import { JwtAuthGuard, AuthenticatedRequest } from "./jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("kdf-params")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  kdfLookup(@Query() query: KdfLookupQueryDto) {
    return this.auth.kdfLookup(query.email);
  }

  @Post("signup")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Post("login")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post("mfa/verify")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyMfa(@Body() dto: MfaVerifyDto) {
    return this.auth.verifyMfa(dto.loginTicket, dto.code, dto.deviceName, dto.devicePlatform);
  }

  @Post("refresh")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken, dto.refreshTokenFamilyId);
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshTokenFamilyId);
  }

  @Post("mfa/enroll")
  @UseGuards(JwtAuthGuard)
  enrollMfa(@Req() req: AuthenticatedRequest) {
    return this.auth.enrollMfa(req.userId);
  }

  @Post("mfa/confirm")
  @UseGuards(JwtAuthGuard)
  confirmMfa(@Req() req: AuthenticatedRequest, @Body() body: ConfirmMfaDto) {
    return this.auth.confirmMfaEnrollment(req.userId, body.code);
  }
}
