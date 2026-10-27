import type {
  BreezSdk,
  CrossChainRoutePair,
  InputType,
  Network,
  OnchainConfirmationSpeed,
  PrepareLnurlPayResponse,
  PrepareSendBatchResponse,
  PrepareSendPaymentResponse,
  PrepareUnilateralExitResponse,
  SdkEvent,
  TransferAuthorization,
  UnilateralExitResponse,
} from "@breeztech/breez-sdk-spark/web";
import { appBreezKey } from "./app-key";
import { mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import {
  LiveSession,
  StaleSessionError,
  normalizeMnemonic,
  sessionIdentity,
  type SessionIdentity,
} from "./live-session";
import {
  QuoteBook,
  normalizePayment,
  quotedFee,
  safeSats,
  type LivePayment,
  type LiveQuote,
} from "./payment-quote";
import { decryptSdkCache, deriveSdkCacheKey, encryptSdkCache } from "./sdk-cache";
export type { LivePayment, LiveQuote } from "./payment-quote";

type SdkModule = typeof import("@breeztech/breez-sdk-spark/web");

let modulePromise: Promise<SdkModule> | null = null;
let prepared: PrepareSendPaymentResponse | null = null;
let preparedLnurl: PrepareLnurlPayResponse | null = null;
let parsed: InputType | null = null;
let preparedBatch: PrepareSendBatchResponse | null = null;
let lastExitPlan: PrepareUnilateralExitResponse | null = null;
let lastExit: UnilateralExitResponse | null = null;
let lastAuth: TransferAuthorization | null = null;
let listenerId: string | null = null;
const listeners = new Map<BreezSdk, string>();
const storageHandles = new Map<string, Set<{ close: () => void }>>();
const cacheKeys = new Map<string, CryptoKey>();
const STORAGE_REGISTRY = "cpay-sdk-databases-v2";
let legacySessionKey: string | null = null;
let legacyQuoteGeneration = 0;
let requestVersion = 0;
let activeFingerprint = "";
let opening: {
  fingerprint: string;
  promise: Promise<Awaited<ReturnType<BreezSdk["getInfo"]>>>;
} | null = null;

function clearPrepared() {
  prepared = null;
  preparedLnurl = null;
  parsed = null;
  preparedBatch = null;
  lastExitPlan = null;
  lastExit = null;
  lastAuth = null;
  lastLinkAddress = "";
  routes = [];
  legacySessionKey = null;
  ++legacyQuoteGeneration;
  quotes.invalidate();
}

function closeSdkStores() {
  for (const handles of storageHandles.values())
    for (const storage of handles) {
      try {
        storage.close();
      } catch {
        /* Deletion reports a blocked cache if a browser handle stays open. */
      }
    }
  storageHandles.clear();
  cacheKeys.clear();
}

async function buildSdkClient(create: () => Promise<BreezSdk>): Promise<BreezSdk> {
  try {
    return await create();
  } catch (error) {
    closeSdkStores();
    throw error;
  }
}

const sessions = new LiveSession<BreezSdk>(
  async (client) => {
    const listener = listeners.get(client);
    listeners.delete(client);
    if (listener) await client.removeEventListener(listener).catch(() => undefined);
    try {
      await client.disconnect();
    } finally {
      try {
        client.free();
      } finally {
        closeSdkStores();
      }
    }
  },
  () => {
    activeFingerprint = "";
    cacheKeys.clear();
    clearPrepared();
  },
);

type QuotedSdkResponse =
  | { type: "send"; response: PrepareSendPaymentResponse }
  | { type: "lnurl"; response: PrepareLnurlPayResponse };
const quotes = new QuoteBook<QuotedSdkResponse>((key) => sessions.isCurrent(key));

export type LiveNetwork = Extract<Network, "mainnet" | "regtest">;

export function isLiveConnected() {
  return sessions.current() !== null;
}

export function currentLiveSession(): SessionIdentity | null {
  return sessions.current()?.identity ?? null;
}

export function isSessionCurrent(key: string) {
  return sessions.isCurrent(key);
}
export { sessionIdentity as sessionKeyFor } from "./live-session";

export function invalidateLiveQuotes() {
  clearPrepared();
}

function browserOnly() {
  if (typeof window === "undefined") throw new Error("The Breez SDK runs in the browser.");
}

async function load(): Promise<SdkModule> {
  browserOnly();
  if (!modulePromise) {
    modulePromise = import("@breeztech/breez-sdk-spark/web")
      .then(async (mod) => {
        await mod.default();
        // The SDK's documented browser adapter is exposed as these factories.
        // Track only this application's handles so full erase can close/delete them.
        type BrowserSdkStorage = {
          close: () => void;
          getCachedItem?: (key: string) => Promise<string | null>;
          setCachedItem?: (key: string, value: string) => Promise<void>;
        };
        const bridge = globalThis as typeof globalThis & {
          createDefaultStorage?: (name: string, logger?: unknown) => Promise<BrowserSdkStorage>;
          createDefaultTreeStore?: (name: string, logger?: unknown) => Promise<BrowserSdkStorage>;
        };
        for (const key of ["createDefaultStorage", "createDefaultTreeStore"] as const) {
          const factory = bridge[key];
          if (factory)
            bridge[key] = async (name, logger) => {
              const storage = await factory(name, logger);
              if (name.startsWith("cpay-")) {
                const handles = storageHandles.get(name) ?? new Set();
                handles.add(storage);
                storageHandles.set(name, handles);
                if (cacheKeys.has(name) && storage.getCachedItem && storage.setCachedItem) {
                  const read = storage.getCachedItem.bind(storage),
                    write = storage.setCachedItem.bind(storage);
                  storage.getCachedItem = async (item) => {
                    const raw = await read(item);
                    const cacheKey = cacheKeys.get(name);
                    if (!cacheKey)
                      throw new Error("Unlock the selected wallet to read its SDK cache.");
                    const plaintext =
                      raw === null
                        ? null
                        : await decryptSdkCache(raw, cacheKey, `${name}\0${item}`);
                    if (cacheKeys.get(name) !== cacheKey)
                      throw new Error("The wallet was locked before the SDK cache read completed.");
                    return plaintext;
                  };
                  storage.setCachedItem = async (item, value) => {
                    const cacheKey = cacheKeys.get(name);
                    if (!cacheKey)
                      throw new Error("Unlock the selected wallet to write its SDK cache.");
                    const raw = await encryptSdkCache(value, cacheKey, `${name}\0${item}`);
                    if (cacheKeys.get(name) !== cacheKey)
                      throw new Error(
                        "The wallet was locked before the SDK cache write completed.",
                      );
                    await write(item, raw);
                  };
                }
              }
              return storage;
            };
        }
        return mod;
      })
      .catch((error) => {
        modulePromise = null;
        throw error;
      });
  }
  return modulePromise;
}

let routes: CrossChainRoutePair[] = [];

function need() {
  return sessions.need().client;
}

async function inSession<T>(task: (client: BreezSdk) => Promise<T>): Promise<T> {
  const session = sessions.need();
  const result = await task(session.client);
  if (!sessions.isCurrent(session.identity.key)) throw new StaleSessionError();
  return result;
}

function rememberStorage(name: string) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_REGISTRY) ?? "[]");
    const names = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.startsWith("cpay-"))
      : [];
    localStorage.setItem(
      STORAGE_REGISTRY,
      JSON.stringify([...new Set([...names, name, `${name}-tree`])]),
    );
  } catch {
    /* Database enumeration remains available if persistent storage is denied. */
  }
}

