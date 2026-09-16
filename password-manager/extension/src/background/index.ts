import { registerMessageRouter } from "./message-router";
import { registerAutoLockAlarm, isVaultUnlocked } from "./vault-session";
import { registerPeriodicSync, connectRealtimeSync } from "./sync-engine";

registerMessageRouter();
registerAutoLockAlarm();

// The service worker restarts often (MV3 eviction); chrome.storage.session
// itself survives that (it only clears on browser close), so on each restart
// we re-arm sync if the vault was already unlocked.
void isVaultUnlocked().then((unlocked) => {
  if (unlocked) {
    registerPeriodicSync();
    void connectRealtimeSync();
  }
});
