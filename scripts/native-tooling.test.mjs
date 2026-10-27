import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);

test("the installed CLI can extract its native project template", async () => {
  const { extractTemplate } = require("@capacitor/cli/dist/util/template.js");
  const target = mkdtempSync(join(tmpdir(), "cpay-native-template-"));
  const cliRoot = resolve("node_modules/@capacitor/cli");
  await extractTemplate(join(cliRoot, "assets/android-template.tar.gz"), target);
  assert.ok(existsSync(join(target, "gradle/wrapper/gradle-wrapper.jar")));
  assert.ok(existsSync(join(target, "app/src/main/AndroidManifest.xml")));
});

test("the iOS project parses and its UUID dependency supports project edits", () => {
  const xcode = require("xcode");
  const project = xcode.project(resolve("ios/App/App.xcodeproj/project.pbxproj"));
  project.parseSync();
  assert.match(project.generateUuid(), /^[A-F0-9]{24}$/);
  const sourceFiles = Object.values(project.pbxFileReferenceSection());
  assert.ok(sourceFiles.some((item) => typeof item === "object" && item.path?.replaceAll('"', "") === "SceneDelegate.swift"));
});