function hexToBytes(hex: string) {
  const clean = hex.trim().replace(/^0x/, "");
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) throw new Error("Key must be hex.");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1)
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function asBig(raw: string, label: string) {
  const cleaned = raw.trim();
  if (!/^\d+$/.test(cleaned)) throw new Error(`${label} must be a whole number.`);
  return BigInt(cleaned);
}

function familyOf(address: string): "evm" | "solana" | "tron" {
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return "evm";
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return "tron";
  return "solana";
}

export type LiveConnection = {
  mnemonic: string;
  apiKey: string;
  network: LiveNetwork;
  account: number;
};

export function connectLive(input: LiveConnection) {
  const normalized = {
    ...input,
    mnemonic: normalizeMnemonic(input.mnemonic),
    apiKey: input.apiKey.trim(),
  };
  const fingerprint = JSON.stringify(normalized);
  if (opening?.fingerprint === fingerprint) return opening.promise;
  const previousOpening = opening;
  const version = ++requestVersion;
  // Revoke a different connected wallet before hashing or loading WASM.
  const active = sessions.current();
  if ((active && activeFingerprint !== fingerprint) || previousOpening)
    void sessions.disconnect().catch(() => undefined);
  const promise = (async () => {
    if (!validateMnemonic(normalized.mnemonic, wordlist)) {
      await sessions.disconnect();
      throw new Error("Enter a valid BIP39 recovery phrase.");
    }
    if (normalized.network === "mainnet" && !normalized.apiKey) {
      await sessions.disconnect();
      throw new Error("Mainnet needs a Breez API key. Add it in Settings.");
    }
    const identity = await sessionIdentity(normalized);
    if (version !== requestVersion) throw new StaleSessionError();
    const client = await sessions.connect(identity, () =>
      buildSdkClient(async () => {
        const mod = await load();
        if (version !== requestVersion) throw new StaleSessionError();
        const config = mod.defaultConfig(normalized.network);
        if (normalized.apiKey) config.apiKey = normalized.apiKey;
        let builder = mod.SdkBuilder.new(config, {
          type: "mnemonic",
          mnemonic: normalized.mnemonic,
        });
        builder = builder.withAccountNumber(normalized.account);
        const storageName = `cpay-sdk-v3-${identity.key}`;
        rememberStorage(storageName);
        const cacheKey = await deriveSdkCacheKey(
          mnemonicToEntropy(normalized.mnemonic, wordlist),
          storageName,
        );
        if (version !== requestVersion) throw new StaleSessionError();
        cacheKeys.set(storageName, cacheKey);
        builder = await builder.withDefaultStorage(storageName);
        return builder.build();
      }),
    );
    if (version !== requestVersion || !sessions.isCurrent(identity.key))
      throw new StaleSessionError();
    activeFingerprint = fingerprint;
    const info = await client.getInfo({
      ensureSynced: !active || active.identity.key !== identity.key,
    });
    if (version !== requestVersion || !sessions.isCurrent(identity.key))
      throw new StaleSessionError();
    return info;
  })();
  opening = { fingerprint, promise };
  void promise
    .finally(() => {
      if (opening?.promise === promise) opening = null;
    })
    .catch(() => undefined);
  return promise;
}

