import { createHmac, randomUUID } from "node:crypto";
import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import type {
  AuthSessionDto,
  KdfLookupResponseDto,
  KdfParams,
  LoginResponseDto,
  MfaEnrollResponseDto,
  RefreshResponseDto,
} from "@password-manager/shared";
import { DEFAULT_KDF_PARAMS_FOR_ENUMERATION_RESISTANCE } from "./kdf-defaults";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../common/redis/redis.service";
import { DevicesService } from "../devices/devices.service";
import { TokenService } from "./token.service";
import { MfaService } from "./mfa.service";
import { encryptServerSecret, decryptServerSecret } from "../common/crypto/server-secret-box";
import { AuditLogService, AUDIT_EVENTS } from "../common/audit-log/audit-log.service";
import type { SignupDto } from "./dto/signup.dto";
import type { LoginDto } from "./dto/login.dto";

const LOGIN_TICKET_TTL_SECONDS = 5 * 60;
const LOGIN_LOCKOUT_THRESHOLD = 10;
const LOGIN_LOCKOUT_WINDOW_SECONDS = 15 * 60;

/**
 * Computed once and cached: a valid Argon2id hash of a fixed, meaningless
 * value, verified against on every login for a nonexistent email so that
 * path pays the same Argon2id cost as a real account with a wrong password.
 * Without this, `argon2.verify` only ever runs when the account exists,
 * and Argon2id's deliberately-slow-by-design cost (tens–hundreds of ms)
 * makes that a large, reliably measurable timing side-channel for account
 * enumeration — undermining the same enumeration-resistance `kdfLookup`
 * below goes out of its way to provide on this same login surface.
 */
const DUMMY_PASSWORD_HASH_PROMISE = argon2.hash("timing-safety-dummy-hash-not-a-real-account");

