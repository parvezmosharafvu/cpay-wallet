import { Capacitor } from "@capacitor/core";
import { copyText } from "@/lib/cpay/money";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  beginVaultLock,
  browserVault,
  refreshVaultState,
  setVaultError,
  subscribeVault,
  vaultError,
  vaultServerState,
  vaultState,
} from "@/lib/cpay/browser-vault";
import { resetWalletMemory, sanitizeWalletData, useCpay } from "@/lib/cpay/store";
import { disconnectLive } from "@/lib/cpay/sdk";
import type { Lang } from "@/lib/cpay/types";

const inputClass = "h-12 w-full rounded-2xl border border-line bg-surface px-4 text-fg";
const buttonClass =
  "min-h-12 w-full rounded-2xl bg-primary px-4 py-3 font-semibold text-primary-ink disabled:opacity-40";
function text(lang: Lang, en: string, bn: string) {
  return lang === "bn" ? bn : en;
}
async function hydrate() {
  const raw = await browserVault().read();
  if (!raw) throw new Error("Unlock the vault first.");
  const state = sanitizeWalletData((JSON.parse(raw) as { state: unknown }).state);
  if (!browserVault().isUnlocked()) throw new Error("Vault locked.");
  useCpay.setState(state);
  await browserVault().flush();
}
export async function lockWallet(externalChange = false) {
  beginVaultLock(); // Hide/unmount signing UI before asynchronous persistence or teardown.
  const disconnected = disconnectLive(); // Synchronously revokes the SDK session.
  let failure: unknown;
  if (externalChange)
    browserVault().lock(); // Never flush obsolete data over another tab's write.
  else {
    try {
      await browserVault().flush();
    } catch (error) {
      failure = error;
    }
    browserVault().lock();
  }
  resetWalletMemory();
  refreshVaultState();
  await disconnected.catch(() => undefined);
  if (failure)
    setVaultError(
      "Latest changes could not be saved before locking. Your previous encrypted vault is retained.",
    );
}
export function VaultGate({ children }: { children: ReactNode }) {
  const status = useSyncExternalStore(subscribeVault, vaultState, vaultServerState);
  const storageError = useSyncExternalStore(subscribeVault, vaultError, () => "");
  const [lang, setLang] = useState<Lang>("en");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importText, setImportText] = useState("");
  const importing = Boolean(importFile || importText.trim());
  useEffect(() => {
    try {
      refreshVaultState();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Storage unavailable.");
    }
    const storage = (event: StorageEvent) => {
      if (event.key === "cpay-vault-v1" || event.key === null) void lockWallet(true);
    };
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, []);
  useEffect(() => {
    if (status !== "unlocked") {
      setReady(false);
      return;
    }
    let timeout: ReturnType<typeof setTimeout>;
    let hidden: ReturnType<typeof setTimeout> | undefined;
    const touch = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => void lockWallet(), 5 * 60_000);
    };
    const visibility = () => {
      if (document.hidden) hidden = setTimeout(() => void lockWallet(), 30_000);
      else {
        clearTimeout(hidden);
        touch();
      }
    };
    touch();
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearTimeout(timeout);
      clearTimeout(hidden);
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [status]);
  async function open() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const v = browserVault();
      if (importing) {
        if (importFile && importFile.size > 16 * 1024 * 1024)
          throw new Error("Backup is too large.");
        await v.import(
          importFile ? await importFile.text() : importText.trim(),
          password,
          (raw) => {
            sanitizeWalletData((JSON.parse(raw) as { state: unknown }).state);
          },
        );
      } else if (status === "new") {
        if (password !== repeat)
          throw new Error(text(lang, "Passwords do not match.", "পাসওয়ার্ড মিলছে না।"));
        const legacy = localStorage.getItem("cpay-practice-v1");
        if (legacy) sanitizeWalletData((JSON.parse(legacy) as { state: unknown }).state);
        await v.create(password);
      } else await v.unlock(password);
      await hydrate();
      setPassword("");
      setRepeat("");
      setImportFile(null);
      setImportText("");
      setReady(true);
      refreshVaultState();
    } catch (e) {
      browserVault().lock();
      void disconnectLive().catch(() => undefined);
      resetWalletMemory();
      setReady(false);
      refreshVaultState();
      setError(e instanceof Error ? e.message : "Could not open wallet.");
    } finally {
      setBusy(false);
    }
  }
  if (status === "unlocked" && ready)
    return (
      <>
        {storageError ? (
          <p role="alert" className="bg-danger p-3 text-fg">
            {storageError}
          </p>
        ) : null}
        {children}
      </>
    );
  return (
    <main className="mx-auto min-h-dvh max-w-md space-y-5 bg-bg px-5 py-10 text-fg">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">CPay</h1>
        <button type="button" onClick={() => setLang(lang === "en" ? "bn" : "en")}>
          {lang === "en" ? "বাংলা" : "English"}
        </button>
      </header>
      <h2 className="text-xl font-semibold">
        {text(
          lang,
          status === "new" ? "Protect your wallet" : "Unlock your wallet",
          status === "new" ? "ওয়ালেট সুরক্ষিত করুন" : "ওয়ালেট আনলক করুন",
        )}
      </h2>
      <p className="text-sm text-muted">
        {text(
          lang,
          "Your wallet stays encrypted on this device. This password is separate from your account login. Keep an encrypted backup and recovery words; CPay cannot reset this password or recover lost keys.",
          "এই ডিভাইসে আপনার ওয়ালেট এনক্রিপ্ট করে রাখা হবে। এই পাসওয়ার্ড অ্যাকাউন্ট লগইন থেকে আলাদা। এনক্রিপ্ট করা ব্যাকআপ ও রিকভারি শব্দ সংরক্ষণ করুন; CPay হারানো পাসওয়ার্ড বা চাবি উদ্ধার করতে পারবে না।",
        )}
      </p>
      {status === "new" && typeof localStorage !== "undefined" && browserVault().hasLegacy() ? (
        <p role="status" className="rounded-2xl border border-line p-3 text-sm">
          {text(
            lang,
            "Existing wallet data will be encrypted before the old unencrypted copy is removed.",
            "পুরোনো ওয়ালেট ডেটা আগে এনক্রিপ্ট হবে, তারপর এনক্রিপশনবিহীন কপি মুছে যাবে।",
          )}
        </p>
      ) : null}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void open();
        }}
      >
        <label className="block text-sm">
          {text(lang, "Vault password", "ভল্ট পাসওয়ার্ড")}
          <input
            type="password"
            autoComplete={status === "new" && !importing ? "new-password" : "current-password"}
            minLength={status === "new" && !importing ? 12 : undefined}
            maxLength={1024}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            required
          />
        </label>
        {status === "new" && !importing ? (
          <label className="block text-sm">
            {text(lang, "Repeat password (12+ characters)", "আবার লিখুন (অন্তত ১২ অক্ষর)")}
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              className={inputClass}
              required
            />
          </label>
        ) : null}
        <button className={buttonClass} disabled={busy || status === "loading"}>
          {busy
            ? text(lang, "Opening…", "খুলছে…")
            : text(
                lang,
                importing
                  ? "Restore encrypted backup"
                  : status === "new"
                    ? "Create encrypted vault"
                    : "Unlock",
                importing
                  ? "এনক্রিপ্ট করা ব্যাকআপ ফেরান"
                  : status === "new"
                    ? "এনক্রিপ্ট করা ভল্ট তৈরি"
                    : "আনলক",
              )}
        </button>
      </form>
      {status === "new" ? (
        <label className="block text-sm">
          {text(lang, "Or import an encrypted CPay backup", "অথবা এনক্রিপ্ট করা CPay ব্যাকআপ আনুন")}
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            className="mt-2 block w-full"
          />
        </label>
      ) : null}
      {status === "new" ? (
        <details>
          <summary className="cursor-pointer py-3">
            {text(lang, "Paste encrypted backup instead", "এনক্রিপ্ট করা ব্যাকআপ পেস্ট করুন")}
          </summary>
          <textarea
            aria-label="Encrypted backup JSON"
            className="h-32 w-full rounded-xl border border-line bg-surface p-3 text-xs"
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportFile(null);
            }}
            spellCheck={false}
            autoComplete="off"
          />
        </details>
      ) : null}
      {status === "locked" ? (
        <details>
          <summary className="cursor-pointer py-3">
            {text(lang, "Lost your vault password?", "ভল্ট পাসওয়ার্ড হারিয়েছেন?")}
          </summary>
          <p className="text-sm text-muted">
            {text(
              lang,
              "CPay cannot reset it. With your recovery words, you can restore your live wallet in a fresh browser profile or another device, using the original network and account number. Keep this encrypted vault; do not clear site data until recovery has been verified. An older encrypted backup still needs its own password.",
              "CPay পাসওয়ার্ড বদলে দিতে পারবে না। Recovery words থাকলে অন্য ডিভাইস বা নতুন browser profile-এ আগের network ও account number দিয়ে লাইভ wallet ফেরাতে পারবেন। Recovery যাচাই না করে এই ডিভাইসের site data মুছবেন না। পুরোনো encrypted backup-এ তার নিজস্ব পাসওয়ার্ড লাগবে।",
            )}
          </p>
        </details>
      ) : null}
      {error || storageError ? (
        <p role="alert" className="text-sm text-danger">
          {error || storageError}
        </p>
      ) : null}
      <p className="text-xs text-muted">
        {text(
          lang,
          "Auto-lock: 5 minutes inactive, or 30 seconds in the background. Encryption protects stored data; keep this device and browser secure while unlocked.",
          "৫ মিনিট ব্যবহার না করলে বা ৩০ সেকেন্ড ব্যাকগ্রাউন্ডে থাকলে লক হবে। আনলক অবস্থায় ডিভাইস ও ব্রাউজার নিরাপদ রাখুন।",
        )}
      </p>
    </main>
  );
}
export function SecretReveal({
  secret,
  lang,
  label,
}: {
  secret: string;
  lang: Lang;
  label?: string;
}) {
  const [password, setPassword] = useState("");
  const [asking, setAsking] = useState(false);
  const [shown, setShown] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setShown(false);
    setAsking(false);
    setPassword("");
  }, [secret]);
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(false), 30_000);
    return () => clearTimeout(timer);
  }, [shown]);
  return (
    <div className="space-y-2">
      {shown ? (
        <>
          <p className="break-words rounded-xl border border-line p-3 font-mono text-sm">
            {secret}
          </p>
          <button type="button" onClick={() => setShown(false)}>
            {text(lang, "Hide recovery words", "রিকভারি শব্দ আড়াল করুন")}
          </button>
        </>
      ) : (
        <button type="button" className="min-h-11 text-primary" onClick={() => setAsking(!asking)}>
          {label ?? text(lang, "Reveal recovery words", "রিকভারি শব্দ দেখুন")}
        </button>
      )}
      {asking && !shown ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            void browserVault()
              .verify(password)
              .then(() => {
                setShown(true);
                setAsking(false);
                setPassword("");
                setError("");
              })
              .catch(() => setError(text(lang, "Wrong vault password.", "ভল্ট পাসওয়ার্ড ভুল।")))
              .finally(() => setBusy(false));
          }}
        >
          <input
            aria-label={text(lang, "Confirm vault password", "ভল্ট পাসওয়ার্ড নিশ্চিত করুন")}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            required
          />
          <button className={buttonClass} disabled={busy}>
            {text(lang, "Verify and reveal", "যাচাই করে দেখুন")}
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
export function VaultSettings() {
  const lang = useCpay((s) => s.lang);
  const [password, setPassword] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [backupSaved, setBackupSaved] = useState(false);
  const [backupText, setBackupText] = useState("");
  const [eraseText, setEraseText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy(false);
      setPassword("");
    }
  }
  return (
    <section className="my-6 space-y-3 rounded-2xl border border-line p-4">
      <h2 className="font-semibold">
        {text(lang, "Wallet security & backup", "ওয়ালেট সুরক্ষা ও ব্যাকআপ")}
      </h2>
      <p className="text-sm text-muted">
        {text(
          lang,
          "Backups include all wallets, contacts and history, encrypted with your vault password. Store a copy outside this device. Account sign-in does not recover your wallet.",
          "ব্যাকআপে সব ওয়ালেট, কন্ট্যাক্ট ও ইতিহাস ভল্ট পাসওয়ার্ড দিয়ে এনক্রিপ্ট করা থাকে। এই ডিভাইসের বাইরে কপি রাখুন। অ্যাকাউন্টে লগইন করে হারানো ওয়ালেট উদ্ধার করা যায় না।",
        )}
      </p>
      <button
        type="button"
        className={buttonClass}
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const raw = await browserVault().export();
            setBackupText(raw);
            if (!Capacitor.isNativePlatform()) {
              const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = `cpay-encrypted-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
            setMessage(
              text(
                lang,
                "Encrypted backup prepared. Save the file or copy the encrypted text outside this device, then verify it restores correctly.",
                "এনক্রিপ্ট করা ব্যাকআপ প্রস্তুত। ফাইল অথবা এনক্রিপ্ট করা টেক্সট এই ডিভাইসের বাইরে রাখুন, তারপর ফেরানো যায় কি না যাচাই করুন।",
              ),
            );
          })
        }
      >
        {text(lang, "Download encrypted backup", "এনক্রিপ্ট করা ব্যাকআপ নামান")}
      </button>
      {backupText ? (
        <div className="space-y-2">
          <label className="block text-sm">
            {text(
              lang,
              "Encrypted backup text (also works in the mobile app)",
              "এনক্রিপ্ট করা ব্যাকআপ টেক্সট (মোবাইল অ্যাপেও ব্যবহার করা যাবে)",
            )}
            <textarea
              aria-label="Encrypted backup text"
              className="mt-2 h-28 w-full rounded-xl border border-line bg-surface p-2 font-mono text-xs"
              value={backupText}
              readOnly
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            className="min-h-11 text-primary"
            onClick={() =>
              void copyText(backupText).then((ok) =>
                setMessage(
                  text(
                    lang,
                    ok
                      ? "Encrypted text copied. Save it in a file; the clipboard alone is not a backup."
                      : "Could not copy. Select and save the encrypted text manually.",
                    ok
                      ? "এনক্রিপ্ট করা টেক্সট কপি হয়েছে। ফাইলে সংরক্ষণ করুন; শুধু clipboard ব্যাকআপ নয়।"
                      : "কপি হয়নি। টেক্সট নিজে নির্বাচন করে সংরক্ষণ করুন।",
                  ),
                ),
              )
            }
          >
            {text(lang, "Copy encrypted backup text", "এনক্রিপ্ট করা ব্যাকআপ টেক্সট কপি করুন")}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="min-h-12 w-full rounded-xl border border-line"
        disabled={busy}
        onClick={() => void lockWallet()}
      >
        {text(lang, "Lock wallet now", "এখনই ওয়ালেট লক করুন")}
      </button>
      <details className="space-y-3">
        <summary className="cursor-pointer py-3">
          {text(lang, "Change vault password", "ভল্ট পাসওয়ার্ড বদলান")}
        </summary>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (next !== repeat)
                throw new Error(text(lang, "Passwords do not match.", "পাসওয়ার্ড মিলছে না।"));
              await browserVault().changePassword(password, next);
              setNext("");
              setRepeat("");
              setMessage(
                text(
                  lang,
                  "Password changed. Download a new backup; older backups still use the old password.",
                  "পাসওয়ার্ড বদলেছে। নতুন ব্যাকআপ নামান; পুরোনো ব্যাকআপে পুরোনো পাসওয়ার্ড লাগবে।",
                ),
              );
            });
          }}
        >
          <input
            type="password"
            autoComplete="current-password"
            placeholder={text(lang, "Current vault password", "বর্তমান ভল্ট পাসওয়ার্ড")}
            aria-label="Current vault password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            placeholder={text(lang, "New password (12+ characters)", "নতুন পাসওয়ার্ড (১২+ অক্ষর)")}
            aria-label="New vault password"
            className={inputClass}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            placeholder={text(lang, "Repeat new password", "আবার নতুন পাসওয়ার্ড")}
            aria-label="Repeat new vault password"
            className={inputClass}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            required
          />
          <button disabled={busy} className={buttonClass}>
            {text(lang, "Update password", "পাসওয়ার্ড বদলান")}
          </button>
        </form>
      </details>
      <details>
        <summary className="cursor-pointer py-3 text-danger">
          {text(lang, "Erase wallet data on this device", "এই ডিভাইসের ওয়ালেট মুছুন")}
        </summary>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (!backupSaved || eraseText !== "ERASE")
                throw new Error("Confirm your backup and type ERASE.");
              await browserVault().verify(password);
              const sdk = await import("@/lib/cpay/sdk");
              await sdk.disconnectLive();
              if ("clearLiveStorage" in sdk && typeof sdk.clearLiveStorage === "function")
                await sdk.clearLiveStorage();
              browserVault().destroy();
              resetWalletMemory();
              refreshVaultState();
            });
          }}
        >
          <p className="text-sm text-danger">
            {text(
              lang,
              "This removes local recovery keys, wallets, API keys and SDK data. It does not cancel payments, erase external backups, or remove your passkey from your password manager.",
              "এতে এই ডিভাইসের রিকভারি চাবি, ওয়ালেট, API key ও SDK ডেটা মুছবে। পেমেন্ট বাতিল, বাইরের ব্যাকআপ বা পাসওয়ার্ড ম্যানেজারের passkey মুছবে না।",
            )}
          </p>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={backupSaved}
              onChange={(e) => setBackupSaved(e.target.checked)}
            />
            {text(
              lang,
              "I have verified my recovery words or encrypted backup.",
              "আমার রিকভারি শব্দ বা এনক্রিপ্ট করা ব্যাকআপ যাচাই করেছি।",
            )}
          </label>
          <input
            aria-label="Type ERASE"
            placeholder="ERASE"
            className={inputClass}
            value={eraseText}
            onChange={(e) => setEraseText(e.target.value)}
            required
          />
          <input
            type="password"
            aria-label="Vault password for erasure"
            placeholder={text(lang, "Vault password", "ভল্ট পাসওয়ার্ড")}
            autoComplete="current-password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            disabled={busy || !backupSaved || eraseText !== "ERASE"}
            className="min-h-12 w-full rounded-xl bg-danger font-semibold text-fg"
          >
            {text(lang, "Erase this device", "এই ডিভাইস মুছুন")}
          </button>
        </form>
      </details>
      {message ? (
        <p role="status" className="text-sm text-primary">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
