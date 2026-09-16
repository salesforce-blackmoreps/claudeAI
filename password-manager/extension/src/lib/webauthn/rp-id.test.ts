import { describe, expect, it } from "vitest";
import { isValidRpIdForOrigin } from "./rp-id";

describe("isValidRpIdForOrigin", () => {
  it("accepts an rpId equal to the origin's hostname", () => {
    expect(isValidRpIdForOrigin("example.com", "https://example.com")).toBe(true);
  });

  it("accepts a registrable-domain rpId for a subdomain origin", () => {
    expect(isValidRpIdForOrigin("example.com", "https://login.example.com")).toBe(true);
  });

  it("rejects an rpId for an unrelated origin", () => {
    expect(isValidRpIdForOrigin("example.com", "https://evil.com")).toBe(false);
  });

  it("rejects a subdomain rpId that the origin is not under", () => {
    expect(isValidRpIdForOrigin("accounts.example.com", "https://example.com")).toBe(false);
  });

  it("rejects a bare public suffix as rpId, even if it is a string-suffix of the origin", () => {
    // "co.uk" is a public suffix, not a registrable domain — a page at
    // evil.co.uk must not be able to claim rpId "co.uk".
    expect(isValidRpIdForOrigin("co.uk", "https://evil.co.uk")).toBe(false);
  });
});
