import { useEffect, useState, type ReactNode } from "react";
import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { ArrowLeft } from "lucide-react";
import { sdkText, type SdkCopy } from "@/lib/cpay/sdk-copy";
import {
  addSdkContact,
  authLnurlLive,
  authorizeAddress,
  broadcastExit,
  checkExit,
  claimAddressTransfer,
  claimHtlc,
  connectTurnkey,
  conversionLimits,
  importExit,
  prepareBatchLive,
  publishLnurlLive,
  publishTransferLive,
  sendBatchLive,
  walletSnapshot,
  watchLive,
  buildUnsignedBatchLive,
  buildUnsignedLive,
  buildUnsignedLnurlLive,
  burnTokenLive,
  buyLive,
  checkAddress,
  checkLive,
  claimDepositLive,
  connectLive,
  createTokenLive,
  currentAddress,
  deleteSdkContact,
  disconnectLive,
  explain,
  exportExit,
  feeRates,
  fiatCurrencies,
  fiatRates,
  freezeTokenLive,
  getLivePayment,
  isLiveConnected,
  issuerState,
  listDeposits,
  listHooks,
  listLivePayments,
  listSdkContacts,
  liveInfo,
  loadPaymentLinkRoutes,
  loadReceiveRoutes,
  mintTokenLive,
  optimizeLive,
  parseLive,
  payLnurlLive,
  paymentLink,
  prepareExit,
  prepareLiveSend,
  prepareLnurlLive,
  present,
  quoteDeposit,
  readSettings,
  receiveLive,
  receiveOnRoute,
  refundConversions,
  refundDepositLive,
  registerAddress,
  registerHook,
  rememberLinkAddress,
  removeAddress,
  removeHook,
  sendLive,
  signLive,
  sparkStatus,
  syncLive,
  tokenMetadata,
  updateSdkContact,
  withdrawLnurlLive,
  writeSettings,
  type LiveNetwork,
} from "@/lib/cpay/sdk";
import { copyText } from "@/lib/cpay/money";
import { useCpay } from "@/lib/cpay/store";

const SECTIONS = [
  "wallet",
  "send",
  "receive",
  "lnurl",
  "address",
  "buy",
  "deposits",
  "tokens",
  "contacts",
  "fiat",
  "settings",
  "advanced",
] as const;

type Section = (typeof SECTIONS)[number];

