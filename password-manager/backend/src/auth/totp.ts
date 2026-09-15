import { createHmac, randomBytes } from "node:crypto";

/**
 * RFC 4226 (HOTP) / RFC 6238 (TOTP) implemented directly against Node's native
 * `crypto.createHmac`. This is a standard, publicly specified OTP *encoding*
 * (not a novel cryptographic primitive), so implementing it directly avoids an
 * extra dependency for account-login 2FA — independent from the zero-knowledge
 * vault crypto in docs/crypto-architecture.md, which never uses hand-rolled
 * primitives.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_DIGITS = 6;

export function generateBase32Secret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(counter: number, secretBytes: Buffer, digits = DEFAULT_DIGITS): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = createHmac("sha1", secretBytes).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = (binary % 10 ** digits).toString().padStart(digits, "0");
  return code;
}

export function generateTotp(
  secretBase32: string,
  options: { period?: number; digits?: number; timeSeconds?: number } = {},
): string {
  const period = options.period ?? DEFAULT_PERIOD_SECONDS;
  const digits = options.digits ?? DEFAULT_DIGITS;
  const timeSeconds = options.timeSeconds ?? Math.floor(Date.now() / 1000);
  const counter = Math.floor(timeSeconds / period);
  return hotp(counter, base32Decode(secretBase32), digits);
}

/**
 * Verifies a TOTP code, tolerating +/- `window` time steps of clock drift
 * (default: one 30s step each way, matching common authenticator app
 * behavior) using a constant-time comparison to resist timing attacks.
 */
export function verifyTotp(
  token: string,
  secretBase32: string,
  options: { period?: number; digits?: number; window?: number; timeSeconds?: number } = {},
): boolean {
  const period = options.period ?? DEFAULT_PERIOD_SECONDS;
  const digits = options.digits ?? DEFAULT_DIGITS;
  const window = options.window ?? 1;
  const timeSeconds = options.timeSeconds ?? Math.floor(Date.now() / 1000);
  const secretBytes = base32Decode(secretBase32);
  const currentCounter = Math.floor(timeSeconds / period);

  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const candidate = hotp(currentCounter + errorWindow, secretBytes, digits);
    if (constantTimeEquals(candidate, token)) {
      return true;
    }
  }
  return false;
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function buildOtpAuthUri(secretBase32: string, label: string, issuer: string): string {
  const encodedLabel = encodeURIComponent(`${issuer}:${label}`);
  const encodedIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${encodedLabel}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${DEFAULT_DIGITS}&period=${DEFAULT_PERIOD_SECONDS}`;
}
