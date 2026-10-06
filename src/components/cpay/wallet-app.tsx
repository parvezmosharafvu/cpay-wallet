import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Check,
  ChevronRight,
  Copy,
  Home,
  KeyRound,
  LayoutGrid,
  Receipt,
  Users,
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
import { InstallCard } from "@/components/cpay/install-card";
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

function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M16.4 6.2 10 16.2h4.6l-1.5 9.6 8.4-11.6h-4.8l-0.3-8Z"
        className="fill-primary-ink"
      />
    </svg>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  tone = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
}) {
  const toneClass =
    tone === "primary"
      ? "bg-primary text-primary-ink"
      : tone === "danger"
        ? "bg-danger text-fg"
        : "border border-line bg-surface text-fg";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-12 w-full items-center justify-center rounded-2xl px-4 text-base font-semibold disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "text" | "decimal" | "numeric";
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode ?? "text"}
        className={`h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base text-fg outline-none placeholder:text-muted focus:border-primary ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}

function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-30 flex justify-center px-4">
      <p className="rounded-full border border-line bg-surface px-4 py-2 text-sm text-fg">{msg}</p>
    </div>
  );
}

function Frame({ children, dock }: { children: ReactNode; dock?: boolean }) {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className={`mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 ${dock ? "dock-pad" : "pb-10"}`}>
        {children}
      </div>
    </div>
  );
}

function BackTitle({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex h-14 items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-surface"
        aria-label="Back"
      >
        <ArrowLeft className="size-5" />
      </button>
      <h1 className="text-lg font-semibold">{title}</h1>
    </header>
  );
}

function AdSlot() {
  const lang = useCpay((s) => s.lang);
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((n) => (n + 1) % 3), 8000);
    return () => window.clearInterval(id);
  }, []);
  const lines: CopyKey[] = ["ad1", "ad2", "ad3"];
  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-2">
      <span className="rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-muted">{t(lang, "adLabel")}</span>
      <p className="min-w-0 truncate text-sm text-fg">{t(lang, lines[i])}</p>
    </div>
  );
}

function Dock({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  const lang = useCpay((s) => s.lang);
  const showAds = useCpay((s) => s.showAds);
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
        {showAds ? <AdSlot /> : null}
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

function Splash() {
  return (
    <Frame>
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Logo size={56} />
        <p className="text-2xl font-semibold tracking-tight">CPay</p>
      </div>
    </Frame>
  );
}

function Onboarding() {
  const lang = useCpay((s) => s.lang);
  const setLang = useCpay((s) => s.setLang);
  const createMember = useCpay((s) => s.createMember);
  const [mode, setMode] = useState<"home" | "create" | "restore">("home");
  const [name, setName] = useState("");
  const [words, setWords] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const result = await createMember(name);
    setBusy(false);
    if (!result.ok) setErr(t(lang, result.error));
  }

  async function restore() {
    setBusy(true);
    const result = await useCpay.getState().restore(words);
    setBusy(false);
    if (!result.ok) setErr(t(lang, result.error));
  }

  return (
    <Frame>
      <header className="flex items-center justify-between pt-6">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-lg font-semibold">CPay</span>
        </div>
        <button
          type="button"
          onClick={() => setLang(lang === "en" ? "bn" : "en")}
          className="h-11 rounded-2xl border border-line px-3 text-sm"
        >
          {lang === "en" ? "বাংলা" : "English"}
        </button>
      </header>

      {mode === "home" ? (
        <div className="flex flex-1 flex-col pt-8">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{t(lang, "practice")}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t(lang, "tagline")}</h1>
          <ul className="mt-8 flex flex-col gap-3">
            {[
              { icon: KeyRound, t: "f1t" as const, d: "f1d" as const },
              { icon: Banknote, t: "f2t" as const, d: "f2d" as const },
              { icon: Users, t: "f3t" as const, d: "f3d" as const },
            ].map((row) => (
              <li key={row.t} className="flex gap-3 rounded-2xl border border-line bg-surface p-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-primary">
                  <row.icon className="size-5" />
                </span>
                <span>
                  <span className="block text-base font-medium">{t(lang, row.t)}</span>
                  <span className="mt-1 block text-sm text-muted">{t(lang, row.d)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-col gap-3 pt-8">
            <InstallCard compact />
            <Btn onClick={() => { setErr(null); setMode("create"); }}>{t(lang, "createWallet")}</Btn>
            <Btn tone="ghost" onClick={() => { setErr(null); setMode("restore"); }}>{t(lang, "restoreWallet")}</Btn>
          </div>
        </div>
      ) : null}

      {mode === "create" ? (
        <form
          className="flex flex-1 flex-col pt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <h1 className="text-2xl font-semibold">{t(lang, "titleCreate")}</h1>
          <p className="mt-2 text-sm text-muted">{t(lang, "saveFirst")}</p>
          <div className="mt-6">
            <Field label={t(lang, "nameLabel")} value={name} onChange={setName} placeholder={t(lang, "namePh")} />
          </div>
          {err ? <p className="mt-3 text-sm text-danger">{err}</p> : null}
          <div className="mt-auto flex flex-col gap-3 pt-8">
            <Btn type="submit" disabled={busy}>{busy ? t(lang, "creating") : t(lang, "createCta")}</Btn>
            <Btn tone="ghost" onClick={() => setMode("home")}>{t(lang, "back")}</Btn>
          </div>
        </form>
      ) : null}

      {mode === "restore" ? (
        <form
          className="flex flex-1 flex-col pt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void restore();
          }}
        >
          <h1 className="text-2xl font-semibold">{t(lang, "restoreH")}</h1>
          <p className="mt-2 text-sm text-muted">{t(lang, "restoreP")}</p>
          <label className="mt-6 block">
            <span className="mb-2 block text-sm text-muted">{t(lang, "wordsLabel")}</span>
            <textarea
              value={words}
              onChange={(e) => setWords(e.target.value)}
              placeholder={t(lang, "placeholderSeed")}
              className="h-32 w-full rounded-2xl border border-line bg-surface p-4 font-mono text-sm text-fg outline-none focus:border-primary"
            />
          </label>
          {err ? <p className="mt-3 text-sm text-danger">{err}</p> : null}
          <div className="mt-auto flex flex-col gap-3 pt-8">
            <Btn type="submit" disabled={busy}>{busy ? t(lang, "restoring") : t(lang, "restoreB")}</Btn>
            <Btn tone="ghost" onClick={() => setMode("home")}>{t(lang, "back")}</Btn>
          </div>
        </form>
      ) : null}
    </Frame>
  );
}

function SeedGate({ memberId }: { memberId: string }) {
  const lang = useCpay((s) => s.lang);
  const member = useCpay((s) => s.members.find((m) => m.id === memberId));
  const ack = useCpay((s) => s.ackBackup);
  const [checked, setChecked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!member) ack();
  }, [member, ack]);

  if (!member) return <Splash />;

  return (
    <Frame>
      <header className="flex items-center gap-3 pt-6">
        <Logo />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{t(lang, "seedIs")}</p>
          <h1 className="text-xl font-semibold">{member.name}</h1>
        </div>
      </header>
      <p className="mt-4 text-sm text-muted">{t(lang, "seedBody")}</p>
      <ol className="mt-4 grid grid-cols-2 gap-2">
        {member.seed.map((word, i) => (
          <li key={`${word}-${i}`} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <span className="w-5 font-mono text-xs text-muted">{i + 1}</span>
            <span className="font-mono text-sm">{word}</span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="mt-3 flex h-11 items-center gap-2 text-sm font-medium text-primary"
        onClick={() => {
          void copyText(member.seed.join(" ")).then((ok) => setCopied(ok));
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? t(lang, "copied") : t(lang, "copyAll")}
      </button>
      <p className="mt-2 text-sm text-danger">{t(lang, "notBip")}</p>
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-1 size-4 accent-primary"
        />
        {t(lang, "checkbox")}
      </label>
      {err ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
      <div className="mt-6">
        <Btn
          onClick={() => {
            if (!checked) {
              setErr(t(lang, "mustTick"));
              return;
            }
            ack();
          }}
        >
          {t(lang, "goIn")}
        </Btn>
      </div>
    </Frame>
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
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{t(lang, "practice")}</p>
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
          {mode === "usd" ? formatUsd(total) : formatSats(me.sats)}
        </p>
        <p className="mt-1 text-sm text-muted">
          {mode === "usd"
            ? `${formatSats(me.sats)} sats`
            : formatUsd(satsToUsd(me.sats, btcUsd))}
        </p>
        <p className="mt-3 font-mono text-xs text-muted">
          {t(lang, "rateLabel")} {formatUsd(btcUsd)} · {priceLive ? t(lang, "liveRate") : t(lang, "practiceRate")}
        </p>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-line bg-surface px-3 py-3">
          <p className="text-xs text-muted">{t(lang, "btcBal")}</p>
          <p className="mt-1 font-mono text-sm tabular-nums">{formatSats(me.sats)} sats</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface px-3 py-3">
          <p className="text-xs text-muted">{t(lang, "stableBal")}</p>
          <p className="mt-1 font-mono text-sm tabular-nums">{formatUsd(me.usdbCents / 100)}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          { label: "navSend" as const, icon: ArrowUpRight, go: () => onTab("send") },
          { label: "navGet" as const, icon: ArrowDownLeft, go: () => onTab("receive") },
          { label: "titleCash" as const, icon: Zap, go: () => open({ name: "cash" }) },
          { label: "titleBuy" as const, icon: Banknote, go: () => open({ name: "buy" }) },
        ].map((action) => (
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

      {waiting.length > 0 ? (
        <button
          type="button"
          onClick={() => open({ name: "claims" })}
          className="mt-3 flex h-12 w-full items-center justify-between rounded-2xl border border-line bg-surface px-4 text-sm"
        >
          <span>{t(lang, "claimBanner")}</span>
          <span className="font-mono text-primary">{waiting.length}</span>
        </button>
      ) : null}

      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-base font-semibold">{t(lang, "recent")}</h2>
        <button type="button" onClick={() => onTab("activity")} className="text-sm text-primary">
          {t(lang, "seeAll")}
        </button>
      </div>
      {recent.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">{t(lang, "emptyHome")}</p>
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
        </div>
      ) : (
        <ul className="mt-2">
          {recent.map((p) => (
            <PayRow key={p.id} payment={p} lang={lang} onOpen={() => open({ name: "detail", id: p.id })} />
          ))}
        </ul>
      )}
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

  function pay() {
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
          <Btn onClick={pay}>{t(lang, "sendPay")}</Btn>
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

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <span className="text-sm text-muted">{k}</span>
      <span className="max-w-[60%] break-all text-right font-mono text-sm">{v}</span>
    </div>
  );
}

function Qr({ value }: { value: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void import("qrcode").then((mod) => {
      const qr = mod.default;
      return qr.toDataURL(value, {
        margin: 1,
        width: 280,
        color: { dark: "#07110C", light: "#F4F4F5" },
      });
    }).then((next) => {
      if (live) setUrl(next);
    }).catch(() => {
      if (live) setUrl(null);
    });
    return () => {
      live = false;
    };
  }, [value]);
  if (!url) return <div className="h-52 w-52 rounded-2xl bg-fg" />;
  return <img src={url} alt="" className="h-52 w-52 rounded-2xl" />;
}

function ReceiveScreen({ ping }: { ping: (msg: string) => void }) {
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

  if (!me) return null;
  const tabs = [
    { id: "ln" as const, label: "tabLn" as const },
    { id: "spark" as const, label: "tabSp" as const },
    { id: "btc" as const, label: "tabBt" as const },
    { id: "usd" as const, label: "tabSt" as const },
  ];

  function make() {
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
        <Btn onClick={make}>{t(lang, "make")}</Btn>
      </div>
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
        {items.map((item) => (
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
  const apiKey = useCpay((s) => s.apiKey);
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
            <p className="pt-2 text-xs text-muted">{apiKey ? t(lang, "realKey") : t(lang, "noApi")}</p>
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
  const [reveal, setReveal] = useState<string | null>(null);
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
                <p className="font-mono text-xs text-muted">{m.lightning}</p>
              </div>
              {m.id !== activeId ? (
                <button type="button" className="h-11 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-ink" onClick={() => { switchTo(m.id); ping(t(lang, "switched")); }}>
                  {t(lang, "memUse")}
                </button>
              ) : null}
            </div>
            <p className="mt-2 font-mono text-xs text-muted">
              {formatSats(m.sats)} sats · {formatUsd(m.usdbCents / 100)}
            </p>
            <div className="mt-2 flex gap-3">
              <button type="button" className="text-sm text-primary" onClick={() => setReveal(reveal === m.id ? null : m.id)}>
                {reveal === m.id ? t(lang, "hideSeed") : t(lang, "revealSeed")}
              </button>
              <button
                type="button"
                className="text-sm text-danger"
                onClick={() => {
                  const result = removeMember(m.id);
                  if (!result.ok) setErr(t(lang, result.error));
                  else ping(t(lang, "removedOk"));
                }}
              >
                {t(lang, "memDel")}
              </button>
            </div>
            {reveal === m.id ? (
              <p className="mt-2 break-words font-mono text-xs text-fg">{m.seed.join(" ")}</p>
            ) : null}
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
            void useCpay.getState().createMember(name).then((result) => {
              setBusy(false);
              if (!result.ok) setErr(t(lang, result.error));
            });
          }}
        >
          <Field label={t(lang, "nameLabel")} value={name} onChange={setName} />
          <Btn type="submit" disabled={busy}>{t(lang, "createGo")}</Btn>
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

function SettingsScreen({ close, ping }: { close: () => void; ping: (m: string) => void }) {
  const lang = useCpay((s) => s.lang);
  const apiKey = useCpay((s) => s.apiKey);
  const admobAppId = useCpay((s) => s.admobAppId);
  const admobUnitId = useCpay((s) => s.admobUnitId);
  const showAds = useCpay((s) => s.showAds);
  const setLang = useCpay((s) => s.setLang);
  const setApiKey = useCpay((s) => s.setApiKey);
  const setAdIds = useCpay((s) => s.setAdIds);
  const setShowAds = useCpay((s) => s.setShowAds);
  const faucet = useCpay((s) => s.faucet);
  const wipe = useCpay((s) => s.wipe);
  const setPrice = useCpay((s) => s.setPrice);
  const [key, setKey] = useState(apiKey);
  const [appId, setAppId] = useState(admobAppId);
  const [unit, setUnit] = useState(admobUnitId);
  const [showKey, setShowKey] = useState(false);
  const [askWipe, setAskWipe] = useState(false);
  const [priceMsg, setPriceMsg] = useState<string | null>(null);

  async function refreshPrice() {
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
      const data = (await res.json()) as { bitcoin?: { usd?: number } };
      const n = data.bitcoin?.usd;
      if (typeof n === "number" && n > 1000) {
        setPrice(n, true);
        setPriceMsg(t(lang, "priceOk"));
        return;
      }
    } catch {
      /* practice rate stays */
    }
    setPriceMsg(t(lang, "priceFail"));
  }

  return (
    <Frame>
      <BackTitle title={t(lang, "setH")} onBack={close} />
      <p className="text-sm text-muted">{t(lang, "setP")}</p>
      <div className="mt-4">
        <InstallCard />
      </div>
      <section className="mt-5">
        <h2 className="text-base font-semibold">{t(lang, "apiSection")}</h2>
        <p className="mt-1 text-sm text-muted">{t(lang, "setKeyHelp")}</p>
        <label className="mt-3 block">
          <span className="mb-2 block text-sm text-muted">{t(lang, "apiKey")}</span>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            type={showKey ? "text" : "password"}
            autoComplete="off"
            placeholder={t(lang, "breezPh")}
            className="h-12 w-full rounded-2xl border border-line bg-surface px-4 font-mono text-base text-fg outline-none focus:border-primary"
          />
        </label>
        <div className="mt-2 flex gap-3">
          <button type="button" className="text-sm text-primary" onClick={() => setShowKey((v) => !v)}>
            {showKey ? t(lang, "hide") : t(lang, "show")}
          </button>
          <button type="button" className="text-sm text-muted" onClick={() => { setKey(""); setApiKey(""); ping(t(lang, "keyCleared")); }}>
            {t(lang, "clear")}
          </button>
        </div>
        <div className="mt-3">
          <Btn onClick={() => { setApiKey(key); ping(t(lang, "keySaved")); }}>{t(lang, "saveKey")}</Btn>
        </div>
        <p className="mt-2 text-xs text-muted">{t(lang, "sdkLine")}</p>
      </section>
      <section className="mt-6">
        <h2 className="text-base font-semibold">{t(lang, "adsSection")}</h2>
        <p className="mt-1 text-sm text-muted">{t(lang, "setAdHelp")}</p>
        <div className="mt-3 flex flex-col gap-3">
          <Field label={t(lang, "appHint")} value={appId} onChange={setAppId} placeholder={t(lang, "appIdPh")} mono />
          <Field label={t(lang, "unitHint")} value={unit} onChange={setUnit} placeholder={t(lang, "unitPh")} mono />
          <Btn onClick={() => { setAdIds(appId, unit); ping(t(lang, "idsSaved")); }}>{t(lang, "saveIds")}</Btn>
          <Btn tone="ghost" onClick={() => setShowAds(!showAds)}>{showAds ? t(lang, "hideSlot") : t(lang, "showSlot")}</Btn>
        </div>
      </section>
      <section className="mt-6">
        <h2 className="text-base font-semibold">{t(lang, "langSection")}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setLang("en")} className={`h-12 rounded-2xl border ${lang === "en" ? "border-primary text-primary" : "border-line"}`}>English</button>
          <button type="button" onClick={() => setLang("bn")} className={`h-12 rounded-2xl border ${lang === "bn" ? "border-primary text-primary" : "border-line"}`}>বাংলা</button>
        </div>
      </section>
      <section className="mt-6">
        <h2 className="text-base font-semibold">{t(lang, "toolsH")}</h2>
        <p className="mt-1 text-sm text-muted">{t(lang, "toolsLead")}</p>
        <div className="mt-3 flex flex-col gap-2">
          <Btn tone="ghost" onClick={() => { faucet(); ping(t(lang, "fundsAdded")); }}>{t(lang, "addB2")}</Btn>
          <Btn tone="ghost" onClick={() => { void refreshPrice(); }}>{t(lang, "tryPrice")}</Btn>
          {priceMsg ? <p className="text-sm text-muted">{priceMsg}</p> : null}
        </div>
      </section>
      <section className="mt-6">
        <h2 className="text-base font-semibold">{t(lang, "aboutH")}</h2>
        <ul className="mt-2 flex flex-col gap-2 text-sm text-muted">
          <li>{t(lang, "about1")}</li>
          <li>{t(lang, "about2")}</li>
          <li>{t(lang, "about3")}</li>
          <li>{t(lang, "about4")}</li>
          <li>{t(lang, "about5")}</li>
        </ul>
      </section>
      <section className="mt-6">
        <h2 className="text-base font-semibold text-danger">{t(lang, "danger")}</h2>
        <p className="mt-1 text-sm text-muted">{t(lang, "eraseBody")}</p>
        {askWipe ? (
          <div className="mt-3 flex flex-col gap-2">
            <Btn tone="danger" onClick={() => wipe()}>{t(lang, "eraseYes")}</Btn>
            <Btn tone="ghost" onClick={() => setAskWipe(false)}>{t(lang, "eraseNo")}</Btn>
          </div>
        ) : (
          <div className="mt-3">
            <Btn tone="ghost" onClick={() => setAskWipe(true)}>{t(lang, "erase")}</Btn>
          </div>
        )}
      </section>
    </Frame>
  );
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
  const setPrice = useCpay((s) => s.setPrice);

  useEffect(() => {
    let live = true;
    void fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd")
      .then((res) => res.json() as Promise<{ bitcoin?: { usd?: number } }>)
      .then((data) => {
        const n = data.bitcoin?.usd;
        if (live && typeof n === "number" && n > 1000) setPrice(n, true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [setPrice]);

  function ping(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  function useAddr(addr: string) {
    useCpay.getState().setPrefill(addr);
    setPage(null);
    setTab("send");
  }

  if (page?.name === "cash") return <><Toast msg={toast} /><CashScreen close={() => setPage(null)} ping={ping} /></>;
  if (page?.name === "buy") return <><Toast msg={toast} /><BuyScreen close={() => setPage(null)} ping={ping} /></>;
  if (page?.name === "convert") return <><Toast msg={toast} /><ConvertScreen close={() => setPage(null)} ping={ping} /></>;
  if (page?.name === "tokens") return <><Toast msg={toast} /><TokenScreen close={() => setPage(null)} ping={ping} /></>;
  if (page?.name === "lnurl") return <><Toast msg={toast} /><LnurlScreen close={() => setPage(null)} ping={ping} /></>;
  if (page?.name === "claims") return <><Toast msg={toast} /><ClaimsScreen close={() => setPage(null)} ping={ping} /></>;
  if (page?.name === "contacts") return <ContactsScreen close={() => setPage(null)} useAddr={useAddr} />;
  if (page?.name === "members") return <><Toast msg={toast} /><MembersScreen close={() => setPage(null)} ping={ping} /></>;
  if (page?.name === "settings") return <><Toast msg={toast} /><SettingsScreen close={() => setPage(null)} ping={ping} /></>;
  if (page?.name === "live") return <SdkScreen close={() => setPage(null)} />;
  if (page?.name === "detail") return <><Toast msg={toast} /><DetailScreen id={page.id} close={() => setPage(null)} ping={ping} /></>;

  return (
    <Frame dock>
      <Toast msg={toast} />
      {banner ? (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-2xl border border-line bg-surface px-3 py-2">
          <p className="text-sm text-muted">{t(lang, "bannerBody")}</p>
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

export function WalletApp() {
  const [ready, setReady] = useState(false);
  const members = useCpay((s) => s.members);
  const pending = useCpay((s) => s.pendingBackupId);

  useEffect(() => {
    void Promise.resolve(useCpay.persist.rehydrate())
      .catch(() => undefined)
      .finally(() => setReady(true));
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  if (!ready) return <Splash />;
  if (members.length === 0) return <Onboarding />;
  if (pending) return <SeedGate memberId={pending} />;
  return <Main />;
}