export async function ensureLive(
  mnemonic: string,
  options: {
    apiKey?: string;
    network?: LiveNetwork;
    account?: number;
  } = {},
) {
  await connectLive({
    mnemonic,
    apiKey: options.apiKey?.trim() || appBreezKey(),
    network: options.network ?? "mainnet",
    account: options.account ?? 0,
  });
  return true;
}

export function disconnectLive() {
  ++requestVersion;
  opening = null;
  listenerId = null;
  return sessions.disconnect();
}

/** Delete this app's SDK caches, including legacy shared namespaces. */
export async function clearLiveStorage() {
  await disconnectLive();
  if (typeof indexedDB === "undefined") return;
  let registered: string[] = [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_REGISTRY) ?? "[]");
    if (Array.isArray(value))
      registered = value.filter(
        (name): name is string => typeof name === "string" && name.startsWith("cpay-"),
      );
  } catch {
    /* Do not trust the registry; enumerate when supported. */
  }
  const databases = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [];
  const names = new Set([
    ...registered,
    ...databases
      .map((entry) => entry.name)
      .filter((name): name is string => !!name && name.startsWith("cpay-")),
    "cpay-mainnet-a0",
    "cpay-mainnet-a0-tree",
    "cpay-regtest-a0",
    "cpay-regtest-a0-tree",
  ]);
  await Promise.all(
    [...names].map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () =>
            reject(request.error ?? new Error("Could not erase the SDK database."));
          request.onblocked = () =>
            reject(new Error("Close other CPay tabs before erasing wallet data."));
        }),
    ),
  );
  localStorage.removeItem(STORAGE_REGISTRY);
}

export async function sparkStatus() {
  const mod = await load();
  return mod.getSparkStatus();
}

export async function syncLive() {
  return inSession((client) => client.syncWallet({}));
}

export async function liveInfo(ensureSynced = false) {
  return inSession((client) => client.getInfo({ ensureSynced }));
}

export async function listLivePayments() {
  return inSession((client) => client.listPayments({ limit: 50, sortAscending: false }));
}

export async function listLiveHistory(): Promise<LivePayment[]> {
  const response = await listLivePayments();
  // Token amounts have separate units and are shown in the advanced panel.
  return response.payments.filter((payment) => payment.method !== "token").map(normalizePayment);
}

export async function parseLive(input: string) {
  clearPrepared();
  const generation = legacyQuoteGeneration;
  const response = await inSession((client) => client.parse(input.trim()));
  if (generation !== legacyQuoteGeneration)
    throw new Error("Payment details changed. Parse the destination again.");
  parsed = response;
  return parsed;
}

export async function prepareLiveSend(input: {
  destination: string;
  amount: string;
  tokenIdentifier: string;
}) {
  const generation = ++legacyQuoteGeneration;
  prepared = null;
  const session = sessions.need();
  const amount = input.amount.trim() ? asBig(input.amount, "Amount") : undefined;
  const response = await inSession((client) =>
    client.prepareSendPayment({
      paymentRequest: { type: "input", input: input.destination.trim() },
      amount,
      tokenIdentifier: input.tokenIdentifier.trim() || undefined,
      feePolicy: "feesExcluded",
    }),
  );
  if (generation !== legacyQuoteGeneration)
    throw new Error("Payment details changed. Prepare the payment again.");
  legacySessionKey = session.identity.key;
  prepared = response;
  return prepared;
}

