import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./prepare-android-signing.mjs", import.meta.url));
function run(t, signing = {}) {
  const root = mkdtempSync(join(tmpdir(), "cpay-signing-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "android"));
  const env = { ...process.env, RUNNER_TEMP: root, GITHUB_OUTPUT: join(root, "output") };
  for (const name of ["KEYSTORE_B64", "STORE_PASSWORD", "KEY_ALIAS", "KEY_PASSWORD", "PUBLISH"])
    delete env[name];
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    env: { ...env, ...signing },
    encoding: "utf8",
  });
  return { root, ...result };
}
test("signing CLI writes separate Java properties and an exact Actions output with wrapped base64", (t) => {
  const result = run(t, {
    KEYSTORE_B64: "AAEC\r\nAwQ=\n",
    STORE_PASSWORD: " secret\\path\n\tবাংলা",
    KEY_ALIAS: "CPay:🚀",
    KEY_PASSWORD: "a=b #!\r\f",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    readFileSync(join(result.root, "cpay-release.jks")),
    Buffer.from([0, 1, 2, 3, 4]),
  );
  assert.equal(readFileSync(join(result.root, "output"), "utf8"), "signed=true\n");
  const lines = readFileSync(join(result.root, "android/keystore.properties"), "ascii").split("\n");
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^storeFile=/);
  assert.equal(
    lines[1],
    "storePassword=\\ secret\\\\path\\n\\t\\u09ac\\u09be\\u0982\\u09b2\\u09be",
  );
  assert.equal(lines[2], "keyAlias=CPay\\:\\ud83d\\ude80");
  assert.equal(lines[3], "keyPassword=a\\=b\\ \\#\\!\\r\\f");
  assert.ok(!result.stdout.includes("secret"));
});
test("unsigned signing CLI produces no key material and a clean false output", (t) => {
  const result = run(t);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(result.root, "output"), "utf8"), "signed=false\n");
  assert.ok(!existsSync(join(result.root, "android/keystore.properties")));
  assert.ok(!existsSync(join(result.root, "cpay-release.jks")));
});
test("signing CLI rejects partial credentials, malformed base64 and publication without a key", (t) => {
  for (const env of [
    { KEY_ALIAS: "only-alias" },
    { PUBLISH: "true" },
    {
      KEYSTORE_B64: "not*base64",
      STORE_PASSWORD: "secret",
      KEY_ALIAS: "key",
      KEY_PASSWORD: "secret",
    },
  ]) {
    const result = run(t, env);
    assert.notEqual(result.status, 0);
    assert.ok(!existsSync(join(result.root, "output")));
    assert.ok(!existsSync(join(result.root, "android/keystore.properties")));
    assert.ok(!existsSync(join(result.root, "cpay-release.jks")));
    assert.ok(!result.stderr.includes("not*base64"));
  }
});
