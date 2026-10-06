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

type SdkModule = typeof import("@breeztech/breez-sdk-spark/web");

let modulePromise: Promise<SdkModule> | null = null;
let sdk: BreezSdk | null = null;
let prepared: PrepareSendPaymentResponse | null = null;
let preparedLnurl: PrepareLnurlPayResponse | null = null;
let parsed: InputType | null = null;
let preparedBatch: PrepareSendBatchResponse | null = null;
let lastExitPlan: PrepareUnilateralExitResponse | null = null;
let lastExit: UnilateralExitResponse | null = null;
let lastAuth: TransferAuthorization | null = null;
let listenerId: string | null = null;

export type LiveNetwork = Extract<Network, "mainnet" | "regtest">;

export function isLiveConnected() {
  return sdk !== null;
}

function browserOnly() {
  if (typeof window === "undefined") throw new Error("The Breez SDK runs in the browser.");
}

async function load(): Promise<SdkModule> {
  browserOnly();
  if (!modulePromise) {
    modulePromise = import("@breeztech/breez-sdk-spark/web").then(async (mod) => {
      await mod.default();
      return mod;
    });
  }
  return modulePromise;
}

async function adopt(next: BreezSdk) {
  if (listenerId && sdk) {
    try {
      await sdk.removeEventListener(listenerId);
    } catch {
      /* listener may already be gone */
    }
  }
  listenerId = null;
  if (sdk) {
    try {
      await sdk.disconnect();
    } catch {
      /* a failed disconnect should not block a new session */
    }
  }
  sdk = next;
  prepared = null;
  preparedLnurl = null;
  preparedBatch = null;
  lastExitPlan = null;
  lastExit = null;
  lastAuth = null;
}

let routes: CrossChainRoutePair[] = [];

function need() {
  if (!sdk) throw new Error("Connect the live wallet first.");
  return sdk;
}

function hexToBytes(hex: string) {
  const clean = hex.trim().replace(/^0x/, "");
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) throw new Error("Key must be hex.");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
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

export async function connectLive(input: {
  mnemonic: string;
  apiKey: string;
  network: LiveNetwork;
  account: number;
}) {
  const mod = await load();
  if (sdk) {
    try {
      await sdk.disconnect();
    } catch {
      /* a failed disconnect should not block a new session */
    }
    sdk = null;
  }
  const config = mod.defaultConfig(input.network);
  const key = input.apiKey.trim();
  if (key) config.apiKey = key;
  else if (input.network === "mainnet") throw new Error("Mainnet needs your Breez API key.");
  let builder = mod.SdkBuilder.new(config, {
    type: "mnemonic",
    mnemonic: input.mnemonic.trim(),
  });
  builder = builder.withAccountNumber(input.account);
  builder = await builder.withDefaultStorage(`cpay-${input.network}-a${input.account}`);
  await adopt(await builder.build());
  return liveInfo(true);
}

export async function disconnectLive() {
  if (!sdk) return;
  if (listenerId) {
    try {
      await sdk.removeEventListener(listenerId);
    } catch {
      /* already removed */
    }
    listenerId = null;
  }
  await sdk.disconnect();
  sdk = null;
  prepared = null;
  preparedLnurl = null;
  preparedBatch = null;
}

export async function sparkStatus() {
  const mod = await load();
  return mod.getSparkStatus();
}

export async function syncLive() {
  return need().syncWallet({});
}

export async function liveInfo(ensureSynced = false) {
  return need().getInfo({ ensureSynced });
}

export async function listLivePayments() {
  return need().listPayments({ limit: 25, sortAscending: false });
}

export async function parseLive(input: string) {
  parsed = await need().parse(input.trim());
  return parsed;
}

export async function prepareLiveSend(input: {
  destination: string;
  amount: string;
  tokenIdentifier: string;
}) {
  const amount = input.amount.trim() ? asBig(input.amount, "Amount") : undefined;
  prepared = await need().prepareSendPayment({
    paymentRequest: { type: "input", input: input.destination.trim() },
    amount,
    tokenIdentifier: input.tokenIdentifier.trim() || undefined,
    feePolicy: "feesExcluded",
  });
  return prepared;
}

