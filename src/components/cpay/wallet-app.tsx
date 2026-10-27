import { useEffect, useRef, useState } from "react";
import { Btn, Field, Frame, BackTitle, Logo, Toast, Line, readQr, Qr } from "./shared-ui";
import { VaultGate, VaultSettings, SecretReveal } from "./vault-gate";
import { LiveSendScreen, LiveReceiveScreen, LiveActivityScreen, useLiveWallet } from "./live-wallet";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Check,
  ChevronRight,
  Home,
  LayoutGrid,
  Receipt,
  Zap,
} from "lucide-react";
import { t, type CopyKey } from "@/lib/cpay/i18n";
import {
  SPEED_FEE,
  cashFee,
  convertFeeCents,
  convertFeeSats,
  copyText,
  formatSats,
  formatUsd,
  lightningFee,
  maxLightning,
  maxStable,
  relTime,
  satsToUsd,
  shortAddr,
  stableFeeCents,
  usdToSats,
  type Speed,
} from "@/lib/cpay/money";
import { parseInput, routesFor, type CashRoute, type Parsed } from "@/lib/cpay/parse";
import { activeMember, useCpay } from "@/lib/cpay/store";
import type { Lang, PayKind, Payment } from "@/lib/cpay/types";
import { Capacitor } from "@capacitor/core";
import { startAds, showAdPrivacyOptions } from "@/lib/cpay/ads";
import { appBreezKey } from "@/lib/cpay/app-key";
import { explain } from "@/lib/cpay/sdk";
import { useBtcPrice } from "@/lib/cpay/use-btc-price";
import { Onboarding, SeedGate, NetworkPicker } from "./onboarding";
import { SdkScreen } from "@/components/cpay/sdk-screen";

type Tab = "home" | "send" | "receive" | "activity" | "more";
type Page =
  | { name: "cash" }
  | { name: "buy" }
  | { name: "convert" }
  | { name: "tokens" }
  | { name: "lnurl" }
  | { name: "claims" }
  | { name: "contacts" }
  | { name: "members" }
  | { name: "settings" }
  | { name: "live" }
  | { name: "detail"; id: string };

function useMe() {
  return useCpay((s) => activeMember(s));
}

function when(ts: number, lang: Lang) {
  const label = relTime(ts);
  return label === "now" ? t(lang, "justNow") : label;
}

function kindLabel(kind: PayKind, lang: Lang) {
  const map: Record<PayKind, CopyKey> = {
    lightning: "kindLightning",
    spark: "kindSpark",
    bitcoin: "kindBitcoin",
    stable: "kindStable",
    cashapp: "kindCash",
    buy: "kindBuy",
    convert: "kindConvert",
    token: "kindToken",
    lnurl: "kindLnurl",
    claim: "kindClaim",
    faucet: "kindFaucet",
  };
  return t(lang, map[kind]);
}

function moneyLine(p: Payment) {
  if (p.kind === "token") return p.detail ? `${p.title} · ${p.detail}` : p.title;
  if (p.sats > 0) return `${formatSats(p.sats)} sats`;
  if (p.usd > 0) return formatUsd(p.usd);
  return kindLabel(p.kind, "en");
}