export function SdkScreen({ close }: { close: () => void }) {
  const lang = useCpay((s) => s.lang);
  const apiKey = useCpay((s) => s.apiKey);
  const mnemonic = useCpay((s) => s.sdkMnemonic);
  const network = useCpay((s) => s.sdkNetwork);
  const account = useCpay((s) => s.sdkAccount);
  const setMnemonic = useCpay((s) => s.setSdkMnemonic);
  const setNetwork = useCpay((s) => s.setSdkNetwork);
  const setAccount = useCpay((s) => s.setSdkAccount);
  const [section, setSection] = useState<Section>("wallet");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");
  const [showSeed, setShowSeed] = useState(false);
  const [connected, setConnected] = useState(isLiveConnected());
  const [sats, setSats] = useState<number | null>(null);
  const [bolt, setBolt] = useState("");
  const [openUrl, setOpenUrl] = useState("");
  const t = (key: SdkCopy) => sdkText(lang, key);

  async function refresh() {
    const snap = await walletSnapshot();
    setSats(snap.balanceSats);
    setConnected(true);
    return snap;
  }

  useEffect(() => {
    if (!validateMnemonic(mnemonic, wordlist)) return;
    if (network === "mainnet" && !apiKey.trim()) return;
    let cancel = false;
    setBusy(true);
    void connectLive({ mnemonic, apiKey, network, account })
      .then(async () => {
        if (cancel) return;
        await watchLive(() => {
          void refresh().catch(() => undefined);
        });
        return refresh();
      })
      .then((snap) => {
        if (!cancel && snap) setOutput(present(snap));
      })
      .catch((error: unknown) => {
        if (!cancel) setOutput(explain(error));
      })
      .finally(() => {
        if (!cancel) setBusy(false);
      });
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mnemonic, network, account, apiKey]);

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    try {
      const value = await task();
      setConnected(isLiveConnected());
      if (value && typeof value === "object") {
        const row = value as { paymentRequest?: unknown; url?: unknown; balanceSats?: unknown };
        if (typeof row.paymentRequest === "string") setBolt(row.paymentRequest);
        if (typeof row.url === "string") setOpenUrl(row.url);
        if (typeof row.balanceSats === "number") setSats(row.balanceSats);
      }
      setOutput(value === undefined ? "OK" : present(value));
    } catch (error) {
      setOutput(explain(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10">
        <header className="flex h-14 items-center gap-2">
          <button
            type="button"
            onClick={close}
            className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-surface"
            aria-label="Back"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
        </header>
        <p className="text-sm text-muted">{t("warn")}</p>
        <p className={`mt-2 text-sm font-medium ${connected ? "text-primary" : "text-muted"}`}>
          {connected ? t("connected") : t("offline")}
          {network === "mainnet" ? " · mainnet" : " · regtest"}
          {sats !== null ? ` · ${sats.toLocaleString()} sats` : ""}
        </p>
        {bolt ? <Qr value={bolt} /> : null}
        {openUrl ? (
          <a href={openUrl} target="_blank" rel="noreferrer" className="mt-3 block break-all text-sm text-primary">
            {openUrl}
          </a>
        ) : null}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {SECTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSection(item)}
              className={`h-11 shrink-0 rounded-full border px-3 text-sm ${section === item ? "border-primary text-primary" : "border-line text-muted"}`}
            >
              {t(item)}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {section === "wallet" ? (
            <WalletPane
              t={t}
              mnemonic={mnemonic}
              showSeed={showSeed}
              network={network}
              account={account}
              busy={busy}
              onMnemonic={setMnemonic}
              onShow={() => setShowSeed((v) => !v)}
              onNetwork={setNetwork}
              onAccount={setAccount}
              onReveal={() => setShowSeed(true)}
              apiKey={apiKey}
              onConnect={() => {
                if (!validateMnemonic(mnemonic, wordlist)) {
                  setOutput(t("badSeed"));
                  return;
                }
                if (network === "mainnet" && !apiKey.trim()) {
                  setOutput(t("keyMissing"));
                  return;
                }
                void run(() => connectLive({ mnemonic, apiKey, network, account }));
              }}
              onRun={run}
            />
          ) : null}
          {section === "send" ? <SendPane t={t} busy={busy} onRun={run} /> : null}
          {section === "receive" ? <ReceivePane t={t} busy={busy} onRun={run} /> : null}
          {section === "lnurl" ? <LnurlPane t={t} busy={busy} onRun={run} /> : null}
          {section === "address" ? <AddressPane t={t} busy={busy} onRun={run} /> : null}
          {section === "buy" ? <BuyPane t={t} busy={busy} onRun={run} /> : null}
          {section === "deposits" ? <DepositPane t={t} busy={busy} onRun={run} /> : null}
          {section === "tokens" ? <TokenPane t={t} busy={busy} onRun={run} /> : null}
          {section === "contacts" ? <ContactPane t={t} busy={busy} onRun={run} /> : null}
          {section === "fiat" ? <FiatPane t={t} busy={busy} onRun={run} /> : null}
          {section === "settings" ? <SettingsPane t={t} busy={busy} onRun={run} /> : null}
          {section === "advanced" ? <AdvancedPane t={t} busy={busy} onRun={run} /> : null}
        </div>
        <div className="mt-4 rounded-2xl border border-line bg-surface p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">{t("result")}</p>
            <button
              type="button"
              className="text-sm font-medium text-primary"
              onClick={() => void copyText(output)}
            >
              {t("copy")}
            </button>
          </div>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-fg">
            {busy ? t("working") : output || "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  mono,
  locked,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
  locked?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-muted">{label}</span>
      <input
        value={value}
        readOnly={locked}
        onChange={(event) => onChange(event.target.value)}
        className={`h-12 w-full rounded-2xl border border-line bg-surface px-3 text-base ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  ghost,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  ghost?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-12 w-full items-center justify-center rounded-2xl px-4 text-base font-semibold disabled:opacity-40 ${ghost ? "border border-line bg-surface text-fg" : "bg-primary text-primary-ink"}`}
    >
      {children}
    </button>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function Qr({ value }: { value: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void import("qrcode")
      .then((mod) => mod.default.toDataURL(value, { margin: 1, width: 240, color: { dark: "#07110C", light: "#F4F4F5" } }))
      .then((next) => {
        if (live) setUrl(next);
      })
      .catch(() => {
        if (live) setUrl(null);
      });
    return () => {
      live = false;
    };
  }, [value]);
  if (!url) return null;
  return <img src={url} alt="" className="mx-auto mt-3 h-44 w-44 rounded-2xl" />;
}

function WalletPane({
  t,
  mnemonic,
  showSeed,
  network,
  account,
  busy,
  onMnemonic,
  onShow,
  onNetwork,
  onAccount,
  onReveal,
  onConnect,
  onRun,
  apiKey,
}: {
  t: (key: SdkCopy) => string;
  mnemonic: string;
  showSeed: boolean;
  network: LiveNetwork;
  account: number;
  busy: boolean;
  onMnemonic: (value: string) => void;
  onShow: () => void;
  onNetwork: (value: LiveNetwork) => void;
  onAccount: (value: number) => void;
  onReveal: () => void;
  onConnect: () => void;
  onRun: (task: () => Promise<unknown>) => void;
  apiKey: string;
}) {
  const [org, setOrg] = useState("");
  const [pub, setPub] = useState("");
  const [priv, setPriv] = useState("");
  const [walletId, setWalletId] = useState("");
  return (
    <>
      <Field label={t("seed")} value={showSeed ? mnemonic : mnemonic ? "•••• •••• ••••" : ""} onChange={onMnemonic} mono locked={!showSeed && Boolean(mnemonic)} />
      <Row>
        <Btn ghost onClick={onShow}>{showSeed ? t("hide") : t("show")}</Btn>
        <Btn
          ghost
          onClick={() => {
            onMnemonic(generateMnemonic(wordlist, 128));
            onReveal();
          }}
        >
          {t("newSeed")}
        </Btn>
      </Row>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onNetwork("regtest")}
          className={`h-12 rounded-2xl border text-sm font-medium ${network === "regtest" ? "border-primary text-primary" : "border-line"}`}
        >
          regtest
        </button>
        <button
          type="button"
          onClick={() => onNetwork("mainnet")}
          className={`h-12 rounded-2xl border text-sm font-medium ${network === "mainnet" ? "border-primary text-primary" : "border-line"}`}
        >
          mainnet
        </button>
      </div>
      <Field label={t("account")} value={String(account)} onChange={(value) => onAccount(Number(value) || 0)} mono />
      <Btn disabled={busy} onClick={onConnect}>{t("connect")}</Btn>
      <Row>
        <Btn ghost disabled={busy} onClick={() => void onRun(syncLive)}>{t("sync")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(() => liveInfo(true))}>{t("info")}</Btn>
      </Row>
      <Row>
        <Btn ghost disabled={busy} onClick={() => void onRun(listLivePayments)}>{t("history")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(sparkStatus)}>{t("status")}</Btn>
      </Row>
      <Btn ghost disabled={busy} onClick={() => void onRun(disconnectLive)}>{t("disconnect")}</Btn>
      <details className="rounded-2xl border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("turnkey")}</summary>
        <div className="mt-3 flex flex-col gap-3">
          <Field label={t("org")} value={org} onChange={setOrg} mono />
          <Field label={t("pubkey")} value={pub} onChange={setPub} mono />
          <Field label={t("secret")} value={priv} onChange={setPriv} mono />
          <Field label={t("walletId")} value={walletId} onChange={setWalletId} mono />
          <Btn
            disabled={busy}
            onClick={() =>
              void onRun(() =>
                connectTurnkey({
                  apiKey,
                  network,
                  account,
                  organizationId: org,
                  apiPublicKey: pub,
                  apiPrivateKey: priv,
                  walletId,
                }),
              )
            }
          >
            {t("connect")}
          </Btn>
        </div>
      </details>
    </>
  );
}

function SendPane({ t, busy, onRun }: Pane) {
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [tokenIdentifier, setToken] = useState("");
  const [speed, setSpeed] = useState<"slow" | "medium" | "fast">("medium");
  const [second, setSecond] = useState("");
  const [secondAmount, setSecondAmount] = useState("");
  return (
    <>
      <Field label={t("destination")} value={destination} onChange={setDestination} mono />
      <Field label={t("amount")} value={amount} onChange={setAmount} mono />
      <Field label={t("tokenId")} value={tokenIdentifier} onChange={setToken} mono />
      <div className="grid grid-cols-3 gap-2">
        {(["slow", "medium", "fast"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSpeed(item)}
            className={`h-11 rounded-2xl border text-sm ${speed === item ? "border-primary text-primary" : "border-line"}`}
          >
            {item}
          </button>
        ))}
      </div>
      <Btn disabled={busy} onClick={() => void onRun(() => parseLive(destination))}>{t("parse")}</Btn>
      <Btn disabled={busy} onClick={() => void onRun(() => prepareLiveSend({ destination, amount, tokenIdentifier }))}>{t("prepare")}</Btn>
      <Row>
        <Btn disabled={busy} onClick={() => void onRun(() => sendLive(speed))}>{t("pay")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(buildUnsignedLive)}>{t("unsigned")}</Btn>
      </Row>
      <Field label={t("destination")} value={second} onChange={setSecond} mono />
      <Field label={t("amount")} value={secondAmount} onChange={setSecondAmount} mono />
      <Btn
        ghost
        disabled={busy}
        onClick={() =>
          void onRun(() =>
            prepareBatchLive([
              { destination, amount, tokenIdentifier },
              { destination: second, amount: secondAmount, tokenIdentifier },
            ]),
          )
        }
      >
        {t("prepare")}
      </Btn>
      <Btn disabled={busy} onClick={() => void onRun(sendBatchLive)}>{t("batch")}</Btn>
    </>
  );
}

function ReceivePane({ t, busy, onRun }: Pane) {
  const [method, setMethod] = useState<"bolt11" | "spark" | "sparkInvoice" | "bitcoin">("bolt11");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [tokenIdentifier, setToken] = useState("");
  const [route, setRoute] = useState("0");
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {(["bolt11", "spark", "sparkInvoice", "bitcoin"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setMethod(item)}
            className={`h-11 rounded-2xl border text-sm ${method === item ? "border-primary text-primary" : "border-line"}`}
          >
            {item}
          </button>
        ))}
      </div>
      <Field label={t("amount")} value={amount} onChange={setAmount} mono />
      <Field label={t("description")} value={description} onChange={setDescription} />
      <Field label={t("tokenId")} value={tokenIdentifier} onChange={setToken} mono />
      <Btn disabled={busy} onClick={() => void onRun(() => receiveLive({ method, amount, description, tokenIdentifier }))}>{t("receive")}</Btn>
      <Btn ghost disabled={busy} onClick={() => void onRun(loadReceiveRoutes)}>{t("routes")}</Btn>
      <Field label={t("pick")} value={route} onChange={setRoute} mono />
      <Btn disabled={busy} onClick={() => void onRun(() => receiveOnRoute(Number(route) || 0, amount))}>USDC / USDT</Btn>
    </>
  );
}

