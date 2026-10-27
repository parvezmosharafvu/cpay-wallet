import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptSdkCache, deriveSdkCacheKey, encryptSdkCache } from "./sdk-cache.ts";

test("SDK secret cache encrypts at rest, round trips, and uses a fresh nonce", async () => {
  const secret = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveSdkCacheKey(secret, "wallet-A");
  assert.equal(key.extractable, false);
  const raw = await encryptSdkCache("secret session credential", key, "wallet-A/cache-name");
  assert.equal(raw.includes("secret session credential"), false);
  assert.equal(await decryptSdkCache(raw, key, "wallet-A/cache-name"), "secret session credential");
  assert.notEqual(
    raw,
    await encryptSdkCache("secret session credential", key, "wallet-A/cache-name"),
  );
});

test("cache tampering, wrong wallet secret, swapped keys and plaintext fail closed", async () => {
  const key = await deriveSdkCacheKey(new Uint8Array(16).fill(1), "wallet-A");
  const wrong = await deriveSdkCacheKey(new Uint8Array(16).fill(2), "wallet-A");
  const raw = await encryptSdkCache("secret", key, "cache-one");
  await assert.rejects(decryptSdkCache(raw, wrong, "cache-one"), /damaged/);
  await assert.rejects(decryptSdkCache(raw, key, "cache-two"), /damaged/);
  const changed = JSON.parse(raw) as { ciphertext: string };
  changed.ciphertext = `${changed.ciphertext[0] === "A" ? "B" : "A"}${changed.ciphertext.slice(1)}`;
  await assert.rejects(decryptSdkCache(JSON.stringify(changed), key, "cache-one"), /damaged/);
  await assert.rejects(decryptSdkCache("legacy plaintext", key, "cache-one"), /damaged/);
  await assert.rejects(deriveSdkCacheKey(new Uint8Array(8), "wallet-A"), /high-entropy/);
});
