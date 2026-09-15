import { describe, expect, it } from "vitest";
import { uriMatchesOrigin } from "./domain-match";

describe("uriMatchesOrigin", () => {
  it("matches an exact hostname", () => {
    expect(uriMatchesOrigin("https://example.com", "https://example.com")).toBe(true);
  });

  it("matches a subdomain against the same registrable domain", () => {
    expect(uriMatchesOrigin("https://mail.example.com", "https://www.example.com")).toBe(true);
    expect(uriMatchesOrigin("https://example.com", "https://login.example.com")).toBe(true);
  });

  it("does not match unrelated domains", () => {
    expect(uriMatchesOrigin("https://example.com", "https://example.net")).toBe(false);
    expect(uriMatchesOrigin("https://evil.com", "https://example.com")).toBe(false);
  });

  it("does not treat sites sharing a multi-part public suffix as matching (PSL-aware)", () => {
    // co.uk is a public suffix, not a registrable domain on its own —
    // a naive "last two labels" heuristic would wrongly match these.
    expect(uriMatchesOrigin("https://site-one.co.uk", "https://site-two.co.uk")).toBe(false);
  });

  it("matches a subdomain under a multi-part public suffix correctly", () => {
    expect(uriMatchesOrigin("https://www.site-one.co.uk", "https://site-one.co.uk")).toBe(true);
  });
});
