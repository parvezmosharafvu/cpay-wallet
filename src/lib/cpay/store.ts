import { create } from "zustand";
import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { browserVault, encryptedWalletStorage } from "./browser-vault.ts";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CopyKey } from "./i18n";
import {
  SPEED_FEE,
  convertFeeCents,
  convertFeeSats,
  lightningFee,
  maxLightning,
  maxStable,
  satsToUsd,
  stableFeeCents,
  uid,
  usdToSats,
  sha256hex,
  slugify,
  type Speed,
} from "./money.ts";
import { parseInput } from "./parse.ts";
import type { Contact, Deposit, Lang, Member, Payment, PayKind, TokenHolding } from "./types";
import { parseSeed, randomSeed } from "./words.ts";

type Result = { ok: true; id?: string; created?: boolean } | { ok: false; error: CopyKey };

export type CpayData = {
  members: Member[];
  activeId: string | null;
  pendingBackupId: string | null;
  payments: Payment[];
  contacts: Contact[];
  deposits: Deposit[];
  lang: Lang;
  apiKey: string;
  admobAppId: string;
  admobUnitId: string;
  showAds: boolean;
  btcUsd: number;
  priceLive: boolean;
  prefill: string;
  sdkMnemonic: string;
  sdkNetwork: "regtest" | "mainnet";
  sdkAccount: number;
};

type CpayStore = CpayData & {
  createMember: (
    name: string,
    extra?: {
      sats?: number;
      cents?: number;
      seed?: string[];
      backup?: boolean;
      mode?: "practice" | "live";
    },
  ) => Promise<Result>;
  createLiveMember: (
    name: string,
    mnemonic?: string,
    network?: "regtest" | "mainnet",
    account?: number,
    requireBackup?: boolean,
  ) => Promise<Result>;
  ackBackup: () => void;
  restore: (raw: string, mode?: "practice" | "live") => Promise<Result>;
  switchTo: (id: string) => void;
  removeMember: (id: string) => Result;
  addShop: () => Promise<Result>;
  faucet: () => Result;
  wipe: () => void;
  setLang: (lang: Lang) => void;
  setApiKey: (apiKey: string) => void;
  setAdIds: (appId: string, unitId: string) => void;
  setShowAds: (showAds: boolean) => void;
  setPrice: (btcUsd: number, live: boolean) => void;
  setPrefill: (prefill: string) => void;
  setSdkMnemonic: (sdkMnemonic: string) => void;
  setSdkNetwork: (sdkNetwork: "regtest" | "mainnet") => void;
  setSdkAccount: (sdkAccount: number) => void;
  rotateAddress: () => Promise<Result>;
  sendBitcoin: (input: { destination: string; sats: number; speed: Speed; note: string }) => Result;
  sendStable: (input: { destination: string; cents: number; note: string }) => Result;
  simulateDeposit: () => Result;
  simulateStable: (cents: number) => Result;
  claim: (id: string) => Result;
  claimAll: () => Result;
  recordCash: (input: {
    to: string;
    payUsd: number;
    outUsd: number;
    asset: string;
    chain: string;
  }) => Result;
  buyBitcoin: (usd: number) => Result;
  convert: (direction: "btc-usd" | "usd-btc", amount: number) => Result;
  issueToken: (ticker: string, name: string, amount: number) => Result;
  sendToken: (ticker: string, toId: string, amount: number) => Result;
  lnurlWithdraw: (code: string, sats: number) => Result;
  addContact: (name: string, address: string) => Result;
  removeContact: (id: string) => void;
};

const EMPTY: CpayData = {
  members: [],
  activeId: null,
  pendingBackupId: null,
  payments: [],
  contacts: [],
  deposits: [],
  lang: "en",
  apiKey: "",
  admobAppId: "",
  admobUnitId: "",
  showAds: true,
  btcUsd: 97420,
  priceLive: false,
  prefill: "",
  sdkMnemonic: "",
  sdkNetwork: "regtest",
  sdkAccount: 0,
};

