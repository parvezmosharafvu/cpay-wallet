import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, Clock, X } from "lucide-react";
import { walletAuthorization } from "@/lib/cpay/browser-vault";
import { appBreezKey } from "@/lib/cpay/app-key";
import { copyText, formatSats, formatUsd, satsToUsd, type Speed } from "@/lib/cpay/money";
import { useCpay } from "@/lib/cpay/store";
import type { Lang, Member } from "@/lib/cpay/types";
import {
  ensureLive,
  executeLiveQuote,
  explain,
  invalidateLiveQuotes,
  isSessionCurrent,
  listLiveHistory,
  liveInfo,
  prepareLiveQuote,
  receiveLive,
  sessionKeyFor,
  type LivePayment,
  type LiveQuote,
} from "@/lib/cpay/sdk";
import { Btn, Field, Line, Qr, readQr } from "./shared-ui";

export const liveCopy = (lang: Lang, en: string, bn: string) => (lang === "bn" ? bn : en);

function identity(member: Member | null | undefined) {
  return member ? `${member.id}:${member.mode}:${member.network}:${member.account}` : "";
}

export function liveOptions(member: Member, apiKey: string) {
  return {
    network: member.network ?? "regtest",
    account: member.account ?? 0,
    apiKey: apiKey || appBreezKey(),
  };
}

/** Re-read selection after async boundaries: a captured seed is not permission to reopen a locked wallet. */
function isSelectedWallet(member: Member, apiKey: string) {
  const state = useCpay.getState();
  const selected = state.members.find((entry) => entry.id === state.activeId);
  return (
    state.activeId === member.id &&
    state.apiKey === apiKey &&
    selected?.mode === "live" &&
    selected.network === member.network &&
    selected.account === member.account &&
    selected.seed.join(" ") === member.seed.join(" ")
  );
}

