import { syncVault } from "../lib/api-client";
import { withFreshAccessToken } from "../lib/with-fresh-access-token";
import { getCursor, mergeSyncPage } from "../lib/storage/vault-cache";
import { getAccessToken } from "./vault-session";
import { WS_BASE_URL } from "../lib/config";

const SYNC_ALARM = "vault-periodic-sync";
const SYNC_ALARM_PERIOD_MINUTES = 1; // chrome.alarms' practical floor

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Pulls everything changed since the last local cursor and merges it into
 * the ciphertext cache. Safe to call opportunistically (on popup open, after
 * a local mutation, on the periodic alarm, or on a realtime "vault-changed"
 * nudge) — it's a no-op read if nothing changed server-side.
 */
export async function pullChanges(): Promise<void> {
  const isUnlocked = await getAccessToken();
  if (!isUnlocked) return;

  await withFreshAccessToken(async (accessToken) => {
    const cursor = await getCursor();
    const page = await syncVault(accessToken, cursor);
    await mergeSyncPage(page.items, page.cursor);
  });
}

export function registerPeriodicSync(): void {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_ALARM_PERIOD_MINUTES });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM) {
      void pullChanges();
    }
  });
}

/**
 * Best-effort realtime "something changed" nudge over a WebSocket (the
 * periodic alarm above is the reliability fallback — this connection drops
 * whenever the MV3 service worker is evicted, and reconnecting is opportunistic,
 * not guaranteed).
 */
export async function connectRealtimeSync(): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken || socket) return;

  socket = new WebSocket(`${WS_BASE_URL}/vault/subscribe?token=${encodeURIComponent(accessToken)}`);
  socket.addEventListener("message", () => {
    void pullChanges();
  });
  socket.addEventListener("close", () => {
    socket = null;
    scheduleReconnect();
  });
  socket.addEventListener("error", () => {
    socket?.close();
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectRealtimeSync();
  }, 5000);
}

export function disconnectRealtimeSync(): void {
  socket?.close();
  socket = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}
