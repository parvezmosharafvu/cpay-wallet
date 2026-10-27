import assert from "node:assert/strict";
import { test } from "node:test";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { activeMember, resetWalletMemory, sanitizeWalletData, useCpay } from "./store.ts";
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