function Dock({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  const lang = useCpay((s) => s.lang);
  const items: { id: Tab; label: CopyKey; icon: typeof Home }[] = [
    { id: "home", label: "navHome", icon: Home },
    { id: "send", label: "navSend", icon: ArrowUpRight },
    { id: "receive", label: "navGet", icon: ArrowDownLeft },
    { id: "activity", label: "navActivity", icon: Receipt },
    { id: "more", label: "navMore", icon: LayoutGrid },
  ];
  return (
    <div className="fixed inset-x-0 bottom-0 z-20">
      <div className="dock-safe mx-auto w-full max-w-md bg-bg">
        <nav className="grid grid-cols-5 border-t border-line" aria-label="Primary">
          {items.map((item) => {
            const Icon = item.icon;
            const on = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTab(item.id)}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs ${on ? "text-primary" : "text-muted"}`}
              >
                <Icon className="size-5" />
                {t(lang, item.label)}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function HomeScreen({
  open,
  onTab,
}: {
  open: (page: Page) => void;
  onTab: (tab: Tab) => void;
}) {
  const lang = useCpay((s) => s.lang);
  const me = useMe();
  const btcUsd = useCpay((s) => s.btcUsd);
  const priceLive = useCpay((s) => s.priceLive);
  const payments = useCpay((s) => s.payments);
  const deposits = useCpay((s) => s.deposits);
  const members = useCpay((s) => s.members);
  const faucet = useCpay((s) => s.faucet);
  const [mode, setMode] = useState<"usd" | "btc">("usd");
  const [msg, setMsg] = useState<string | null>(null);
  const liveWallet = useLiveWallet(me);
  const live = me?.mode === "live";
  const liveSats = liveWallet.balance;
  if (!me) return null;
  const total = satsToUsd(me.sats, btcUsd) + me.usdbCents / 100;
  const recent = payments.filter((p) => p.memberId === me.id).slice(0, 4);
  const waiting = deposits.filter((d) => d.memberId === me.id);

  return (
    <div className="pt-4">
      <Toast msg={msg} />
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <p className="text-base font-semibold leading-tight">CPay</p>
            <p className="text-sm text-muted">{me.name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => open({ name: "members" })}
          className="h-11 rounded-2xl border border-line bg-surface px-3 text-sm"
        >
          {t(lang, "switch")}
        </button>
      </header>

      <section className="mt-5 rounded-3xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{live ? `${t(lang, "liveBal")} · ${me.network ?? "regtest"}` : t(lang, "practice")}</p>
          <div className="flex rounded-full border border-line p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("usd")}
              className={`h-8 rounded-full px-3 ${mode === "usd" ? "bg-primary text-primary-ink" : "text-muted"}`}
            >
              USD
            </button>
            <button
              type="button"
              onClick={() => setMode("btc")}
              className={`h-8 rounded-full px-3 ${mode === "btc" ? "bg-primary text-primary-ink" : "text-muted"}`}
            >
              BTC
            </button>
          </div>
        </div>
        <p className="mt-3 font-mono text-4xl font-medium tabular-nums tracking-tight">
          {live && liveSats === null ? "—" : mode === "usd" ? formatUsd(live ? satsToUsd(liveSats ?? 0, btcUsd) : total) : formatSats(live ? liveSats ?? 0 : me.sats)}
        </p>
        <p className="mt-1 text-sm text-muted">
          {mode === "usd"
            ? `${live && liveSats === null ? "—" : formatSats(live ? liveSats ?? 0 : me.sats)} sats`
            : live && liveSats === null ? "—" : formatUsd(satsToUsd(live ? liveSats ?? 0 : me.sats, btcUsd))}
        </p>
        <p className="mt-3 font-mono text-xs text-muted">
          {t(lang, "rateLabel")} {formatUsd(btcUsd)} · {priceLive ? t(lang, "liveRate") : t(lang, "practiceRate")}
        </p>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-line bg-surface px-3 py-3">
          <p className="text-xs text-muted">{t(lang, "btcBal")}</p>
          <p className="mt-1 font-mono text-sm tabular-nums">{live && liveSats === null ? "—" : formatSats(live ? liveSats ?? 0 : me.sats)} sats</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface px-3 py-3">
          <p className="text-xs text-muted">{t(lang, "stableBal")}</p>
          <p className="mt-1 font-mono text-sm tabular-nums">{live ? "—" : formatUsd(me.usdbCents / 100)}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          { label: "navSend" as const, icon: ArrowUpRight, go: () => onTab("send") },
          { label: "navGet" as const, icon: ArrowDownLeft, go: () => onTab("receive") },
          { label: "titleCash" as const, icon: Zap, go: () => open({ name: "cash" }) },
          { label: "titleBuy" as const, icon: Banknote, go: () => open({ name: "buy" }) },
        ].filter((action) => !live || action.label === "navSend" || action.label === "navGet").map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.go}
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface text-xs"
          >
            <action.icon className="size-5 text-primary" />
            {t(lang, action.label)}
          </button>
        ))}
      </div>

      {!live && waiting.length > 0 ? (
        <button
          type="button"
          onClick={() => open({ name: "claims" })}
          className="mt-3 flex h-12 w-full items-center justify-between rounded-2xl border border-line bg-surface px-4 text-sm"
        >
          <span>{t(lang, "claimBanner")}</span>
          <span className="font-mono text-primary">{waiting.length}</span>
        </button>
      ) : null}

      {live ? <><p className="mt-3 text-sm text-muted">{liveWallet.loading ? (lang === "bn" ? "লাইভ balance আসছে…" : "Loading live balance…") : ""}</p>{liveWallet.error ? <p role="alert" className="mt-2 text-sm text-danger">{liveWallet.error}</p> : null}<button type="button" onClick={liveWallet.refresh} className="min-h-11 text-sm text-primary">{lang === "bn" ? "Balance রিফ্রেশ" : "Refresh balance"}</button><LiveActivityScreen member={me} compact /></> : <>
      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-base font-semibold">{t(lang, "recent")}</h2>
        <button type="button" onClick={() => onTab("activity")} className="text-sm text-primary">
          {t(lang, "seeAll")}
        </button>
      </div>
      {recent.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">{t(lang, "emptyHome")}</p>
          {(
          <div className="mt-3 flex flex-col gap-2">
            <Btn
              onClick={() => {
                const result = faucet();
                if (result.ok) setMsg(t(lang, "fundsAdded"));
              }}
            >
              {t(lang, "homeFaucet")}
            </Btn>
            {members.length < 2 ? (
              <Btn tone="ghost" onClick={() => open({ name: "members" })}>
                {t(lang, "homeShop")}
              </Btn>
            ) : null}
          </div>
          )}
        </div>
      ) : (
        <ul className="mt-2">
          {recent.map((p) => (
            <PayRow key={p.id} payment={p} lang={lang} onOpen={() => open({ name: "detail", id: p.id })} />
          ))}
        </ul>
      )}
      </>}
      <p className="mt-4 text-center text-xs text-muted">
        {members.length} {t(lang, "membersHere")}
      </p>
    </div>
  );
}

function PayRow({ payment, lang, onOpen }: { payment: Payment; lang: Lang; onOpen: () => void }) {
  const inbound = payment.direction === "in";
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 py-3 text-left">
        <span className={`grid h-11 w-11 place-items-center rounded-2xl ${inbound ? "bg-primary text-primary-ink" : "bg-surface-2 text-fg"}`}>
          {inbound ? <ArrowDownLeft className="size-5" /> : <ArrowUpRight className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{kindLabel(payment.kind, lang)}</span>
          <span className="block truncate text-xs text-muted">{shortAddr(payment.counterparty, 18, 8)}</span>
        </span>
        <span className="text-right">
          <span className={`block font-mono text-sm tabular-nums ${inbound ? "text-primary" : "text-fg"}`}>
            {inbound ? "+" : "−"}
            {moneyLine(payment)}
          </span>
          <span className="block text-xs text-muted">{when(payment.createdAt, lang)}</span>
        </span>
      </button>
    </li>
  );
}

function parsedLocal(parsed: Parsed) {
  if (parsed.type === "bolt11" || parsed.type === "lightning" || parsed.type === "spark" || parsed.type === "bitcoin") {
    return parsed.localMemberId;
  }
  return undefined;
}

function SendScreen({ openDetail }: { openDetail: (id: string) => void }) {
  const me = useMe();
  if (me?.mode === "live") return <LiveSendScreen key={me.id} member={me} />;
  return <PracticeSendScreen openDetail={openDetail} />;
}

function PracticeSendScreen({ openDetail }: { openDetail: (id: string) => void }) {
  const lang = useCpay((s) => s.lang);
  const me = useMe();
  const members = useCpay((s) => s.members);
  const contacts = useCpay((s) => s.contacts);
  const btcUsd = useCpay((s) => s.btcUsd);
  const prefill = useCpay((s) => s.prefill);
  const setPrefill = useCpay((s) => s.setPrefill);
  const sendBitcoin = useCpay((s) => s.sendBitcoin);
  const sendStable = useCpay((s) => s.sendStable);
  const [dest, setDest] = useState("");
  const [step, setStep] = useState<"dest" | "amount" | "review" | "warn" | "done">("dest");
  const [amount, setAmount] = useState("");
  const [speed, setSpeed] = useState<Speed>("medium");
  const [err, setErr] = useState<string | null>(null);
  const [payId, setPayId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!prefill) return;
    setDest(prefill);
    setStep("dest");
    setErr(null);
    setPrefill("");
  }, [prefill, setPrefill]);

  if (!me) return null;
  const parsed = parseInput(dest.trim(), members);
  const stable = parsed.type === "evm" || parsed.type === "solana" || parsed.type === "tron";
  const locked = parsed.type === "bolt11" && parsed.sats != null ? parsed.sats : null;
  const localId = parsedLocal(parsed);
  const local = members.find((m) => m.id === localId);

  function feeSats(sats: number) {
    if (localId) return 0;
    if (parsed.type === "bitcoin") return SPEED_FEE[speed];
    if (parsed.type === "spark") return 1;
    return lightningFee(sats);
  }

  function applyMax() {
    if (stable) {
      setAmount((maxStable(me!.usdbCents) / 100).toFixed(2));
      return;
    }
    if (locked != null) return;
    const room = parsed.type === "bitcoin" && !localId ? me!.sats - SPEED_FEE[speed] : parsed.type === "spark" && !localId ? me!.sats - 1 : maxLightning(me!.sats);
    setAmount(String(Math.max(0, localId ? me!.sats : room)));
  }

  function nextFromDest() {
    if (parsed.type === "empty") return setErr(t(lang, "needDest"));
    if (parsed.type === "unknown") return setErr(t(lang, "unknownDest"));
    if (localId === me?.id) return setErr(t(lang, "selfPay"));
    setErr(null);
    if (locked != null) setAmount(String(locked));
    setStep("amount");
  }

  function nextFromAmount() {
    if (stable) {
      const cents = Math.round(Number(amount) * 100);
      if (!Number.isFinite(cents) || cents < 100) return setErr(t(lang, "lowUsd"));
      if (cents + stableFeeCents(cents) > me!.usdbCents) return setErr(t(lang, "notEnough"));
    } else {
      const sats = locked ?? Math.round(Number(amount));
      if (!Number.isFinite(sats) || sats <= 0) return setErr(t(lang, "badAmount"));
      if (sats + feeSats(sats) > me!.sats) return setErr(t(lang, "noFit"));
    }
    setErr(null);
    setStep(parsed.type === "bitcoin" && parsed.mainnetLike ? "warn" : "review");
  }

  async function pay() {
    const result = stable
      ? sendStable({ destination: dest.trim(), cents: Math.round(Number(amount) * 100), note: "" })
      : sendBitcoin({
          destination: dest.trim(),
          sats: locked ?? Math.round(Number(amount)),
          speed,
          note: "",
        });
    if (!result.ok) {
      setErr(t(lang, result.error));
      return;
    }
    setPayId(result.id ?? null);
    setStep("done");
  }

  const sats = locked ?? Math.round(Number(amount) || 0);
  const cents = Math.round(Number(amount || 0) * 100);
  const fee = stable ? stableFeeCents(cents) : feeSats(sats);

  return (
    <div className="pt-4">
      <h1 className="text-2xl font-semibold">{t(lang, "sendH")}</h1>
      <p className="mt-1 text-sm text-muted">{t(lang, "sendP")}</p>

      {step === "dest" ? (
        <div className="mt-5 flex flex-col gap-3">
          <Field label={t(lang, "destLabel")} value={dest} onChange={setDest} placeholder={t(lang, "destPh")} mono />
          <input
            ref={scanRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void readQr(file).then((text) => {
                setDest(text);
                setErr(null);
              }).catch(() => setErr(t(lang, "unknownDest")));
            }}
          />
          <Btn tone="ghost" onClick={() => scanRef.current?.click()}>{t(lang, "scan")}</Btn>
          {parsed.type !== "empty" && parsed.type !== "unknown" ? (
            <p className="text-sm text-primary">
              {t(lang, "detected")}: {parsed.type}
              {local ? ` · ${local.name}` : ""}
            </p>
          ) : null}
          {contacts.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto">
              {contacts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setDest(c.address)}
                  className="h-10 shrink-0 rounded-full border border-line bg-surface px-3 text-sm"
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
          {err ? <p className="text-sm text-danger">{err}</p> : null}
          <Btn onClick={nextFromDest}>{t(lang, "sendNext")}</Btn>
        </div>
      ) : null}

      {step === "amount" ? (
        <div className="mt-5 flex flex-col gap-3">
          <p className="break-all font-mono text-xs text-muted">{shortAddr(dest.trim(), 16, 10)}</p>
          <Field
            label={stable ? t(lang, "amountUsd") : t(lang, "amountSats")}
            value={locked != null ? String(locked) : amount}
            onChange={locked != null ? () => undefined : setAmount}
            inputMode="decimal"
            mono
          />
          {!stable && locked == null ? (
            <p className="text-sm text-muted">
              {t(lang, "approx")} {formatUsd(satsToUsd(Math.round(Number(amount) || 0), btcUsd))}
            </p>
          ) : null}
          {locked != null ? <p className="text-sm text-muted">{t(lang, "lockAmt")}</p> : null}
          <div className="grid grid-cols-3 gap-2">
            {(["25", "50", "100"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  if (p === "100") applyMax();
                  else if (stable) setAmount(((maxStable(me.usdbCents) / 100) * (Number(p) / 100)).toFixed(2));
                  else if (locked == null) {
                    const max = localId ? me.sats : parsed.type === "bitcoin" ? me.sats - SPEED_FEE[speed] : maxLightning(me.sats);
                    setAmount(String(Math.floor(Math.max(0, max) * (Number(p) / 100))));
                  }
                }}
                className="h-11 rounded-2xl border border-line bg-surface text-sm"
              >
                {p === "100" ? t(lang, "max") : `${p}%`}
              </button>
            ))}
          </div>
          {parsed.type === "bitcoin" && !localId ? (
            <div className="grid grid-cols-3 gap-2">
              {(["slow", "medium", "fast"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`h-11 rounded-2xl border text-sm ${speed === s ? "border-primary text-primary" : "border-line text-muted"}`}
                >
                  {t(lang, s)}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-sm text-muted">
            {t(lang, "available")}{" "}
            {stable ? formatUsd(me.usdbCents / 100) : `${formatSats(me.sats)} sats`}
          </p>
          {err ? <p className="text-sm text-danger">{err}</p> : null}
          <Btn onClick={nextFromAmount}>{t(lang, "review")}</Btn>
          <Btn tone="ghost" onClick={() => setStep("dest")}>{t(lang, "back")}</Btn>
        </div>
      ) : null}

      {step === "warn" ? (
        <div className="mt-5 rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-lg font-semibold">{t(lang, "warnTitle")}</h2>
          <p className="mt-2 text-sm text-muted">{t(lang, "warnBody")}</p>
          <div className="mt-4 flex flex-col gap-2">
            <Btn onClick={() => setStep("review")}>{t(lang, "warnGo")}</Btn>
            <Btn tone="ghost" onClick={() => setStep("dest")}>{t(lang, "warnStay")}</Btn>
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="mt-5 flex flex-col gap-3">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <Line k={t(lang, "reviewTo")} v={local?.name ?? shortAddr(dest.trim(), 14, 8)} />
            <Line k={t(lang, "reviewVia")} v={localId ? t(lang, "railSpark") : stable ? t(lang, "dollars") : parsed.type === "bitcoin" ? t(lang, "railBtc") : t(lang, "railLn")} />
            <Line k={t(lang, "youSend")} v={stable ? formatUsd(cents / 100) : `${formatSats(sats)} sats`} />
            <Line k={t(lang, "fee")} v={stable ? formatUsd(fee / 100) : fee === 0 ? t(lang, "free") : `${formatSats(fee)} sats`} />
            <Line
              k={t(lang, "reviewLeft")}
              v={stable ? formatUsd((me.usdbCents - cents - fee) / 100) : `${formatSats(me.sats - sats - fee)} sats`}
            />
            {localId ? <p className="pt-2 text-sm text-primary">{t(lang, "sparkCheaper")}</p> : <p className="pt-2 text-sm text-muted">{t(lang, "broadcastNo")}</p>}
          </div>
          {err ? <p className="text-sm text-danger">{err}</p> : null}
          <Btn onClick={() => void pay()} disabled={busy}>{t(lang, "sendPay")}</Btn>
          <Btn tone="ghost" onClick={() => setStep("amount")}>{t(lang, "editAmt")}</Btn>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="mt-8 flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-ink">
            <Check className="size-7" />
          </span>
          <h2 className="mt-4 text-2xl font-semibold">{t(lang, "successH")}</h2>
          <p className="mt-2 text-sm text-muted">{localId ? t(lang, "internalOk") : t(lang, "externalOk")}</p>
          <div className="mt-6 flex w-full flex-col gap-2">
            {payId ? <Btn onClick={() => openDetail(payId)}>{t(lang, "viewReceipt")}</Btn> : null}
            <Btn
              tone="ghost"
              onClick={() => {
                setDest("");
                setAmount("");
                setStep("dest");
                setPayId(null);
              }}
            >
              {t(lang, "sendNew")}
            </Btn>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReceiveScreen({ ping }: { ping: (msg: string) => void }) {
  const me = useMe();
  if (me?.mode === "live") return <LiveReceiveScreen key={me.id} member={me} />;
  return <PracticeReceiveScreen ping={ping} />;
}

function PracticeReceiveScreen({ ping }: { ping: (msg: string) => void }) {
  const lang = useCpay((s) => s.lang);
  const me = useMe();
  const rotate = useCpay((s) => s.rotateAddress);
  const simulateDeposit = useCpay((s) => s.simulateDeposit);
  const simulateStable = useCpay((s) => s.simulateStable);
  const [method, setMethod] = useState<"ln" | "spark" | "btc" | "usd">("ln");
  const [amt, setAmt] = useState("");
  const [asset, setAsset] = useState<"USDC" | "USDT">("USDC");
  const [chain, setChain] = useState("Base");
  const [req, setReq] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!me) return null;
  const tabs = [
    { id: "ln" as const, label: "tabLn" as const },
    { id: "spark" as const, label: "tabSp" as const },
    { id: "btc" as const, label: "tabBt" as const },
    { id: "usd" as const, label: "tabSt" as const },
  ];

  async function make() {
    if (method === "ln") {
      const sats = Math.round(Number(amt));
      setReq(Number.isFinite(sats) && sats > 0 ? `lnbc${sats}n1p${me!.id}` : `lnbcany1p${me!.id}`);
    } else if (method === "spark") setReq(me!.spark);
    else if (method === "btc") setReq(me!.bitcoin);
    else setReq(`usdb:${asset}:${chain}:${me!.id}`);
  }

  const lead =
    method === "ln" ? t(lang, "lightningLead") : method === "spark" ? t(lang, "sparkLead") : method === "btc" ? t(lang, "bitcoinLead") : t(lang, "stableLead");

  return (
    <div className="pt-4">
      <h1 className="text-2xl font-semibold">{t(lang, "recvH")}</h1>
      <div className="mt-4 grid grid-cols-4 gap-1 rounded-2xl border border-line p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setMethod(tab.id);
              setReq(null);
            }}
            className={`h-10 rounded-xl text-xs ${method === tab.id ? "bg-primary text-primary-ink" : "text-muted"}`}
          >
            {t(lang, tab.label)}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">{lead}</p>
      {method === "ln" ? (
        <div className="mt-3">
          <Field label={t(lang, "amtOpt")} value={amt} onChange={setAmt} inputMode="numeric" placeholder={t(lang, "leaveBlank")} mono />
        </div>
      ) : null}
      {method === "usd" ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(["USDC", "USDT"] as const).map((a) => (
            <button key={a} type="button" onClick={() => setAsset(a)} className={`h-11 rounded-2xl border text-sm ${asset === a ? "border-primary text-primary" : "border-line"}`}>
              {a}
            </button>
          ))}
          {["Base", "Ethereum", "Solana", "Tron"].map((c) => (
            <button key={c} type="button" onClick={() => setChain(c)} className={`h-11 rounded-2xl border text-sm ${chain === c ? "border-primary text-primary" : "border-line"}`}>
              {c}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-3">
        <Btn onClick={() => void make()}>{t(lang, "make")}</Btn>
      </div>
      {err ? <p className="mt-3 text-sm text-danger">{err}</p> : null}
      {req ? (
        <div className="mt-4 flex flex-col items-center gap-3">
          <Qr value={req} />
          <p className="w-full break-all text-center font-mono text-xs text-muted">{req}</p>
          <p className="text-center text-xs text-danger">{t(lang, "doNot")}</p>
          <Btn
            tone="ghost"
            onClick={() => {
              void copyText(req).then((ok) => ping(ok ? t(lang, "reqCopied") : t(lang, "failCopy")));
            }}
          >
            {t(lang, "copyB")}
          </Btn>
          {method === "btc" ? (
            <>
              <Btn
                onClick={() => {
                  const result = simulateDeposit();
                  if (result.ok) ping(t(lang, "depositMade"));
                }}
              >
                {t(lang, "simPay")}
              </Btn>
              <Btn
                tone="ghost"
                onClick={() => {
                  void rotate().then((result) => {
                    if (result.ok) {
                      const next = useCpay.getState().members.find((m) => m.id === me.id)?.bitcoin;
                      if (next) setReq(next);
                      ping(t(lang, "rotated"));
                    }
                  });
                }}
              >
                {t(lang, "newA")}
              </Btn>
            </>
          ) : null}
          {method === "usd" ? (
            <Btn
              onClick={() => {
                const result = simulateStable(2500);
                if (result.ok) ping(t(lang, "stableIn"));
              }}
            >
              {t(lang, "simStable")}
            </Btn>
          ) : null}
          <p className="text-center text-xs text-muted">{t(lang, "scanHint")}</p>
        </div>
      ) : null}
    </div>
  );
}

function ActivityScreen({ open }: { open: (page: Page) => void }) {
  const me = useMe();
  if (me?.mode === "live") return <LiveActivityScreen key={me.id} member={me} />;
  return <PracticeActivityScreen open={open} />;
}

function PracticeActivityScreen({ open }: { open: (page: Page) => void }) {
  const lang = useCpay((s) => s.lang);
  const me = useMe();
  const payments = useCpay((s) => s.payments);
  const [filter, setFilter] = useState<"all" | "in" | "out" | "pending">("all");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"this" | "all">("this");
  if (!me) return null;
  const rows = payments.filter((p) => {
    if (scope === "this" && p.memberId !== me.id) return false;
    if (filter === "in" && p.direction !== "in") return false;
    if (filter === "out" && p.direction !== "out") return false;
    if (filter === "pending" && p.status !== "pending") return false;
    if (q.trim()) {
      const blob = `${p.counterparty} ${p.title} ${p.kind} ${p.detail}`.toLowerCase();
      if (!blob.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });
  return (
    <div className="pt-4">
      <h1 className="text-2xl font-semibold">{t(lang, "actH")}</h1>
      <div className="mt-3">
        <Field label={t(lang, "actSearch")} value={q} onChange={setQ} placeholder={t(lang, "qPh")} />
      </div>
      <div className="mt-3 flex gap-2">
        {(["all", "in", "out", "pending"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`h-10 rounded-full px-3 text-sm ${filter === f ? "bg-primary text-primary-ink" : "border border-line text-muted"}`}
          >
            {t(lang, f === "all" ? "allB" : f === "in" ? "inB" : f === "out" ? "outB" : "pendB")}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setScope(scope === "this" ? "all" : "this")} className="mt-3 text-sm text-primary">
        {scope === "this" ? t(lang, "thisB") : t(lang, "allWB")}
      </button>
      {rows.length === 0 ? <p className="mt-6 text-sm text-muted">{t(lang, "emptyA")}</p> : null}
      <ul>
        {rows.map((p) => (
          <PayRow key={p.id} payment={p} lang={lang} onOpen={() => open({ name: "detail", id: p.id })} />
        ))}
      </ul>
    </div>
  );
}

function MoreScreen({ open }: { open: (page: Page) => void }) {
  const me = useMe();
  const lang = useCpay((s) => s.lang);
  const items: { page: Page; title: CopyKey; body: CopyKey }[] = [
    { page: { name: "live" }, title: "featureLive", body: "liveBlurb" },
    { page: { name: "cash" }, title: "featureCash", body: "cashBlurb" },
    { page: { name: "buy" }, title: "featureBuy", body: "buyBlurb" },
    { page: { name: "convert" }, title: "featureConvert", body: "convBlurb" },
    { page: { name: "tokens" }, title: "featureToken", body: "tokBlurb" },
    { page: { name: "lnurl" }, title: "featureLnurl", body: "lnBlurb" },
    { page: { name: "claims" }, title: "featureClaim", body: "clBlurb" },
    { page: { name: "contacts" }, title: "featureContacts", body: "bookBlurb" },
    { page: { name: "members" }, title: "featureMembers", body: "memBlurb" },
    { page: { name: "settings" }, title: "featureSettings", body: "setBlurb" },
  ];
  return (
    <div className="pt-4">
      <h1 className="text-2xl font-semibold">{t(lang, "moreTitle")}</h1>
      <p className="mt-1 text-sm text-muted">{t(lang, "moreLead")}</p>
      <ul className="mt-4 flex flex-col gap-2">
        {items.filter((item) => me?.mode !== "live" || ["live", "contacts", "members", "settings"].includes(item.page.name)).map((item) => (
          <li key={item.title}>
            <button
              type="button"
              onClick={() => open(item.page)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t(lang, item.title)}</span>
                <span className="block text-xs text-muted">{t(lang, item.body)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CashScreen({ close, ping }: { close: () => void; ping: (m: string) => void }) {
  const lang = useCpay((s) => s.lang);
  const members = useCpay((s) => s.members);
  const recordCash = useCpay((s) => s.recordCash);
  const [addr, setAddr] = useState("");
  const [usd, setUsd] = useState("10");
  const [route, setRoute] = useState<CashRoute | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const parsed = parseInput(addr.trim(), members);
  const routes = routesFor(parsed);

  function quote() {
    const amount = Number(usd);
    if (routes.length === 0) return setErr(t(lang, "badCash"));
    if (!Number.isFinite(amount) || amount < 1) return setErr(t(lang, "lowUsd"));
    const picked = route && routes.some((r) => r.id === route.id) ? route : routes[0];
    setRoute(picked);
    setErr(null);
    const fee = cashFee(amount, picked.bps);
    const slug = `${picked.asset}-${picked.chain}-${amount.toFixed(2)}`.toLowerCase();
    setLink(`https://cash.app/launch/lightning/practice-${slug}`);
  }

  const amount = Number(usd) || 0;
  const picked = route && routes.some((r) => r.id === route.id) ? route : routes[0];
  const fee = picked ? cashFee(amount, picked.bps) : 0;

  return (
    <Frame>
      <BackTitle title={t(lang, "cashH")} onBack={close} />
      <p className="text-sm text-muted">{t(lang, "cashP")}</p>
      <div className="mt-4 flex flex-col gap-3">
        <Field label={t(lang, "addrPh")} value={addr} onChange={(v) => { setAddr(v); setLink(null); }} placeholder="0x… / Solana / Tron" mono />
        {routes.length > 0 ? <p className="text-sm text-primary">{t(lang, "addressOk")}</p> : null}
        <div className="flex flex-col gap-2">
          {routes.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => { setRoute(r); setLink(null); }}
              className={`rounded-2xl border px-3 py-3 text-left ${(picked?.id ?? "") === r.id ? "border-primary" : "border-line"}`}
            >
              <span className="block text-sm font-medium">{r.asset} · {r.chain}</span>
              <span className="block text-xs text-muted">{r.provider} · {(r.bps / 100).toFixed(2)}%</span>
            </button>
          ))}
        </div>
        <Field label={t(lang, "amountUsd")} value={usd} onChange={(v) => { setUsd(v); setLink(null); }} inputMode="decimal" mono />
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        <Btn onClick={quote}>{t(lang, "getQ")}</Btn>
        {link && picked ? (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <Line k={t(lang, "youPayL")} v={formatUsd(amount)} />
            <Line k={t(lang, "theyL")} v={`${(amount - fee).toFixed(2)} ${picked.asset}`} />
            <Line k={t(lang, "feeL")} v={formatUsd(fee)} />
            <Line k={t(lang, "viaL")} v={`${picked.provider} · ${picked.chain}`} />
            <p className="pt-2 text-sm text-primary">{t(lang, "noteL")}</p>
            <p className="break-all pt-2 font-mono text-xs text-muted">{link}</p>
            <p className="pt-2 text-xs text-muted">{appBreezKey() ? t(lang, "setKeyHelp") : t(lang, "noApi")}</p>
            <div className="mt-3 flex flex-col gap-2">
              <Btn
                tone="ghost"
                onClick={() => {
                  void copyText(link).then((ok) => ping(ok ? t(lang, "linkCopied") : t(lang, "failCopy")));
                }}
              >
                {t(lang, "copyL")}
              </Btn>
              <Btn
                onClick={() => {
                  const result = recordCash({
                    to: addr.trim(),
                    payUsd: amount,
                    outUsd: Number((amount - fee).toFixed(2)),
                    asset: picked.asset,
                    chain: picked.chain,
                  });
                  if (result.ok) {
                    ping(t(lang, "cashRecorded"));
                    close();
                  }
                }}
              >
                {t(lang, "markL")}
              </Btn>
            </div>
          </div>
        ) : null}
      </div>
    </Frame>
  );
}