export async function getLivePayment(paymentId: string) {
  return need().getPayment({ paymentId: paymentId.trim() });
}

export async function buildUnsignedBatchLive() {
  if (!preparedBatch) throw new Error("Prepare the batch first.");
  return need().buildUnsignedBatchPackage({ prepareResponse: preparedBatch });
}

export async function buildUnsignedLnurlLive() {
  if (!preparedLnurl) throw new Error("Prepare the LNURL payment first.");
  return need().buildUnsignedLnurlPayPackage({ prepareResponse: preparedLnurl });
}

export async function publishTransferLive(raw: string) {
  return need().publishSignedTransferPackage({ signedPackage: JSON.parse(raw) as never });
}

export async function publishLnurlLive(raw: string) {
  return need().publishSignedLnurlPayPackage({ signedPackage: JSON.parse(raw) as never });
}

export async function sendLive(speed: OnchainConfirmationSpeed) {
  if (!prepared) throw new Error("Prepare the payment first.");
  const method = prepared.paymentMethod;
  const options =
    method.type === "bitcoinAddress"
      ? { type: "bitcoinAddress" as const, confirmationSpeed: speed }
      : method.type === "bolt11Invoice"
        ? { type: "bolt11Invoice" as const, preferSpark: true }
        : undefined;
  const result = await need().sendPayment({ prepareResponse: prepared, options });
  prepared = null;
  return result;
}

export async function buildUnsignedLive() {
  if (!prepared) throw new Error("Prepare the payment first.");
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
    return need().receivePayment({ paymentMethod: { type: "sparkAddress" } });
  }
  if (input.method === "bitcoin") {
    return need().receivePayment({ paymentMethod: { type: "bitcoinAddress" } });
  }
  if (input.method === "sparkInvoice") {
    return need().receivePayment({
      paymentMethod: {
        type: "sparkInvoice",
        description,
        amount: amount || undefined,
        tokenIdentifier: input.tokenIdentifier.trim() || undefined,
      },
    });
  }
  return need().receivePayment({
    paymentMethod: {
      type: "bolt11Invoice",
      description,
      amountSats: amount ? Number(asBig(amount, "Amount")) : undefined,
    },
  });
}

export async function loadReceiveRoutes() {
  routes = await need().getCrossChainRoutes({ type: "receive" });
  return routes;
}

export async function receiveOnRoute(index: number, amount: string) {
  const route = routes[index];
  if (!route) throw new Error("Load routes, then pick one.");
  return need().receivePayment({
    paymentMethod: { type: "crossChain", route, amount: asBig(amount, "Amount").toString() },
  });
}

export async function prepareLnurlLive(amount: string, comment: string) {
  if (!parsed || parsed.type !== "lnurlPay") throw new Error("Parse an LNURL-pay or Lightning address first.");
  preparedLnurl = await need().prepareLnurlPay({
    amount: asBig(amount, "Amount"),
    comment: comment.trim() || undefined,
    payRequest: parsed,
    feePolicy: "feesExcluded",
  });
  return preparedLnurl;
}

export async function payLnurlLive() {
  if (!preparedLnurl) throw new Error("Prepare the LNURL payment first.");
  const result = await need().lnurlPay({ prepareResponse: preparedLnurl });
  preparedLnurl = null;
  return result;
}