/** A snapshot is visible only for the selected wallet. Errors never switch modes. */
export function useLiveWallet(member: Member | null | undefined) {
  const apiKey = useCpay((s) => s.apiKey);
  const key = identity(member);
  const phrase = member?.seed.join(" ") ?? "";
  const [snapshot, setSnapshot] = useState<{
    key: string;
    balance: number;
    payments: LivePayment[];
    updatedAt: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const [refreshId, setRefreshId] = useState(0);
  const refresh = useCallback(() => setRefreshId((n) => n + 1), []);
  useEffect(() => {
    const current = ++generation.current;
    setSnapshot(null);
    setError(null);
    if (!member || member.mode !== "live") return;
    let running = false;
    const selected = member;
    async function update() {
      if (running || current !== generation.current) return;
      running = true;
      setLoading(true);
      try {
        const authorization = walletAuthorization.capture();
        const stillCurrent = () =>
          current === generation.current &&
          walletAuthorization.isCurrent(authorization) &&
          isSelectedWallet(selected, apiKey);
        const expected = await sessionKeyFor({
          mnemonic: phrase,
          network: selected.network ?? "regtest",
          account: selected.account ?? 0,
        });
        if (!stillCurrent()) return;
        await ensureLive(phrase, liveOptions(selected, apiKey));
        if (!stillCurrent()) return;
        if (!isSessionCurrent(expected.key))
          throw new Error("Wallet session changed. Refresh the selected wallet.");
        const info = await liveInfo(true);
        if (!stillCurrent() || !isSessionCurrent(expected.key)) return;
        const payments = await listLiveHistory();
        if (stillCurrent() && isSessionCurrent(expected.key)) {
          setSnapshot({ key, balance: info.balanceSats, payments, updatedAt: Date.now() });
          setError(null);
        }
      } catch (cause) {
        if (current === generation.current) setError(explain(cause));
      } finally {
        running = false;
        if (current === generation.current) setLoading(false);
      }
    }
    void update();
    const timer = window.setInterval(() => void update(), 15_000);
    const onFocus = () => void update();
    window.addEventListener("focus", onFocus);
    window.addEventListener("cpay:wallet-refresh", onFocus);
    return () => {
      generation.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("cpay:wallet-refresh", onFocus);
    };
  }, [key, phrase, apiKey, refreshId]);
  return {
    balance: snapshot?.key === key ? snapshot.balance : null,
    payments: snapshot?.key === key ? snapshot.payments : [],
    updatedAt: snapshot?.key === key ? snapshot.updatedAt : null,
    loading,
    error,
    refresh,
  };
}

function NetworkNotice({ member, lang }: { member: Member; lang: Lang }) {
  return (
    <p
      className={`mt-2 rounded-xl border border-line p-3 text-sm ${member.network === "mainnet" ? "text-danger" : "text-muted"}`}
    >
      {member.network === "mainnet"
        ? liveCopy(
            lang,
            "MAINNET · Real bitcoin. Payments cannot be undone.",
            "MAINNET · আসল বিটকয়েন। পাঠানো অর্থ ফেরত নেওয়া যায় না।",
          )
        : liveCopy(
            lang,
            "REGTEST · Test network, no real-money value.",
            "REGTEST · পরীক্ষার নেটওয়ার্ক, বাস্তব অর্থ নয়।",
          )}
      {` · Account ${member.account ?? 0}`}
    </p>
  );
}

export function LiveSendScreen({ member }: { member: Member }) {
  const lang = useCpay((s) => s.lang);
  const apiKey = useCpay((s) => s.apiKey);
  const prefill = useCpay((s) => s.prefill);
  const setPrefill = useCpay((s) => s.setPrefill);
  const wallet = useLiveWallet(member);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [speed, setSpeed] = useState<Speed>("medium");
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [receipt, setReceipt] = useState<LivePayment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const scan = useRef<HTMLInputElement>(null);
  const epoch = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current++;
    };
  }, []);
  const phrase = member.seed.join(" ");
  const [now, setNow] = useState(Date.now());
  const copy = (en: string, bn: string) => liveCopy(lang, en, bn);
  useEffect(() => {
    epoch.current++;
    setQuote(null);
    setReceipt(null);
    setError(null);
    invalidateLiveQuotes();
    return () => {
      epoch.current++;
      invalidateLiveQuotes();
    };
  }, [
    destination,
    amount,
    speed,
    member.id,
    member.mode,
    member.network,
    member.account,
    phrase,
    apiKey,
  ]);
  useEffect(() => {
    if (prefill) {
      setDestination(prefill);
      setPrefill("");
    }
  }, [prefill, setPrefill]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
      epoch.current++;
    };
  }, []);
  async function review() {
    if (pending.current) return;
    const requestEpoch = epoch.current;
    let authorization: number;
    try {
      authorization = walletAuthorization.capture();
    } catch (cause) {
      setError(explain(cause));
      return;
    }
    const current = () =>
      mounted.current &&
      requestEpoch === epoch.current &&
      walletAuthorization.isCurrent(authorization) &&
      isSelectedWallet(member, apiKey);
    if (!current()) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!destination.trim())
        throw new Error(copy("Enter a destination.", "প্রাপকের ঠিকানা দিন।"));
      if (
        amount.trim() &&
        (!/^\d+$/.test(amount.trim()) ||
          !Number.isSafeInteger(Number(amount)) ||
          Number(amount) <= 0)
      )
        throw new Error(
          copy(
            "Use a positive whole number of sats, or leave blank for a fixed invoice.",
            "পূর্ণসংখ্যায় sats দিন, অথবা নির্দিষ্ট invoice-এর জন্য খালি রাখুন।",
          ),
        );
      const expected = await sessionKeyFor({
        mnemonic: member.seed.join(" "),
        network: member.network ?? "regtest",
        account: member.account ?? 0,
      });
      if (!current()) return;
      await ensureLive(member.seed.join(" "), liveOptions(member, apiKey));
      if (!current()) return;
      if (!isSessionCurrent(expected.key)) throw new Error("Wallet session changed. Review again.");
      const prepared = await prepareLiveQuote({ destination, amount, speed });
      if (!current()) return;
      const info = await liveInfo(true);
      if (!current()) return;
      if (!isSessionCurrent(prepared.sessionKey))
        throw new Error("Wallet session changed. Review again.");
      if (prepared.totalSats > info.balanceSats)
        throw new Error(
          copy(
            "The live balance does not cover the amount and fee.",
            "লাইভ balance দিয়ে amount ও fee মেটানো যাচ্ছে না।",
          ),
        );
      if (current()) setQuote(prepared);
    } catch (cause) {
      if (current()) setError(explain(cause));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function confirm() {
    if (!quote || pending.current || !mounted.current || !isSelectedWallet(member, apiKey)) return;
    const requestEpoch = epoch.current;
    let authorization: number;
    try {
      authorization = walletAuthorization.capture();
    } catch (cause) {
      setError(explain(cause));
      return;
    }
    const current = () =>
      mounted.current &&
      requestEpoch === epoch.current &&
      walletAuthorization.isCurrent(authorization) &&
      isSelectedWallet(member, apiKey);
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (Date.now() >= quote.expiresAt || !isSessionCurrent(quote.sessionKey))
        throw new Error(
          copy(
            "The quote expired or the wallet changed. Review again.",
            "Quote-এর মেয়াদ শেষ অথবা wallet বদলেছে। আবার review করুন।",
          ),
        );
      const payment = await executeLiveQuote(quote.id);
      if (!current()) return;
      setReceipt(payment);
      setQuote(null);
      window.dispatchEvent(new Event("cpay:wallet-refresh"));
    } catch (cause) {
      if (!current()) return;
      setQuote(null);
      setError(
        `${explain(cause)} ${copy("If the result is uncertain, check Activity before retrying.", "ফলাফল অনিশ্চিত হলে আবার পাঠানোর আগে Activity দেখুন।")}`,
      );
      wallet.refresh();
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const expired = quote ? now >= quote.expiresAt : false;
  return (
    <div className="pt-4">
      <h1 className="text-2xl font-semibold">{copy("Send bitcoin", "বিটকয়েন পাঠান")}</h1>
      <NetworkNotice member={member} lang={lang} />
      {receipt ? (
        <div className="mt-5 flex flex-col gap-4">
          <PaymentReceipt payment={receipt} lang={lang} />
          <Btn
            tone="ghost"
            onClick={() => {
              setReceipt(null);
              setDestination("");
              setAmount("");
              wallet.refresh();
            }}
          >
            {copy("New payment", "নতুন পেমেন্ট")}
          </Btn>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          <Field
            label={copy("Destination / invoice / LNURL", "ঠিকানা / invoice / LNURL")}
            value={destination}
            onChange={setDestination}
            mono
          />
          <input
            ref={scan}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void readQr(file)
                  .then(setDestination)
                  .catch(() =>
                    setError(copy("Could not read this QR image.", "QR ছবিটি পড়া যায়নি।")),
                  );
              e.target.value = "";
            }}
          />
          <Btn tone="ghost" disabled={busy} onClick={() => scan.current?.click()}>
            {copy("Read QR image", "QR ছবি পড়ুন")}
          </Btn>
          <Field
            label={copy(
              "Amount (sats, optional for fixed invoice)",
              "পরিমাণ (sats; নির্দিষ্ট invoice হলে ঐচ্ছিক)",
            )}
            value={amount}
            onChange={setAmount}
            inputMode="numeric"
            mono
          />
          <label className="text-sm text-muted">
            {copy("Bitcoin confirmation speed", "বিটকয়েন confirmation speed")}
            <select
              value={speed}
              onChange={(e) => setSpeed(e.target.value as Speed)}
              className="mt-2 h-12 w-full rounded-xl border border-line bg-surface px-3 text-fg"
            >
              {(["slow", "medium", "fast"] as const).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <p className="text-sm text-muted">
            {copy("Live balance", "লাইভ balance")}:{" "}
            {wallet.balance === null ? "—" : `${formatSats(wallet.balance)} sats`}
          </p>
          <p className="text-xs text-muted">
            {copy(
              "This flow supports bitcoin payments. Token and cross-chain operations are available only in Advanced SDK tools.",
              "এই flow বিটকয়েনের জন্য। Token ও cross-chain কাজ Advanced SDK tools-এ রয়েছে।",
            )}
          </p>
          {wallet.error ? (
            <p role="alert" className="text-sm text-danger">
              {wallet.error}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          {quote ? (
            <section className="rounded-2xl border border-primary bg-surface p-4">
              <h2 className="font-semibold">
                {copy("Review the SDK quote", "SDK quote যাচাই করুন")}
              </h2>
              <Line k={copy("Recipient", "প্রাপক")} v={quote.destination} />
              <Line k={copy("Amount", "পরিমাণ")} v={`${formatSats(quote.amountSats)} sats`} />
              <Line k={copy("Fee", "ফি")} v={`${formatSats(quote.feeSats)} sats`} />
              <Line
                k={copy("Total debit", "মোট কাটা হবে")}
                v={`${formatSats(quote.totalSats)} sats`}
              />
              <Line k={copy("Network", "নেটওয়ার্ক")} v={quote.network} />
              <p className="my-3 text-xs text-muted">
                {expired
                  ? copy("Quote expired. Review again.", "Quote-এর মেয়াদ শেষ। আবার review করুন।")
                  : copy(
                      "Editing any field invalidates this quote.",
                      "কোনো তথ্য বদলালে এই quote বাতিল হবে।",
                    )}
              </p>
              <Btn disabled={busy || expired} onClick={() => void confirm()}>
                {busy
                  ? copy("Sending…", "পাঠানো হচ্ছে…")
                  : copy("Confirm payment", "পেমেন্ট নিশ্চিত করুন")}
              </Btn>
            </section>
          ) : null}
          <Btn tone={quote ? "ghost" : "primary"} disabled={busy} onClick={() => void review()}>
            {busy
              ? copy("Working…", "কাজ হচ্ছে…")
              : copy("Get quote and review", "Quote নিয়ে review করুন")}
          </Btn>
        </div>
      )}
    </div>
  );
}

export function LiveReceiveScreen({ member }: { member: Member }) {
  const lang = useCpay((s) => s.lang);
  const apiKey = useCpay((s) => s.apiKey);
  const [method, setMethod] = useState<"bolt11" | "spark" | "bitcoin">("bolt11");
  const [amount, setAmount] = useState("");
  const [request, setRequest] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const mounted = useRef(false);
  const phrase = member.seed.join(" ");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current++;
    };
  }, []);
  const pending = useRef(false);
  const copy = (en: string, bn: string) => liveCopy(lang, en, bn);
  useEffect(() => {
    epoch.current++;
    setRequest("");
    setError(null);
    return () => {
      epoch.current++;
    };
  }, [member.id, member.mode, member.network, member.account, phrase, apiKey, method, amount]);
  async function make() {
    if (pending.current) return;
    const requestEpoch = epoch.current;
    let authorization: number;
    try {
      authorization = walletAuthorization.capture();
    } catch (cause) {
      setError(explain(cause));
      return;
    }
    const current = () =>
      mounted.current &&
      requestEpoch === epoch.current &&
      walletAuthorization.isCurrent(authorization) &&
      isSelectedWallet(member, apiKey);
    if (!current()) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const expected = await sessionKeyFor({
        mnemonic: member.seed.join(" "),
        network: member.network ?? "regtest",
        account: member.account ?? 0,
      });
      if (!current()) return;
      await ensureLive(member.seed.join(" "), liveOptions(member, apiKey));
      if (!current()) return;
      if (!isSessionCurrent(expected.key))
        throw new Error("Wallet session changed. Generate a new request.");
      const response = await receiveLive({
        method,
        amount,
        description: "CPay",
        tokenIdentifier: "",
      });
      if (current() && isSessionCurrent(expected.key)) setRequest(response.paymentRequest);
    } catch (cause) {
      if (current()) setError(explain(cause));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="pt-4">
      <h1 className="text-2xl font-semibold">{copy("Receive bitcoin", "বিটকয়েন গ্রহণ")}</h1>
      <NetworkNotice member={member} lang={lang} />
      <div className="mt-4 flex flex-col gap-3">
        <label className="text-sm text-muted">
          {copy("Payment method", "পেমেন্ট পদ্ধতি")}
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
            className="mt-2 h-12 w-full rounded-xl border border-line bg-surface px-3 text-fg"
          >
            <option value="bolt11">Lightning</option>
            <option value="spark">Spark</option>
            <option value="bitcoin">Bitcoin</option>
          </select>
        </label>
        {method === "bolt11" ? (
          <Field
            label={copy("Amount in sats (optional)", "পরিমাণ sats-এ (ঐচ্ছিক)")}
            value={amount}
            onChange={setAmount}
            inputMode="numeric"
          />
        ) : null}
        <Btn disabled={busy} onClick={() => void make()}>
          {busy
            ? copy("Creating…", "তৈরি হচ্ছে…")
            : copy("Create payment request", "পেমেন্ট request তৈরি করুন")}
        </Btn>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {request ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface p-4">
            <Qr value={request} />
            <p className="w-full break-all font-mono text-xs">{request}</p>
            <Btn
              tone="ghost"
              onClick={() =>
                void copyText(request).then((ok) => {
                  if (!ok) setError(copy("Copy failed.", "কপি হয়নি।"));
                })
              }
            >
              {copy("Copy request", "Request কপি করুন")}
            </Btn>
          </div>
        ) : null}
        <p className="text-xs text-muted">
          {copy(
            "Only SDK-generated requests appear here. A connection error never creates a practice address.",
            "শুধু SDK-এর তৈরি request এখানে দেখায়। Connection ব্যর্থ হলে practice ঠিকানা তৈরি হয় না।",
          )}
        </p>
      </div>
    </div>
  );
}