export async function prepareLiveQuote(input: {
  destination: string;
  amount: string;
  tokenIdentifier?: string;
  speed?: OnchainConfirmationSpeed;
}): Promise<LiveQuote> {
  const session = sessions.need();
  const generation = quotes.generation();
  const destination = input.destination.trim();
  if (!destination) throw new Error("Enter a payment destination.");
  if (input.tokenIdentifier?.trim())
    throw new Error("Token payments use different amount units. Use the advanced SDK panel.");
  const amount = input.amount.trim() ? asBig(input.amount, "Amount") : undefined;
  if (amount !== undefined && amount <= 0n) throw new Error("Amount must be greater than zero.");
  const speed = input.speed ?? "medium";
  const parsedInput = await inSession((client) => client.parse(destination));
  let sdkResponse: QuotedSdkResponse;
  let feeSats: number;
  let amountSats: number;
  let expiresAt = Date.now() + 120_000;
  if (parsedInput.type === "lightningAddress" || parsedInput.type === "lnurlPay") {
    if (!amount) throw new Error("Enter the amount in sats for this Lightning address or LNURL.");
    const response = await inSession((client) =>
      client.prepareLnurlPay({
        amount,
        payRequest: parsedInput.type === "lightningAddress" ? parsedInput.payRequest : parsedInput,
        feePolicy: "feesExcluded",
        validateSuccessActionUrl: true,
      }),
    );
    sdkResponse = { type: "lnurl", response };
    feeSats = safeSats(response.feeSats, "Fee");
    amountSats = safeSats(response.amountSats);
  } else {
    const response = await inSession((client) =>
      client.prepareSendPayment({
        paymentRequest: { type: "input", input: destination },
        amount,
        feePolicy: "feesExcluded",
      }),
    );
    sdkResponse = { type: "send", response };
    feeSats = quotedFee(response, speed);
    amountSats = safeSats(response.amount);
    if (response.paymentMethod.type === "bitcoinAddress") {
      const expiry = response.paymentMethod.feeQuote.expiresAt;
      expiresAt = Math.min(expiresAt, expiry > 1e12 ? expiry : expiry * 1000);
    }
  }
  if (!sessions.isCurrent(session.identity.key)) throw new StaleSessionError();
  if (amountSats <= 0) throw new Error("The prepared payment has no positive amount.");
  const totalSats = safeSats(BigInt(amountSats) + BigInt(feeSats), "Total");
  return quotes.add(
    {
      id: crypto.randomUUID(),
      sessionKey: session.identity.key,
      destination,
      amountSats,
      feeSats,
      totalSats,
      network: session.identity.network,
      expiresAt,
      speed,
    },
    sdkResponse,
    generation,
  );
}

export function executeLiveQuote(id: string): Promise<LivePayment> {
  return quotes.execute(id, async (item, quote) => {
    const client = sessions.need().client;
    const result =
      item.type === "lnurl"
        ? await client.lnurlPay({ prepareResponse: item.response, idempotencyKey: quote.id })
        : await client.sendPayment({
            prepareResponse: item.response,
            options:
              item.response.paymentMethod.type === "bitcoinAddress"
                ? { type: "bitcoinAddress", confirmationSpeed: quote.speed }
                : item.response.paymentMethod.type === "bolt11Invoice"
                  ? { type: "bolt11Invoice", preferSpark: false }
                  : undefined,
            idempotencyKey: quote.id,
          });
    // A pending/failed response must never be turned into a success receipt.
    return normalizePayment(result.payment);
  });
}

export async function getLivePayment(paymentId: string) {
  return inSession((client) => client.getPayment({ paymentId: paymentId.trim() }));
}

export async function buildUnsignedBatchLive() {
  if (!preparedBatch || !legacySessionKey || !sessions.isCurrent(legacySessionKey))
    throw new Error("Prepare the batch in the selected wallet first.");
  return need().buildUnsignedBatchPackage({ prepareResponse: preparedBatch });
}

export async function buildUnsignedLnurlLive() {
  if (!preparedLnurl || !legacySessionKey || !sessions.isCurrent(legacySessionKey))
    throw new Error("Prepare the LNURL payment in the selected wallet first.");
  return need().buildUnsignedLnurlPayPackage({ prepareResponse: preparedLnurl });
}

export async function publishTransferLive(raw: string) {
  return need().publishSignedTransferPackage({ signedPackage: JSON.parse(raw) as never });
}

export async function publishLnurlLive(raw: string) {
  return need().publishSignedLnurlPayPackage({ signedPackage: JSON.parse(raw) as never });
}

