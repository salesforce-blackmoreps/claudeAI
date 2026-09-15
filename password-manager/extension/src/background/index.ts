// MV3 service worker entry point. Kept event-driven and free of module-scope
// mutable state (the worker can be evicted at any time) — anything that must
// survive an eviction goes through chrome.storage.session, not a JS variable here.
// vault-session.ts, sync-engine.ts, message-router.ts, and webauthn/ are added in
// later phases as those features are built.

chrome.runtime.onInstalled.addListener(() => {
  // eslint-disable-next-line no-console
  console.log("Password Manager service worker installed.");
});