export async function withdrawLnurlLive(amountSats: string) {
  if (!parsed || parsed.type !== "lnurlWithdraw") throw new Error("Parse an LNURL-withdraw code first.");
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
  return need().getLightningAddress();
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
  routes = await need().getCrossChainRoutes({
    type: "paymentLink",
    addressDetails: { address: address.trim(), addressFamily: familyOf(address.trim()) },
  });
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

export async function refundDepositLive(txid: string, vout: string, destination: string, fee: string) {
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
  return need().getTokenIssuer().createIssuerToken({
    name: input.name.trim(),
    ticker: input.ticker.trim(),
    decimals: Number(input.decimals),
    isFreezable: input.freezable,
    maxSupply: asBig(input.maxSupply, "Max supply"),
  });
}

export async function mintTokenLive(amount: string) {
  return need().getTokenIssuer().mintIssuerToken({ amount: asBig(amount, "Amount") });
}

export async function burnTokenLive(amount: string) {
  return need().getTokenIssuer().burnIssuerToken({ amount: asBig(amount, "Amount") });
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
  return need().updateContact({ id: id.trim(), name: name.trim(), paymentIdentifier: paymentIdentifier.trim() });
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
  lastExitPlan = await need().prepareUnilateralExit({
    feeRateSatPerVbyte: Number(feeRate) || 5,
    fundingKind: { type: "p2wpkh" },
    destination: destination.trim(),
    selection: { type: "auto" },
  });
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
  const mod = await load();
  const signer = mod.singleKeyCpfpSigner(hexToBytes(input.secretHex));
  lastExit = await need().unilateralExit(
    {
      prepared: lastExitPlan,
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
  const current = need();
  if (listenerId) {
    try {
      await current.removeEventListener(listenerId);
    } catch {
      /* replace it */
    }
  }
  listenerId = await current.addEventListener({ onEvent });
  return listenerId;
}

export async function walletSnapshot() {
  const info = await liveInfo(false);
  const address = await currentAddress();
  const history = await listLivePayments();
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
  const mod = await load();
  const config = mod.defaultConfig(input.network);
  const key = input.apiKey.trim();
  if (key) config.apiKey = key;
  else if (input.network === "mainnet") throw new Error("Mainnet needs your Breez API key.");
  const signers = await mod.createTurnkeySigner({
    organizationId: input.organizationId.trim(),
    apiPublicKey: input.apiPublicKey.trim(),
    apiPrivateKey: input.apiPrivateKey.trim(),
    walletId: input.walletId.trim(),
    network: input.network,
    accountNumber: input.account,
  });
  const next = await mod.connectWithSigner(
    config,
    signers.breezSigner,
    signers.sparkSigner,
    `cpay-turnkey-${input.network}-a${input.account}`,
  );
  await adopt(next);
  return liveInfo(true);
}

export async function prepareBatchLive(rows: { destination: string; amount: string; tokenIdentifier: string }[]) {
  const recipients = rows
    .filter((row) => row.destination.trim())
    .map((row) => ({
      paymentRequest: row.destination.trim(),
      amount: row.amount.trim() ? asBig(row.amount, "Amount") : undefined,
      tokenIdentifier: row.tokenIdentifier.trim() || undefined,
    }));
  if (recipients.length === 0) throw new Error("Add a recipient.");
  preparedBatch = await need().prepareSendBatch({ recipients });
  return preparedBatch;
}

export async function sendBatchLive() {
  if (!preparedBatch) throw new Error("Prepare the batch first.");
  const result = await need().sendBatch({ prepareResponse: preparedBatch });
  preparedBatch = null;
  return result;
}

export async function claimHtlc(preimage: string) {
  return need().claimHtlcPayment({ preimage: preimage.trim() });
}

export async function conversionLimits(tokenIdentifier: string) {
  const fromBitcoin = await need().fetchConversionLimits({ conversionType: { type: "fromBitcoin" } });
  const toBitcoin = tokenIdentifier.trim()
    ? await need().fetchConversionLimits({
        conversionType: { type: "toBitcoin", fromTokenIdentifier: tokenIdentifier.trim() },
      })
    : null;
  return { fromBitcoin, toBitcoin };
}

export async function authorizeAddress(transfereePubkey: string) {
  lastAuth = await need().authorizeLightningAddressTransfer({ transfereePubkey: transfereePubkey.trim() });
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
