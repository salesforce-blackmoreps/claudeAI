import { describe, expect, it } from "vitest";
import { bytesToBase64Url, base64UrlToBytes, randomBytes } from "./encoding";

describe("base64url encoding", () => {
  it("round-trips arbitrary bytes", () => {
    for (const length of [0, 1, 2, 3, 4, 16, 32, 33]) {
      const bytes = randomBytes(length);
      expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
    }
  });

  it("never contains standard-base64-only characters or padding", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc, 0xfb]);
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
  });
});