function LnurlPane({ t, busy, onRun }: Pane) {
  const [input, setInput] = useState("");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  return (
    <>
      <Field label="LNURL" value={input} onChange={setInput} mono />
      <Field label={t("amount")} value={amount} onChange={setAmount} mono />
      <Field label={t("comment")} value={comment} onChange={setComment} />
      <Btn disabled={busy} onClick={() => void onRun(() => parseLive(input))}>{t("parse")}</Btn>
      <Btn disabled={busy} onClick={() => void onRun(() => prepareLnurlLive(amount, comment))}>{t("prepare")}</Btn>
      <Row>
        <Btn disabled={busy} onClick={() => void onRun(payLnurlLive)}>{t("pay")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(() => withdrawLnurlLive(amount))}>{t("withdraw")}</Btn>
      </Row>
      <Btn ghost disabled={busy} onClick={() => void onRun(authLnurlLive)}>{t("auth")}</Btn>
    </>
  );
}

function AddressPane({ t, busy, onRun }: Pane) {
  const [username, setUsername] = useState("");
  const [description, setDescription] = useState("CPay");
  const [pubkey, setPubkey] = useState("");
  return (
    <>
      <Field label={t("username")} value={username} onChange={setUsername} />
      <Field label={t("description")} value={description} onChange={setDescription} />
      <Row>
        <Btn ghost disabled={busy} onClick={() => void onRun(() => checkAddress(username))}>{t("check")}</Btn>
        <Btn disabled={busy} onClick={() => void onRun(() => registerAddress(username, description))}>{t("register")}</Btn>
      </Row>
      <Row>
        <Btn ghost disabled={busy} onClick={() => void onRun(currentAddress)}>{t("current")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(removeAddress)}>{t("remove")}</Btn>
      </Row>
      <Field label={t("pubkey")} value={pubkey} onChange={setPubkey} mono />
      <Btn ghost disabled={busy} onClick={() => void onRun(() => authorizeAddress(pubkey))}>{t("authorize")}</Btn>
      <Btn ghost disabled={busy} onClick={() => void onRun(() => claimAddressTransfer(description))}>{t("claimAddr")}</Btn>
    </>
  );
}

