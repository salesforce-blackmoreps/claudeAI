/** Plaintext shape of a decrypted "passkey" vault item's `encryptedData`. */
export interface PasskeyItemFields {
  rpId: string;
  rpName: string;
  userHandle: string; // base64
  userName: string;
  userDisplayName: string;
  credentialId: string; // base64
  /** Uncompressed SEC1 public key point, base64 — kept alongside the private key so get() can rebuild the COSE key without re-deriving it. */
  publicKeyRaw: string;
  privateKeyPkcs8: string; // base64 — wrapped like every other item, via the same encryptItemFields envelope
  signCount: number;
}
