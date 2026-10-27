import assert from "node:assert/strict";
import { test } from "node:test";
import { consentAllowsAds, resolveAdsConfig } from "./ads-config.ts";

test("production advertisements require explicit build opt-in and a real banner unit", () => {
  assert.equal(resolveAdsConfig({ production: true, platform: "android" }), null);
  assert.equal(resolveAdsConfig({ production: true, platform: "android", unitId: "ca-app-pub-3940256099942544/6300978111" }), null);
  assert.equal(resolveAdsConfig({ production: true, platform: "web", unitId: "ca-app-pub-1234567890123456/1234567890" }), null);
  assert.deepEqual(resolveAdsConfig({ production: true, platform: "ios", unitId: "ca-app-pub-1234567890123456/1234567890" }), { adId: "ca-app-pub-1234567890123456/1234567890", isTesting: false });
  assert.equal(resolveAdsConfig({ production: false, platform: "ios" })?.isTesting, true);
});

test("unknown or required consent never permits requesting a banner", () => {
  assert.equal(consentAllowsAds("UNKNOWN", true), false);
  assert.equal(consentAllowsAds("REQUIRED", true), false);
  assert.equal(consentAllowsAds("OBTAINED", false), false);
  assert.equal(consentAllowsAds("OBTAINED", true), true);
  assert.equal(consentAllowsAds("NOT_REQUIRED", true), true);
});