function BuyPane({ t, busy, onRun }: Pane) {
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [route, setRoute] = useState("0");
  return (
    <>
      <Field label={t("amount")} value={amount} onChange={setAmount} mono />
      <Btn disabled={busy} onClick={() => void onRun(() => buyLive("cashApp", amount))}>{t("cash")}</Btn>
      <Btn ghost disabled={busy} onClick={() => void onRun(() => buyLive("moonpay", amount))}>{t("moon")}</Btn>
      <Field label={t("destination")} value={address} onChange={setAddress} mono />
      <Field label={t("pick")} value={route} onChange={setRoute} mono />
      <Btn
        ghost
        disabled={busy}
        onClick={() => {
          rememberLinkAddress(address);
          void onRun(() => loadPaymentLinkRoutes(address));
        }}
      >
        {t("routes")}
      </Btn>
      <Btn
        disabled={busy}
        onClick={() => {
          rememberLinkAddress(address);
          void onRun(() => paymentLink(Number(route) || 0, amount));
        }}
      >
        {t("link")}
      </Btn>
    </>
  );
}

function DepositPane({ t, busy, onRun }: Pane) {
  const [txid, setTxid] = useState("");
  const [vout, setVout] = useState("0");
  const [destination, setDestination] = useState("");
  const [fee, setFee] = useState("2");
  return (
    <>
      <Btn ghost disabled={busy} onClick={() => void onRun(listDeposits)}>{t("deposits")}</Btn>
      <Field label={t("txid")} value={txid} onChange={setTxid} mono />
      <Field label={t("vout")} value={vout} onChange={setVout} mono />
      <Row>
        <Btn ghost disabled={busy} onClick={() => void onRun(() => quoteDeposit(txid, vout))}>{t("quote")}</Btn>
        <Btn disabled={busy} onClick={() => void onRun(() => claimDepositLive(txid, vout))}>{t("claim")}</Btn>
      </Row>
      <Field label={t("dest")} value={destination} onChange={setDestination} mono />
      <Field label={t("fee")} value={fee} onChange={setFee} mono />
      <Btn ghost disabled={busy} onClick={() => void onRun(() => refundDepositLive(txid, vout, destination, fee))}>{t("refund")}</Btn>
    </>
  );
}

