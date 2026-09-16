import { sendToBackground } from "../background/messages";

/**
 * Isolated-world relay between the MAIN-world page override
 * (webauthn-page-world.ts) and the background service worker. Runs as a
 * normal content script (isolated world = a real extension context), so its
 * `chrome.runtime.sendMessage` calls pass the same sender.id check every
 * other background message does — the MAIN-world script itself has no
 * extension API access at all, by design.
 *
 * Only reacts to `window.postMessage` traffic carrying our own private
 * marker and targeted at our own origin; anything else on the page
 * (including a page trying to spoof the marker) is ignored — the MAIN-world
 * override is the only legitimate source, and even it only ever forwards
 * ceremony parameters the page's own `navigator.credentials` call supplied,
 * never arbitrary page-chosen actions.
 */
const MESSAGE_MARKER = "__pmWebauthn";

interface RequestMessage {
  [MESSAGE_MARKER]: true;
  direction: "request";
  requestId: string;
  action: "create" | "get";
  payload: Record<string, unknown>;
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const data = event.data as Partial<RequestMessage>;
  if (!data?.[MESSAGE_MARKER] || data.direction !== "request" || !data.requestId || !data.action) return;

  void handleRequest(data as RequestMessage);
});

async function handleRequest(request: RequestMessage): Promise<void> {
  try {
    const result =
      request.action === "create"
        ? await sendToBackground({
            type: "WEBAUTHN_CREATE",
            origin: location.origin,
            rpId: String(request.payload.rpId),
            rpName: String(request.payload.rpName),
            userIdB64: String(request.payload.userIdB64),
            userName: String(request.payload.userName),
            userDisplayName: String(request.payload.userDisplayName),
            challengeB64: String(request.payload.challengeB64),
          })
        : await sendToBackground({
            type: "WEBAUTHN_GET",
            origin: location.origin,
            rpId: String(request.payload.rpId),
            challengeB64: String(request.payload.challengeB64),
            allowCredentialIdsB64: (request.payload.allowCredentialIdsB64 as string[]) ?? [],
          });

    if (result && typeof result === "object" && "error" in result) {
      postResponse(request.requestId, undefined, String((result as { error: unknown }).error));
    } else {
      postResponse(request.requestId, result);
    }
  } catch (err) {
    postResponse(request.requestId, undefined, err instanceof Error ? err.message : String(err));
  }
}

function postResponse(requestId: string, result?: unknown, error?: string): void {
  window.postMessage({ [MESSAGE_MARKER]: true, direction: "response", requestId, result, error }, location.origin);
}
