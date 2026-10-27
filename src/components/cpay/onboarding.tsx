import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useCpay } from "@/lib/cpay/store";
import { createPasskey, signInPasskey, passkeyMessage } from "@/lib/cpay/passkey";
import { copyText } from "@/lib/cpay/money";
import { t } from "@/lib/cpay/i18n";
import type { Lang } from "@/lib/cpay/types";
import { Btn, Field, Frame, Logo } from "./shared-ui";

const copy = (lang: Lang, en: string, bn: string) => (lang === "bn" ? bn : en);

export function NetworkPicker({
  value,
  onChange,
  lang,
}: {
  value: "regtest" | "mainnet";
  onChange: (v: "regtest" | "mainnet") => void;
  lang: Lang;
}) {
  return (
    <label className="block text-sm text-muted">
      {copy(lang, "Network", "নেটওয়ার্ক")}
      <select
        className="mt-2 h-12 w-full rounded-xl border border-line bg-surface px-3 text-fg"
        value={value}
        onChange={(e) => onChange(e.target.value as typeof value)}
      >
        <option value="regtest">Regtest — {copy(lang, "test bitcoin", "পরীক্ষার বিটকয়েন")}</option>
        <option value="mainnet">Mainnet — {copy(lang, "real bitcoin", "আসল বিটকয়েন")}</option>
      </select>
    </label>
  );
}