function BuyScreen({ close, ping }: { close: () => void; ping: (m: string) => void }) {
  const lang = useCpay((s) => s.lang);
  const btcUsd = useCpay((s) => s.btcUsd);
  const buy = useCpay((s) => s.buyBitcoin);
  const [usd, setUsd] = useState("25");
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const amount = Number(usd) || 0;
  const fee = Math.max(0.15, amount * 0.015);
  const sats = usdToSats(Math.max(0, amount - fee), btcUsd);
  return (
    <Frame>
      <BackTitle title={t(lang, "buyH")} onBack={close} />
      <p className="text-sm text-muted">{t(lang, "explainedBuy")}</p>
      <div className="mt-4 flex flex-col gap-3">
        <Field label={t(lang, "buyP")} value={usd} onChange={(v) => { setUsd(v); setReady(false); }} inputMode="decimal" mono />
        {ready ? (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <Line k={t(lang, "cashPays")} v={formatUsd(amount)} />
            <Line k={t(lang, "buyFee")} v={formatUsd(fee)} />
            <Line k={t(lang, "youReceiveBtc")} v={`${formatSats(sats)} sats`} />
          </div>
        ) : null}
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        {!ready ? <Btn onClick={() => (amount >= 1 ? setReady(true) : setErr(t(lang, "lowUsd")))}>{t(lang, "prep")}</Btn> : (
          <Btn
            onClick={() => {
              const result = buy(amount);
              if (!result.ok) setErr(t(lang, result.error));
              else {
                ping(t(lang, "buyAdded"));
                close();
              }
            }}
          >
            {t(lang, "simB")}
          </Btn>
        )}
      </div>
    </Frame>
  );
}