/** Validate imported data before replacing the encrypted vault; never copy store actions. */
export function sanitizeWalletData(value: unknown): Partial<CpayData> {
  const record = (value: unknown, label: string): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`Invalid ${label}.`);
    return value as Record<string, unknown>;
  };
  const string = (value: unknown, label: string, fallback?: string): string => {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== "string" || value.length > 65_536) throw new Error(`Invalid ${label}.`);
    return value;
  };
  const id = (value: unknown, label: string): string => {
    const result = string(value, label);
    if (!result || result.length > 256) throw new Error(`Invalid ${label}.`);
    return result;
  };
  const number = (value: unknown, label: string, integer = true, fallback?: number): number => {
    if (value === undefined && fallback !== undefined) return fallback;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > Number.MAX_SAFE_INTEGER ||
      (integer && !Number.isSafeInteger(value))
    )
      throw new Error(`Invalid ${label}.`);
    return value;
  };
  const array = (value: unknown, label: string): unknown[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(`Invalid ${label}.`);
    return value;
  };
  const unique = <T extends { id: string }>(rows: T[], label: string): T[] => {
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      throw new Error(`Duplicate ${label}.`);
    return rows;
  };
  const input = record(value, "wallet backup");
  if (!Array.isArray(input.members)) throw new Error("Wallet backup has no member list.");
  const members: Member[] = unique(
    input.members.map((item) => {
      const member = record(item, "wallet member");
      if (!Array.isArray(member.seed) || !member.seed.every((w) => typeof w === "string"))
        throw new Error("Wallet recovery data is damaged.");
      const seed = member.seed as string[];
      const phrase = seed.join(" ");
      if (member.mode !== undefined && member.mode !== "live" && member.mode !== "practice")
        throw new Error("Invalid wallet mode.");
      const validBip39 = validateMnemonic(phrase, wordlist);
      // Conservatively protect every legacy BIP39 candidate from practice-only deletion.
      const live = member.mode === "live" || (member.mode === undefined && validBip39);
      if (live ? !validBip39 : !parseSeed(phrase).ok)
        throw new Error("Wallet recovery phrase is invalid.");
      const network = member.network ?? input.sdkNetwork ?? "regtest";
      const account = member.account ?? input.sdkAccount ?? 0;
      if (
        live &&
        ((network !== "mainnet" && network !== "regtest") ||
          typeof account !== "number" ||
          !Number.isSafeInteger(account) ||
          account < 0 ||
          account > 2_147_483_647)
      )
        throw new Error("Invalid wallet network or account.");
      const tokens: TokenHolding[] = unique(
        array(member.tokens, "wallet tokens").map((item) => {
          const token = record(item, "wallet token");
          return {
            id: id(token.id, "token ID"),
            ticker: id(token.ticker, "token ticker"),
            name: string(token.name, "token name"),
            amount: number(token.amount, "token amount"),
          };
        }),
        "token IDs",
      );
      return {
        id: id(member.id, "wallet ID"),
        name: id(member.name, "wallet name"),
        seed: [...seed],
        spark: string(member.spark, "Spark address", ""),
        lightning: string(member.lightning, "Lightning address", ""),
        bitcoin: string(member.bitcoin, "Bitcoin address", ""),
        sats: number(member.sats, "wallet balance", true, 0),
        usdbCents: number(member.usdbCents, "dollar balance", true, 0),
        tokens,
        createdAt: number(member.createdAt, "wallet timestamp", true, 0),
        mode: live ? "live" : "practice",
        ...(live ? { network: network as "mainnet" | "regtest", account: account as number } : {}),
      };
    }),
    "wallet IDs",
  );
  const memberIds = new Set(members.map((member) => member.id));
  const memberId = (value: unknown): string => {
    const result = id(value, "payment wallet ID");
    if (!memberIds.has(result)) throw new Error("Wallet backup references a missing wallet.");
    return result;
  };
  const activeId =
    input.activeId === undefined
      ? (members[0]?.id ?? null)
      : input.activeId === null
        ? null
        : memberId(input.activeId);
  const pendingBackupId =
    input.pendingBackupId === undefined || input.pendingBackupId === null
      ? null
      : memberId(input.pendingBackupId);
  const kinds = new Set<PayKind>([
    "lightning",
    "spark",
    "bitcoin",
    "stable",
    "cashapp",
    "buy",
    "convert",
    "token",
    "lnurl",
    "claim",
    "faucet",
  ]);
  const payments: Payment[] = unique(
    array(input.payments, "payment history").map((item) => {
      const payment = record(item, "payment");
      if (
        (payment.direction !== "in" && payment.direction !== "out") ||
        !kinds.has(payment.kind as PayKind) ||
        (payment.status !== "pending" &&
          payment.status !== "completed" &&
          payment.status !== "failed")
      )
        throw new Error("Invalid payment status or type.");
      return {
        id: id(payment.id, "payment ID"),
        memberId: memberId(payment.memberId),
        direction: payment.direction,
        kind: payment.kind as PayKind,
        status: payment.status,
        title: string(payment.title, "payment title"),
        detail: string(payment.detail, "payment detail", ""),
        counterparty: string(payment.counterparty, "payment counterparty", ""),
        sats: number(payment.sats, "payment amount"),
        usd: number(payment.usd, "payment dollars", false),
        feeSats: number(payment.feeSats, "payment fee"),
        feeUsd: number(payment.feeUsd, "payment dollar fee", false),
        createdAt: number(payment.createdAt, "payment timestamp"),
      };
    }),
    "payment IDs",
  );
  const contacts: Contact[] = unique(
    array(input.contacts, "contacts").map((item) => {
      const contact = record(item, "contact");
      return {
        id: id(contact.id, "contact ID"),
        name: id(contact.name, "contact name"),
        address: string(contact.address, "contact address"),
      };
    }),
    "contact IDs",
  );
  const deposits: Deposit[] = unique(
    array(input.deposits, "deposits").map((item) => {
      const deposit = record(item, "deposit");
      return {
        id: id(deposit.id, "deposit ID"),
        memberId: memberId(deposit.memberId),
        sats: number(deposit.sats, "deposit amount"),
        address: string(deposit.address, "deposit address"),
        createdAt: number(deposit.createdAt, "deposit timestamp"),
      };
    }),
    "deposit IDs",
  );
  const result: Partial<CpayData> = {
    members,
    activeId,
    pendingBackupId,
    payments,
    contacts,
    deposits,
    priceLive: false,
  };
  for (const key of ["apiKey", "admobAppId", "admobUnitId", "sdkMnemonic", "prefill"] as const)
    if (input[key] !== undefined) Object.assign(result, { [key]: string(input[key], key) });
  // Advanced editor text may be an unfinished draft; only connectLive accepts valid BIP39.
  if (input.lang !== undefined) {
    if (input.lang !== "en" && input.lang !== "bn") throw new Error("Invalid wallet language.");
    result.lang = input.lang;
  }
  if (input.showAds !== undefined) {
    if (typeof input.showAds !== "boolean") throw new Error("Invalid advertisement preference.");
    result.showAds = input.showAds;
  }
  if (input.btcUsd !== undefined) {
    result.btcUsd = number(input.btcUsd, "display price", false);
    if (!result.btcUsd) throw new Error("Invalid display price.");
  }
  if (input.sdkNetwork !== undefined) {
    if (input.sdkNetwork !== "mainnet" && input.sdkNetwork !== "regtest")
      throw new Error("Invalid advanced wallet network.");
    result.sdkNetwork = input.sdkNetwork;
  }
  if (input.sdkAccount !== undefined) {
    result.sdkAccount = number(input.sdkAccount, "advanced wallet account");
    if (result.sdkAccount > 2_147_483_647) throw new Error("Invalid advanced wallet account.");
  }
  return result;
}