export async function sendLive(speed: OnchainConfirmationSpeed) {
  if (!prepared || !legacySessionKey || !sessions.isCurrent(legacySessionKey))
    throw new Error("Prepare the payment in the selected wallet first.");
  const response = prepared;
  prepared = null;
  const method = response.paymentMethod;
  const options =
    method.type === "bitcoinAddress"
      ? { type: "bitcoinAddress" as const, confirmationSpeed: speed }
      : method.type === "bolt11Invoice"
        ? { type: "bolt11Invoice" as const, preferSpark: false }
        : undefined;
  const result = await need().sendPayment({
    prepareResponse: response,
    options,
    idempotencyKey: crypto.randomUUID(),
  });
  return result;
}

export async function buildUnsignedLive() {
  if (!prepared || !legacySessionKey || !sessions.isCurrent(legacySessionKey))
    throw new Error("Prepare the payment in the selected wallet first.");
  return need().buildUnsignedTransferPackage({ prepareResponse: prepared });
}

export async function receiveLive(input: {
  method: "bolt11" | "spark" | "sparkInvoice" | "bitcoin";
  amount: string;
  description: string;
  tokenIdentifier: string;
}) {
  const description = input.description.trim() || "CPay";
  const amount = input.amount.trim();
  if (input.method === "spark") {
    return inSession((client) =>
      client.receivePayment({ paymentMethod: { type: "sparkAddress" } }),
    );
  }
  if (input.method === "bitcoin") {
    return inSession((client) =>
      client.receivePayment({ paymentMethod: { type: "bitcoinAddress" } }),
    );
  }
  if (input.method === "sparkInvoice") {
    return inSession((client) =>
      client.receivePayment({
        paymentMethod: {
          type: "sparkInvoice",
          description,
          amount: amount || undefined,
          tokenIdentifier: input.tokenIdentifier.trim() || undefined,
        },
      }),
    );
  }
  return inSession((client) =>
    client.receivePayment({
      paymentMethod: {
        type: "bolt11Invoice",
        description,
        amountSats: amount ? safeSats(asBig(amount, "Amount")) : undefined,
      },
    }),
  );
}

export async function loadReceiveRoutes() {
  routes = await inSession((client) => client.getCrossChainRoutes({ type: "receive" }));
  return routes;
}

export async function receiveOnRoute(index: number, amount: string) {
  const route = routes[index];
  if (!route) throw new Error("Load routes, then pick one.");
  return inSession((client) =>
    client.receivePayment({
      paymentMethod: { type: "crossChain", route, amount: asBig(amount, "Amount").toString() },
    }),
  );
}

export async function prepareLnurlLive(amount: string, comment: string) {
  if (!parsed || parsed.type !== "lnurlPay")
    throw new Error("Parse an LNURL-pay or Lightning address first.");
  const session = sessions.need();
  const generation = ++legacyQuoteGeneration;
  const payRequest = parsed;
  preparedLnurl = null;
  const response = await inSession((client) =>
    client.prepareLnurlPay({
      amount: asBig(amount, "Amount"),
      comment: comment.trim() || undefined,
      payRequest,
      feePolicy: "feesExcluded",
    }),
  );
  if (generation !== legacyQuoteGeneration)
    throw new Error("Payment details changed. Prepare the LNURL payment again.");
  legacySessionKey = session.identity.key;
  preparedLnurl = response;
  return preparedLnurl;
}

export async function payLnurlLive() {
  if (!preparedLnurl || !legacySessionKey || !sessions.isCurrent(legacySessionKey))
    throw new Error("Prepare the LNURL payment in the selected wallet first.");
  const response = preparedLnurl;
  preparedLnurl = null;
  const result = await need().lnurlPay({
    prepareResponse: response,
    idempotencyKey: crypto.randomUUID(),
  });
  return result;
}

export async function withdrawLnurlLive(amountSats: string) {
  if (!parsed || parsed.type !== "lnurlWithdraw")
    throw new Error("Parse an LNURL-withdraw code first.");
  return need().lnurlWithdraw({
    amountSats: Number(asBig(amountSats, "Amount")),
    withdrawRequest: parsed,
  });
}

export async function authLnurlLive() {
  if (!parsed || parsed.type !== "lnurlAuth") throw new Error("Parse an LNURL-auth link first.");
  return need().lnurlAuth(parsed);
}

export async function checkAddress(username: string) {
  return need().checkLightningAddressAvailable({ username: username.trim() });
}

export async function registerAddress(username: string, description: string) {
  return need().registerLightningAddress({
    username: username.trim(),
    description: description.trim() || undefined,
  });
}

export async function currentAddress() {
  return inSession((client) => client.getLightningAddress());
}

export async function removeAddress() {
  return need().deleteLightningAddress();
}

export async function buyLive(kind: "cashApp" | "moonpay", amountSats: string) {
  if (kind === "cashApp") {
    return need().buyBitcoin({ type: "cashApp", amountSats: Number(asBig(amountSats, "Amount")) });
  }
  const locked = amountSats.trim() ? Number(asBig(amountSats, "Amount")) : undefined;
  return need().buyBitcoin({ type: "moonpay", lockedAmountSat: locked });
}