export function PaymentReceipt({ payment, lang }: { payment: LivePayment; lang: Lang }) {
  const copy = (en: string, bn: string) => liveCopy(lang, en, bn);
  const label =
    payment.status === "completed"
      ? copy("Completed", "সম্পন্ন")
      : payment.status === "failed"
        ? copy("Failed", "ব্যর্থ")
        : copy("Pending confirmation", "নিশ্চিত হওয়ার অপেক্ষায়");
  const Icon = payment.status === "completed" ? Check : payment.status === "failed" ? X : Clock;
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-5" />
        <h2 className="text-lg font-semibold">{label}</h2>
      </div>
      <Line k={copy("Amount", "পরিমাণ")} v={`${formatSats(payment.amountSats)} sats`} />
      <Line k={copy("Fee", "ফি")} v={`${formatSats(payment.feeSats)} sats`} />
      <Line k={copy("Payment ID", "পেমেন্ট আইডি")} v={payment.id} />
      <Line k={copy("Method", "পদ্ধতি")} v={payment.method} />
      <Line
        k={copy("Time", "সময়")}
        v={new Date(payment.timestamp).toLocaleString(lang === "bn" ? "bn-BD" : "en-US")}
      />
      {payment.status === "pending" ? (
        <p className="mt-3 text-sm text-muted">
          {copy(
            "Accepted by the SDK; settlement is not yet confirmed. Check Activity for updates.",
            "SDK গ্রহণ করেছে; settlement এখনও নিশ্চিত নয়। Activity-তে আপডেট দেখুন।",
          )}
        </p>
      ) : null}
    </section>
  );
}

