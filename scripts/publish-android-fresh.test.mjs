import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FRESH_TAG,
  RELEASE_ASSETS,
  publicationDecision,
  matchingRelease,
  readRelease,
  remoteRefs,
  releaseResponse,
  assertFreshMetadata,
  assertAssetDigests,
} from "./publish-android-fresh.mjs";

const sha = "a".repeat(40);
const other = "b".repeat(40);
const draft = { id: 42, tag_name: FRESH_TAG, draft: true, target_commitish: sha };
const state = { sourceSha: sha, mainSha: sha };

test("fresh publication creates only when no release exists and main matches", () => {
  assert.equal(publicationDecision(state), "create-draft");
  assert.equal(publicationDecision({ ...state, tagSha: sha }), "create-draft");
});
test("a failed upload can safely resume the existing same-commit draft", () => {
  assert.equal(publicationDecision({ ...state, release: draft }), "resume-draft");
  assert.equal(publicationDecision({ ...state, release: draft, tagSha: sha }), "resume-draft");
});
test("published releases and unrelated drafts cannot be overwritten", () => {
  assert.throws(
    () => publicationDecision({ ...state, release: { ...draft, draft: false } }),
    /already published/,
  );
  assert.throws(
    () => publicationDecision({ ...state, release: { ...draft, target_commitish: other } }),
    /different commit/,
  );
  assert.throws(
    () => publicationDecision({ ...state, release: { ...draft, target_commitish: "main" } }),
    /different commit/,
  );
  assert.throws(
    () => publicationDecision({ ...state, release: { ...draft, id: null } }),
    /identity/,
  );
  assert.throws(
    () => publicationDecision({ ...state, release: { ...draft, tag_name: "another-release" } }),
    /tag/,
  );
});
test("main advancement and tag mismatches block create, resume and final publication", () => {
  for (const release of [null, draft]) {
    assert.throws(() => publicationDecision({ ...state, mainSha: other, release }), /main/);
    assert.throws(() => publicationDecision({ ...state, mainSha: null, release }), /main/);
    assert.throws(() => publicationDecision({ ...state, tagSha: other, release }), /tag/);
  }
  assert.throws(() => publicationDecision({ ...state, sourceSha: "main" }), /GITHUB_SHA/);
});
test("annotated tags use their peeled commit and lightweight tags use their direct commit", () => {
  assert.deepEqual(
    remoteRefs(
      `${sha}\trefs/heads/main\n${other}\trefs/tags/${FRESH_TAG}\n${sha}\trefs/tags/${FRESH_TAG}^{}\n`,
    ),
    { mainSha: sha, tagSha: sha },
  );
  assert.deepEqual(remoteRefs(`${sha}\trefs/heads/main\n${sha}\trefs/tags/${FRESH_TAG}\n`), {
    mainSha: sha,
    tagSha: sha,
  });
  assert.deepEqual(remoteRefs(`${sha}\trefs/heads/main\n`), { mainSha: sha, tagSha: null });
  assert.throws(() => remoteRefs(`${sha}\trefs/tags/${FRESH_TAG}^{}\n`), /peeled/);
  assert.throws(
    () => remoteRefs(`${sha}\trefs/heads/main\n${other}\trefs/heads/main`),
    /ambiguous/,
  );
});
test("only GitHub HTTP404 means the release does not exist", () => {
  assert.equal(
    releaseResponse(
      'HTTP/2.0 404 Not Found\r\nContent-Type: application/json\r\n\r\n{"message":"Not Found"}',
      1,
    ),
    null,
  );
  assert.deepEqual(
    releaseResponse(
      `HTTP/2.0 200 OK\nContent-Type: application/json\n\n${JSON.stringify(draft)}`,
      0,
    ),
    draft,
  );
  for (const code of [401, 403, 429, 500])
    assert.throws(
      () => releaseResponse(`HTTP/2.0 ${code} Error\nContent-Type: application/json\n\n{}`, 1),
      /failed/,
    );
  assert.throws(() => releaseResponse("connection timed out", 1), /HTTP status/);
  assert.throws(
    () => releaseResponse("HTTP/2.0 200 OK\nContent-Type: application/json\n\n{}", 1),
    /failed/,
  );
});
test("fresh metadata enforces separate identity, signature, installability and source provenance", () => {
  const policy = {
    package: "technology.cpay.wallet.fresh",
    versionCode: 6,
    versionName: "1.5",
    signerSha256: "C".repeat(64),
  };
  const good = {
    ...policy,
    signed: true,
    installable: true,
    installableUpdate: false,
    installation: "fresh",
    sourceCommit: sha,
  };
  assert.doesNotThrow(() => assertFreshMetadata(good, policy, sha));
  for (const bad of [
    { ...good, signed: false },
    { ...good, installableUpdate: true },
    { ...good, sourceCommit: other },
    { ...good, package: "technology.cpay.wallet" },
    { ...good, signerSha256: "D".repeat(64) },
  ])
    assert.throws(() => assertFreshMetadata(bad, policy, sha));
});
test("remote APK, checksum and provenance bytes must all match before draft becomes public", () => {
  const expected = Object.fromEntries(
    RELEASE_ASSETS.map((name, index) => [name, String(index + 1).repeat(64)]),
  );
  assert.doesNotThrow(() => assertAssetDigests(expected, { ...expected }));
  for (const name of RELEASE_ASSETS) {
    assert.throws(
      () => assertAssetDigests(expected, { ...expected, [name]: "0".repeat(64) }),
      new RegExp(name.replaceAll(".", "\\.")),
    );
    const missing = { ...expected };
    delete missing[name];
    assert.throws(() => assertAssetDigests(expected, missing));
  }
});