interface LoginTicketPayload {
  userId: string;
  deviceName: string;
  devicePlatform: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly devices: DevicesService,
    private readonly tokens: TokenService,
    private readonly mfa: MfaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthSessionDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const masterPasswordHash = await argon2.hash(dto.masterPasswordHash);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        masterPasswordHash,
        kdfType: dto.kdfType,
        kdfParams: { ...dto.kdfParams },
        kdfSalt: dto.kdfSalt,
        encryptedVaultKey: dto.encryptedVaultKey,
        publicKey: dto.publicKey,
        encryptedPrivateKey: dto.encryptedPrivateKey,
      },
    });

    // Resolve any team invites that were sent to this address before the
    // person had an account (see TeamMember.inviteEmail in schema.prisma).
    // They still land in "pending", same as any other invite — signing up
    // just makes the invite theirs to accept.
    await this.prisma.teamMember.updateMany({
      where: { inviteEmail: user.email },
      data: { userId: user.id, inviteEmail: null },
    });

    await this.auditLog.record({ actorUserId: user.id, eventType: AUDIT_EVENTS.SIGNUP, targetId: user.id });

    return this.establishSession(user.id, dto.deviceName, dto.devicePlatform, {
      encryptedVaultKey: user.encryptedVaultKey,
      encryptedPrivateKey: user.encryptedPrivateKey,
      publicKey: user.publicKey,
      kdfType: user.kdfType as "argon2id",
      kdfParams: user.kdfParams as unknown as KdfParams,
      kdfSalt: user.kdfSalt,
    });
  }

  /**
   * Never reveals whether an email is registered: for an unknown email this
   * returns a deterministic-but-fake salt/params derived from the email
   * itself, indistinguishable from a real account's response without also
   * knowing the (secret) server pepper.
   */
  async kdfLookup(email: string): Promise<KdfLookupResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      return { kdfType: "argon2id", kdfParams: user.kdfParams as unknown as KdfParams, kdfSalt: user.kdfSalt };
    }
    const fakeSalt = createHmac("sha256", getPepper()).update(email.toLowerCase()).digest("base64");
    return { kdfType: "argon2id", kdfParams: DEFAULT_KDF_PARAMS_FOR_ENUMERATION_RESISTANCE, kdfSalt: fakeSalt };
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const lockoutKey = this.loginLockoutKey(dto.email);
    const failedAttempts = Number((await this.redis.get(lockoutKey)) ?? 0);
    if (failedAttempts >= LOGIN_LOCKOUT_THRESHOLD) {
      await this.auditLog.record({ eventType: AUDIT_EVENTS.LOGIN_LOCKED_OUT, metadata: { email: dto.email } });
      throw new UnauthorizedException("Too many failed attempts. Please try again in 15 minutes.");
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Always run a real Argon2id verify, even when the account doesn't
    // exist — see DUMMY_PASSWORD_HASH_PROMISE above for why.
    const hashToVerify = user ? user.masterPasswordHash : await DUMMY_PASSWORD_HASH_PROMISE;
    const passwordMatches = await argon2.verify(hashToVerify, dto.masterPasswordHash);
    if (!user || !passwordMatches) {
      await this.redis.set(lockoutKey, String(failedAttempts + 1), "EX", LOGIN_LOCKOUT_WINDOW_SECONDS);
      await this.auditLog.record({
        actorUserId: user?.id ?? null,
        eventType: AUDIT_EVENTS.LOGIN_FAILED,
        metadata: { email: dto.email },
      });
      throw new UnauthorizedException("Invalid email or master password");
    }

    await this.redis.del(lockoutKey);

    if (user.mfaEnabled) {
      const loginTicket = randomUUID();
      const payload: LoginTicketPayload = {
        userId: user.id,
        deviceName: dto.deviceName,
        devicePlatform: dto.devicePlatform,
      };
      await this.redis.set(
        this.loginTicketKey(loginTicket),
        JSON.stringify(payload),
        "EX",
        LOGIN_TICKET_TTL_SECONDS,
      );
      return { mfaRequired: true, loginTicket };
    }

    await this.auditLog.record({ actorUserId: user.id, eventType: AUDIT_EVENTS.LOGIN_SUCCEEDED });
    return this.establishSession(user.id, dto.deviceName, dto.devicePlatform, {
      encryptedVaultKey: user.encryptedVaultKey,
      encryptedPrivateKey: user.encryptedPrivateKey,
      publicKey: user.publicKey,
      kdfType: user.kdfType as "argon2id",
      kdfParams: user.kdfParams as unknown as KdfParams,
      kdfSalt: user.kdfSalt,
    });
  }

  async verifyMfa(loginTicket: string, code: string, deviceName: string, devicePlatform: string): Promise<AuthSessionDto> {
    const raw = await this.redis.get(this.loginTicketKey(loginTicket));
    if (!raw) {
      throw new UnauthorizedException("Login session expired, please sign in again");
    }
    const payload = JSON.parse(raw) as LoginTicketPayload;
    const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.mfaSecretEncrypted) {
      throw new UnauthorizedException("MFA is not configured for this account");
    }

    const secret = decryptServerSecret(user.mfaSecretEncrypted);
    if (!this.mfa.verify(code, secret)) {
      throw new UnauthorizedException("Invalid verification code");
    }

    await this.redis.del(this.loginTicketKey(loginTicket));
    await this.auditLog.record({ actorUserId: user.id, eventType: AUDIT_EVENTS.LOGIN_SUCCEEDED, metadata: { mfa: true } });
    return this.establishSession(user.id, deviceName, devicePlatform, {
      encryptedVaultKey: user.encryptedVaultKey,
      encryptedPrivateKey: user.encryptedPrivateKey,
      publicKey: user.publicKey,
      kdfType: user.kdfType as "argon2id",
      kdfParams: user.kdfParams as unknown as KdfParams,
      kdfSalt: user.kdfSalt,
    });
  }

  async refresh(refreshToken: string, refreshTokenFamilyId: string): Promise<RefreshResponseDto> {
    const ownerId = await this.redis.get(`refresh-token-owner:${refreshTokenFamilyId}`);
    if (!ownerId) {
      throw new UnauthorizedException("Session expired, please sign in again");
    }
    try {
      const issued = await this.tokens.rotateRefreshToken(refreshToken, refreshTokenFamilyId, ownerId);
      await this.devices.touch(refreshTokenFamilyId).catch(() => undefined);
      return issued;
    } catch {
      // Reuse of an already-rotated refresh token: revoke the device outright.
      await this.devices.deleteByFamilyId(refreshTokenFamilyId);
      throw new UnauthorizedException("Session invalidated, please sign in again");
    }
  }

  async logout(refreshTokenFamilyId: string): Promise<void> {
    await this.tokens.revokeFamily(refreshTokenFamilyId);
    await this.devices.deleteByFamilyId(refreshTokenFamilyId);
  }

  async enrollMfa(userId: string): Promise<MfaEnrollResponseDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = this.mfa.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecretEncrypted: encryptServerSecret(secret) },
    });
    return { secret, otpAuthUri: this.mfa.toURI(secret, user.email) };
  }

  async confirmMfaEnrollment(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecretEncrypted) {
      throw new UnauthorizedException("Call POST /auth/mfa/enroll first");
    }
    const secret = decryptServerSecret(user.mfaSecretEncrypted);
    if (!this.mfa.verify(code, secret)) {
      throw new UnauthorizedException("Invalid verification code");
    }
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
  }

  private async establishSession(
    userId: string,
    deviceName: string,
    devicePlatform: string,
    vaultFields: Pick<
      AuthSessionDto,
      "encryptedVaultKey" | "encryptedPrivateKey" | "publicKey" | "kdfType" | "kdfParams" | "kdfSalt"
    >,
  ): Promise<AuthSessionDto> {
    const issued = await this.tokens.issueTokens(userId);
    const device = await this.devices.register(userId, deviceName, devicePlatform, issued.refreshTokenFamilyId);
    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      refreshTokenFamilyId: issued.refreshTokenFamilyId,
      deviceId: device.id,
      ...vaultFields,
    };
  }

  private loginTicketKey(loginTicket: string): string {
    return `login-ticket:${loginTicket}`;
  }

  private loginLockoutKey(email: string): string {
    return `login-lockout:${email.toLowerCase()}`;
  }
}

function getPepper(): string {
  const pepper = process.env.SERVER_SECRET_KEY;
  if (!pepper) {
    throw new Error("SERVER_SECRET_KEY environment variable is not set");
  }
  return pepper;
}
