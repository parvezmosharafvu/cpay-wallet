import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchBtcPrice, isPriceFresh, PRICE_MAX_AGE_MS } from "./price.ts";

test("only a finite positive successful market quote is accepted", async () => {
  const good = await fetchBtcPrice({ fetcher: async () => new Response('{"bitcoin":{"usd":80000}}') });
  assert.equal(good.usd, 80_000);
  assert.ok(isPriceFresh(good.fetchedAt));
  for (const value of [0, -1, "80000", null]) {
    await assert.rejects(fetchBtcPrice({ fetcher: async () => Response.json({ bitcoin: { usd: value } }) }));
  }
  await assert.rejects(fetchBtcPrice({ fetcher: async () => new Response("rate limited", { status: 429 }) }));
});

test("persisted, future and expired quotes are not advertised as current", () => {
  assert.equal(isPriceFresh(0, 100), false);
  assert.equal(isPriceFresh(101, 100), false);
  assert.equal(isPriceFresh(1, PRICE_MAX_AGE_MS + 1), false);
  assert.equal(isPriceFresh(1, PRICE_MAX_AGE_MS), true);
});

test("a hung feed is aborted without replacing the last good quote", async () => {
  await assert.rejects(fetchBtcPrice({ timeoutMs: 5, fetcher: async (_url, options) => new Promise((_resolve, reject) => {
    const keepAlive = setTimeout(() => reject(new Error("timeout did not abort the feed")), 500);
    options?.signal?.addEventListener("abort", () => { clearTimeout(keepAlive); reject(options.signal?.reason); });
  }) }));
});
