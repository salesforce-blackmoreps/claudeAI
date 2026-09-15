import { describe, expect, it } from "vitest";
import { generateEcKeyPair, encodePublicKey } from "./ec";
import { randomBytes } from "./encoding";
import { wrapItemKeyForRecipient, unwrapItemKeyFromSender } from "./share-wrap";

describe("share-wrap (ECIES item key wrapping)", () => {
  it("lets the recipient recover the exact item key from the wrapped envelope", async () => {
    const recipient = await generateEcKeyPair();
    const itemKey = randomBytes(32);

    const envelope = await wrapItemKeyForRecipient(itemKey, encodePublicKey(recipient.publicKeyRaw));
    const recovered = await unwrapItemKeyFromSender(envelope, recipient.privateKeyPkcs8);

    expect(Array.from(recovered)).toEqual(Array.from(itemKey));
  });

  it("produces a different envelope each time, even for the same item key and recipient", async () => {
    const recipient = await generateEcKeyPair();
    const itemKey = randomBytes(32);

    const envelopeA = await wrapItemKeyForRecipient(itemKey, encodePublicKey(recipient.publicKeyRaw));
    const envelopeB = await wrapItemKeyForRecipient(itemKey, encodePublicKey(recipient.publicKeyRaw));
    expect(envelopeA).not.toBe(envelopeB);
  });

  it("fails to unwrap with a different recipient's private key", async () => {
    const recipient = await generateEcKeyPair();
    const impostor = await generateEcKeyPair();
    const itemKey = randomBytes(32);

    const envelope = await wrapItemKeyForRecipient(itemKey, encodePublicKey(recipient.publicKeyRaw));
    await expect(unwrapItemKeyFromSender(envelope, impostor.privateKeyPkcs8)).rejects.toThrow();
  });
});