function requireUnlockedWallet() {
  if (typeof window !== "undefined" && !browserVault().isUnlocked())
    throw new Error("Unlock the wallet before changing recovery data.");
}

function pushPay(list: Payment[], payment: Payment): Payment[] {
  return [payment, ...list].slice(0, 300);
}

function pay(
  partial: Omit<Payment, "id" | "createdAt" | "status"> & { status?: Payment["status"] },
): Payment {
  return {
    id: uid(),
    createdAt: Date.now(),
    status: partial.status ?? "completed",
    ...partial,
  };
}

async function identities(name: string, seed: string[], id: string) {
  const digest = await sha256hex(`${seed.join(" ")}:${id}`);
  return {
    spark: `sprk1${digest.slice(0, 40)}`,
    lightning: `${slugify(name)}${id.slice(0, 4)}@practice.cpay`,
    bitcoin: `practice1q${digest.slice(0, 38)}`,
  };
}

export const useCpay = create<CpayStore>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      async createMember(name, extra) {
        requireUnlockedWallet();
        if (extra?.mode === "live") return get().createLiveMember(name, extra.seed?.join(" "));
        const clean = name.trim().replace(/\s+/g, " ");
        if (clean.length < 2) return { ok: false, error: "nameTooShort" };
        const id = uid();
        const seed = extra?.seed ?? randomSeed();
        const ids = await identities(clean, seed, id);
        requireUnlockedWallet();
        const member: Member = {
          id,
          name: clean,
          seed,
          ...ids,
          sats: extra?.sats ?? 0,
          usdbCents: extra?.cents ?? 0,
          tokens: [],
          createdAt: Date.now(),
        };
        const skipBackup = Boolean(extra?.seed) || extra?.backup === false;
        set((s) => ({
          members: [...s.members, member],
          activeId: member.id,
          pendingBackupId: skipBackup ? s.pendingBackupId : member.id,
        }));
        return { ok: true, id: member.id, created: true };
      },

      async createLiveMember(
        name,
        mnemonic,
        network = "regtest",
        account = 0,
        requireBackup = false,
      ) {
        requireUnlockedWallet();
        const clean = name.trim().replace(/\s+/g, " ");
        if (clean.length < 2) return { ok: false, error: "nameTooShort" };
        const phrase = (mnemonic ?? generateMnemonic(wordlist, 128))
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ");
        if (!validateMnemonic(phrase, wordlist)) return { ok: false, error: "badSeed" };
        if (!Number.isSafeInteger(account) || account < 0 || account > 2_147_483_647)
          return { ok: false, error: "failed" };
        const existing = get().members.find(
          (m) =>
            m.mode === "live" &&
            m.seed.join(" ") === phrase &&
            m.network === network &&
            (m.account ?? 0) === account,
        );
        if (existing) {
          set({ activeId: existing.id });
          return { ok: true, id: existing.id, created: false };
        }
        const member: Member = {
          id: uid(),
          name: clean,
          seed: phrase.split(" "),
          mode: "live",
          network,
          account,
          spark: "",
          lightning: "",
          bitcoin: "",
          sats: 0,
          usdbCents: 0,
          tokens: [],
          createdAt: Date.now(),
        };
        set((s) => ({
          members: [...s.members, member],
          activeId: member.id,
          pendingBackupId: mnemonic && !requireBackup ? null : member.id,
          sdkMnemonic: phrase,
          sdkNetwork: network,
          sdkAccount: account,
        }));
        return { ok: true, id: member.id, created: true };
      },

      ackBackup() {
        set({ pendingBackupId: null });
      },

      async restore(raw, mode) {
        const phrase = raw.trim().toLowerCase().replace(/\s+/g, " ");
        if (mode !== "practice" && validateMnemonic(phrase, wordlist))
          return get().createLiveMember("Recovered wallet", phrase);
        if (mode === "live") return { ok: false, error: "badSeed" };
        const parsed = parseSeed(raw);
        if (!parsed.ok) return { ok: false, error: "badSeed" };
        const practicePhrase = parsed.words.join(" ");
        const existing = get().members.find((m) => m.seed.join(" ") === phrase);
        if (existing) {
          set({ activeId: existing.id, pendingBackupId: null });
          return { ok: true, id: existing.id, created: false };
        }
        const name = parsed.words[0].slice(0, 1).toUpperCase() + parsed.words[0].slice(1);
        return get().createMember(name, { seed: parsed.words });
      },

      switchTo(id) {
        if (!get().members.some((m) => m.id === id)) return;
        set({ activeId: id });
      },

      removeMember(id) {
        const member = get().members.find((m) => m.id === id);
        if (!member) return { ok: false, error: "failed" };
        if (member.mode === "live" || validateMnemonic(member.seed.join(" "), wordlist))
          return { ok: false, error: "balanceBlock" };
        const tokenLeft = member.tokens.some((t) => t.amount > 0);
        if (member.sats > 0 || member.usdbCents > 0 || tokenLeft) {
          return { ok: false, error: "balanceBlock" };
        }
        const members = get().members.filter((m) => m.id !== id);
        const activeId = get().activeId === id ? (members[0]?.id ?? null) : get().activeId;
        set({
          members,
          activeId,
          payments: get().payments.filter((p) => p.memberId !== id),
          deposits: get().deposits.filter((d) => d.memberId !== id),
          pendingBackupId: get().pendingBackupId === id ? null : get().pendingBackupId,
        });
        return { ok: true };
      },

      async addShop() {
        if (get().members.some((m) => m.name.toLowerCase() === "shop")) {
          return { ok: false, error: "shopAlready" };
        }
        const keep = get().activeId;
        const created = await get().createMember("Shop", {
          sats: 80_000,
          cents: 2_500,
          backup: false,
        });
        if (!created.ok) return created;
        set({ pendingBackupId: null, activeId: keep ?? created.id ?? null });
        return { ok: true, id: created.id };
      },

      faucet() {
        const id = get().activeId;
        if (!id) return { ok: false, error: "noWallet" };
        if (get().members.find((m) => m.id === id)?.mode === "live")
          return { ok: false, error: "failed" };
        const payment = pay({
          memberId: id,
          direction: "in",
          kind: "faucet",
          title: "Practice funds",
          detail: "",
          counterparty: "practice.cpay",
          sats: 100_000,
          usd: 50,
          feeSats: 0,
          feeUsd: 0,
        });
        set((s) => ({
          members: s.members.map((m) =>
            m.id === id ? { ...m, sats: m.sats + 100_000, usdbCents: m.usdbCents + 5_000 } : m,
          ),
          payments: pushPay(s.payments, payment),
        }));
        return { ok: true, id: payment.id };
      },

      wipe() {
        set({
          members: [],
          activeId: null,
          pendingBackupId: null,
          payments: [],
          contacts: [],
          deposits: [],
        });
      },

      setLang(lang) {
        set({ lang });
      },

      setApiKey(apiKey) {
        set({ apiKey: apiKey.trim() });
      },

      setAdIds(appId, unitId) {
        set({ admobAppId: appId.trim(), admobUnitId: unitId.trim() });
      },

      setShowAds(showAds) {
        set({ showAds });
      },

      setPrice(btcUsd, live) {
        set({ btcUsd, priceLive: live });
      },

      setPrefill(prefill) {
        set({ prefill });
      },

      setSdkMnemonic(sdkMnemonic) {
        requireUnlockedWallet();
        set({ sdkMnemonic: sdkMnemonic.trim().replace(/\s+/g, " ") });
      },

      setSdkNetwork(sdkNetwork) {
        set({ sdkNetwork });
      },

      setSdkAccount(sdkAccount) {
        set({ sdkAccount: Number.isFinite(sdkAccount) ? Math.max(0, Math.floor(sdkAccount)) : 0 });
      },

      async rotateAddress() {
        const id = get().activeId;
        const member = get().members.find((m) => m.id === id);
        if (!member) return { ok: false, error: "noWallet" };
        const digest = await sha256hex(`${member.bitcoin}:${Date.now()}:${uid()}`);
        set({
          members: get().members.map((m) =>
            m.id === id ? { ...m, bitcoin: `practice1q${digest.slice(0, 38)}` } : m,
          ),
        });
        return { ok: true };
      },

      sendBitcoin({ destination, sats, speed, note }) {
        const state = get();
        const me = state.members.find((m) => m.id === state.activeId);
        if (!me) return { ok: false, error: "noWallet" };
        if (me.mode === "live") return { ok: false, error: "failed" };
        const parsed = parseInput(destination, state.members);
        if (parsed.type === "empty") return { ok: false, error: "needDest" };
        if (parsed.type === "unknown") return { ok: false, error: "badDest" };
        if (parsed.type === "evm" || parsed.type === "solana" || parsed.type === "tron") {
          return { ok: false, error: "cantBtc" };
        }

        let amount = Math.round(sats);
        let localId: string | undefined;
        let kind: PayKind = "lightning";
        let fee = 0;
        let counterparty = destination.trim();

        if (parsed.type === "bolt11") {
          if (parsed.sats != null) amount = parsed.sats;
          localId = parsed.localMemberId;
          counterparty = parsed.raw;
          kind = localId ? "spark" : "lightning";
          fee = localId ? 0 : lightningFee(amount);
        } else if (parsed.type === "lightning") {
          localId = parsed.localMemberId;
          counterparty = parsed.address;
          kind = localId ? "spark" : "lightning";
          fee = localId ? 0 : lightningFee(amount);
        } else if (parsed.type === "spark") {
          localId = parsed.localMemberId;
          counterparty = parsed.address;
          kind = "spark";
          fee = localId ? 0 : 1;
        } else if (parsed.type === "bitcoin") {
          localId = parsed.localMemberId;
          counterparty = parsed.address;
          kind = localId ? "spark" : "bitcoin";
          fee = localId ? 0 : SPEED_FEE[speed];
        } else if (parsed.type === "lnurl") {
          counterparty = parsed.raw;
          kind = "lnurl";
          fee = lightningFee(amount);
        }

        if (localId === me.id) return { ok: false, error: "self" };
        if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, error: "badAmount" };
        if (amount + fee > me.sats) return { ok: false, error: "noFit" };

        const other = localId ? state.members.find((m) => m.id === localId) : undefined;
        const outgoing = pay({
          memberId: me.id,
          direction: "out",
          kind,
          title: other?.name ?? counterparty,
          detail: note.trim(),
          counterparty: other?.lightning ?? counterparty,
          sats: amount,
          usd: Number(satsToUsd(amount, state.btcUsd).toFixed(2)),
          feeSats: fee,
          feeUsd: 0,
        });
        const incoming = other
          ? pay({
              memberId: other.id,
              direction: "in",
              kind,
              title: me.name,
              detail: note.trim(),
              counterparty: me.lightning,
              sats: amount,
              usd: outgoing.usd,
              feeSats: 0,
              feeUsd: 0,
            })
          : null;

        set({
          members: state.members.map((m) => {
            if (m.id === me.id) return { ...m, sats: m.sats - amount - fee };
            if (other && m.id === other.id) return { ...m, sats: m.sats + amount };
            return m;
          }),
          payments: pushPay(
            incoming ? pushPay(state.payments, incoming) : state.payments,
            outgoing,
          ),
        });
        return { ok: true, id: outgoing.id };
      },

      sendStable({ destination, cents, note }) {
        const state = get();
        const me = state.members.find((m) => m.id === state.activeId);
        if (!me) return { ok: false, error: "noWallet" };
        if (me.mode === "live") return { ok: false, error: "failed" };
        const parsed = parseInput(destination, state.members);
        if (parsed.type !== "evm" && parsed.type !== "solana" && parsed.type !== "tron") {
          return { ok: false, error: "badAddress" };
        }
        const amount = Math.round(cents);
        if (!Number.isSafeInteger(amount) || amount < 100) return { ok: false, error: "lowUsd" };
        const fee = stableFeeCents(amount);
        if (amount + fee > me.usdbCents) return { ok: false, error: "poor" };
        const chain = parsed.type === "evm" ? "EVM" : parsed.type === "tron" ? "Tron" : "Solana";
        const outgoing = pay({
          memberId: me.id,
          direction: "out",
          kind: "stable",
          title: parsed.address,
          detail: note.trim() || chain,
          counterparty: parsed.address,
          sats: 0,
          usd: amount / 100,
          feeSats: 0,
          feeUsd: fee / 100,
          status: "pending",
        });
        set({
          members: state.members.map((m) =>
            m.id === me.id ? { ...m, usdbCents: m.usdbCents - amount - fee } : m,
          ),
          payments: pushPay(state.payments, { ...outgoing, status: "completed" }),
        });
        return { ok: true, id: outgoing.id };
      },

      simulateDeposit() {
        const me = get().members.find((m) => m.id === get().activeId);
        if (!me) return { ok: false, error: "noWallet" };
        if (me.mode === "live") return { ok: false, error: "failed" };
        const deposit: Deposit = {
          id: uid(),
          memberId: me.id,
          sats: 25_000,
          address: me.bitcoin,
          createdAt: Date.now(),
        };
        set({ deposits: [deposit, ...get().deposits] });
        return { ok: true, id: deposit.id };
      },

      simulateStable(cents) {
        if (!Number.isFinite(cents) || !Number.isSafeInteger(Math.round(cents)))
          return { ok: false, error: "badAmount" };
        const id = get().activeId;
        if (!id) return { ok: false, error: "noWallet" };
        if (get().members.find((m) => m.id === id)?.mode === "live")
          return { ok: false, error: "failed" };
        const amount = Math.max(100, Math.round(cents));
        const payment = pay({
          memberId: id,
          direction: "in",
          kind: "stable",
          title: "USDC",
          detail: "Base",
          counterparty: "deposit",
          sats: 0,
          usd: amount / 100,
          feeSats: 0,
          feeUsd: 0,
        });
        set((s) => ({
          members: s.members.map((m) =>
            m.id === id ? { ...m, usdbCents: m.usdbCents + amount } : m,
          ),
          payments: pushPay(s.payments, payment),
        }));
        return { ok: true, id: payment.id };
      },

      claim(depositId) {
        const deposit = get().deposits.find((d) => d.id === depositId);
        if (!deposit) return { ok: false, error: "claimNone" };
        if (get().members.find((m) => m.id === deposit.memberId)?.mode === "live")
          return { ok: false, error: "failed" };
        const payment = pay({
          memberId: deposit.memberId,
          direction: "in",
          kind: "claim",
          title: "Bitcoin deposit",
          detail: "",
          counterparty: deposit.address,
          sats: deposit.sats,
          usd: Number(satsToUsd(deposit.sats, get().btcUsd).toFixed(2)),
          feeSats: 0,
          feeUsd: 0,
        });
        set((s) => ({
          deposits: s.deposits.filter((d) => d.id !== depositId),
          members: s.members.map((m) =>
            m.id === deposit.memberId ? { ...m, sats: m.sats + deposit.sats } : m,
          ),
          payments: pushPay(s.payments, payment),
        }));
        return { ok: true, id: payment.id };
      },

      claimAll() {
        const id = get().activeId;
        const mine = get().deposits.filter((d) => d.memberId === id);
        if (mine.length === 0) return { ok: false, error: "claimNone" };
        mine.forEach((d) => get().claim(d.id));
        return { ok: true };
      },

      recordCash({ to, payUsd, outUsd, asset, chain }) {
        if (
          !Number.isFinite(payUsd) ||
          !Number.isFinite(outUsd) ||
          payUsd <= 0 ||
          outUsd <= 0 ||
          outUsd > payUsd
        )
          return { ok: false, error: "badAmount" };
        const id = get().activeId;
        if (!id) return { ok: false, error: "noWallet" };
        if (get().members.find((m) => m.id === id)?.mode === "live")
          return { ok: false, error: "failed" };
        const payment = pay({
          memberId: id,
          direction: "out",
          kind: "cashapp",
          title: `${asset} on ${chain}`,
          detail: "Cash App · balance unchanged",
          counterparty: to,
          sats: 0,
          usd: payUsd,
          feeSats: 0,
          feeUsd: Number((payUsd - outUsd).toFixed(2)),
        });
        set({ payments: pushPay(get().payments, payment) });
        return { ok: true, id: payment.id };
      },

      buyBitcoin(usd) {
        const id = get().activeId;
        if (!id) return { ok: false, error: "noWallet" };
        if (get().members.find((m) => m.id === id)?.mode === "live")
          return { ok: false, error: "failed" };
        if (!Number.isFinite(usd) || usd < 1) return { ok: false, error: "lowUsd" };
        const fee = Math.max(0.15, usd * 0.015);
        const net = Math.max(0, usd - fee);
        const sats = usdToSats(net, get().btcUsd);
        if (!Number.isSafeInteger(sats) || sats <= 0) return { ok: false, error: "dust" };
        const payment = pay({
          memberId: id,
          direction: "in",
          kind: "buy",
          title: "Cash App",
          detail: "",
          counterparty: "cash.app",
          sats,
          usd,
          feeSats: 0,
          feeUsd: Number(fee.toFixed(2)),
        });
        set((s) => ({
          members: s.members.map((m) => (m.id === id ? { ...m, sats: m.sats + sats } : m)),
          payments: pushPay(s.payments, payment),
        }));
        return { ok: true, id: payment.id };
      },

      convert(direction, amount) {
        if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "badAmount" };
        const id = get().activeId;
        const me = get().members.find((m) => m.id === id);
        if (!me || !id) return { ok: false, error: "noWallet" };
        if (me.mode === "live") return { ok: false, error: "failed" };
        const price = get().btcUsd;
        if (direction === "btc-usd") {
          const sats = Math.round(amount);
          if (!Number.isSafeInteger(sats) || sats <= 0) return { ok: false, error: "noAmt" };
          const fee = convertFeeSats(sats);
          if (sats + fee > me.sats) return { ok: false, error: "poor" };
          const cents = Math.round(satsToUsd(sats, price) * 100);
          if (!Number.isSafeInteger(cents) || cents <= 0) return { ok: false, error: "dust" };
          const payment = pay({
            memberId: id,
            direction: "out",
            kind: "convert",
            title: "BTC → USD",
            detail: "",
            counterparty: "USDB",
            sats,
            usd: cents / 100,
            feeSats: fee,
            feeUsd: 0,
          });
          set((s) => ({
            members: s.members.map((m) =>
              m.id === id ? { ...m, sats: m.sats - sats - fee, usdbCents: m.usdbCents + cents } : m,
            ),
            payments: pushPay(s.payments, payment),
          }));
          return { ok: true, id: payment.id };
        }
        const cents = Math.round(amount);
        if (!Number.isSafeInteger(cents) || cents <= 0) return { ok: false, error: "noAmt" };
        const fee = convertFeeCents(cents);
        if (cents + fee > me.usdbCents) return { ok: false, error: "poor" };
        const sats = usdToSats(cents / 100, price);
        if (!Number.isSafeInteger(sats) || sats <= 0) return { ok: false, error: "dust" };
        const payment = pay({
          memberId: id,
          direction: "in",
          kind: "convert",
          title: "USD → BTC",
          detail: "",
          counterparty: "BTC",
          sats,
          usd: cents / 100,
          feeSats: 0,
          feeUsd: fee / 100,
        });
        set((s) => ({
          members: s.members.map((m) =>
            m.id === id ? { ...m, usdbCents: m.usdbCents - cents - fee, sats: m.sats + sats } : m,
          ),
          payments: pushPay(s.payments, payment),
        }));
        return { ok: true, id: payment.id };
      },

      issueToken(ticker, name, amount) {
        const id = get().activeId;
        const me = get().members.find((m) => m.id === id);
        if (!me || !id) return { ok: false, error: "noWallet" };
        if (me.mode === "live") return { ok: false, error: "failed" };
        const tick = ticker
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
        if (tick.length < 2 || tick.length > 6) return { ok: false, error: "badTicker" };
        const qty = Math.round(amount);
        if (!Number.isSafeInteger(qty) || qty <= 0) return { ok: false, error: "positive" };
        if (me.tokens.some((t) => t.ticker === tick)) return { ok: false, error: "tokenDup" };
        const token: TokenHolding = {
          id: uid(),
          ticker: tick,
          name: name.trim() || tick,
          amount: qty,
        };
        const payment = pay({
          memberId: id,
          direction: "in",
          kind: "token",
          title: tick,
          detail: token.name,
          counterparty: me.lightning,
          sats: 0,
          usd: 0,
          feeSats: 0,
          feeUsd: 0,
        });
        set((s) => ({
          members: s.members.map((m) => (m.id === id ? { ...m, tokens: [...m.tokens, token] } : m)),
          payments: pushPay(s.payments, payment),
        }));
        return { ok: true, id: payment.id };
      },

      sendToken(ticker, toId, amount) {
        const id = get().activeId;
        const me = get().members.find((m) => m.id === id);
        const other = get().members.find((m) => m.id === toId);
        if (!me || !id || !other) return { ok: false, error: "needToken" };
        if (me.mode === "live" || other.mode === "live") return { ok: false, error: "failed" };
        if (other.id === me.id) return { ok: false, error: "self" };
        const qty = Math.round(amount);
        if (!Number.isSafeInteger(qty) || qty <= 0) return { ok: false, error: "positive" };
        const mine = me.tokens.find((t) => t.ticker === ticker);
        if (!mine || mine.amount < qty) return { ok: false, error: "noHold" };
        const outgoing = pay({
          memberId: me.id,
          direction: "out",
          kind: "token",
          title: mine.ticker,
          detail: String(qty),
          counterparty: other.lightning,
          sats: 0,
          usd: 0,
          feeSats: 0,
          feeUsd: 0,
        });
        const incoming = pay({
          memberId: other.id,
          direction: "in",
          kind: "token",
          title: mine.ticker,
          detail: String(qty),
          counterparty: me.lightning,
          sats: 0,
          usd: 0,
          feeSats: 0,
          feeUsd: 0,
        });
        set((s) => ({
          members: s.members.map((m) => {
            if (m.id === me.id) {
              return {
                ...m,
                tokens: m.tokens.map((t) =>
                  t.ticker === ticker ? { ...t, amount: t.amount - qty } : t,
                ),
              };
            }
            if (m.id === other.id) {
              const has = m.tokens.some((t) => t.ticker === ticker);
              const tokens = has
                ? m.tokens.map((t) => (t.ticker === ticker ? { ...t, amount: t.amount + qty } : t))
                : [...m.tokens, { id: uid(), ticker: mine.ticker, name: mine.name, amount: qty }];
              return { ...m, tokens };
            }
            return m;
          }),
          payments: pushPay(pushPay(s.payments, incoming), outgoing),
        }));
        return { ok: true, id: outgoing.id };
      },

      lnurlWithdraw(code, sats) {
        const id = get().activeId;
        if (!id) return { ok: false, error: "noWallet" };
        if (get().members.find((m) => m.id === id)?.mode === "live")
          return { ok: false, error: "failed" };
        const raw = code.trim();
        if (!/^lnurl/i.test(raw)) return { ok: false, error: "codeBad" };
        const amount = Math.round(sats);
        if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, error: "positive" };
        const payment = pay({
          memberId: id,
          direction: "in",
          kind: "lnurl",
          title: "LNURL withdraw",
          detail: "",
          counterparty: raw,
          sats: amount,
          usd: Number(satsToUsd(amount, get().btcUsd).toFixed(2)),
          feeSats: 0,
          feeUsd: 0,
        });
        set((s) => ({
          members: s.members.map((m) => (m.id === id ? { ...m, sats: m.sats + amount } : m)),
          payments: pushPay(s.payments, payment),
        }));
        return { ok: true, id: payment.id };
      },

      addContact(name, address) {
        const cleanName = name.trim();
        const cleanAddr = address.trim();
        if (cleanName.length < 2 || cleanAddr.length < 4) return { ok: false, error: "needBoth" };
        if (get().contacts.some((c) => c.address.toLowerCase() === cleanAddr.toLowerCase())) {
          return { ok: false, error: "dupContact" };
        }
        const contact: Contact = { id: uid(), name: cleanName, address: cleanAddr };
        set({ contacts: [contact, ...get().contacts] });
        return { ok: true, id: contact.id };
      },

      removeContact(id) {
        set({ contacts: get().contacts.filter((c) => c.id !== id) });
      },
    }),
    {
      name: "cpay-practice-v1",
      storage: createJSONStorage(() => encryptedWalletStorage),
      merge: (persisted, current) => ({ ...current, ...sanitizeWalletData(persisted) }),
      skipHydration: true,
      partialize: (s) => ({
        members: s.members,
        activeId: s.activeId,
        pendingBackupId: s.pendingBackupId,
        payments: s.payments,
        contacts: s.contacts,
        deposits: s.deposits,
        lang: s.lang,
        apiKey: s.apiKey,
        admobAppId: s.admobAppId,
        admobUnitId: s.admobUnitId,
        showAds: s.showAds,
        btcUsd: s.btcUsd,
        priceLive: s.priceLive,
        sdkMnemonic: s.sdkMnemonic,
        sdkNetwork: s.sdkNetwork,
        sdkAccount: s.sdkAccount,
      }),
    },
  ),
);

export function activeMember(state: CpayData): Member | null {
  return state.members.find((m) => m.id === state.activeId) ?? null;
}

export { maxLightning, maxStable };

/** Drop decrypted application data only after the vault key has been revoked. */
export function resetWalletMemory() {
  useCpay.setState({ ...EMPTY });
}
