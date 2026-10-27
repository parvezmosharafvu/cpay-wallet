#!/usr/bin/env node
/** Isolated UI regression smoke. Uses synthetic wallets, blocks remote wallet/network calls, never sends funds. */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] || "http://127.0.0.1:8080/";
const parsed = new URL(base);
if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname))
  throw new Error("Wallet smoke accepts a local test server only.");
const password = "Smoke vault 2026!";
const fixture = "legal winner thank year wave sausage worth useful legal winner thank yellow";
const temporary = await mkdtemp(join(tmpdir(), "cpay-wallet-smoke-"));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  });
} catch {
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  }
}
const failures = [];
const steps = [];
let currentPage;
async function sdkMockSource() {
  const source = await readFile(new URL("../src/lib/cpay/sdk.ts", import.meta.url), "utf8");
  const names = [...source.matchAll(/^export (?:async )?function (\w+)/gm)].map(
    (match) => match[1],
  );
  names.push("sessionKeyFor");
  return `
  const state=window.__walletMock={balance:1000,sends:0,prepared:0,status:'pending',payments:[]};
  let quote=null;
  const api={
    ensureLive:async()=>true,
    connectLive:async()=>({balanceSats:state.balance}),
    disconnectLive:async()=>{},clearLiveStorage:async()=>{},
    sessionKeyFor:async()=>({key:'smoke-session',network:'regtest',account:0}),
    currentLiveSession:()=>({key:'smoke-session',network:'regtest',account:0}),
    isSessionCurrent:key=>key==='smoke-session',isLiveConnected:()=>true,
    liveInfo:async()=>({balanceSats:state.balance}),listLiveHistory:async()=>state.payments,
    invalidateLiveQuotes:()=>{quote=null;},explain:error=>String(error.message||error),
    prepareLiveQuote:async input=>{state.prepared++;quote={id:'quote-'+state.prepared,sessionKey:'smoke-session',destination:input.destination,amountSats:Number(input.amount),feeSats:7,totalSats:Number(input.amount)+7,network:'regtest',expiresAt:Date.now()+60000,speed:input.speed};return quote;},
    executeLiveQuote:async id=>{if(!quote||quote.id!==id)throw Error('Missing quote');state.sends++;await new Promise(r=>setTimeout(r,150));const result={id:'synthetic-payment-'+state.sends,status:state.status,amountSats:quote.amountSats,feeSats:7,timestamp:Date.now(),method:'spark',direction:'out'};state.payments=[result];state.balance-=quote.totalSats;quote=null;return result;},
    receiveLive:async()=>({paymentRequest:'spark-regtest-synthetic-request'}),
    watchLive:async()=>{},walletSnapshot:async()=>({balanceSats:state.balance}),present:value=>JSON.stringify(value),
  };
  ${names.map((name) => `export const ${name}=(...args)=>{if(typeof api.${name}==='function')return api.${name}(...args);throw Error('Unsupported test SDK action: ${name}');};`).join("\n")}
  `;
}
async function context({ mockSdk = false } = {}) {
  const result = await browser.newContext({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
    serviceWorkers: "block",
  });
  const mockSource = mockSdk ? await sdkMockSource() : null;
  await result.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (mockSource && url.pathname === "/src/lib/cpay/sdk.ts")
      return route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: mockSource,
      });
    if (url.origin !== parsed.origin || /\.wasm(?:\?|$)/.test(url.pathname)) return route.abort();
    return route.continue();
  });
  const page = await result.newPage();
  currentPage = page;
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto(base, { waitUntil: "networkidle" });
  return { page, context: result };
}
async function visible(locator) {
  await locator.waitFor({ state: "visible", timeout: 20_000 });
}
async function createVault(page) {
  await visible(page.getByRole("heading", { name: "Protect your wallet", exact: true }));
  await page.getByLabel("Vault password", { exact: true }).fill(password);
  await page.getByLabel("Repeat password (12+ characters)", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create encrypted vault", exact: true }).click();
  await visible(page.getByRole("heading", { name: "Your keys. Your wallet.", exact: true }));
}
async function settings(page) {
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: /^Settings/ }).click();
  await visible(page.getByRole("heading", { name: "Wallet security & backup", exact: true }));
}
async function unlock(page, pass = password) {
  await page.getByLabel("Vault password", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
}
try {
  const first = await context();
  const page = first.page;
  await createVault(page);
  steps.push("create encrypted vault");
  await page.getByRole("button", { name: "Restore live wallet (BIP39)", exact: true }).click();
  await page.locator("textarea").fill("not a valid recovery phrase");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await visible(page.getByRole("alert"));
  assert.match(await page.getByRole("alert").innerText(), /phrase|words|seed|BIP39/i);
  steps.push("invalid BIP39 recovery rejected");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page
    .getByRole("button", { name: "Try practice mode — no real funds", exact: true })
    .click();
  await page.getByLabel("Wallet name", { exact: true }).fill("Smoke practice");
  await page.getByRole("button", { name: "Create and back up", exact: true }).click();
  await visible(page.getByRole("heading", { name: "Back up this wallet", exact: true }));
  await page.getByRole("button", { name: "Reveal recovery words", exact: true }).click();
  const seedWords = await page.locator("ol li").allTextContents();
  assert.equal(seedWords.length, 12);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Verify backup and continue", exact: true }).click();
  await visible(page.getByText("Smoke practice", { exact: true }));
  await page.getByRole("button", { name: "Add practice funds", exact: true }).click();
  steps.push("practice create, backup and faucet");
  if (process.env.WALLET_SMOKE_SCREENSHOT)
    await page.screenshot({ path: process.env.WALLET_SMOKE_SCREENSHOT, fullPage: true });
  await settings(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download encrypted backup", exact: true }).click();
  const file = await download;
  const backup = join(temporary, "synthetic-backup.json");
  await file.saveAs(backup);
  const rawBackup = await readFile(backup, "utf8");
  assert.doesNotMatch(rawBackup, /"members"|"sdkMnemonic"|"Smoke practice"/);
  await page.waitForTimeout(200);
  const persistent = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  assert.doesNotMatch(persistent, /"members"|"sdkMnemonic"|"Smoke practice"/);
  assert.equal(await page.evaluate(() => localStorage.getItem("cpay-practice-v1")), null);
  steps.push("backup and persistence contain ciphertext only");
  await page.reload({ waitUntil: "networkidle" });
  await visible(page.getByRole("heading", { name: "Unlock your wallet", exact: true }));
  await unlock(page, "incorrect password");
  await visible(page.getByRole("alert"));
  assert.equal(await page.getByRole("button", { name: "More", exact: true }).count(), 0);
  await unlock(page);
  await visible(page.getByText("Smoke practice", { exact: true }));
  steps.push("reload locked; wrong password denied; correct password restores state");
  await settings(page);
  await page.getByRole("button", { name: "Lock wallet now", exact: true }).click();
  await visible(page.getByRole("heading", { name: "Unlock your wallet", exact: true }));
  steps.push("manual lock hides wallet");
  const second = await context();
  const imported = second.page;
  await imported.locator('input[type="file"]').setInputFiles(backup);
  await imported.getByLabel("Vault password", { exact: true }).fill(password);
  await imported.getByRole("button", { name: "Restore encrypted backup", exact: true }).click();
  await visible(imported.getByText("Smoke practice", { exact: true }));
  steps.push("encrypted backup restores in fresh browser context");
  await settings(imported);
  await imported.getByText("Erase wallet data on this device", { exact: true }).click();
  await imported.getByRole("checkbox").check();
  await imported.getByLabel("Type ERASE", { exact: true }).fill("ERASE");
  await imported.getByLabel("Vault password for erasure", { exact: true }).fill(password);
  await imported.getByRole("button", { name: "Erase this device", exact: true }).click();
  await visible(imported.getByRole("heading", { name: "Protect your wallet", exact: true }));
  assert.equal(await imported.evaluate(() => localStorage.getItem("cpay-vault-v1")), null);
  steps.push("full local erasure removes vault");
  await createVault(imported);
  await imported.getByRole("button", { name: "Restore live wallet (BIP39)", exact: true }).click();
  await imported.locator("textarea").fill(fixture);
  await imported.getByRole("button", { name: "Restore", exact: true }).click();
  await visible(
    imported.getByText("Live SDK · regtest · Account 0. Keep your recovery backup safe.", {
      exact: true,
    }),
  );
  assert.equal(
    await imported.getByRole("button", { name: "Add practice funds", exact: true }).count(),
    0,
  );
  await imported
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: "Send", exact: true })
    .click();
  await visible(imported.getByRole("heading", { name: "Send bitcoin", exact: true }));
  await imported
    .getByLabel("Destination / invoice / LNURL", { exact: true })
    .fill("lnbc1synthetic");
  await imported
    .getByLabel("Amount (sats, optional for fixed invoice)", { exact: true })
    .fill("10");
  await imported.getByRole("button", { name: "Get quote and review", exact: true }).click();
  await visible(imported.getByRole("alert").first());
  assert.equal(
    await imported.getByRole("button", { name: "Confirm payment", exact: true }).count(),
    0,
  );
  assert.equal(
    await imported.getByText("Settled on the practice network.", { exact: true }).count(),
    0,
  );
  steps.push("BIP39 restore retains regtest; failed SDK never falls back to practice");
  await imported.getByRole("button", { name: "More", exact: true }).click();
  assert.equal(
    await imported
      .getByRole("button", { name: /Cash App|Buy bitcoin|Convert BTC|Spark tokens|Claims/ })
      .count(),
    0,
  );
  steps.push("live wallet hides practice-only tools");
  const horizontalOverflow = await imported.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(horizontalOverflow, false);
  steps.push("390px mobile viewport has no horizontal overflow");
  const mocked = await context({ mockSdk: true });
  const live = mocked.page;
  await createVault(live);
  await live.getByRole("button", { name: "Create live wallet", exact: true }).click();
  await live.getByLabel("Wallet name", { exact: true }).fill("Smoke live");
  await live.getByRole("button", { name: "Create and back up", exact: true }).click();
  await visible(live.getByRole("heading", { name: "Back up this wallet", exact: true }));
  await live.getByRole("button", { name: "Reveal recovery words", exact: true }).click();
  const newSeed = await live.locator("ol li").allTextContents();
  assert.equal(newSeed.length, 12);
  await live.getByRole("checkbox").check();
  await live.getByLabel("Last recovery word", { exact: true }).fill("incorrect");
  await live.getByRole("button", { name: "Verify backup and continue", exact: true }).click();
  await visible(live.getByRole("alert"));
  await live
    .getByLabel("Last recovery word", { exact: true })
    .fill(newSeed[11].trim().replace(/^\d+\s*/, ""));
  await live.getByRole("button", { name: "Verify backup and continue", exact: true }).click();
  await visible(live.getByText("Smoke live", { exact: true }));
  steps.push("new BIP39 wallet requires correct backup verification");
  await live
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: "Send", exact: true })
    .click();
  await live
    .getByLabel("Destination / invoice / LNURL", { exact: true })
    .fill("spark-regtest-recipient");
  await live.getByLabel("Amount (sats, optional for fixed invoice)", { exact: true }).fill("100");
  await live.getByRole("button", { name: "Get quote and review", exact: true }).click();
  await visible(live.getByRole("heading", { name: "Review the SDK quote", exact: true }));
  assert.match(await live.locator("section").innerText(), /7 sats/);
  assert.match(await live.locator("section").innerText(), /107 sats/);
  assert.equal(await live.evaluate(() => window.__walletMock.sends), 0);
  await live.getByLabel("Amount (sats, optional for fixed invoice)", { exact: true }).fill("110");
  assert.equal(await live.getByRole("button", { name: "Confirm payment", exact: true }).count(), 0);
  await live.getByRole("button", { name: "Get quote and review", exact: true }).click();
  await visible(live.getByRole("button", { name: "Confirm payment", exact: true }));
  await live.getByRole("button", { name: "Confirm payment", exact: true }).evaluate((button) => {
    button.click();
    button.click();
  });
  await visible(live.getByRole("heading", { name: "Pending confirmation", exact: true }));
  assert.equal(await live.evaluate(() => window.__walletMock.sends), 1);
  steps.push(
    "SDK fee quote precedes consent; edit invalidates; double click submits once; pending remains pending",
  );
  await live.evaluate(() => {
    window.__walletMock.payments[0].status = "failed";
  });
  await live
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: "Activity", exact: true })
    .click();
  await visible(live.getByRole("button", { name: /spark · failed/ }));
  await live.getByRole("button", { name: /spark · failed/ }).click();
  await visible(live.getByRole("heading", { name: "Failed", exact: true }));
  steps.push("live Activity refreshes SDK failed status and real payment ID");
  await live.getByRole("button", { name: "More", exact: true }).click();
  await live.getByRole("button", { name: /^Members/ }).click();
  await live.getByRole("button", { name: "Reveal recovery words", exact: true }).click();
  assert.equal(
    await live
      .getByText(newSeed.map((word) => word.trim().replace(/^\d+\s*/, "")).join(" "), {
        exact: true,
      })
      .count(),
    0,
  );
  await live.getByLabel("Confirm vault password", { exact: true }).fill(password);
  await live.getByRole("button", { name: "Verify and reveal", exact: true }).click();
  await visible(
    live.getByText(newSeed.map((word) => word.trim().replace(/^\d+\s*/, "")).join(" "), {
      exact: true,
    }),
  );
  steps.push("stored seed reveal requires vault reauthentication");
  await mocked.context.close();
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ ok: true, steps }, null, 2));
  await first.context.close();
  await second.context.close();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        steps,
        error: error.message,
        body: await currentPage
          ?.locator("body")
          .innerText()
          .catch(() => ""),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
