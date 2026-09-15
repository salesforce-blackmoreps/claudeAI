import { getDomain, getHostname } from "tldts";

/**
 * WebAuthn spec §5.1.3: an rpId is valid for a given calling origin only if
 * it equals the origin's effective domain, or is a registrable domain
 * suffix of it. We never trust an rpId supplied across the page↔content
 * script↔background boundary without this check — accepting an unchecked
 * rpId would let a malicious page register or assert a passkey "as" a
 * completely unrelated site.
 */
export function isValidRpIdForOrigin(rpId: string, origin: string): boolean {
  const originHostname = getHostname(origin);
  if (!originHostname) return false;

  if (rpId === originHostname) return true;
  if (!originHostname.endsWith(`.${rpId}`)) return false;

  // The suffix match above alone isn't enough: it would also accept e.g.
  // rpId="co.uk" for origin="evil.co.uk" (co.uk is a public suffix, not a
  // real, registrable site). Require rpId to be that registrable domain too.
  const rpIdDomain = getDomain(rpId);
  return rpIdDomain !== null && rpIdDomain === rpId;
}