export async function loadPaymentLinkRoutes(address: string) {
  routes = await inSession((client) =>
    client.getCrossChainRoutes({
      type: "paymentLink",
      addressDetails: { address: address.trim(), addressFamily: familyOf(address.trim()) },
    }),
  );
  return routes;
}

let lastLinkAddress = "";

export async function paymentLink(index: number, amount: string) {
  const route = routes[index];
  if (!route) throw new Error("Load routes, then pick one.");
  if (!lastLinkAddress) throw new Error("Enter the recipient address first.");
  return need().preparePaymentLink({
    address: lastLinkAddress,
    route,
    amount: asBig(amount, "Amount"),
    feePolicy: "feesExcluded",
  });
}

export function rememberLinkAddress(address: string) {
  lastLinkAddress = address.trim();
}

export async function listDeposits() {
  return need().listUnclaimedDeposits({});
}

export async function quoteDeposit(txid: string, vout: string) {
  return need().fetchClaimDepositQuote({ txid: txid.trim(), vout: Number(vout) });
}

export async function claimDepositLive(txid: string, vout: string) {
  return need().claimDeposit({
    txid: txid.trim(),
    vout: Number(vout),
    maxFee: { type: "networkRecommended", leewaySatPerVbyte: 2 },
  });
}

export async function refundDepositLive(
  txid: string,
  vout: string,
  destination: string,
  fee: string,
) {
  return need().refundDeposit({
    txid: txid.trim(),
    vout: Number(vout),
    destinationAddress: destination.trim(),
    fee: { type: "rate", satPerVbyte: Number(fee) || 2 },
  });
}

export async function createTokenLive(input: {
  name: string;
  ticker: string;
  decimals: string;
  maxSupply: string;
  freezable: boolean;
}) {
  return need()
    .getTokenIssuer()
    .createIssuerToken({
      name: input.name.trim(),
      ticker: input.ticker.trim(),
      decimals: Number(input.decimals),
      isFreezable: input.freezable,
      maxSupply: asBig(input.maxSupply, "Max supply"),
    });
}

export async function mintTokenLive(amount: string) {
  return need()
    .getTokenIssuer()
    .mintIssuerToken({ amount: asBig(amount, "Amount") });
}

export async function burnTokenLive(amount: string) {
  return need()
    .getTokenIssuer()
    .burnIssuerToken({ amount: asBig(amount, "Amount") });
}

export async function freezeTokenLive(address: string, freeze: boolean) {
  const issuer = need().getTokenIssuer();
  if (freeze) return issuer.freezeIssuerToken({ address: address.trim() });
  return issuer.unfreezeIssuerToken({ address: address.trim() });
}

export async function issuerState() {
  const issuer = need().getTokenIssuer();
  const [metadata, balance] = await Promise.all([
    issuer.getIssuerTokenMetadata().catch((error: unknown) => ({ error: explain(error) })),
    issuer.getIssuerTokenBalance().catch((error: unknown) => ({ error: explain(error) })),
  ]);
  return { metadata, balance };
}

export async function tokenMetadata(ids: string) {
  const tokenIdentifiers = ids
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
  if (tokenIdentifiers.length === 0) throw new Error("Paste at least one token id.");
  return need().getTokensMetadata({ tokenIdentifiers });
}

export async function listSdkContacts() {
  return need().listContacts({ limit: 50 });
}

export async function addSdkContact(name: string, paymentIdentifier: string) {
  return need().addContact({ name: name.trim(), paymentIdentifier: paymentIdentifier.trim() });
}

export async function updateSdkContact(id: string, name: string, paymentIdentifier: string) {
  return need().updateContact({
    id: id.trim(),
    name: name.trim(),
    paymentIdentifier: paymentIdentifier.trim(),
  });
}

export async function deleteSdkContact(id: string) {
  await need().deleteContact(id.trim());
  return { deleted: id.trim() };
}

export async function fiatCurrencies() {
  return need().listFiatCurrencies();
}

export async function fiatRates() {
  return need().listFiatRates();
}

export async function readSettings() {
  return need().getUserSettings();
}

export async function writeSettings(input: {
  privateMode?: boolean;
  stableLabel?: string;
  clearStable?: boolean;
  masterKey?: string;
  clearMaster?: boolean;
}) {
  return need().updateUserSettings({
    sparkPrivateModeEnabled: input.privateMode,
    stableBalanceActiveLabel: input.clearStable
      ? { type: "unset" }
      : input.stableLabel
        ? { type: "set", label: input.stableLabel }
        : undefined,
    sparkMasterIdentityPublicKey: input.clearMaster
      ? { type: "unset" }
      : input.masterKey
        ? { type: "set", publicKey: input.masterKey }
        : undefined,
  });
}

