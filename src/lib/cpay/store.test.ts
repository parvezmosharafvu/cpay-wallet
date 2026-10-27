import assert from "node:assert/strict";
import { test } from "node:test";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { activeMember, resetWalletMemory, sanitizeWalletData, useCpay } from "./store.ts";
import { walletAuthorization } from "./browser-vault.ts";
const phrase = "legal winner thank year wave sausage worth useful legal winner thank yellow";
test("live BIP39 wallet creation, network/account restore and duplicate recovery", async () => {
  resetWalletMemory();
  const created = await useCpay.getState().createLiveMember("Live wallet", undefined, "regtest", 2);
  assert.equal(created.ok, true);
  const member = activeMember(useCpay.getState())!;
  assert.equal(validateMnemonic(member.seed.join(" "), wordlist), true);
  assert.equal(member.mode, "live");
  assert.equal(member.network, "regtest");
  assert.equal(member.account, 2);
  const recovered = await useCpay
    .getState()
    .createLiveMember("Recovered", member.seed.join(" "), "regtest", 2);
  assert.equal(recovered.ok && recovered.created, false);
  assert.equal(useCpay.getState().members.length, 1);
  const imported = await useCpay.getState().restore(phrase);
  assert.equal(imported.ok, true);
  assert.equal(activeMember(useCpay.getState())?.mode, "live");
});
test("live wallets refuse every simulation mutation, including direct store calls", async () => {
  resetWalletMemory();
  await useCpay.getState().createLiveMember("Live", phrase);
  const s = useCpay.getState();
  for (const result of [
    s.faucet(),
    s.simulateDeposit(),
    s.simulateStable(100),
    s.buyBitcoin(1),
    s.convert("btc-usd", 1),
    s.issueToken("TEST", "Test", 1),
    s.lnurlWithdraw("lnurltest", 1),
    s.recordCash({ to: "test", payUsd: 1, outUsd: 1, asset: "USDC", chain: "Base" }),
  ])
    assert.equal(result.ok, false);
  assert.equal(useCpay.getState().payments.length, 0);
  assert.equal(activeMember(useCpay.getState())?.sats, 0);
  assert.equal(s.removeMember(activeMember(s)!.id).ok, false);
});
test("practice ledger rejects non-finite inputs without corrupting balances", async () => {
  resetWalletMemory();
  await useCpay.getState().createMember("Practice");
  useCpay.getState().faucet();
  const before = JSON.stringify(useCpay.getState().members);
  const s = useCpay.getState();
  for (const n of [NaN, Infinity, -Infinity]) {
    assert.equal(
      s.sendStable({ destination: "0x" + "1".repeat(40), cents: n, note: "" }).ok,
      false,
    );
    assert.equal(s.convert("btc-usd", n).ok, false);
    assert.equal(s.issueToken("TEST", "Test", n).ok, false);
    assert.equal(s.simulateStable(n).ok, false);
    assert.equal(s.lnurlWithdraw("lnurltest", n).ok, false);
  }
  assert.equal(JSON.stringify(useCpay.getState().members), before);
});
test("legacy passkey members migrate to explicit live metadata without changing words", () => {
  const migrated = sanitizeWalletData({
    members: [{ id: "a", name: "Old", seed: phrase.split(" ") }],
    sdkMnemonic: phrase,
    sdkNetwork: "mainnet",
    sdkAccount: 3,
    wipe: "untrusted",
  });
  assert.equal(migrated.members![0].mode, "live");
  assert.equal(migrated.members![0].network, "mainnet");
  assert.equal(migrated.members![0].account, 3);
  assert.equal("wipe" in migrated, false);
  assert.equal(migrated.priceLive, false);
});
test("memory erasure also clears advanced SDK mnemonic/network/account", () => {
  useCpay.getState().setSdkMnemonic(phrase);
  useCpay.getState().setSdkNetwork("mainnet");
  useCpay.getState().setSdkAccount(2);
  resetWalletMemory();
  assert.equal(useCpay.getState().sdkMnemonic, "");
  assert.equal(useCpay.getState().members.length, 0);
  assert.equal(useCpay.getState().sdkNetwork, "regtest");
  assert.equal(useCpay.getState().sdkAccount, 0);
});

test("malformed imported nested data and dangling wallet references fail before hydration", () => {
  const base = {
    members: [
      {
        id: "a",
        name: "Wallet",
        seed: phrase.split(" "),
        mode: "live",
        network: "regtest",
        account: 0,
      },
    ],
  };
  for (const bad of [
    { ...base, activeId: "missing" },
    { members: [{ ...base.members[0], network: "wrong" }] },
    { members: [{ ...base.members[0], account: -1 }] },
    { members: [{ ...base.members[0], sats: NaN }] },
    { ...base, payments: [{ memberId: "missing" }] },
    { ...base, contacts: [null] },
  ])
    assert.throws(() => sanitizeWalletData(bad));
});
test("older legacy BIP39 wallets remain protected even when global SDK seed changed", () => {
  const prior =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  const migrated = sanitizeWalletData({
    members: [{ id: "old", name: "Old", seed: prior.split(" ") }],
    sdkMnemonic: phrase,
  });
  assert.equal(migrated.members![0].mode, "live");
});

