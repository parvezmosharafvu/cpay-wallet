import { create } from "zustand";
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
} from "./money";
import { parseInput } from "./parse";
import type { Contact, Deposit, Lang, Member, Payment, PayKind, TokenHolding } from "./types";
import { parseSeed, randomSeed } from "./words";

type Result = { ok: true; id?: string; created?: boolean } | { ok: false; error: CopyKey };

type CpayData = {
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
  createMember: (name: string, extra?: { sats?: number; cents?: number; seed?: string[]; backup?: boolean }) => Promise<Result>;
  ackBackup: () => void;
  restore: (raw: string) => Promise<Result>;
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
  recordCash: (input: { to: string; payUsd: number; outUsd: number; asset: string; chain: string }) => Result;
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

function pushPay(list: Payment[], payment: Payment): Payment[] {
  return [payment, ...list].slice(0, 300);
}

function pay(partial: Omit<Payment, "id" | "createdAt" | "status"> & { status?: Payment["status"] }): Payment {
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
        const clean = name.trim().replace(/\s+/g, " ");
        if (clean.length < 2) return { ok: false, error: "nameTooShort" };
        const id = uid();
        const seed = extra?.seed ?? randomSeed();
        const ids = await identities(clean, seed, id);
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

      ackBackup() {
        set({ pendingBackupId: null });
      },

      async restore(raw) {
        const parsed = parseSeed(raw);
        if (!parsed.ok) return { ok: false, error: "badSeed" };
        const phrase = parsed.words.join(" ");
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
        const created = await get().createMember("Shop", { sats: 80_000, cents: 2_500, backup: false });
        if (!created.ok) return created;
        set({ pendingBackupId: null, activeId: keep ?? created.id ?? null });
        return { ok: true, id: created.id };
      },

      faucet() {
        const id = get().activeId;
        if (!id) return { ok: false, error: "noWallet" };
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
        if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "badAmount" };
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
          payments: pushPay(incoming ? pushPay(state.payments, incoming) : state.payments, outgoing),
        });
        return { ok: true, id: outgoing.id };
      },

      sendStable({ destination, cents, note }) {
        const state = get();
        const me = state.members.find((m) => m.id === state.activeId);
        if (!me) return { ok: false, error: "noWallet" };
        const parsed = parseInput(destination, state.members);
        if (parsed.type !== "evm" && parsed.type !== "solana" && parsed.type !== "tron") {
          return { ok: false, error: "badAddress" };
        }
        const amount = Math.round(cents);
        if (amount < 100) return { ok: false, error: "lowUsd" };
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
        const id = get().activeId;
        if (!id) return { ok: false, error: "noWallet" };
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
          members: s.members.map((m) => (m.id === id ? { ...m, usdbCents: m.usdbCents + amount } : m)),
          payments: pushPay(s.payments, payment),
        }));
        return { ok: true, id: payment.id };
      },

      claim(depositId) {
        const deposit = get().deposits.find((d) => d.id === depositId);
        if (!deposit) return { ok: false, error: "claimNone" };
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
          members: s.members.map((m) => (m.id === deposit.memberId ? { ...m, sats: m.sats + deposit.sats } : m)),
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
        const id = get().activeId;
        if (!id) return { ok: false, error: "noWallet" };
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
        if (!Number.isFinite(usd) || usd < 1) return { ok: false, error: "lowUsd" };
        const fee = Math.max(0.15, usd * 0.015);
        const net = Math.max(0, usd - fee);
        const sats = usdToSats(net, get().btcUsd);
        if (sats <= 0) return { ok: false, error: "dust" };
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
        const id = get().activeId;
        const me = get().members.find((m) => m.id === id);
        if (!me || !id) return { ok: false, error: "noWallet" };
        const price = get().btcUsd;
        if (direction === "btc-usd") {
          const sats = Math.round(amount);
          if (sats <= 0) return { ok: false, error: "noAmt" };
          const fee = convertFeeSats(sats);
          if (sats + fee > me.sats) return { ok: false, error: "poor" };
          const cents = Math.round(satsToUsd(sats, price) * 100);
          if (cents <= 0) return { ok: false, error: "dust" };
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
        if (cents <= 0) return { ok: false, error: "noAmt" };
        const fee = convertFeeCents(cents);
        if (cents + fee > me.usdbCents) return { ok: false, error: "poor" };
        const sats = usdToSats(cents / 100, price);
        if (sats <= 0) return { ok: false, error: "dust" };
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
        const tick = ticker.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (tick.length < 2 || tick.length > 6) return { ok: false, error: "badTicker" };
        const qty = Math.round(amount);
        if (qty <= 0) return { ok: false, error: "positive" };
        if (me.tokens.some((t) => t.ticker === tick)) return { ok: false, error: "tokenDup" };
        const token: TokenHolding = { id: uid(), ticker: tick, name: name.trim() || tick, amount: qty };
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
        if (other.id === me.id) return { ok: false, error: "self" };
        const qty = Math.round(amount);
        if (qty <= 0) return { ok: false, error: "positive" };
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
                tokens: m.tokens.map((t) => (t.ticker === ticker ? { ...t, amount: t.amount - qty } : t)),
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
        const raw = code.trim();
        if (!/^lnurl/i.test(raw)) return { ok: false, error: "codeBad" };
        const amount = Math.round(sats);
        if (amount <= 0) return { ok: false, error: "positive" };
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
      storage: createJSONStorage(() => localStorage),
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