export async function listHooks() {
  return need().listWebhooks();
}

export async function registerHook(url: string, secret: string) {
  return need().registerWebhook({
    url: url.trim(),
    secret: secret.trim(),
    eventTypes: [
      { type: "lightningReceiveFinished" },
      { type: "lightningSendFinished" },
      { type: "coopExitFinished" },
      { type: "staticDepositFinished" },
    ],
  });
}

export async function removeHook(webhookId: string) {
  await need().unregisterWebhook({ webhookId: webhookId.trim() });
  return { removed: webhookId.trim() };
}

export async function optimizeLive() {
  return need().optimizeLeaves({ mode: "full" });
}

export async function feeRates() {
  return need().recommendedFees();
}

export async function signLive(message: string) {
  return need().signMessage({ message, compact: true });
}

export async function checkLive(message: string, pubkey: string, signature: string) {
  return need().checkMessage({ message, pubkey: pubkey.trim(), signature: signature.trim() });
}

export async function refundConversions() {
  return need().refundPendingConversions();
}

export async function prepareExit(feeRate: string, destination: string) {
  const generation = ++legacyQuoteGeneration;
  lastExitPlan = null;
  const response = await inSession((client) =>
    client.prepareUnilateralExit({
      feeRateSatPerVbyte: Number(feeRate) || 5,
      fundingKind: { type: "p2wpkh" },
      destination: destination.trim(),
      selection: { type: "auto" },
    }),
  );
  if (generation !== legacyQuoteGeneration)
    throw new Error("Exit details changed. Prepare the exit again.");
  lastExitPlan = response;
  return lastExitPlan;
}

export async function broadcastExit(input: {
  txid: string;
  vout: string;
  value: string;
  pubkey: string;
  secretHex: string;
}) {
  if (!lastExitPlan) throw new Error("Prepare the exit first.");
  const session = sessions.need();
  const plan = lastExitPlan;
  lastExitPlan = null;
  const mod = await load();
  if (!sessions.isCurrent(session.identity.key)) throw new StaleSessionError();
  const signer = mod.singleKeyCpfpSigner(hexToBytes(input.secretHex));
  lastExit = await inSession((client) =>
    client.unilateralExit(
      {
        prepared: plan,
        fundingInputs: [
          {
            type: "p2wpkh",
            txid: input.txid.trim(),
            vout: Number(input.vout),
            value: Number(input.value),
            pubkey: input.pubkey.trim(),
          },
        ],
      },
      signer,
    ),
  );
  return lastExit;
}

export async function checkExit() {
  if (!lastExit) throw new Error("Broadcast the exit first.");
  return need().checkUnilateralExit({ exit: lastExit });
}

export async function importExit(exitState: string) {
  return need().importUnilateralExitState({ exitState: exitState.trim() });
}

export async function exportExit() {
  return need().exportUnilateralExitState();
}

export async function watchLive(onEvent: (event: SdkEvent) => void) {
  const session = sessions.need();
  const current = session.client;
  const previousListener = listeners.get(current);
  if (previousListener) {
    try {
      await current.removeEventListener(previousListener);
    } catch {
      /* replace it */
    }
  }
  const nextListener = await current.addEventListener({
    onEvent: (event) => {
      if (sessions.isCurrent(session.identity.key)) onEvent(event);
    },
  });
  if (!sessions.isCurrent(session.identity.key)) {
    await current.removeEventListener(nextListener).catch(() => undefined);
    throw new StaleSessionError();
  }
  listeners.set(current, nextListener);
  listenerId = nextListener;
  return listenerId;
}

export async function walletSnapshot() {
  const session = sessions.need();
  const info = await liveInfo(false);
  const address = await currentAddress();
  const history = await listLivePayments();
  if (!sessions.isCurrent(session.identity.key)) throw new StaleSessionError();
  const tokens = [...info.tokenBalances.entries()].map(([id, balance]) => ({
    id,
    ticker: balance.tokenMetadata.ticker,
    amount: balance.balance.toString(),
  }));
  return {
    balanceSats: info.balanceSats,
    pubkey: info.identityPubkey,
    lightningAddress: address?.lightningAddress ?? "",
    tokens,
    payments: history.payments.slice(0, 8).map((payment) => ({
      id: payment.id,
      type: payment.paymentType,
      status: payment.status,
      amount: payment.amount.toString(),
      fees: payment.fees.toString(),
    })),
  };
}

