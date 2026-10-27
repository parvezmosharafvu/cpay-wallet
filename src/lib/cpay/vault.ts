export const VAULT_KEY = "cpay-vault-v1";
export const LEGACY_KEY = "cpay-practice-v1";
const ITERATIONS = 600_000;
const MAX_BYTES = 8 * 1024 * 1024;
const AAD = new TextEncoder().encode("CPay encrypted wallet vault v1");
export type VaultEnvelope = {
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};
export type VaultStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function base64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}
function unbase64(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error("Invalid backup encoding.");
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
export function parseEnvelope(raw: string): VaultEnvelope {
  if (raw.length > MAX_BYTES * 2) throw new Error("Backup is too large.");
  const e: unknown = JSON.parse(raw);
  if (!e || typeof e !== "object") throw new Error("Invalid wallet backup.");
  const p = e as Partial<VaultEnvelope>;
  if (
    p.version !== 1 ||
    p.kdf !== "PBKDF2-SHA256" ||
    p.iterations !== ITERATIONS ||
    typeof p.salt !== "string" ||
    typeof p.iv !== "string" ||
    typeof p.ciphertext !== "string" ||
    unbase64(p.salt).length !== 16 ||
    unbase64(p.iv).length !== 12 ||
    unbase64(p.ciphertext).length < 16
  ) {
    throw new Error("Unsupported or damaged wallet backup.");
  }
  return p as VaultEnvelope;
}
async function derive(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export function assertPassword(password: string) {
  if (password.length < 12 || password.length > 1024)
    throw new Error("Use a password of at least 12 characters (maximum 1024).");
}
async function encrypt(raw: string, key: CryptoKey, salt: string): Promise<VaultEnvelope> {
  if (new TextEncoder().encode(raw).length > MAX_BYTES)
    throw new Error("Wallet data is too large.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: AAD },
    key,
    new TextEncoder().encode(raw),
  );
  return {
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt,
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
  };
}
async function decrypt(e: VaultEnvelope, key: CryptoKey): Promise<string> {
  try {
    const value = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unbase64(e.iv), additionalData: AAD },
      key,
      unbase64(e.ciphertext),
    );
    return new TextDecoder().decode(value);
  } catch {
    throw new Error("Wrong password or damaged wallet backup.");
  }
}
export function assertWalletData(raw: string) {
  if (new TextEncoder().encode(raw).length > MAX_BYTES)
    throw new Error("Wallet data is too large.");
  const doc = JSON.parse(raw) as {
    state?: { members?: unknown; sdkMnemonic?: unknown };
    version?: unknown;
  };
  if (
    !doc ||
    typeof doc !== "object" ||
    !doc.state ||
    !Array.isArray(doc.state.members) ||
    (doc.version !== undefined && doc.version !== 0)
  )
    throw new Error("Invalid wallet data.");
}
/** Keys exist only in this instance's memory. Disk contains only authenticated ciphertext. */
export class WalletVault {
  private key: CryptoKey | null = null;
  private salt = "";
  private epoch = 0;
  private queue: Promise<void> = Promise.resolve();
  private writeError: unknown;
  private storage: VaultStorage;
  private persisted: string | null = null;
  constructor(storage: VaultStorage) {
    this.storage = storage;
  }
  private assertCurrent(epoch: number, expected: string | null) {
    if (this.epoch !== epoch || this.storage.getItem(VAULT_KEY) !== expected) {
      throw new Error(
        "The vault was locked or changed in another tab. Unlock the current vault and try again.",
      );
    }
  }
  private assertInputPassword(password: string) {
    if (password.length > 1024) throw new Error("The vault password is too long.");
  }
  exists() {
    return this.storage.getItem(VAULT_KEY) !== null;
  }
  hasLegacy() {
    return this.storage.getItem(LEGACY_KEY) !== null;
  }
  isUnlocked() {
    return this.key !== null;
  }
  async create(password: string) {
    if (this.exists()) throw new Error("Unlock the existing vault first.");
    assertPassword(password);
    const epoch = this.epoch;
    const legacy = this.storage.getItem(LEGACY_KEY);
    const raw = legacy ?? JSON.stringify({ state: { members: [] }, version: 0 });
    assertWalletData(raw);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await derive(password, salt);
    const e = await encrypt(raw, key, base64(salt));
    this.assertCurrent(epoch, null);
    if (this.storage.getItem(LEGACY_KEY) !== legacy)
      throw new Error("Legacy wallet data changed. Reload before encrypting it.");
    // Remove plaintext only AFTER the durable encrypted write succeeds.
    const serialized = JSON.stringify(e);
    this.storage.setItem(VAULT_KEY, serialized);
    this.storage.removeItem(LEGACY_KEY);
    this.key = key;
    this.salt = e.salt;
    this.persisted = serialized;
    this.epoch++;
  }
  async unlock(password: string) {
    this.assertInputPassword(password);
    const epoch = this.epoch;
    const raw = this.storage.getItem(VAULT_KEY);
    if (!raw) throw new Error("Create or import a vault first.");
    const e = parseEnvelope(raw);
    const key = await derive(password, unbase64(e.salt));
    assertWalletData(await decrypt(e, key));
    this.assertCurrent(epoch, raw);
    this.key = key;
    this.salt = e.salt;
    this.persisted = raw;
    this.epoch++;
  }
  async verify(password: string) {
    this.assertInputPassword(password);
    const epoch = this.epoch;
    const raw = this.storage.getItem(VAULT_KEY);
    if (!raw) throw new Error("Vault is missing.");
    const e = parseEnvelope(raw);
    assertWalletData(await decrypt(e, await derive(password, unbase64(e.salt))));
    this.assertCurrent(epoch, raw);
  }
  async read(): Promise<string | null> {
    if (!this.key) return null;
    const epoch = this.epoch,
      key = this.key;
    const raw = this.storage.getItem(VAULT_KEY);
    if (!raw) throw new Error("Vault is missing.");
    this.assertCurrent(epoch, this.persisted);
    const value = await decrypt(parseEnvelope(raw), key);
    this.assertCurrent(epoch, raw);
    assertWalletData(value);
    return value;
  }
  write(raw: string): Promise<void> {
    if (!this.key) return Promise.resolve(); // memory clearing on lock must not overwrite the vault
    assertWalletData(raw);
    const key = this.key,
      salt = this.salt,
      epoch = this.epoch;
    const next = this.queue.then(async () => {
      if (this.epoch !== epoch || !this.key) return;
      const expected = this.persisted;
      this.assertCurrent(epoch, expected);
      const e = await encrypt(raw, key, salt);
      if (this.epoch !== epoch || !this.key) return;
      this.assertCurrent(epoch, expected);
      const serialized = JSON.stringify(e);
      this.storage.setItem(VAULT_KEY, serialized);
      this.storage.removeItem(LEGACY_KEY);
      this.persisted = serialized;
      this.writeError = undefined;
    });
    this.queue = next.catch((error: unknown) => {
      this.writeError = error;
    });
    return next;
  }
  async flush() {
    await this.queue;
    if (this.writeError) {
      const e = this.writeError;
      this.writeError = undefined;
      throw e;
    }
  }
  lock() {
    this.epoch++;
    this.key = null;
    this.salt = "";
    this.persisted = null;
  }
  async export(): Promise<string> {
    await this.flush();
    const raw = this.storage.getItem(VAULT_KEY);
    if (!raw) throw new Error("Vault is missing.");
    parseEnvelope(raw);
    return raw;
  }
  async import(raw: string, password: string, validate?: (plaintext: string) => void) {
    this.assertInputPassword(password);
    const epoch = this.epoch;
    await this.flush();
    if (this.epoch !== epoch)
      throw new Error("The vault was locked or changed. Start the import again.");
    const expected = this.storage.getItem(VAULT_KEY);
    // Validate/decrypt first: failure leaves the existing wallet untouched.
    const e = parseEnvelope(raw);
    const key = await derive(password, unbase64(e.salt));
    const plaintext = await decrypt(e, key);
    assertWalletData(plaintext);
    validate?.(plaintext);
    this.assertCurrent(epoch, expected);
    const serialized = JSON.stringify(e);
    this.storage.setItem(VAULT_KEY, serialized);
    this.storage.removeItem(LEGACY_KEY);
    this.epoch++;
    this.key = key;
    this.salt = e.salt;
    this.persisted = serialized;
  }
  async changePassword(oldPassword: string, newPassword: string) {
    assertPassword(newPassword);
    this.assertInputPassword(oldPassword);
    if (!this.key) throw new Error("Unlock the vault first.");
    const epoch = this.epoch;
    await this.flush();
    this.assertCurrent(epoch, this.persisted);
    const expected = this.storage.getItem(VAULT_KEY);
    if (!expected) throw new Error("Vault is missing.");
    const existing = parseEnvelope(expected);
    const raw = await decrypt(existing, await derive(oldPassword, unbase64(existing.salt)));
    assertWalletData(raw);
    this.assertCurrent(epoch, expected);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await derive(newPassword, salt);
    const e = await encrypt(raw, key, base64(salt));
    this.assertCurrent(epoch, expected);
    const serialized = JSON.stringify(e);
    this.storage.setItem(VAULT_KEY, serialized);
    this.epoch++;
    this.key = key;
    this.salt = e.salt;
    this.persisted = serialized;
  }
  destroy() {
    this.lock();
    this.storage.removeItem(VAULT_KEY);
    this.storage.removeItem(LEGACY_KEY);
  }
}