test("authenticated release-list JSON accepts arrays and inaccessible collections fail closed", () => {
  const body = [draft, { id: 7, tag_name: "v1.4", draft: false }];
  assert.deepEqual(
    releaseResponse(
      `HTTP/2.0 200 OK\nContent-Type: application/json\n\n${JSON.stringify(body)}`,
      0,
    ),
    body,
  );
  assert.throws(() => readRelease("owner/repo", () => null), /inaccessible/);
  assert.throws(() => readRelease("owner/repo", () => ({ message: "Not Found" })), /invalid/);
});

test("release selection finds matching drafts across pages, ignores prior public releases and rejects duplicates", () => {
  const previous = { id: 1, tag_name: "v1.4", draft: false };
  assert.equal(matchingRelease([[previous], [draft]]), draft);
  assert.equal(matchingRelease([[previous], []]), null);
  assert.throws(() => matchingRelease([[draft], [{ ...draft, id: 99 }]]), /Multiple releases/);
  assert.throws(() => matchingRelease([[{ ...draft, id: "42" }]]), /numeric identity/);
});

test("actual readRelease wiring paginates authenticated lists then reads the draft by numeric ID", () => {
  const calls = [];
  const previous = Array.from({ length: 100 }, (_, i) => ({
    id: i + 100,
    tag_name: `v0.${i}`,
    draft: false,
  }));
  const result = readRelease("owner/repo", (endpoint) => {
    calls.push(endpoint);
    if (endpoint === "repos/owner/repo/releases?per_page=100&page=1") return previous;
    if (endpoint === "repos/owner/repo/releases?per_page=100&page=2") return [draft];
    if (endpoint === "repos/owner/repo/releases/42") return { ...draft, assets: [] };
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  });
  assert.deepEqual(result, { ...draft, assets: [] });
  assert.deepEqual(calls, [
    "repos/owner/repo/releases?per_page=100&page=1",
    "repos/owner/repo/releases?per_page=100&page=2",
    "repos/owner/repo/releases/42",
  ]);
  assert.equal(
    calls.some((endpoint) => endpoint.includes("/tags/")),
    false,
  );
});

test("readRelease returns absence only after all list pages and rejects an inaccessible draft snapshot", () => {
  const previous = Array.from({ length: 100 }, (_, i) => ({
    id: i + 100,
    tag_name: `old-${i}`,
    draft: false,
  }));
  const calls = [];
  assert.equal(
    readRelease("owner/repo", (endpoint) => {
      calls.push(endpoint);
      return endpoint.endsWith("page=1") ? previous : [];
    }),
    null,
  );
  assert.equal(calls.length, 2);
  assert.throws(
    () => readRelease("owner/repo", (endpoint) => (endpoint.includes("?") ? [draft] : null)),
    /disappeared/,
  );
  assert.throws(
    () =>
      readRelease("owner/repo", (endpoint) =>
        endpoint.includes("?") ? [draft] : { ...draft, id: 99 },
      ),
    /changed identity/,
  );
});
