import { Injectable } from "@nestjs/common";
import { buildOtpAuthUri, generateBase32Secret, verifyTotp } from "./totp";

/**
 * TOTP-based 2FA for the *account login itself* — independent from the
 * zero-knowledge vault crypto (docs/crypto-architecture.md) and independent
 * from the WebAuthn passkey provider the extension issues to other sites
 * (Phase 4). The TOTP secret is a genuine server-side secret (the server must
 * hold it in plaintext at verify time), so it's encrypted at rest via
 * server-secret-box rather than the zero-knowledge envelope.
 */
@Injectable()
export class MfaService {
  generateSecret(): string {
    return generateBase32Secret();
  }

  toURI(secret: string, label: string): string {
    return buildOtpAuthUri(secret, label, "Password Manager");
  }

  verify(code: string, secret: string): boolean {
    return verifyTotp(code, secret);
  }
}