test("explicit practice recovery stays practice even when its words have a valid BIP39 checksum", async () => {
  resetWalletMemory();
  const practicePhrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  assert.equal(validateMnemonic(practicePhrase, wordlist), true);
  const restored = await useCpay.getState().restore(practicePhrase, "practice");
  assert.equal(restored.ok, true);
  const member = activeMember(useCpay.getState())!;
  assert.equal(member.mode, "practice");
  const hydrated = sanitizeWalletData(JSON.parse(JSON.stringify(useCpay.getState())));
  assert.equal(hydrated.members![0].mode, "practice");
  assert.equal(hydrated.members![0].seed.join(" "), practicePhrase);
});

test("wallet creation accepts 256-character names and rejects longer names before state changes", async () => {
  for (const live of [false, true]) {
    resetWalletMemory();
    const create = (name: string) => live
      ? useCpay.getState().createLiveMember(name, phrase)
      : useCpay.getState().createMember(name);
    assert.equal((await create("n".repeat(256))).ok, true);
    const before = JSON.stringify(useCpay.getState().members);
    assert.equal((await create("n".repeat(257))).ok, false);
    assert.equal(JSON.stringify(useCpay.getState().members), before);
    assert.doesNotThrow(() => sanitizeWalletData(JSON.parse(JSON.stringify(useCpay.getState()))));
  }
});

test("contact name bounds match persisted data without invalidating existing longer names", async () => {
  resetWalletMemory();
  await useCpay.getState().createMember("Practice");
  assert.equal(useCpay.getState().addContact("c".repeat(256), "person@example.com").ok, true);
  assert.equal(useCpay.getState().addContact("c".repeat(257), "other@example.com").ok, false);
  const snapshot = JSON.parse(JSON.stringify(useCpay.getState()));
  snapshot.members[0].name = "legacy wallet ".repeat(30);
  snapshot.contacts[0].name = "legacy contact ".repeat(30);
  const hydrated = sanitizeWalletData(snapshot);
  assert.equal(hydrated.members![0].name, snapshot.members[0].name);
  assert.equal(hydrated.contacts![0].name, snapshot.contacts[0].name);
  assert.equal(hydrated.members![0].seed.join(" "), snapshot.members[0].seed.join(" "));
});

test("wallet creation cannot finish after its vault unlock was revoked and replaced", async () => {
  resetWalletMemory();
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  try {
    walletAuthorization.unlock();
    const pending = useCpay.getState().createMember("Late callback");
    walletAuthorization.lock();
    walletAuthorization.unlock();
    await assert.rejects(pending, /locked or changed/);
    assert.equal(useCpay.getState().members.length, 0);
    walletAuthorization.lock();
    await assert.rejects(useCpay.getState().createLiveMember("Locked", phrase), /Unlock/);
    assert.throws(() => useCpay.getState().setSdkMnemonic(phrase), /Unlock/);
  } finally {
    walletAuthorization.lock();
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("advanced account and runtime network inputs cannot strand a persisted wallet", async () => {
  resetWalletMemory();
  const badNetwork = await useCpay.getState().createLiveMember("Invalid network", phrase, "wrong" as "regtest");
  assert.equal(badNetwork.ok, false);
  assert.equal(useCpay.getState().members.length, 0);
  useCpay.getState().setSdkAccount(2_147_483_647);
  assert.equal(useCpay.getState().sdkAccount, 2_147_483_647);
  for (const bad of [2_147_483_648, Number.MAX_SAFE_INTEGER, NaN, Infinity, -1]) {
    useCpay.getState().setSdkAccount(bad);
    assert.equal(useCpay.getState().sdkAccount, 2_147_483_647);
  }
  useCpay.getState().setSdkNetwork("wrong" as "regtest");
  assert.equal(useCpay.getState().sdkNetwork, "regtest");
  useCpay.getState().setSdkMnemonic("legal winner"); // An unfinished advanced editor draft is valid persisted text.
  assert.doesNotThrow(() => sanitizeWalletData(JSON.parse(JSON.stringify(useCpay.getState()))));
});

test("invalid price and oversized editable settings leave the previous valid snapshot intact", async () => {
  resetWalletMemory();
  await useCpay.getState().createMember("Practice");
  const s = useCpay.getState();
  s.setPrice(80_000, true);
  for (const bad of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    s.setPrice(bad, false);
    assert.equal(useCpay.getState().btcUsd, 80_000);
    assert.equal(useCpay.getState().priceLive, true);
  }
  s.setApiKey("test-key"); s.setAdIds("app", "unit"); s.setPrefill("address"); s.setSdkMnemonic("draft");
  const long = "x".repeat(65_537);
  s.setApiKey(long); s.setAdIds(long, "other"); s.setAdIds("other", long);
  s.setPrefill(long); s.setSdkMnemonic(long);
  const current = useCpay.getState();
  assert.equal(current.apiKey, "test-key"); assert.equal(current.admobAppId, "app");
  assert.equal(current.admobUnitId, "unit"); assert.equal(current.prefill, "address");
  assert.equal(current.sdkMnemonic, "draft");
  assert.doesNotThrow(() => sanitizeWalletData(JSON.parse(JSON.stringify(current))));
});
