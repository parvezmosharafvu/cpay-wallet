#!/usr/bin/env node
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { commandEnvironment, projectRoot } from "./with-app-env.mjs";
const port = "8087";
const url = `http://127.0.0.1:${port}/`;
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "dev", "--host", "127.0.0.1", "--port", port],
  {
    cwd: projectRoot(),
    env: commandEnvironment(projectRoot(), {
      ...process.env,
      VITE_AUTH_ENABLED: "false",
      VITE_GROK_EXTENSIONS: "0",
    }),
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
server.stdout.on("data", (chunk) => {
  logs = (logs + chunk).slice(-12_000);
});
server.stderr.on("data", (chunk) => {
  logs = (logs + chunk).slice(-12_000);
});
let result = 1;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`Test server exited. ${logs}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* wait for startup */
    }
    await delay(500);
  }
  if (!ready) throw new Error(`Test server did not start. ${logs}`);
  result = await new Promise((resolve, reject) => {
    const test = spawn(process.execPath, ["scripts/wallet-smoke.mjs", url], {
      cwd: projectRoot(),
      stdio: "inherit",
      env: process.env,
    });
    test.once("error", reject);
    test.once("exit", (code) => resolve(code ?? 1));
  });
} catch (error) {
  console.error(error);
} finally {
  server.kill();
}
process.exitCode = result;
