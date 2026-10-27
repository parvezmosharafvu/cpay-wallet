#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_SIGNER = "79BB30EFCD41E2035FD09E3E84E3B21A1DBCD63A3B4DC08C2541CD15F223AE3C";
export function parseApkMetadata(badging) {
  const row = badging.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m);
  if (!row) throw new Error("APK package metadata is missing.");
  const metadata = { package: row[1], versionCode: Number(row[2]), versionName: row[3] };
  if (
    metadata.package !== "technology.cpay.wallet" ||
    metadata.versionCode !== 6 ||
    metadata.versionName !== "1.5"
  )
    throw new Error("APK is not the expected CPay 1.5 / code 6 update.");
  return metadata;
}
export function verifiedSigner(output) {
  const rows = [...output.matchAll(/^Signer #\d+ certificate SHA-256 digest: (.+)$/gm)];
  if (rows.length !== 1 || rows[0][1].replaceAll(":", "").trim().toUpperCase() !== EXPECTED_SIGNER)
    throw new Error(
      "Signing certificate does not match the existing CPay 1.4 release. Do not publish this APK as an update.",
    );
  return EXPECTED_SIGNER;
}
function main() {
  const apk = resolve(process.argv[2] || "");
  if (!process.argv[2] || !existsSync(apk)) throw new Error("Provide the built APK path.");
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error("ANDROID_HOME is required.");
  const tools = join(sdk, "build-tools", "36.0.0");
  const metadata = parseApkMetadata(
    execFileSync(join(tools, "aapt"), ["dump", "badging", apk], { encoding: "utf8" }),
  );
  const mustBeSigned = process.env.APK_SIGNED === "true";
  let signer = null;
  if (mustBeSigned)
    signer = verifiedSigner(
      execFileSync(join(tools, "apksigner"), ["verify", "--verbose", "--print-certs", apk], {
        encoding: "utf8",
      }),
    );
  const assetCheck = `import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\njs=[n for n in z.namelist() if n.startswith('assets/public/') and n.endswith('.js')]\nassert js, 'APK has no mobile JavaScript bundle'\nassert any(b'CPay encrypted wallet vault v1' in z.read(n) for n in js), 'APK contains stale wallet code: encrypted vault marker absent'\nassert 'assets/public/index.html' in z.namelist(), 'APK mobile entry is missing'\n`;
  execFileSync("python3", ["-c", assetCheck, apk], { stdio: "inherit" });
  const report = {
    ...metadata,
    signed: mustBeSigned,
    signerSha256: signer,
    sourceCommit: process.env.GITHUB_SHA || "local",
    installableUpdate: mustBeSigned,
    note: mustBeSigned
      ? "Certificate matches CPay 1.4; physical-device validation still required."
      : "UNSIGNED: build artifact only. Not installable; original signing key is required.",
  };
  writeFileSync(join(dirname(apk), "apk-metadata.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