function TokenPane({ t, busy, onRun }: Pane) {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [decimals, setDecimals] = useState("0");
  const [maxSupply, setSupply] = useState("1000");
  const [freezable, setFreezable] = useState(false);
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [ids, setIds] = useState("");
  return (
    <>
      <Field label={t("name")} value={name} onChange={setName} />
      <Field label={t("ticker")} value={ticker} onChange={setTicker} />
      <Row>
        <Field label={t("decimals")} value={decimals} onChange={setDecimals} mono />
        <Field label={t("supply")} value={maxSupply} onChange={setSupply} mono />
      </Row>
      <button type="button" onClick={() => setFreezable((v) => !v)} className={`h-12 rounded-2xl border text-sm ${freezable ? "border-primary text-primary" : "border-line"}`}>
        {t("freeze")}
      </button>
      <Btn disabled={busy} onClick={() => void onRun(() => createTokenLive({ name, ticker, decimals, maxSupply, freezable }))}>{t("create")}</Btn>
      <Field label={t("amount")} value={amount} onChange={setAmount} mono />
      <Row>
        <Btn disabled={busy} onClick={() => void onRun(() => mintTokenLive(amount))}>{t("mint")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(() => burnTokenLive(amount))}>{t("burn")}</Btn>
      </Row>
      <Field label={t("destination")} value={address} onChange={setAddress} mono />
      <Row>
        <Btn ghost disabled={busy} onClick={() => void onRun(() => freezeTokenLive(address, true))}>{t("lock")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(() => freezeTokenLive(address, false))}>{t("unlock")}</Btn>
      </Row>
      <Btn ghost disabled={busy} onClick={() => void onRun(issuerState)}>{t("issuer")}</Btn>
      <Field label={t("tokenId")} value={ids} onChange={setIds} mono />
      <Btn ghost disabled={busy} onClick={() => void onRun(() => tokenMetadata(ids))}>{t("lookup")}</Btn>
    </>
  );
}