export function Onboarding() {
  const lang = useCpay((s) => s.lang);
  const setLang = useCpay((s) => s.setLang);
  const [page, setPage] = useState<"home" | "create" | "restore">("home");
  const [walletMode, setWalletMode] = useState<"practice" | "live">("live");
  const [network, setNetwork] = useState<"regtest" | "mainnet">("regtest");
  const [account, setAccount] = useState("0");
  const [name, setName] = useState("");
  const [words, setWords] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const c = (en: string, bn: string) => copy(lang, en, bn);
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const state = useCpay.getState();
      const label = name.trim() || "CPay";
      if (
        walletMode === "live" &&
        (!/^\d+$/.test(account) || !Number.isSafeInteger(Number(account)))
      )
        throw new Error(
          c(
            "Use a whole, non-negative account number.",
            "শূন্য বা তার বেশি পূর্ণসংখ্যায় account দিন।",
          ),
        );
      if (page === "restore" && !words.trim())
        throw new Error(c("Enter your recovery words.", "Recovery words লিখুন।"));
      const result =
        walletMode === "live"
          ? await state.createLiveMember(
              label,
              page === "restore" ? words : undefined,
              network,
              Number(account),
            )
          : page === "restore"
            ? await state.restore(words, "practice")
            : await state.createMember(label);
      if (!result.ok)
        setError(
          walletMode === "live" && result.error === "badSeed"
            ? c(
                "Enter a valid BIP39 recovery phrase with its checksum.",
                "Checksum-সহ সঠিক BIP39 recovery phrase দিন।",
              )
            : t(lang, result.error),
        );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function passkey(kind: "create" | "signin") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const label = name.trim() || "CPay";
      const seed = kind === "create" ? await createPasskey(label) : await signInPasskey(label);
      const result = await useCpay
        .getState()
        .createLiveMember(label, seed.join(" "), network, 0, kind === "create");
      if (!result.ok) setError(t(lang, result.error));
    } catch (cause) {
      setError(t(lang, passkeyMessage(cause)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame>
      <header className="flex items-center justify-between pt-6">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-lg font-semibold">CPay</span>
        </div>
        <button
          className="h-11 rounded-xl border border-line px-3 text-sm"
          type="button"
          onClick={() => setLang(lang === "en" ? "bn" : "en")}
        >
          {lang === "en" ? "বাংলা" : "English"}
        </button>
      </header>
      {page === "home" ? (
        <div className="flex flex-1 flex-col gap-4 pt-8">
          <h1 className="text-3xl font-semibold">
            {c("Your keys. Your wallet.", "আপনার চাবি। আপনার ওয়ালেট।")}
          </h1>
          <p className="text-sm text-muted">
            {c(
              "Choose a live SDK wallet or a clearly separate practice wallet. Your recovery phrase and encrypted backup are your responsibility.",
              "লাইভ SDK wallet অথবা আলাদা practice wallet বেছে নিন। Recovery phrase ও encrypted backup নিরাপদে রাখুন।",
            )}
          </p>
          <NetworkPicker value={network} onChange={setNetwork} lang={lang} />
          <p className="text-xs text-muted">
            {network === "mainnet"
              ? c(
                  "Mainnet uses real bitcoin. Start with regtest while validating recovery and payments.",
                  "Mainnet আসল বিটকয়েন ব্যবহার করে। Recovery ও payment যাচাইয়ে আগে regtest ব্যবহার করুন।",
                )
              : c("Regtest has no real-money value.", "Regtest-এর বাস্তব অর্থমূল্য নেই।")}
          </p>
          <Btn
            disabled={busy}
            onClick={() => {
              setWalletMode("live");
              setPage("create");
              setError(null);
            }}
          >
            {c("Create live wallet", "লাইভ wallet তৈরি করুন")}
          </Btn>
          <Btn
            tone="ghost"
            disabled={busy}
            onClick={() => {
              setWalletMode("live");
              setPage("restore");
              setError(null);
            }}
          >
            {c("Restore live wallet (BIP39)", "লাইভ wallet পুনরুদ্ধার (BIP39)")}
          </Btn>
          <div className="border-t border-line pt-4">
            <p className="mb-3 text-sm text-muted">
              {c(
                "Passkeys are tied to this site's domain and your authenticator. Keep an independent recovery backup.",
                "Passkey এই সাইটের domain ও authenticator-এর সঙ্গে যুক্ত। আলাদা recovery backup রাখুন।",
              )}
            </p>
            <div className="flex flex-col gap-2">
              <Btn tone="ghost" disabled={busy} onClick={() => void passkey("create")}>
                {t(lang, "passkeyCta")}
              </Btn>
              <Btn tone="ghost" disabled={busy} onClick={() => void passkey("signin")}>
                {t(lang, "passkeyIn")}
              </Btn>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            className="min-h-11 text-sm text-primary"
            onClick={() => {
              setWalletMode("practice");
              setPage("create");
              setError(null);
            }}
          >
            {c("Try practice mode — no real funds", "Practice mode দেখুন — আসল অর্থ নয়")}
          </button>
          <button
            type="button"
            disabled={busy}
            className="min-h-11 text-sm text-primary"
            onClick={() => {
              setWalletMode("practice");
              setPage("restore");
              setError(null);
            }}
          >
            {c("Restore practice words", "Practice words পুনরুদ্ধার")}
          </button>
        </div>
      ) : (
        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h1 className="text-2xl font-semibold">
            {page === "create"
              ? c("Create wallet", "ওয়ালেট তৈরি")
              : c("Restore wallet", "ওয়ালেট পুনরুদ্ধার")}
          </h1>
          <p className="rounded-xl border border-line p-3 text-sm text-muted">
            {walletMode === "live"
              ? c("LIVE SDK · BIP39 recovery phrase", "LIVE SDK · BIP39 recovery phrase")
              : c("PRACTICE · Simulated balances only", "PRACTICE · শুধু অনুশীলনের balance")}
          </p>
          <Field
            label={c("Wallet name", "ওয়ালেটের নাম")}
            value={name}
            onChange={setName}
            placeholder="CPay"
          />
          {walletMode === "live" ? (
            <>
              <NetworkPicker value={network} onChange={setNetwork} lang={lang} />
              <Field
                label={c(
                  "Account number (use the original number for recovery)",
                  "Account number (recovery-তে আগের নম্বর ব্যবহার করুন)",
                )}
                value={account}
                onChange={setAccount}
                inputMode="numeric"
              />
            </>
          ) : null}
          {page === "restore" ? (
            <label className="block text-sm text-muted">
              {walletMode === "live"
                ? c("12–24 BIP39 recovery words", "১২–২৪টি BIP39 recovery word")
                : c("12 practice words", "১২টি practice word")}
              <textarea
                className="mt-2 h-32 w-full rounded-xl border border-line bg-surface p-3 font-mono text-sm text-fg"
                value={words}
                onChange={(e) => setWords(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
          ) : null}
          <Btn type="submit" disabled={busy}>
            {busy
              ? c("Working…", "কাজ হচ্ছে…")
              : page === "create"
                ? c("Create and back up", "তৈরি করে backup নিন")
                : c("Restore", "পুনরুদ্ধার")}
          </Btn>
          <Btn
            tone="ghost"
            disabled={busy}
            onClick={() => {
              setPage("home");
              setWords("");
              setError(null);
            }}
          >
            {c("Back", "ফিরে যান")}
          </Btn>
        </form>
      )}
      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Frame>
  );
}

export function SeedGate({ memberId }: { memberId: string }) {
  const lang = useCpay((s) => s.lang);
  const member = useCpay((s) => s.members.find((m) => m.id === memberId));
  const ack = useCpay((s) => s.ackBackup);
  const [show, setShow] = useState(false);
  const [checked, setChecked] = useState(false);
  const [verify, setVerify] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!member) ack();
  }, [member, ack]);
  if (!member) return null;
  const live = member.mode === "live";
  const c = (en: string, bn: string) => copy(lang, en, bn);
  function complete() {
    if (!checked)
      return setError(
        c("Confirm you saved the recovery words.", "Recovery words সংরক্ষণ করেছেন নিশ্চিত করুন।"),
      );
    if (live && verify.trim().toLowerCase() !== member!.seed[member!.seed.length - 1])
      return setError(
        c(
          "Enter the last recovery word to verify your backup.",
          "Backup যাচাই করতে শেষ recovery word লিখুন।",
        ),
      );
    ack();
  }
  return (
    <Frame>
      <header className="flex items-center gap-3 pt-6">
        <Logo />
        <h1 className="text-xl font-semibold">
          {c("Back up this wallet", "ওয়ালেটের backup নিন")}
        </h1>
      </header>
      <p className="mt-4 text-sm text-muted">
        {live
          ? c(
              "These words control your live wallet. Store them offline in the correct order. The vault password is not a recovery phrase.",
              "এই words আপনার লাইভ wallet নিয়ন্ত্রণ করে। সঠিক ক্রমে offline রাখুন। Vault password recovery phrase নয়।",
            )
          : t(lang, "seedBody")}
      </p>
      <p className="mt-3 text-sm font-semibold">
        {member.name} ·{" "}
        {live
          ? `${member.network} · Account ${member.account ?? 0}`
          : c("Practice only", "শুধু practice")}
      </p>
      <div className="mt-4">
        <Btn tone="ghost" onClick={() => setShow(!show)}>
          {show
            ? c("Hide recovery words", "Recovery words লুকান")
            : c("Reveal recovery words", "Recovery words দেখুন")}
        </Btn>
      </div>
      {show ? (
        <>
          <ol className="mt-4 grid grid-cols-2 gap-2">
            {member.seed.map((word, i) => (
              <li
                key={i}
                className="rounded-xl border border-line bg-surface px-3 py-2 font-mono text-sm"
              >
                <span className="mr-2 text-muted">{i + 1}</span>
                {word}
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="flex min-h-11 items-center gap-2 text-sm text-primary"
            onClick={() => void copyText(member.seed.join(" "))}
          >
            <Copy className="size-4" />
            {c(
              "Copy (clipboard can be read by other apps)",
              "কপি (অন্য অ্যাপ clipboard পড়তে পারে)",
            )}
          </button>
        </>
      ) : null}
      <label className="mt-4 flex gap-3 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-1 size-4 accent-primary"
        />
        {c(
          "I saved the words and the network/account details.",
          "Words ও network/account তথ্য সংরক্ষণ করেছি।",
        )}
      </label>
      {live ? (
        <div className="mt-4">
          <Field
            label={c("Last recovery word", "শেষ recovery word")}
            value={verify}
            onChange={setVerify}
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-5">
        <Btn onClick={complete}>
          <Check className="mr-2 size-4" />
          {c("Verify backup and continue", "Backup যাচাই করে এগিয়ে যান")}
        </Btn>
      </div>
    </Frame>
  );
}