export function LiveActivityScreen({
  member,
  compact = false,
}: {
  member: Member;
  compact?: boolean;
}) {
  const lang = useCpay((s) => s.lang);
  const btcUsd = useCpay((s) => s.btcUsd);
  const wallet = useLiveWallet(member);
  const [selected, setSelected] = useState<LivePayment | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const copy = (en: string, bn: string) => liveCopy(lang, en, bn);
  const rows = wallet.payments
    .filter(
      (p) =>
        (filter === "all" || p.direction === filter || p.status === filter) &&
        `${p.id} ${p.method}`.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, compact ? 4 : 100);
  const receipt = selected ? (wallet.payments.find((p) => p.id === selected.id) ?? selected) : null;
  return (
    <div className={compact ? "mt-5" : "pt-4"}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {copy(
            compact ? "Recent bitcoin payments" : "Bitcoin activity",
            compact ? "সাম্প্রতিক বিটকয়েন পেমেন্ট" : "বিটকয়েন লেনদেন",
          )}
        </h2>
        <button
          className="min-h-11 text-sm text-primary"
          type="button"
          disabled={wallet.loading}
          onClick={wallet.refresh}
        >
          {copy("Refresh", "রিফ্রেশ")}
        </button>
      </div>
      {!compact ? (
        <>
          <NetworkNotice member={member} lang={lang} />
          <div className="mt-3">
            <Field
              label={copy("Search payment ID or method", "আইডি বা পদ্ধতি খুঁজুন")}
              value={query}
              onChange={setQuery}
            />
          </div>
          <select
            className="mt-3 h-11 rounded-xl border border-line bg-surface px-3"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">{copy("All", "সব")}</option>
            <option value="in">{copy("Received", "গ্রহণ")}</option>
            <option value="out">{copy("Sent", "প্রেরণ")}</option>
            <option value="pending">{copy("Pending", "অপেক্ষমাণ")}</option>
            <option value="failed">{copy("Failed", "ব্যর্থ")}</option>
          </select>
        </>
      ) : null}
      {!compact ? (
        <p className="mt-2 text-xs text-muted">
          {copy(
            "Bitcoin history only. Token history is available in Advanced SDK tools.",
            "শুধু বিটকয়েনের history। Token history Advanced SDK tools-এ দেখুন।",
          )}
        </p>
      ) : null}
      {wallet.error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {wallet.error}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          {wallet.loading
            ? copy("Loading SDK history…", "SDK history আসছে…")
            : copy("No live payments found.", "কোনো লাইভ পেমেন্ট পাওয়া যায়নি।")}
        </p>
      ) : null}
      <ul>
        {rows.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setSelected(p)}
              className="flex w-full items-center gap-3 border-b border-line py-3 text-left"
            >
              {p.direction === "in" ? (
                <ArrowDownLeft className="size-5 text-primary" />
              ) : (
                <ArrowUpRight className="size-5" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm">
                  {p.method} · {p.status}
                </span>
                <span className="block truncate font-mono text-xs text-muted">{p.id}</span>
              </span>
              <span className="text-right">
                <span className="block font-mono text-sm">
                  {p.direction === "in" ? "+" : "−"}
                  {formatSats(p.amountSats)} sats
                </span>
                <span className="text-xs text-muted">
                  {formatUsd(satsToUsd(p.amountSats, btcUsd))}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {receipt ? (
        <div className="mt-4">
          <PaymentReceipt payment={receipt} lang={lang} />
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="min-h-11 text-sm text-primary"
          >
            {copy("Close receipt", "রসিদ বন্ধ করুন")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