function ContactPane({ t, busy, onRun }: Pane) {
  const [name, setName] = useState("");
  const [paymentIdentifier, setId] = useState("");
  const [contactId, setContactId] = useState("");
  return (
    <>
      <Btn ghost disabled={busy} onClick={() => void onRun(listSdkContacts)}>{t("contacts")}</Btn>
      <Field label={t("name")} value={name} onChange={setName} />
      <Field label={t("destination")} value={paymentIdentifier} onChange={setId} mono />
      <Field label={t("id")} value={contactId} onChange={setContactId} mono />
      <Btn disabled={busy} onClick={() => void onRun(() => addSdkContact(name, paymentIdentifier))}>{t("add")}</Btn>
      <Row>
        <Btn ghost disabled={busy} onClick={() => void onRun(() => updateSdkContact(contactId, name, paymentIdentifier))}>{t("update")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(() => deleteSdkContact(contactId))}>{t("remove")}</Btn>
      </Row>
    </>
  );
}

function FiatPane({ t, busy, onRun }: Pane) {
  return (
    <>
      <Btn disabled={busy} onClick={() => void onRun(fiatCurrencies)}>{t("currencies")}</Btn>
      <Btn ghost disabled={busy} onClick={() => void onRun(fiatRates)}>{t("rates")}</Btn>
    </>
  );
}

function SettingsPane({ t, busy, onRun }: Pane) {
  const [label, setLabel] = useState("USDB");
  const [master, setMaster] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [hookId, setHookId] = useState("");
  return (
    <>
      <Btn ghost disabled={busy} onClick={() => void onRun(readSettings)}>{t("read")}</Btn>
      <Row>
        <Btn disabled={busy} onClick={() => void onRun(() => writeSettings({ privateMode: true }))}>{t("privateOn")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(() => writeSettings({ privateMode: false }))}>{t("privateOff")}</Btn>
      </Row>
      <Field label={t("stable")} value={label} onChange={setLabel} />
      <Row>
        <Btn disabled={busy} onClick={() => void onRun(() => writeSettings({ stableLabel: label }))}>{t("stable")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(() => writeSettings({ clearStable: true }))}>{t("clearStable")}</Btn>
      </Row>
      <Field label={t("master")} value={master} onChange={setMaster} mono />
      <Row>
        <Btn disabled={busy} onClick={() => void onRun(() => writeSettings({ masterKey: master }))}>{t("master")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(() => writeSettings({ clearMaster: true }))}>{t("clearMaster")}</Btn>
      </Row>
      <Field label={t("hookUrl")} value={url} onChange={setUrl} mono />
      <Field label={t("secret")} value={secret} onChange={setSecret} mono />
      <Btn disabled={busy} onClick={() => void onRun(() => registerHook(url, secret))}>{t("hook")}</Btn>
      <Field label={t("id")} value={hookId} onChange={setHookId} mono />
      <Row>
        <Btn ghost disabled={busy} onClick={() => void onRun(listHooks)}>{t("hooks")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(() => removeHook(hookId))}>{t("unhook")}</Btn>
      </Row>
    </>
  );
}

