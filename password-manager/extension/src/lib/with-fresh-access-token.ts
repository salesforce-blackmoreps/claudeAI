import { ApiError, refreshSession } from "./api-client";
import { loadSession, updateTokens } from "./storage/local-store";
import { getAccessToken, setAccessToken, lockVaultSession } from "../background/vault-session";

/**
 * Runs `fn` with the current access token; on a 401 (expired token) it
 * refreshes once via the stored refresh token and retries. If the refresh
 * itself fails (refresh token revoked/expired), the vault session is locked
 * so the UI falls back to the unlock/login screen rather than looping.
 */
export async function withFreshAccessToken<T>(fn: (accessToken: string) => Promise<T>): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("Vault is locked");
  }

  try {
    return await fn(accessToken);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) {
      throw err;
    }

    const session = await loadSession();
    if (!session) {
      await lockVaultSession();
      throw err;
    }

    try {
      const refreshed = await refreshSession(session.refreshToken, session.refreshTokenFamilyId);
      await updateTokens(refreshed.refreshToken, refreshed.refreshTokenFamilyId);
      await setAccessToken(refreshed.accessToken);
      return await fn(refreshed.accessToken);
    } catch (refreshErr) {
      await lockVaultSession();
      throw refreshErr;
    }
  }
}
