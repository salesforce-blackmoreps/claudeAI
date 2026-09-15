import type {
  AuthSessionDto,
  EntitlementsDto,
  KdfLookupResponseDto,
  LoginResponseDto,
  MfaEnrollResponseDto,
  RefreshResponseDto,
  SignupRequestDto,
  LoginRequestDto,
  MfaVerifyRequestDto,
  VaultItemDto,
  VaultSyncResponseDto,
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

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export function syncVault(accessToken: string, since: string | null): Promise<VaultSyncResponseDto> {
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  return request(`/vault/sync${query}`, { headers: authHeaders(accessToken) });
}

export interface CreateVaultItemBody {
  type: "login" | "passkey" | "note";
  encryptedData: string;
  encryptedItemKey: string;
  folderId?: string;
}

export function createVaultItem(accessToken: string, body: CreateVaultItemBody): Promise<VaultItemDto> {
  return request("/vault/items", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export interface UpdateVaultItemBody {
  encryptedData: string;
  encryptedItemKey: string;
  folderId?: string;
  expectedRev: number;
}

export function updateVaultItem(accessToken: string, id: string, body: UpdateVaultItemBody): Promise<VaultItemDto> {
  return request(`/vault/items/${id}`, {
    method: "PUT",
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export function deleteVaultItem(accessToken: string, id: string): Promise<void> {
  return request(`/vault/items/${id}`, { method: "DELETE", headers: authHeaders(accessToken) });
}

export function getEntitlements(accessToken: string): Promise<EntitlementsDto> {
  return request("/billing/entitlements", { headers: authHeaders(accessToken) });
}

export { ApiError };
