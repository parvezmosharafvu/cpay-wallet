import assert from "node:assert/strict";
import { test } from "node:test";
import { LEGACY_KEY, VAULT_KEY, WalletVault, parseEnvelope } from "./vault.ts";
const password = "correct horse vault password";
const phrase = "legal winner thank year wave sausage worth useful legal winner thank yellow";
const snapshot = JSON.stringify({
  version: 0,
  state: {
    members: [{ id: "a", name: "Test", seed: phrase.split(" ") }],
    sdkMnemonic: phrase,
    apiKey: "test-api-secret",
  },
});
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
}
test("migration removes plaintext only after authenticated encrypted vault is saved", async () => {
  const disk = storage();
  disk.setItem(LEGACY_KEY, snapshot);
  const v = new WalletVault(disk);
  await v.create(password);
  assert.equal(disk.getItem(LEGACY_KEY), null);
  const raw = disk.getItem(VAULT_KEY)!;
  assert.equal(raw.includes(phrase), false);
  assert.equal(raw.includes("test-api-secret"), false);
  assert.equal(await v.read(), snapshot);
  v.lock();
  assert.equal(await v.read(), null);
  await v.unlock(password);
  assert.equal(await v.read(), snapshot);
});
test("failed durable migration retains the original recovery data", async () => {
  const disk = storage();
  disk.setItem(LEGACY_KEY, snapshot);
  const broken = {
    ...disk,
    setItem: () => {
      throw new Error("quota");
    },
  };
  await assert.rejects(new WalletVault(broken).create(password), /quota/);
  assert.equal(disk.getItem(LEGACY_KEY), snapshot);
  assert.equal(disk.getItem(VAULT_KEY), null);
});
test("wrong password and modified ciphertext fail closed without destroying the backup", async () => {
  const disk = storage();
  const v = new WalletVault(disk);
  await v.create(password);
  await v.write(snapshot);
  const backup = await v.export();
  v.lock();
  await assert.rejects(v.unlock("a wrong password"), /Wrong password/);
  assert.equal(v.isUnlocked(), false);
  const e = parseEnvelope(backup);
  e.ciphertext = (e.ciphertext[0] === "A" ? "B" : "A") + e.ciphertext.slice(1);
  await assert.rejects(v.import(JSON.stringify(e), password), /damaged/);
  assert.equal(disk.getItem(VAULT_KEY), backup);
});
test("portable backup decrypts on a fresh device and rejects unsupported parameters", async () => {
  const a = new WalletVault(storage());
  await a.create(password);
  await a.write(snapshot);
  const b = new WalletVault(storage());
  await b.import(await a.export(), password);
  assert.equal(await b.read(), snapshot);
  const e = parseEnvelope(await a.export());
  e.iterations = 1;
  assert.throws(() => parseEnvelope(JSON.stringify(e)), /Unsupported/);
});
test("queued writes preserve newest state and use a fresh IV", async () => {
  const disk = storage();
  const v = new WalletVault(disk);
  await v.create(password);
  const before = parseEnvelope(await v.export()).iv;
  const next = JSON.stringify({ version: 0, state: { members: [], sdkMnemonic: "latest" } });
  await Promise.all([v.write(snapshot), v.write(next)]);
  await v.flush();
  assert.equal(await v.read(), next);
  assert.notEqual(parseEnvelope(await v.export()).iv, before);
});
test("erasure cancels queued writes so secrets cannot reappear", async () => {
  const disk = storage();
  const v = new WalletVault(disk);
  await v.create(password);
  const write = v.write(snapshot);
  v.destroy();
  await write;
  assert.equal(disk.getItem(VAULT_KEY), null);
  assert.equal(disk.getItem(LEGACY_KEY), null);
  assert.equal(v.isUnlocked(), false);
});
test("password rotation retains data; only the new password unlocks the current vault", async () => {
  const v = new WalletVault(storage());
  await v.create(password);
  await v.write(snapshot);
  await v.changePassword(password, "another strong vault password");
  v.lock();
  await assert.rejects(v.unlock(password), /Wrong password/);
  await v.unlock("another strong vault password");
  assert.equal(await v.read(), snapshot);
});
test("short passwords never replace an existing backup", async () => {
  const v = new WalletVault(storage());
  await assert.rejects(v.create("short"), /12 characters/);
  assert.equal(v.exists(), false);
});

test("lock during creation or unlock cannot revive keys after the lock", async () => {
  const legacy = storage();
  legacy.setItem(LEGACY_KEY, snapshot);
  const creating = new WalletVault(legacy);
  const create = creating.create(password);
  creating.lock();
  await assert.rejects(create, /locked or changed/);
  assert.equal(creating.exists(), false);
  assert.equal(legacy.getItem(LEGACY_KEY), snapshot);
  const v = new WalletVault(storage());
  await v.create(password);
  v.lock();
  const unlock = v.unlock(password);
  v.lock();
  await assert.rejects(unlock, /locked or changed/);
  assert.equal(v.isUnlocked(), false);
});

test("an in-flight read never returns plaintext after locking", async () => {
  const v = new WalletVault(storage());
  await v.create(password);
  await v.write(snapshot);
  const read = v.read();
  v.lock();
  await assert.rejects(read, /locked or changed/);
  assert.equal(await v.read(), null);
});

test("another tab's replacement is never overwritten by pending old writes or unlocked as old state", async () => {
  const disk = storage(),
    v = new WalletVault(disk);
  await v.create(password);
  await v.write(snapshot);
  const replacement = new WalletVault(storage());
  await replacement.create(password);
  const next = await replacement.export();
  const write = v.write(snapshot);
  disk.setItem(VAULT_KEY, next);
  await assert.rejects(write, /locked or changed/);
  assert.equal(disk.getItem(VAULT_KEY), next);
  v.lock();
  const unlock = v.unlock(password);
  disk.setItem(VAULT_KEY, `${next} `); // Still valid JSON, but a distinct concurrent revision.
  await assert.rejects(unlock, /locked or changed/);
  assert.equal(v.isUnlocked(), false);
});

test("import and password rotation cannot finish after an intervening lock", async () => {
  const disk = storage(),
    v = new WalletVault(disk);
  await v.create(password);
  await v.write(snapshot);
  const before = await v.export();
  const imported = v.import(before, password);
  v.lock();
  await assert.rejects(imported, /locked or changed/);
  assert.equal(v.isUnlocked(), false);
  assert.equal(disk.getItem(VAULT_KEY), before);
  await v.unlock(password);
  const rotated = v.changePassword(password, "another valid long password");
  await new Promise((resolve) => setTimeout(resolve, 0));
  v.lock();
  await assert.rejects(rotated, /locked or changed/);
  assert.equal(v.isUnlocked(), false);
  assert.equal(disk.getItem(VAULT_KEY), before);
});

test("backup schema validation runs before replacing the existing vault", async () => {
  const v = new WalletVault(storage());
  await v.create(password);
  await v.write(snapshot);
  const before = await v.export();
  await assert.rejects(
    v.import(before, password, () => {
      throw new Error("invalid member schema");
    }),
    /invalid member/,
  );
  assert.equal(await v.export(), before);
  assert.equal(await v.read(), snapshot);
});
