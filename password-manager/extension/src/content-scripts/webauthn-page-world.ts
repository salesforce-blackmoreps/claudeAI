import { bytesToBase64, bytesToBase64Url } from "../lib/crypto/encoding";

/**
 * Runs in the page's MAIN world — see manifest.json's second content_scripts
 * entry with `"world": "MAIN"`, `run_at: "document_start"`. This is the only
 * way to override `navigator.credentials` as the *page* sees it: a normal
 * (isolated-world) content script sees its own copy of the JS globals, not
 * the page's actual objects, so replacing a method here wouldn't be visible
 * to the page's own script at all.
 *
 * This MAIN-world script has no access to the vault or any extension API —
 * it only relays serialized ceremony parameters to the isolated-world
 * relay (webauthn-injector.ts) via `window.postMessage`, targeted at our
 * own origin, tagged with a private marker so we never act on arbitrary
 * postMessage traffic already on the page. All decryption and signing
 * happens in the background service worker; see ceremony-handler.ts.
 *
 * KNOWN CAVEAT: the objects returned below are plain JS objects shaped like
 * PublicKeyCredential / AuthenticatorAttestationResponse /
 * AuthenticatorAssertionResponse, not real instances of those interfaces —
 * a page cannot construct genuine ones (only the browser can), and neither
 * can we. Relying parties that do `instanceof PublicKeyCredential` checks
 * (uncommon; most just read properties) will not recognize these.
 */

const MESSAGE_MARKER = "__pmWebauthn";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

const pending = new Map<string, PendingRequest>();

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const data = event.data as { [MESSAGE_MARKER]?: boolean; direction?: string; requestId?: string; result?: unknown; error?: string };
  if (!data?.[MESSAGE_MARKER] || data.direction !== "response" || !data.requestId) return;

  const req = pending.get(data.requestId);
  if (!req) return;
  pending.delete(data.requestId);

  if (data.error) {
    req.reject(new DOMException(data.error, "NotAllowedError"));
  } else {
    req.resolve(data.result);
  }
});

function callExtension<T>(action: "create" | "get", payload: Record<string, unknown>): Promise<T> {
  const requestId = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject });
    window.postMessage({ [MESSAGE_MARKER]: true, direction: "request", requestId, action, payload }, location.origin);
  });
}

function toBase64(source: BufferSource): string {
  const bytes = source instanceof ArrayBuffer ? new Uint8Array(source) : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  return bytesToBase64(bytes);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

interface CreateResult {
  credentialIdB64: string;
  attestationObjectB64: string;
  clientDataJSONB64: string;
}

interface GetResult {
  credentialIdB64: string;
  authenticatorDataB64: string;
  clientDataJSONB64: string;
  signatureB64: string;
  userHandleB64: string;
}

const originalCreate = navigator.credentials.create.bind(navigator.credentials);
const originalGet = navigator.credentials.get.bind(navigator.credentials);

navigator.credentials.create = (async (options?: CredentialCreationOptions) => {
  if (!options?.publicKey) return originalCreate(options);
  const pk = options.publicKey;

  const result = await callExtension<CreateResult>("create", {
    rpId: pk.rp.id ?? location.hostname,
    rpName: pk.rp.name,
    userIdB64: toBase64(pk.user.id),
    userName: pk.user.name,
    userDisplayName: pk.user.displayName,
    challengeB64: toBase64(pk.challenge),
  });

  const rawId = base64ToArrayBuffer(result.credentialIdB64);
  return {
    id: bytesToBase64Url(new Uint8Array(rawId)),
    rawId,
    type: "public-key",
    authenticatorAttachment: "platform",
    response: {
      clientDataJSON: base64ToArrayBuffer(result.clientDataJSONB64),
      attestationObject: base64ToArrayBuffer(result.attestationObjectB64),
      getTransports: () => ["internal"],
      getPublicKeyAlgorithm: () => -7,
      getAuthenticatorData: () => new ArrayBuffer(0),
      getPublicKey: () => null,
    },
    getClientExtensionResults: () => ({}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}) as typeof navigator.credentials.create;

navigator.credentials.get = (async (options?: CredentialRequestOptions) => {
  if (!options?.publicKey) return originalGet(options);
  const pk = options.publicKey;

  const result = await callExtension<GetResult>("get", {
    rpId: pk.rpId ?? location.hostname,
    challengeB64: toBase64(pk.challenge),
    allowCredentialIdsB64: (pk.allowCredentials ?? []).map((c) => toBase64(c.id)),
  });

  const rawId = base64ToArrayBuffer(result.credentialIdB64);
  return {
    id: bytesToBase64Url(new Uint8Array(rawId)),
    rawId,
    type: "public-key",
    authenticatorAttachment: "platform",
    response: {
      clientDataJSON: base64ToArrayBuffer(result.clientDataJSONB64),
      authenticatorData: base64ToArrayBuffer(result.authenticatorDataB64),
      signature: base64ToArrayBuffer(result.signatureB64),
      userHandle: base64ToArrayBuffer(result.userHandleB64),
    },
    getClientExtensionResults: () => ({}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}) as typeof navigator.credentials.get;

// Some relying parties gate their passkey UI behind these checks before ever
// calling create()/get() — report both as available so we aren't skipped.
if (window.PublicKeyCredential) {
  window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () => Promise.resolve(true);
  const pkc = window.PublicKeyCredential as unknown as { isConditionalMediationAvailable?: () => Promise<boolean> };
  if ("isConditionalMediationAvailable" in window.PublicKeyCredential) {
    pkc.isConditionalMediationAvailable = () => Promise.resolve(true);
  }
}
