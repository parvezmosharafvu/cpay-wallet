import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXPECTED_SIGNER,
  FRESH_RELEASE,
  parseApkMetadata,
  verifiedSigner,
} from "./verify-android-apk.mjs";
test("APK verifier accepts current package/version and rejects stale or different apps", () => {
  const good =
    "package: name='technology.cpay.wallet' versionCode='6' versionName='1.5' platformBuildVersionName='16'";
  assert.equal(parseApkMetadata(good).versionCode, 6);
  for (const bad of [
    good.replace("'6'", "'5'"),
    good.replace("'1.5'", "'1.4'"),
    good.replace("technology.cpay.wallet", "example.other"),
    "",
  ])
    assert.throws(() => parseApkMetadata(bad));
});
test("fresh APK is a separate labeled app with the original launcher class", () => {
  const fresh = `package: name='technology.cpay.wallet.fresh' versionCode='6' versionName='1.5'
application-label:'CPay 1.5'
launchable-activity: name='technology.cpay.wallet.MainActivity' label='CPay 1.5'`;
  assert.equal(parseApkMetadata(fresh, FRESH_RELEASE).package, "technology.cpay.wallet.fresh");
  assert.throws(() => parseApkMetadata(fresh));
  for (const bad of [
    fresh.replace("wallet.fresh'", "wallet'"),
    fresh.replace("'6'", "'5'"),
    fresh.replace("application-label:'CPay 1.5'", "application-label:'CPay'"),
    fresh.replace("wallet.MainActivity", "wallet.fresh.MainActivity"),
  ])
    assert.throws(() => parseApkMetadata(bad, FRESH_RELEASE));
});
test("original and fresh signing policies cannot be substituted for each other", () => {
  const oldSignature = `Signer #1 certificate SHA-256 digest: ${EXPECTED_SIGNER}`;
  const freshSignature = `Signer #1 certificate SHA-256 digest: ${FRESH_RELEASE.signerSha256}`;
  assert.notEqual(FRESH_RELEASE.signerSha256, EXPECTED_SIGNER);
  assert.equal(
    verifiedSigner(freshSignature, FRESH_RELEASE.signerSha256),
    FRESH_RELEASE.signerSha256,
  );
  assert.throws(() => verifiedSigner(freshSignature));
  assert.throws(() => verifiedSigner(oldSignature, FRESH_RELEASE.signerSha256));
});
test("APK verifier rejects unsigned, unexpected, or multiple signing certificates", () => {
  assert.equal(
    verifiedSigner(`Signer #1 certificate SHA-256 digest: ${EXPECTED_SIGNER.toLowerCase()}`),
    EXPECTED_SIGNER,
  );
  assert.throws(() => verifiedSigner(""));
  assert.throws(() => verifiedSigner(`Signer #1 certificate SHA-256 digest: ${"0".repeat(64)}`));
  assert.throws(() =>
    verifiedSigner(
      `Signer #1 certificate SHA-256 digest: ${EXPECTED_SIGNER}\nSigner #2 certificate SHA-256 digest: ${EXPECTED_SIGNER}`,
    ),
  );
});
