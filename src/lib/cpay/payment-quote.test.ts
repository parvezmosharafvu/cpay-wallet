import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrepareSendPaymentResponse } from "@breeztech/breez-sdk-spark/web";
import {
  QuoteBook,
  normalizePayment,
  quotedFee,
  safeSats,
  type LiveQuote,
  type LivePayment,
} from "./payment-quote.ts";

const quote = (patch: Partial<LiveQuote> = {}): LiveQuote => ({
  id: "quote-one",
  sessionKey: "wallet-A",
  destination: "recipient",
  amountSats: 100,
  feeSats: 3,
  totalSats: 103,
  network: "mainnet",
  expiresAt: 2000,
  speed: "medium",
  ...patch,
});
const result: LivePayment = {
  id: "sdk-id",
  status: "pending",
  amountSats: 100,
  feeSats: 3,
  timestamp: 1000,
  method: "lightning",
  direction: "out",
};

test("quote retries share one payment operation, including an uncertain network error", async () => {
  const book = new QuoteBook<string>(
    (key) => key === "wallet-A",
    () => 1000,
  );
  book.add(quote(), "private SDK prepare response");
  let calls = 0;
  const send = async (prepared: string, approved: LiveQuote) => {
    ++calls;
    assert.equal(prepared, "private SDK prepare response");
    assert.equal(approved.destination, "recipient");
    return result;
  };
  const one = book.execute("quote-one", send);
  const two = book.execute("quote-one", send);
  assert.strictEqual(one, two);
  assert.equal((await one).status, "pending");
  assert.equal(calls, 1);
  const uncertain = new QuoteBook<null>(
    () => true,
    () => 1000,
  );
  uncertain.add(quote(), null);
  const fail = async () => {
    ++calls;
    throw new Error("Connection lost after submission");
  };
  await assert.rejects(uncertain.execute("quote-one", fail), /Connection lost/);
  await assert.rejects(uncertain.execute("quote-one", fail), /Connection lost/);
  assert.equal(calls, 2);
});

test("wallet changes, edits, and expiry prevent spending an unapproved quote", async () => {
  let current = "wallet-A";
  let now = 1000;
  const book = new QuoteBook<string>(
    (key) => key === current,
    () => now,
  );
  const stored = book.add(quote(), "response");
  assert.ok(Object.isFrozen(stored));
  current = "wallet-B";
  await assert.rejects(
    book.execute(stored.id, async () => result),
    /wallet changed/,
  );
  current = "wallet-A";
  now = 2000;
  await assert.rejects(
    book.execute(stored.id, async () => result),
    /expired/,
  );
  const generation = book.generation();
  book.invalidate();
  assert.throws(
    () => book.add(quote(), "stale asynchronous preparation", generation),
    /details changed/,
  );
  await assert.rejects(
    book.execute(stored.id, async () => result),
    /cleared/,
  );
});

test("on-chain approval includes both SDK fee components at the selected speed", () => {
  const response = {
    paymentMethod: {
      type: "bitcoinAddress",
      feeQuote: {
        speedFast: { userFeeSat: 10, l1BroadcastFeeSat: 20 },
        speedMedium: { userFeeSat: 5, l1BroadcastFeeSat: 10 },
        speedSlow: { userFeeSat: 1, l1BroadcastFeeSat: 2 },
      },
    },
  } as PrepareSendPaymentResponse;
  assert.equal(quotedFee(response, "fast"), 30);
  assert.equal(quotedFee(response, "medium"), 15);
  assert.equal(quotedFee(response, "slow"), 3);
});

test("pending/failed SDK payments retain real identifiers and status, with safe sats conversion", () => {
  const normalized = normalizePayment({
    id: "real-id",
    status: "failed",
    amount: 100n,
    fees: 2n,
    timestamp: 123,
    method: "lightning",
    paymentType: "send",
  });
  assert.equal(normalized.id, "real-id");
  assert.equal(normalized.status, "failed");
  assert.equal(normalized.timestamp, 123000);
  assert.throws(() => safeSats(9007199254740993n), /range/);
  assert.throws(() => safeSats("1.5"), /whole/);
  assert.throws(() => safeSats(-1), /range/);
});
