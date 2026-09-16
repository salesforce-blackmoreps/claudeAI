import { getDomain, getHostname } from "tldts";

/**
 * Decides whether a saved item's URI should be offered for autofill on the
 * current page. Uses `tldts` (a maintained Public Suffix List implementation)
 * rather than a naive "last two labels" heuristic — a naive approach would
 * wrongly treat unrelated sites under a multi-part public suffix (e.g.
 * `evil.co.uk` vs. `another.co.uk`) as matching, which is a real,
 * security-relevant class of autofill bug.
 *
 * Match rules (checked in order):
 * 1. Exact hostname match.
 * 2. Same registrable domain (eTLD+1) — e.g. a saved `mail.example.com` item
 *    still matches `www.example.com`, since both are the same site's concern
 *    for credential reuse, but never crosses to a different registrable
 *    domain even if it shares a public suffix.
 */
export function uriMatchesOrigin(itemUri: string, pageOrigin: string): boolean {
  const itemHostname = getHostname(itemUri);
  const pageHostname = getHostname(pageOrigin);
  if (!itemHostname || !pageHostname) return false;

  if (itemHostname === pageHostname) return true;

  const itemDomain = getDomain(itemHostname);
  const pageDomain = getDomain(pageHostname);
  return Boolean(itemDomain && pageDomain && itemDomain === pageDomain);
}
