import assert from "node:assert/strict";
import { test } from "node:test";
import { WalletAuthorization } from "./wallet-authorization.ts";

test("a locked vault cannot issue a signing capability", () => {
  const auth = new WalletAuthorization();
  assert.throws(() => auth.capture(), /Unlock/);
  auth.unlock();
  const ticket = auth.capture();
  auth.assert(ticket);
  auth.lock();
  assert.throws(() => auth.assert(ticket), /locked/);
});
test("unlocking again never revives an earlier async operation", async () => {
  const auth = new WalletAuthorization();
  auth.unlock();
  const ticket = auth.capture();
  let resume!: () => void;
  const delayed = new Promise<void>((resolve) => {
    resume = resolve;
  });
  let connected = false;
  const work = (async () => {
    await delayed;
    auth.assert(ticket);
    connected = true;
  })();
  auth.lock();
  auth.unlock();
  resume();
  await assert.rejects(work, /locked or changed/);
  assert.equal(connected, false);
  auth.assert(auth.capture());
});
