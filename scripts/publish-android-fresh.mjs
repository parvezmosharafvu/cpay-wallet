#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FRESH_TAG = "v1.5.0-android-fresh";
export const RELEASE_ASSETS = Object.freeze([
  "CPay-1.5.apk",
  "SHA256SUMS.txt",
  "apk-metadata.json",
]);
const SHA = /^[0-9a-f]{40}$/;

/** Publication may recover a matching draft, never replace a public release or another commit. */
export function publicationDecision({ sourceSha, mainSha, tagSha = null, release = null }) {
  if (!SHA.test(sourceSha ?? "")) throw new Error("A full lowercase GITHUB_SHA is required.");
  if (mainSha !== sourceSha)
    throw new Error("Remote main advanced or differs from this build. Rebuild current main.");
  if (tagSha !== null && tagSha !== sourceSha)
    throw new Error("The release tag points to a different source commit.");
  if (release === null) return "create-draft";
  if (release.tag_name !== FRESH_TAG) throw new Error("GitHub returned an unexpected release tag.");
  if (release.draft !== true)
    throw new Error("The release is already published; public assets must not be overwritten.");
  if (release.target_commitish !== sourceSha)
    throw new Error("The existing draft belongs to a different commit; inspect it manually.");
  if (!Number.isSafeInteger(release.id) || release.id <= 0)
    throw new Error("The existing draft has no valid release identity.");
  return "resume-draft";
}

/** Annotated tags must be compared using their peeled commit, not their tag-object SHA. */
export function remoteRefs(output) {
  const refs = new Map();
  for (const line of output.trim().split(/\r?\n/)) {
    if (!line) continue;
    const match = line.match(/^([0-9a-f]{40})\s+(refs\/.+)$/);
    if (!match || refs.has(match[2])) throw new Error("Remote refs are malformed or ambiguous.");
    refs.set(match[2], match[1]);
  }
  const direct = refs.get(`refs/tags/${FRESH_TAG}`) ?? null;
  const peeled = refs.get(`refs/tags/${FRESH_TAG}^{}`) ?? null;
  if (peeled && !direct)
    throw new Error("The remote returned a peeled tag without its tag reference.");
  return { mainSha: refs.get("refs/heads/main") ?? null, tagSha: peeled ?? direct };
}

/** Parse authenticated API JSON. Callers must reject a 404 where an accessible collection/id is required. */
export function releaseResponse(output, exitCode, expectedStatus = 200) {
  const responses = [...output.matchAll(/^HTTP\/\S+\s+(\d{3})[^\r\n]*\r?\n/gm)];
  const response = responses.at(-1);
  if (!response)
    throw new Error(
      "GitHub release lookup returned no HTTP status; do not assume the release is absent.",
    );
  const status = Number(response[1]);
  if (status === 404) return null;
  if (status !== expectedStatus || exitCode !== 0)
    throw new Error(`GitHub release lookup failed (HTTP ${status}).`);
  const headerStart = response.index + response[0].length;
  const boundary = /\r?\n\r?\n/.exec(output.slice(headerStart));
  if (!boundary) throw new Error("GitHub release lookup returned incomplete headers.");
  const body = output.slice(headerStart + boundary.index + boundary[0].length);
  const release = JSON.parse(body);
  if (!release || typeof release !== "object")
    throw new Error("GitHub release response is invalid.");
  return release;
}

export function assertFreshMetadata(report, policy, sourceSha) {
  if (
    report?.signed !== true ||
    report.installable !== true ||
    report.installableUpdate !== false ||
    report.installation !== "fresh"
  ) {
    throw new Error("Publication requires a verified signed, separate fresh-install APK.");
  }
  if (report.sourceCommit !== sourceSha) throw new Error("APK provenance differs from GITHUB_SHA.");
  for (const field of ["package", "versionCode", "versionName", "signerSha256"]) {
    if (report[field] !== policy[field])
      throw new Error(`APK ${field} differs from the pinned fresh-release policy.`);
  }
}

export function assertAssetDigests(expected, downloaded) {
  for (const name of RELEASE_ASSETS) {
    if (!/^[0-9a-f]{64}$/.test(expected[name] ?? "") || downloaded[name] !== expected[name]) {
      throw new Error(`Uploaded release asset differs from the verified local bytes: ${name}`);
    }
  }
}