function ConvertScreen({ close, ping }: { close: () => void; ping: (m: string) => void }) {
  const lang = useCpay((s) => s.lang);
  const me = useMe();
  const btcUsd = useCpay((s) => s.btcUsd);
  const convert = useCpay((s) => s.convert);
  const [dir, setDir] = useState<"btc-usd" | "usd-btc">("btc-usd");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (!me) return null;
  const raw = Number(amount) || 0;
  const preview =
    dir === "btc-usd"
      ? formatUsd(satsToUsd(Math.round(raw), btcUsd))
      : `${formatSats(usdToSats(raw, btcUsd))} sats`;
  return (
    <Frame>
      <BackTitle title={t(lang, "convH")} onBack={close} />
      <p className="text-sm text-muted">{t(lang, "convP")}</p>
      <div className="mt-4 flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3">
        <div>
          <p className="text-xs text-muted">{t(lang, "from")}</p>
          <p className="text-base font-medium">{dir === "btc-usd" ? t(lang, "convBtc") : t(lang, "convUsd")}</p>
        </div>
        <button type="button" onClick={() => setDir(dir === "btc-usd" ? "usd-btc" : "btc-usd")} className="grid h-11 w-11 place-items-center rounded-full border border-line" aria-label={t(lang, "swap")}>
          <ArrowLeftRight className="size-5 text-primary" />
        </button>
        <div className="text-right">
          <p className="text-xs text-muted">{t(lang, "to")}</p>
          <p className="text-base font-medium">{dir === "btc-usd" ? t(lang, "intoUsd") : t(lang, "intoBtc")}</p>
        </div>
      </div>
      <div className="mt-3">
        <Field label={dir === "btc-usd" ? t(lang, "amountSats") : t(lang, "amountUsd")} value={amount} onChange={setAmount} inputMode="decimal" mono />
      </div>
      <p className="mt-2 text-sm text-muted">
        {t(lang, "youGet")} {raw > 0 ? preview : "—"} · {t(lang, "fee")}{" "}
        {dir === "btc-usd" ? `${formatSats(convertFeeSats(Math.round(raw)))} sats` : formatUsd(convertFeeCents(Math.round(raw * 100)) / 100)}
      </p>
      {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
      <div className="mt-4">
        <Btn
          onClick={() => {
            const result = convert(dir, dir === "usd-btc" ? Math.round(raw * 100) : Math.round(raw));
            if (!result.ok) setErr(t(lang, result.error));
            else {
              ping(t(lang, "convAdded"));
              close();
            }
          }}
        >
          {t(lang, "run")}
        </Btn>
      </div>
    </Frame>
  );
}

function TokenScreen({ close, ping }: { close: () => void; ping: (m: string) => void }) {
  const lang = useCpay((s) => s.lang);
  const me = useMe();
  const members = useCpay((s) => s.members);
  const issue = useCpay((s) => s.issueToken);
  const send = useCpay((s) => s.sendToken);
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [supply, setSupply] = useState("1000");
  const [to, setTo] = useState("");
  const [tick, setTick] = useState("");
  const [qty, setQty] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (!me) return null;
  const others = members.filter((m) => m.id !== me.id);
  return (
    <Frame>
      <BackTitle title={t(lang, "tokH")} onBack={close} />
      <h2 className="text-base font-semibold">{t(lang, "issueH")}</h2>
      <div className="mt-3 flex flex-col gap-3">
        <Field label={t(lang, "tokTicker")} value={ticker} onChange={setTicker} placeholder={t(lang, "tickPh")} />
        <Field label={t(lang, "tokName")} value={name} onChange={setName} placeholder={t(lang, "namePh2")} />
        <Field label={t(lang, "tokSupply")} value={supply} onChange={setSupply} inputMode="numeric" mono />
        <Btn
          onClick={() => {
            const result = issue(ticker, name, Number(supply));
            if (!result.ok) setErr(t(lang, result.error));
            else {
              setTicker("");
              setName("");
              ping(t(lang, "tokenIssued"));
            }
          }}
        >
          {t(lang, "issueB")}
        </Btn>
      </div>
      <h2 className="mt-6 text-base font-semibold">{t(lang, "yourTokens")}</h2>
      {me.tokens.length === 0 ? <p className="mt-2 text-sm text-muted">{t(lang, "noTokens")}</p> : (
        <ul className="mt-2">
          {me.tokens.map((token) => (
            <li key={token.id} className="flex items-center justify-between border-b border-line py-3">
              <span>
                <span className="block text-sm font-medium">{token.ticker}</span>
                <span className="block text-xs text-muted">{token.name}</span>
              </span>
              <span className="font-mono text-sm tabular-nums">{token.amount}</span>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-6 text-base font-semibold">{t(lang, "sendH2")}</h2>
      {others.length === 0 ? <p className="mt-2 text-sm text-muted">{t(lang, "noOther")}</p> : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {others.map((m) => (
              <button key={m.id} type="button" onClick={() => setTo(m.id)} className={`h-11 rounded-2xl border px-3 text-left text-sm ${to === m.id ? "border-primary" : "border-line"}`}>
                {m.name}
              </button>
            ))}
          </div>
          <Field label={t(lang, "ticker")} value={tick} onChange={setTick} placeholder="BTKN" />
          <Field label={t(lang, "amtL")} value={qty} onChange={setQty} inputMode="numeric" mono />
          <Btn
            onClick={() => {
              const result = send(tick.trim().toUpperCase(), to, Number(qty));
              if (!result.ok) setErr(t(lang, result.error));
              else ping(t(lang, "tokenSent"));
            }}
          >
            {t(lang, "sendB")}
          </Btn>
        </div>
      )}
      {err ? <p className="mt-3 text-sm text-danger">{err}</p> : null}
    </Frame>
  );
}

function LnurlScreen({ close, ping }: { close: () => void; ping: (m: string) => void }) {
  const lang = useCpay((s) => s.lang);
  const withdraw = useCpay((s) => s.lnurlWithdraw);
  const [code, setCode] = useState("lnurl1practicewithdraw");
  const [sats, setSats] = useState("5000");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Frame>
      <BackTitle title={t(lang, "lnH")} onBack={close} />
      <p className="text-sm text-muted">{t(lang, "lnP")}</p>
      <div className="mt-4 flex flex-col gap-3">
        <Field label={t(lang, "lnCode")} value={code} onChange={setCode} mono />
        <Field label={t(lang, "lnAmt")} value={sats} onChange={setSats} inputMode="numeric" mono />
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        <Btn
          onClick={() => {
            const result = withdraw(code, Number(sats));
            if (!result.ok) setErr(t(lang, result.error));
            else {
              ping(t(lang, "lnAdded"));
              close();
            }
          }}
        >
          {t(lang, "pull")}
        </Btn>
      </div>
    </Frame>
  );
}

function ClaimsScreen({ close, ping }: { close: () => void; ping: (m: string) => void }) {
  const lang = useCpay((s) => s.lang);
  const me = useMe();
  const deposits = useCpay((s) => s.deposits);
  const claim = useCpay((s) => s.claim);
  const claimAll = useCpay((s) => s.claimAll);
  if (!me) return null;
  const mine = deposits.filter((d) => d.memberId === me.id);
  return (
    <Frame>
      <BackTitle title={t(lang, "clH")} onBack={close} />
      <p className="text-sm text-muted">{t(lang, "clP")}</p>
      {mine.length === 0 ? <p className="mt-6 text-sm text-muted">{t(lang, "noneC")}</p> : (
        <>
          <ul className="mt-4">
            {mine.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 border-b border-line py-3">
                <span>
                  <span className="block font-mono text-sm">{formatSats(d.sats)} sats</span>
                  <span className="block text-xs text-muted">{shortAddr(d.address)}</span>
                </span>
                <button
                  type="button"
                  className="h-11 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-ink"
                  onClick={() => {
                    const result = claim(d.id);
                    if (result.ok) ping(t(lang, "claimDone"));
                  }}
                >
                  {t(lang, "doC")}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Btn onClick={() => { const result = claimAll(); if (result.ok) ping(t(lang, "claimDone")); }}>{t(lang, "allC")}</Btn>
          </div>
        </>
      )}
    </Frame>
  );
}

function ContactsScreen({ close, useAddr }: { close: () => void; useAddr: (addr: string) => void }) {
  const lang = useCpay((s) => s.lang);
  const contacts = useCpay((s) => s.contacts);
  const add = useCpay((s) => s.addContact);
  const remove = useCpay((s) => s.removeContact);
  const [name, setName] = useState("");
  const [addr, setAddr] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Frame>
      <BackTitle title={t(lang, "ctH")} onBack={close} />
      <p className="text-sm text-muted">{t(lang, "ctP")}</p>
      <div className="mt-4 flex flex-col gap-3">
        <Field label={t(lang, "ctName")} value={name} onChange={setName} />
        <Field label={t(lang, "ctAddr")} value={addr} onChange={setAddr} mono />
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        <Btn
          onClick={() => {
            const result = add(name, addr);
            if (!result.ok) setErr(t(lang, result.error));
            else {
              setName("");
              setAddr("");
              setErr(null);
            }
          }}
        >
          {t(lang, "ctSave")}
        </Btn>
      </div>
      <ul className="mt-4">
        {contacts.length === 0 ? <li className="text-sm text-muted">{t(lang, "emptyC")}</li> : null}
        {contacts.map((c) => (
          <li key={c.id} className="flex items-center gap-2 border-b border-line py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{c.name}</span>
              <span className="block truncate font-mono text-xs text-muted">{c.address}</span>
            </span>
            <button type="button" className="h-11 rounded-xl border border-line px-3 text-sm" onClick={() => useAddr(c.address)}>
              {t(lang, "useB")}
            </button>
            <button type="button" className="h-11 rounded-xl px-2 text-sm text-danger" onClick={() => remove(c.id)}>
              {t(lang, "delB")}
            </button>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function MembersScreen({ close, ping }: { close: () => void; ping: (m: string) => void }) {
  const lang = useCpay((s) => s.lang);
  const members = useCpay((s) => s.members);
  const activeId = useCpay((s) => s.activeId);
  const switchTo = useCpay((s) => s.switchTo);
  const removeMember = useCpay((s) => s.removeMember);
  const addShop = useCpay((s) => s.addShop);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [walletMode, setWalletMode] = useState<"practice" | "live">("live");
  const [network, setNetwork] = useState<"regtest" | "mainnet">("regtest");
  const [phrase, setPhrase] = useState("");
  const [account, setAccount] = useState("0");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Frame>
      <BackTitle title={t(lang, "memH")} onBack={close} />
      <p className="text-sm text-muted">{t(lang, "memP")}</p>
      <ul className="mt-4 flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.id} className="rounded-2xl border border-line bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-base font-medium">
                  {m.name} {m.id === activeId ? <span className="text-xs text-primary">{t(lang, "memActive")}</span> : null}
                </p>
                <p className="font-mono text-xs text-muted">{m.mode === "live" ? `Live · ${m.network} · Account ${m.account ?? 0}` : m.lightning}</p>
              </div>
              {m.id !== activeId ? (
                <button type="button" className="h-11 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-ink" onClick={() => { switchTo(m.id); ping(t(lang, "switched")); }}>
                  {t(lang, "memUse")}
                </button>
              ) : null}
            </div>
            <p className="mt-2 font-mono text-xs text-muted">
              {m.mode === "live" ? (lang === "bn" ? "লাইভ balance Home-এ দেখুন" : "Live balance is shown on Home") : `${formatSats(m.sats)} sats · ${formatUsd(m.usdbCents / 100)}`}
            </p>
            <div className="mt-2 flex gap-3">
              <SecretReveal secret={m.seed.join(" ")} lang={lang} />
              <button
                type="button"
                disabled={m.mode === "live"}
                className="text-sm text-danger disabled:opacity-40"
                onClick={() => {
                  const result = removeMember(m.id);
                  if (!result.ok) setErr(t(lang, result.error));
                  else ping(t(lang, "removedOk"));
                }}
              >
                {t(lang, "memDel")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {err ? <p className="mt-3 text-sm text-danger">{err}</p> : null}
      {creating ? (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            const state = useCpay.getState();
            if (!/^\d+$/.test(account) || !Number.isSafeInteger(Number(account))) { setBusy(false); setErr(lang === "bn" ? "সঠিক account number দিন।" : "Enter a valid account number."); return; }
            const action = walletMode === "live" ? state.createLiveMember(name || "CPay", phrase || undefined, network, Number(account)) : state.createMember(name);
            void action.then((result) => {
              if (!result.ok) setErr(t(lang, result.error));
              else { setCreating(false); setPhrase(""); }
            }).catch((error: unknown) => setErr(explain(error))).finally(() => setBusy(false));
          }}
        >
          <Field label={t(lang, "nameLabel")} value={name} onChange={setName} />
          <label className="block text-sm text-muted">{lang === "bn" ? "Wallet mode" : "Wallet mode"}<select value={walletMode} onChange={e=>setWalletMode(e.target.value as typeof walletMode)} className="mt-2 h-12 w-full rounded-xl border border-line bg-surface px-3"><option value="live">Live SDK</option><option value="practice">Practice</option></select></label>
          {walletMode === "live" ? <><NetworkPicker value={network} onChange={setNetwork} lang={lang}/><Field label={lang === "bn" ? "Account number" : "Account number"} value={account} onChange={setAccount} inputMode="numeric"/><label className="block text-sm text-muted">{lang === "bn" ? "Recovery phrase (নতুন wallet হলে খালি রাখুন)" : "Recovery phrase (leave blank for a new wallet)"}<textarea value={phrase} onChange={e=>setPhrase(e.target.value)} autoComplete="off" autoCorrect="off" spellCheck={false} className="mt-2 h-24 w-full rounded-xl border border-line bg-surface p-3 font-mono text-sm"/></label></> : null}
          <Btn type="submit" disabled={busy}>{t(lang, "createGo")}</Btn>
          <Btn tone="ghost" disabled={busy} onClick={()=>{setCreating(false);setPhrase("");}}>{t(lang,"back")}</Btn>
        </form>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <Btn onClick={() => setCreating(true)}>{t(lang, "memNew")}</Btn>
          <Btn
            tone="ghost"
            onClick={() => {
              void addShop().then((result) => {
                if (!result.ok) setErr(t(lang, result.error));
                else ping(t(lang, "shopCreated"));
              });
            }}
          >
            {t(lang, "shopB")}
          </Btn>
        </div>
      )}
    </Frame>
  );
}

function SettingsScreen({ close, ping, price }: { close: () => void; ping: (m: string) => void; price: ReturnType<typeof useBtcPrice> }) {
  const lang = useCpay((s) => s.lang);
  const me = useMe();
  const admobAppId = useCpay((s) => s.admobAppId);
  const admobUnitId = useCpay((s) => s.admobUnitId);
  const apiKey = useCpay((s) => s.apiKey);
  const setApiKey = useCpay((s) => s.setApiKey);
  const showAds = useCpay((s) => s.showAds);
  const setLang = useCpay((s) => s.setLang);
  const setAdIds = useCpay((s) => s.setAdIds);
  const setShowAds = useCpay((s) => s.setShowAds);
  const faucet = useCpay((s) => s.faucet);
  const [key, setKey] = useState(apiKey);
  const [unit, setUnit] = useState(admobUnitId);
  const c = (en: string, bn: string) => lang === "bn" ? bn : en;
  return <Frame>
    <BackTitle title={t(lang, "setH")} onBack={close} />
    <VaultSettings />
    <section className="mt-6">
      <h2 className="font-semibold">Breez API key</h2>
      <p className="mt-1 text-sm text-muted">{c("Saved inside the encrypted vault. Mainnet requires a valid Breez key. Regtest remains a test network.", "Encrypted vault-এ সংরক্ষিত হয়। Mainnet-এর জন্য valid Breez key দরকার। Regtest পরীক্ষার নেটওয়ার্ক।")}</p>
      <label className="mt-3 block text-sm text-muted">API key<input className="mt-2 h-12 w-full rounded-xl border border-line bg-surface px-3 font-mono text-fg" type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} /></label>
      <div className="mt-3"><Btn onClick={()=>{setApiKey(key);setKey(key.trim());ping(c("API key saved in the vault.","API key vault-এ সংরক্ষিত হয়েছে।"));}}>{c("Save key", "Key সংরক্ষণ")}</Btn></div>
    </section>
    <section className="mt-6">
      <h2 className="font-semibold">{t(lang, "adsSection")}</h2>
      <p className="mt-1 text-sm text-muted">{c("Native AdMob app IDs belong to the Android/iOS build configuration. The banner unit below is used only in a production-enabled native build; testing is the default and consent is required.", "Native AdMob app ID Android/iOS build configuration-এ থাকে। নিচের banner unit শুধু production-enabled native build-এ ব্যবহৃত হয়; default test mode, এবং consent প্রয়োজন।")}</p>
      <div className="mt-3 flex flex-col gap-3"><Field label={t(lang, "unitHint")} value={unit} onChange={setUnit} placeholder={t(lang, "unitPh")} mono /><Btn onClick={()=>{setAdIds(admobAppId,unit);ping(t(lang,"idsSaved"));}}>{t(lang,"saveIds")}</Btn><Btn tone="ghost" onClick={()=>setShowAds(!showAds)}>{showAds?t(lang,"hideSlot"):t(lang,"showSlot")}</Btn>{Capacitor.isNativePlatform()?<Btn tone="ghost" onClick={()=>void showAdPrivacyOptions().catch(error=>ping(explain(error)))}>{c("Ad privacy choices", "বিজ্ঞাপনের গোপনীয়তা পছন্দ")}</Btn>:null}</div>
    </section>
    <section className="mt-6"><h2 className="font-semibold">{t(lang,"langSection")}</h2><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setLang("en")} className={`h-12 rounded-xl border ${lang === "en"?"border-primary text-primary":"border-line"}`}>English</button><button type="button" onClick={()=>setLang("bn")} className={`h-12 rounded-xl border ${lang === "bn"?"border-primary text-primary":"border-line"}`}>বাংলা</button></div></section>
    <section className="mt-6"><h2 className="font-semibold">{c("Market price", "বাজারদর")}</h2><p className="mt-2 text-sm text-muted">{price.updatedAt?`${c("Last update", "শেষ আপডেট")}: ${new Date(price.updatedAt).toLocaleTimeString(lang === "bn"?"bn-BD":"en-US")}`:c("No fresh market quote yet.", "এখনও নতুন বাজারদর পাওয়া যায়নি।")}</p><p className="mt-1 text-sm text-muted">{price.stale?c("Estimate / stale. Fiat values are informational.", "পুরোনো / আনুমানিক দর। Fiat মান শুধু তথ্যের জন্য।"):c("CoinGecko market estimate. Not an executable conversion quote.", "CoinGecko-এর আনুমানিক বাজারদর। এটি conversion quote নয়।")}</p>{price.error?<p className="mt-1 text-sm text-danger">{price.error}</p>:null}<div className="mt-3"><Btn tone="ghost" onClick={()=>void price.refresh()}>{t(lang,"tryPrice")}</Btn></div></section>
    {me?.mode!=="live"?<section className="mt-6"><h2 className="font-semibold">{c("Practice tools", "Practice tools")}</h2><p className="mt-1 text-sm text-muted">{t(lang,"toolsLead")}</p><div className="mt-3"><Btn tone="ghost" onClick={()=>{const result=faucet();if(result.ok)ping(t(lang,"fundsAdded"));}}>{t(lang,"addB2")}</Btn></div></section>:null}
    <section className="mt-6"><h2 className="font-semibold">{c("Recovery and privacy", "Recovery ও গোপনীয়তা")}</h2><p className="mt-2 text-sm text-muted">{c("Account sign-in does not back up wallet keys. Keep recovery words, the network/account number, and an encrypted vault export. Password loss cannot be reset by CPay. Browser scripts can access an unlocked wallet; lock it when finished.", "Account sign-in wallet key-এর backup নয়। Recovery words, network/account number ও encrypted vault export রাখুন। Password হারালে CPay reset করতে পারে না। Wallet unlocked থাকলে browser script এটি ব্যবহার করতে পারে; কাজ শেষে lock করুন।")}</p></section>
  </Frame>;
}

function DetailScreen({ id, close, ping }: { id: string; close: () => void; ping: (m: string) => void }) {
  const lang = useCpay((s) => s.lang);
  const payment = useCpay((s) => s.payments.find((p) => p.id === id));
  if (!payment) {
    return (
      <Frame>
        <BackTitle title={t(lang, "detH")} onBack={close} />
        <p className="text-sm text-muted">{t(lang, "emptyA")}</p>
      </Frame>
    );
  }
  return (
    <Frame>
      <BackTitle title={t(lang, "detH")} onBack={close} />
      <p className="font-mono text-3xl font-medium tabular-nums">
        {payment.direction === "in" ? "+" : "−"}
        {moneyLine(payment)}
      </p>
      <div className="mt-4 rounded-2xl border border-line bg-surface px-4">
        <Line k={t(lang, "kindL")} v={kindLabel(payment.kind, lang)} />
        <Line k={t(lang, "statL")} v={payment.status === "pending" ? t(lang, "pend") : t(lang, "comp")} />
        <Line k={t(lang, "dirLine")} v={payment.direction === "in" ? t(lang, "inDir") : t(lang, "outDir")} />
        <Line k={t(lang, "countL")} v={payment.counterparty} />
        <Line k={t(lang, "feeWL")} v={payment.feeSats ? `${formatSats(payment.feeSats)} sats` : payment.feeUsd ? formatUsd(payment.feeUsd) : t(lang, "free")} />
        <Line k={t(lang, "timeL")} v={new Date(payment.createdAt).toLocaleString(lang === "bn" ? "bn-BD" : "en-US")} />
        <Line k={t(lang, "netL")} v={t(lang, "practiceNet")} />
        {payment.detail ? <Line k={t(lang, "noteWL")} v={payment.detail} /> : null}
        <Line k={t(lang, "idL")} v={payment.id} />
      </div>
      <p className="mt-3 text-sm text-muted">{t(lang, "broadcastNo")}</p>
      <div className="mt-4">
        <Btn
          tone="ghost"
          onClick={() => {
            void copyText(payment.id).then((ok) => ping(ok ? t(lang, "idCopied") : t(lang, "failCopy")));
          }}
        >
          {t(lang, "copyI")}
        </Btn>
      </div>
    </Frame>
  );
}

function Main() {
  const [tab, setTab] = useState<Tab>("home");
  const [page, setPage] = useState<Page | null>(null);
  const [banner, setBanner] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const lang = useCpay((s) => s.lang);
  const me = useMe();
  const price = useBtcPrice();

  const showAds = useCpay((s) => s.showAds);
  const admobUnitId = useCpay((s) => s.admobUnitId);

  useEffect(() => {
    void startAds(showAds && tab !== "send" && page === null, admobUnitId).catch(() => undefined);
    return () => { void startAds(false).catch(() => undefined); };
  }, [showAds, admobUnitId, tab, page]);

  function ping(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  function useAddr(addr: string) {
    useCpay.getState().setPrefill(addr);
    setPage(null);
    setTab("send");
  }

  if (me?.mode === "live" && page && ["cash", "buy", "convert", "tokens", "lnurl", "claims"].includes(page.name)) return <Frame><BackTitle title={lang === "bn" ? "শুধু practice" : "Practice only"} onBack={() => setPage(null)} /><p className="text-sm text-muted">{lang === "bn" ? "এই simulation লাইভ wallet-এ ব্যবহার করা যায় না।" : "This simulation is unavailable for a live wallet."}</p></Frame>;

  if (page?.name === "cash") return <><Toast msg={toast} /><CashScreen close={() => setPage(null)} ping={ping} /></>;
  if (page?.name === "buy") return <><Toast msg={toast} /><BuyScreen close={() => setPage(null)} ping={ping} /></>;
  if (page?.name === "convert") return <><Toast msg={toast} /><ConvertScreen close={() => setPage(null)} ping={ping} /></>;
  if (page?.name === "tokens") return <><Toast msg={toast} /><TokenScreen close={() => setPage(null)} ping={ping} /></>;
  if (page?.name === "lnurl") return <><Toast msg={toast} /><LnurlScreen close={() => setPage(null)} ping={ping} /></>;
  if (page?.name === "claims") return <><Toast msg={toast} /><ClaimsScreen close={() => setPage(null)} ping={ping} /></>;
  if (page?.name === "contacts") return <ContactsScreen close={() => setPage(null)} useAddr={useAddr} />;
  if (page?.name === "members") return <><Toast msg={toast} /><MembersScreen close={() => setPage(null)} ping={ping} /></>;
  if (page?.name === "settings") return <><Toast msg={toast} /><SettingsScreen close={() => setPage(null)} ping={ping} price={price} /></>;
  if (page?.name === "live") return <SdkScreen close={() => setPage(null)} />;
  if (page?.name === "detail") return <><Toast msg={toast} /><DetailScreen id={page.id} close={() => setPage(null)} ping={ping} /></>;

  return (
    <Frame dock>
      <Toast msg={toast} />
      {banner ? (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-2xl border border-line bg-surface px-3 py-2">
          <p className="text-sm text-muted">{me?.mode === "live" ? (lang === "bn" ? `লাইভ SDK · ${me.network} · Account ${me.account ?? 0}। Backup নিরাপদে রাখুন।` : `Live SDK · ${me.network} · Account ${me.account ?? 0}. Keep your recovery backup safe.`) : t(lang, "bannerBody")}</p>
          <button type="button" onClick={() => setBanner(false)} className="shrink-0 text-sm font-medium text-primary">
            {t(lang, "know")}
          </button>
        </div>
      ) : null}
      {tab === "home" ? <HomeScreen open={setPage} onTab={setTab} /> : null}
      {tab === "send" ? <SendScreen openDetail={(id) => setPage({ name: "detail", id })} /> : null}
      {tab === "receive" ? <ReceiveScreen ping={ping} /> : null}
      {tab === "activity" ? <ActivityScreen open={setPage} /> : null}
      {tab === "more" ? <MoreScreen open={setPage} /> : null}
      <Dock tab={tab} onTab={setTab} />
    </Frame>
  );
}

function WalletContent() {
  const members = useCpay((s) => s.members);
  const pending = useCpay((s) => s.pendingBackupId);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  if (members.length === 0) return <Onboarding />;
  if (pending) return <SeedGate memberId={pending} />;
  return <Main />;
}

export function WalletApp() {
  return <VaultGate><WalletContent /></VaultGate>;
}
