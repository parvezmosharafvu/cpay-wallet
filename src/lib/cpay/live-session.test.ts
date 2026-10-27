import assert from "node:assert/strict";
import { test } from "node:test";
import { LiveSession, sessionIdentity, StaleSessionError } from "./live-session.ts";

const identity = (key: string) => ({ key, network: "mainnet" as const, account: 0 });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("session identity distinguishes recovery phrase, network and account without exposing the phrase", async () => {
  const first = await sessionIdentity({
    mnemonic: "  test   phrase ",
    network: "mainnet",
    account: 0,
  });
  const equivalent = await sessionIdentity({
    mnemonic: "test phrase",
    network: "mainnet",
    account: 0,
  });
  assert.deepEqual(first, equivalent);
  assert.match(first.key, /^[0-9a-f]{64}$/);
  for (const input of [
    { mnemonic: "another phrase", network: "mainnet" as const, account: 0 },
    { mnemonic: "test phrase", network: "regtest" as const, account: 0 },
    { mnemonic: "test phrase", network: "mainnet" as const, account: 1 },
  ])
    assert.notEqual((await sessionIdentity(input)).key, first.key);
  await assert.rejects(sessionIdentity({ mnemonic: "test", network: "mainnet", account: -1 }));
  await assert.rejects(sessionIdentity({ mnemonic: "test", network: "mainnet", account: 2 ** 32 }));
});

test("switching wallets immediately revokes the old signing SDK and serializes teardown", async () => {
  const events: string[] = [];
  const manager = new LiveSession<string>(async (sdk) => {
    events.push(`close:${sdk}`);
  });
  await manager.connect(identity("A"), async () => "A");
  const connecting = manager.connect(identity("B"), async () => {
    events.push("build:B");
    return "B";
  });
  assert.throws(() => manager.need(), /Connect the selected/);
  assert.equal(await connecting, "B");
  assert.deepEqual(events, ["close:A", "build:B"]);
  assert.equal(manager.current()?.identity.key, "B");
});

test("a locked vault cannot be reopened by an old in-flight build", async () => {
  const building = deferred<string>();
  const started = deferred<void>();
  const disposed: string[] = [];
  const manager = new LiveSession<string>(async (sdk) => {
    disposed.push(sdk);
  });
  const connecting = manager.connect(identity("A"), async () => {
    started.resolve();
    return building.promise;
  });
  await started.promise;
  const rejection = assert.rejects(connecting, StaleSessionError);
  const disconnecting = manager.disconnect();
  assert.equal(manager.current(), null);
  building.resolve("A");
  await Promise.all([rejection, disconnecting]);
  assert.deepEqual(disposed, ["A"]);
  assert.equal(manager.current(), null);
});

test("newest wallet request wins and equal pending requests share one connection", async () => {
  const a = deferred<string>();
  const started = deferred<void>();
  const manager = new LiveSession<string>(async () => undefined);
  const first = manager.connect(identity("A"), async () => {
    started.resolve();
    return a.promise;
  });
  assert.strictEqual(
    manager.connect(identity("A"), async () => "duplicate"),
    first,
  );
  await started.promise;
  const rejection = assert.rejects(first, StaleSessionError);
  const last = manager.connect(identity("B"), async () => "B");
  a.resolve("A");
  await rejection;
  assert.equal(await last, "B");
  assert.equal(manager.current()?.client, "B");
});

test("disconnect failure never leaves the SDK accessible and a later connection can recover", async () => {
  const manager = new LiveSession<string>(async () => {
    throw new Error("offline");
  });
  await manager.connect(identity("A"), async () => "A");
  const disconnecting = manager.disconnect();
  assert.throws(() => manager.need());
  await assert.rejects(disconnecting, /offline/);
  assert.equal(await manager.connect(identity("B"), async () => "B"), "B");
});
