import type {
  AuthSessionDto,
  KdfLookupResponseDto,
  LoginResponseDto,
  MfaEnrollResponseDto,
  RefreshResponseDto,
  SignupRequestDto,
  LoginRequestDto,
  MfaVerifyRequestDto,
} from "@password-manager/shared";
import { API_BASE_URL } from "./config";

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, body.message ?? "Request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function fetchKdfParams(email: string): Promise<KdfLookupResponseDto> {
  return request(`/auth/kdf-params?email=${encodeURIComponent(email)}`);
}

export function signup(body: SignupRequestDto): Promise<AuthSessionDto> {
  return request("/auth/signup", { method: "POST", body: JSON.stringify(body) });
}

export function login(body: LoginRequestDto): Promise<LoginResponseDto> {
  return request("/auth/login", { method: "POST", body: JSON.stringify(body) });
}

export function verifyMfa(body: MfaVerifyRequestDto): Promise<AuthSessionDto> {
  return request("/auth/mfa/verify", { method: "POST", body: JSON.stringify(body) });
}

export function refreshSession(refreshToken: string, refreshTokenFamilyId: string): Promise<RefreshResponseDto> {
  return request("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken, refreshTokenFamilyId }),
  });
}

export function logout(accessToken: string, refreshTokenFamilyId: string): Promise<void> {
  return request("/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ refreshTokenFamilyId }),
  });
}

export function enrollMfa(accessToken: string): Promise<MfaEnrollResponseDto> {
  return request("/auth/mfa/enroll", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function confirmMfaEnrollment(accessToken: string, code: string): Promise<void> {
  return request("/auth/mfa/confirm", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ code }),
  });
}

export { ApiError };
