const MAX_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();

function base64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function bytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new Error("Invalid encrypted SDK cache encoding.");
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

/** Independent from the public wallet/session digest; the secret is never stored. */
export async function deriveSdkCacheKey(secret: Uint8Array, namespace: string): Promise<CryptoKey> {
  if (secret.length < 16)
    throw new Error("SDK cache encryption requires a high-entropy wallet secret.");
  const material = await crypto.subtle.importKey("raw", new Uint8Array(secret), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("CPay SDK secret cache encryption v1"),
      info: encoder.encode(namespace),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSdkCache(
  value: string,
  key: CryptoKey,
  context: string,
): Promise<string> {
  const plaintext = encoder.encode(value);
  if (plaintext.length > MAX_BYTES) throw new Error("SDK cache entry is too large.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
    key,
    plaintext,
  );
  return JSON.stringify({
    version: 1,
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
  });
}

export async function decryptSdkCache(
  raw: string,
  key: CryptoKey,
  context: string,
): Promise<string> {
  if (raw.length > MAX_BYTES * 2) throw new Error("SDK cache entry is too large.");
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") throw new Error();
    const record = value as { version?: unknown; iv?: unknown; ciphertext?: unknown };
    if (
      record.version !== 1 ||
      typeof record.iv !== "string" ||
      typeof record.ciphertext !== "string"
    )
      throw new Error();
    const iv = bytes(record.iv),
      ciphertext = bytes(record.ciphertext);
    if (iv.length !== 12 || ciphertext.length < 16 || ciphertext.length > MAX_BYTES + 16)
      throw new Error();
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
      key,
      ciphertext,
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  } catch {
    throw new Error(
      "The encrypted SDK cache is damaged or belongs to another wallet. Recover the wallet in a fresh browser profile; do not overwrite its recovery phrase.",
    );
  }
}
