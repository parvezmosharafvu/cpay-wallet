import assert from "node:assert/strict";
import { test } from "node:test";
import { EXPECTED_SIGNER, parseApkMetadata, verifiedSigner } from "./verify-android-apk.mjs";
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