function AdvancedPane({ t, busy, onRun }: Pane) {
  const [message, setMessage] = useState("");
  const [pubkey, setPubkey] = useState("");
  const [signature, setSignature] = useState("");
  const [destination, setDestination] = useState("");
  const [fee, setFee] = useState("5");
  const [txid, setTxid] = useState("");
  const [vout, setVout] = useState("0");
  const [value, setValue] = useState("");
  const [fundKey, setFundKey] = useState("");
  const [secret, setSecret] = useState("");
  const [preimage, setPreimage] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [signed, setSigned] = useState("");
  const [blob, setBlob] = useState("");
  return (
    <>
      <Row>
        <Btn ghost disabled={busy} onClick={() => void onRun(optimizeLive)}>{t("leaves")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(feeRates)}>{t("fees")}</Btn>
      </Row>
      <Field label={t("message")} value={message} onChange={setMessage} />
      <Btn disabled={busy} onClick={() => void onRun(() => signLive(message))}>{t("sign")}</Btn>
      <Field label={t("pubkey")} value={pubkey} onChange={setPubkey} mono />
      <Field label={t("signature")} value={signature} onChange={setSignature} mono />
      <Btn ghost disabled={busy} onClick={() => void onRun(() => checkLive(message, pubkey, signature))}>{t("verify")}</Btn>
      <Btn ghost disabled={busy} onClick={() => void onRun(refundConversions)}>{t("conversions")}</Btn>
      <Field label={t("dest")} value={destination} onChange={setDestination} mono />
      <Field label={t("fee")} value={fee} onChange={setFee} mono />
      <Row>
        <Btn disabled={busy} onClick={() => void onRun(() => prepareExit(fee, destination))}>{t("exit")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(exportExit)}>{t("exportExit")}</Btn>
      </Row>
      <Field label={t("txid")} value={txid} onChange={setTxid} mono />
      <Field label={t("vout")} value={vout} onChange={setVout} mono />
      <Field label={t("amount")} value={value} onChange={setValue} mono />
      <Field label={t("pubkey")} value={fundKey} onChange={setFundKey} mono />
      <Field label={t("secret")} value={secret} onChange={setSecret} mono />
      <Btn
        disabled={busy}
        onClick={() => void onRun(() => broadcastExit({ txid, vout, value, pubkey: fundKey, secretHex: secret }))}
      >
        {t("broadcast")}
      </Btn>
      <Btn ghost disabled={busy} onClick={() => void onRun(checkExit)}>{t("checkExit")}</Btn>
      <Field label={t("paymentLookup")} value={paymentId} onChange={setPaymentId} mono />
      <Btn ghost disabled={busy} onClick={() => void onRun(() => getLivePayment(paymentId))}>{t("paymentLookup")}</Btn>
      <Row>
        <Btn ghost disabled={busy} onClick={() => void onRun(buildUnsignedBatchLive)}>{t("unsignedBatch")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(buildUnsignedLnurlLive)}>{t("unsignedLnurl")}</Btn>
      </Row>
      <Field label={t("publish")} value={signed} onChange={setSigned} mono />
      <Row>
        <Btn ghost disabled={busy} onClick={() => void onRun(() => publishTransferLive(signed))}>{t("publish")}</Btn>
        <Btn ghost disabled={busy} onClick={() => void onRun(() => publishLnurlLive(signed))}>{t("publishLnurl")}</Btn>
      </Row>
      <Field label={t("importExit")} value={blob} onChange={setBlob} mono />
      <Btn ghost disabled={busy} onClick={() => void onRun(() => importExit(blob))}>{t("importExit")}</Btn>
      <Field label={t("htlc")} value={preimage} onChange={setPreimage} mono />
      <Btn ghost disabled={busy} onClick={() => void onRun(() => claimHtlc(preimage))}>{t("htlc")}</Btn>
      <Field label={t("tokenId")} value={tokenId} onChange={setTokenId} mono />
      <Btn ghost disabled={busy} onClick={() => void onRun(() => conversionLimits(tokenId))}>{t("limits")}</Btn>
    </>
  );
}

type Pane = {
  t: (key: SdkCopy) => string;
  busy: boolean;
  onRun: (task: () => Promise<unknown>) => void;
};
