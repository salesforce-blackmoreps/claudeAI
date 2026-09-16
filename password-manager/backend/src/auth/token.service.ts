import { randomUUID, randomBytes, createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../common/redis/redis.service";

const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const REFRESH_TOKEN_BYTES = 32;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenFamilyId: string;
}

/**
 * Access tokens are short-lived JWTs. Refresh tokens are opaque, single-use,
 * and rotate on every use — reuse of an already-consumed refresh token is
 * theft evidence, so it revokes the entire token family (see invariant list
 * in docs/crypto-architecture.md's login flow section and the plan's Phase 1
 * risk notes). Only the SHA-256 hash of the refresh token is stored in Redis,
 * never the token itself.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  signAccessToken(userId: string): string {
    return this.jwt.sign(
      { sub: userId },
      {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.config.get<string>("JWT_ACCESS_TTL") ?? "15m",
      },
    );
  }

  verifyAccessToken(token: string): { sub: string } {
    return this.jwt.verify(token, { secret: this.config.get<string>("JWT_ACCESS_SECRET") });
  }

  /** Issues a brand-new refresh token family (first login on a device). */
  async issueTokens(userId: string): Promise<IssuedTokens> {
    const refreshTokenFamilyId = randomUUID();
    const refreshToken = await this.storeNewRefreshToken(userId, refreshTokenFamilyId);
    return { accessToken: this.signAccessToken(userId), refreshToken, refreshTokenFamilyId };
  }

  /**
   * Rotates a refresh token: the presented token must match the current
   * value stored for its family. On success, a new token is stored and the
   * old one is invalidated. On a hash mismatch (the token was already
   * rotated/consumed), the entire family is revoked and the caller must
   * treat this as a potential theft signal.
   */
  async rotateRefreshToken(
    presentedToken: string,
    refreshTokenFamilyId: string,
    userId: string,
  ): Promise<IssuedTokens> {
    const key = this.familyKey(refreshTokenFamilyId);
    const storedHash = await this.redis.get(key);
    const presentedHash = hashToken(presentedToken);

    if (!storedHash || storedHash !== presentedHash) {
      await this.revokeFamily(refreshTokenFamilyId);
      throw new Error("refresh_token_reuse_detected");
    }

    const refreshToken = await this.storeNewRefreshToken(userId, refreshTokenFamilyId);
    return { accessToken: this.signAccessToken(userId), refreshToken, refreshTokenFamilyId };
  }

  async revokeFamily(refreshTokenFamilyId: string): Promise<void> {
    await this.redis.del(this.familyKey(refreshTokenFamilyId));
  }

  private async storeNewRefreshToken(userId: string, refreshTokenFamilyId: string): Promise<string> {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
    await this.redis.set(this.familyKey(refreshTokenFamilyId), hashToken(token), "EX", REFRESH_TOKEN_TTL_SECONDS);
    await this.redis.set(this.familyOwnerKey(refreshTokenFamilyId), userId, "EX", REFRESH_TOKEN_TTL_SECONDS);
    return token;
  }

  private familyKey(refreshTokenFamilyId: string): string {
    return `refresh-token:${refreshTokenFamilyId}`;
  }

  private familyOwnerKey(refreshTokenFamilyId: string): string {
    return `refresh-token-owner:${refreshTokenFamilyId}`;
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