export async function connectTurnkey(input: {
  apiKey: string;
  network: LiveNetwork;
  account: number;
  organizationId: string;
  apiPublicKey: string;
  apiPrivateKey: string;
  walletId: string;
}) {
  const version = ++requestVersion;
  opening = null;
  await sessions.disconnect();
  if (input.network === "mainnet" && !input.apiKey.trim())
    throw new Error("Mainnet needs your Breez API key.");
  const identity = await sessionIdentity({
    mnemonic: `turnkey:${input.organizationId.trim()}:${input.walletId.trim()}:${input.apiPublicKey.trim()}`,
    network: input.network,
    account: input.account,
  });
  if (version !== requestVersion) throw new StaleSessionError();
  const client = await sessions.connect(identity, () =>
    buildSdkClient(async () => {
      const mod = await load();
      if (version !== requestVersion) throw new StaleSessionError();
      const config = mod.defaultConfig(input.network);
      if (input.apiKey.trim()) config.apiKey = input.apiKey.trim();
      const signers = await mod.createTurnkeySigner({
        organizationId: input.organizationId.trim(),
        apiPublicKey: input.apiPublicKey.trim(),
        apiPrivateKey: input.apiPrivateKey.trim(),
        walletId: input.walletId.trim(),
        network: input.network,
        accountNumber: input.account,
      });
      const storageName = `cpay-sdk-v3-${identity.key}`;
      rememberStorage(storageName);
      const cacheKey = await deriveSdkCacheKey(
        new TextEncoder().encode(input.apiPrivateKey.trim()),
        storageName,
      );
      if (version !== requestVersion) throw new StaleSessionError();
      cacheKeys.set(storageName, cacheKey);
      return mod.connectWithSigner(config, signers.breezSigner, signers.sparkSigner, storageName);
    }),
  );
  if (version !== requestVersion || !sessions.isCurrent(identity.key))
    throw new StaleSessionError();
  return client.getInfo({ ensureSynced: true });
}

export async function prepareBatchLive(
  rows: { destination: string; amount: string; tokenIdentifier: string }[],
) {
  const session = sessions.need();
  const generation = ++legacyQuoteGeneration;
  preparedBatch = null;
  const recipients = rows
    .filter((row) => row.destination.trim())
    .map((row) => ({
      paymentRequest: row.destination.trim(),
      amount: row.amount.trim() ? asBig(row.amount, "Amount") : undefined,
      tokenIdentifier: row.tokenIdentifier.trim() || undefined,
    }));
  if (recipients.length === 0) throw new Error("Add a recipient.");
  const response = await inSession((client) => client.prepareSendBatch({ recipients }));
  if (generation !== legacyQuoteGeneration)
    throw new Error("Batch details changed. Prepare the batch again.");
  preparedBatch = response;
  legacySessionKey = session.identity.key;
  return preparedBatch;
}

export async function sendBatchLive() {
  if (!preparedBatch || !legacySessionKey || !sessions.isCurrent(legacySessionKey))
    throw new Error("Prepare the batch in the selected wallet first.");
  const response = preparedBatch;
  preparedBatch = null;
  const result = await need().sendBatch({ prepareResponse: response });
  return result;
}

export async function claimHtlc(preimage: string) {
  return need().claimHtlcPayment({ preimage: preimage.trim() });
}

export async function conversionLimits(tokenIdentifier: string) {
  const fromBitcoin = await need().fetchConversionLimits({
    conversionType: { type: "fromBitcoin" },
  });
  const toBitcoin = tokenIdentifier.trim()
    ? await need().fetchConversionLimits({
        conversionType: { type: "toBitcoin", fromTokenIdentifier: tokenIdentifier.trim() },
      })
    : null;
  return { fromBitcoin, toBitcoin };
}

export async function authorizeAddress(transfereePubkey: string) {
  lastAuth = await inSession((client) =>
    client.authorizeLightningAddressTransfer({ transfereePubkey: transfereePubkey.trim() }),
  );
  return lastAuth;
}

export async function claimAddressTransfer(description: string) {
  if (!lastAuth) throw new Error("Authorize the address transfer first.");
  return need().claimLightningAddressTransfer({
    authorization: lastAuth,
    description: description.trim() || undefined,
  });
}

export function explain(error: unknown) {
  let text = "The SDK call failed.";
  if (typeof error === "string") text = error;
  else if (error instanceof Error && error.message) text = error.message;
  else {
    try {
      text = JSON.stringify(error);
    } catch {
      text = "The SDK call failed.";
    }
  }
  const line = text.split("\n")[0] ?? text;
  return line.length > 280 ? `${line.slice(0, 280)}…` : line;
}

export function present(value: unknown) {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, item: unknown) => {
      if (typeof item === "bigint") return item.toString();
      if (item instanceof Map) return Object.fromEntries(item);
      if (item && typeof item === "object") {
        if (seen.has(item)) return undefined;
        seen.add(item);
      }
      return item;
    },
    2,
  );
}
