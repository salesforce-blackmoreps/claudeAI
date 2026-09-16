/** Plaintext shape of a decrypted "login" vault item's `encryptedData`. */
export interface LoginItemFields {
  title: string;
  username: string;
  password: string;
  uri?: string;
  notes?: string;
}
