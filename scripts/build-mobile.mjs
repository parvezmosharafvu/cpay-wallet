#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "./with-app-env.mjs";

const root = projectRoot();
const result = spawnSync(process.execPath, [join(root, "scripts/with-app-env.mjs"), "vite", "build", "--config", "vite.mobile.config.ts"], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
copyFileSync(join(root, "dist-mobile/mobile/index.html"), join(root, "dist-mobile/index.html"));
