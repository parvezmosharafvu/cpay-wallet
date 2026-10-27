#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

function testsIn(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((item) => {
    const path = join(root, item.name);
    return item.isDirectory() ? testsIn(path) : /\.test\.(mjs|ts)$/.test(item.name) ? [path] : [];
  });
}

// Explicit paths work on Windows and Node 22, where shell glob expansion differs.
const files = [...testsIn("scripts"), ...testsIn("src")].sort();
if (files.length === 0) throw new Error("No tests found.");
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