export function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}
function requestReleaseJson(endpoint) {
  const result = spawnSync("gh", ["api", "--include", endpoint], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return releaseResponse(result.stdout ?? "", result.status);
}

export function matchingRelease(pages) {
  const matches = [];
  for (const page of pages) {
    if (!Array.isArray(page))
      throw new Error("GitHub release listing is inaccessible or invalid; do not assume absence.");
    for (const release of page) {
      if (!release || typeof release !== "object" || Array.isArray(release))
        throw new Error("GitHub release listing contains an invalid record.");
      if (release.tag_name === FRESH_TAG) matches.push(release);
    }
  }
  if (matches.length > 1)
    throw new Error("Multiple releases use the fresh tag; inspect the ambiguous drafts manually.");
  const release = matches[0] ?? null;
  if (release && (!Number.isSafeInteger(release.id) || release.id <= 0))
    throw new Error("The listed release has no valid numeric identity.");
  return release;
}

/** The by-tag REST endpoint omits drafts. Authenticated listing discovers them; numeric IDs read snapshots. */
export function readRelease(repo, request = requestReleaseJson) {
  const pages = [];
  for (let page = 1; ; page++) {
    const rows = request(`repos/${repo}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(rows))
      throw new Error("GitHub release listing is inaccessible or invalid; do not assume absence.");
    pages.push(rows);
    if (rows.length < 100) break;
  }
  const listed = matchingRelease(pages);
  if (!listed) return null;
  return readReleaseById(repo, listed.id, request);
}

export function readReleaseById(repo, id, request = requestReleaseJson) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("A valid release ID is required.");
  const snapshot = request(`repos/${repo}/releases/${id}`);
  if (
    !snapshot ||
    Array.isArray(snapshot) ||
    snapshot.id !== id ||
    snapshot.tag_name !== FRESH_TAG
  ) {
    throw new Error(
      "The discovered release disappeared or changed identity; inspect it before retrying.",
    );
  }
  return snapshot;
}

export function createDraft(repo, sourceSha, notes, command = run) {
  const payload = {
    tag_name: FRESH_TAG,
    target_commitish: sourceSha,
    name: "CPay 1.5 — new install",
    body: notes,
    draft: true,
    prerelease: false,
  };
  const output = command(
    "gh",
    ["api", "--include", "--method", "POST", `repos/${repo}/releases`, "--input", "-"],
    { input: JSON.stringify(payload) },
  );
  const release = releaseResponse(output, 0, 201);
  if (!release || Array.isArray(release) || !Number.isSafeInteger(release.id) || release.id <= 0)
    throw new Error("Draft creation returned no valid numeric identity.");
  return release;
}

/** A successful create response is authoritative; release-list propagation is not needed to confirm it. */
export function prepareDraft(
  repo,
  sourceSha,
  {
    request = requestReleaseJson,
    command = run,
    remote = currentRemote,
    notes = readFileSync("docs/android-fresh-release-notes.md", "utf8"),
  } = {},
) {
  let release = readRelease(repo, request);
  const decision = publicationDecision({ sourceSha, ...remote(), release });
  if (decision === "create-draft") {
    try {
      release = createDraft(repo, sourceSha, notes, command);
      publicationDecision({ sourceSha, ...remote(), release });
    } catch (error) {
      // Never repeat an uncertain POST. Listing is used only to recover its observed result.
      const observed = readRelease(repo, request);
      if (!observed) throw error;
      publicationDecision({ sourceSha, ...remote(), release: observed });
      release = observed;
    }
  }
  if (!release) throw new Error("Draft creation was not confirmed; refusing to upload assets.");
  const confirmed = readReleaseById(repo, release.id, request);
  publicationDecision({ sourceSha, ...remote(), release: confirmed });
  return confirmed;
}

function currentRemote() {
  return remoteRefs(
    run("git", [
      "ls-remote",
      "origin",
      "refs/heads/main",
      `refs/tags/${FRESH_TAG}`,
      `refs/tags/${FRESH_TAG}^{}`,
    ]),
  );
}
function assetDigests(directory) {
  return Object.fromEntries(
    RELEASE_ASSETS.map((name) => [
      name,
      createHash("sha256")
        .update(readFileSync(join(directory, name)))
        .digest("hex"),
    ]),
  );
}

export function publishFreshRelease(env = process.env) {
  const repo = env.GH_REPO;
  const sourceSha = env.GITHUB_SHA;
  if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
    throw new Error("GH_REPO must identify the target owner/repository.");
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN is required for release publication.");
  if (!SHA.test(sourceSha ?? "")) throw new Error("A full lowercase GITHUB_SHA is required.");
  const directory = resolve("apk-output");
  const policy = JSON.parse(readFileSync("android/fresh-release.json", "utf8"));
  const metadata = JSON.parse(readFileSync(join(directory, "apk-metadata.json"), "utf8"));
  assertFreshMetadata(metadata, policy, sourceSha);
  const expected = assetDigests(directory);
  const checksum = readFileSync(join(directory, "SHA256SUMS.txt"), "utf8").trim();
  if (checksum !== `${expected["CPay-1.5.apk"]}  CPay-1.5.apk`)
    throw new Error("APK checksum manifest does not match the verified APK bytes.");
  let release = prepareDraft(repo, sourceSha);
  const draftId = release.id;
  // --clobber is permitted only after this matching draft check. Workflow-level publication concurrency is also required.
  run("gh", [
    "release",
    "upload",
    FRESH_TAG,
    ...RELEASE_ASSETS.map((name) => join(directory, name)),
    "--repo",
    repo,
    "--clobber",
  ]);
  const downloaded = mkdtempSync(join(env.RUNNER_TEMP || tmpdir(), "cpay-release-verify-"));
  run("gh", [
    "release",
    "download",
    FRESH_TAG,
    "--repo",
    repo,
    "--dir",
    downloaded,
    ...RELEASE_ASSETS.flatMap((name) => ["--pattern", name]),
  ]);
  assertAssetDigests(expected, assetDigests(downloaded));
  // Recheck the branch, peeled tag and draft after uploads, immediately before making it public/latest.
  release = readReleaseById(repo, draftId);
  publicationDecision({ sourceSha, ...currentRemote(), release });
  if (!release || release.id !== draftId)
    throw new Error("The release identity changed during publication.");
  run("gh", ["release", "edit", FRESH_TAG, "--repo", repo, "--draft=false", "--latest"]);
  const published = readReleaseById(repo, draftId);
  if (
    published?.id !== draftId ||
    published.draft !== false ||
    published.tag_name !== FRESH_TAG ||
    published.target_commitish !== sourceSha
  ) {
    throw new Error(
      "GitHub publication could not be confirmed. Inspect the release before retrying.",
    );
  }
  const finalRemote = currentRemote();
  if (finalRemote.tagSha !== sourceSha)
    throw new Error(
      "Published release tag differs from the expected source commit. Inspect it immediately.",
    );
  console.log(
    `Published ${repo} ${FRESH_TAG} from ${sourceSha}; all three uploaded assets match verified local bytes.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  publishFreshRelease();
