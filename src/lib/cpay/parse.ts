import type { Member } from "./types";

export type Parsed =
  | { type: "empty" }
  | { type: "bolt11"; raw: string; sats: number | null; localMemberId?: string }
  | { type: "lnurl"; raw: string }
  | { type: "lightning"; address: string; localMemberId?: string }
  | { type: "spark"; address: string; localMemberId?: string }
  | { type: "bitcoin"; address: string; mainnetLike: boolean; localMemberId?: string }
  | { type: "evm"; address: string }
  | { type: "tron"; address: string }
  | { type: "solana"; address: string }
  | { type: "unknown"; raw: string };

const EVM = /^0x[a-fA-F0-9]{40}$/;
const TRON = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const LN_ADDR = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const BOLT = /^lnbc(\d+)n1p([a-z0-9]+)$/i;
const BOLT_OPEN = /^lnbc/i;
const MAINNET_BTC = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{20,}$/;

export function findMember(members: Member[], value: string): Member | undefined {
  const v = value.trim().toLowerCase();
  return members.find(
    (m) =>
      m.id === v ||
      m.spark.toLowerCase() === v ||
      m.lightning.toLowerCase() === v ||
      m.bitcoin.toLowerCase() === v,
  );
}

export function parseInput(raw: string, members: Member[]): Parsed {
  const input = raw.trim();
  if (!input) return { type: "empty" };

  const any = input.match(/^lnbcany1p([a-z0-9]+)$/i);
  if (any) {
    const local = findMember(members, any[1]);
    return { type: "bolt11", raw: input, sats: null, localMemberId: local?.id };
  }
  const bolt = input.match(BOLT);
  if (bolt) {
    const local = findMember(members, bolt[2]);
    return {
      type: "bolt11",
      raw: input,
      sats: Number(bolt[1]),
      localMemberId: local?.id,
    };
  }
  if (BOLT_OPEN.test(input)) return { type: "bolt11", raw: input, sats: null };
  if (/^lnurl/i.test(input)) return { type: "lnurl", raw: input };
  if (input.toLowerCase().startsWith("sprk1")) {
    const local = findMember(members, input);
    return { type: "spark", address: input, localMemberId: local?.id };
  }
  if (input.toLowerCase().startsWith("practice1")) {
    const local = findMember(members, input);
    return { type: "bitcoin", address: input, mainnetLike: false, localMemberId: local?.id };
  }
  if (LN_ADDR.test(input)) {
    const local = findMember(members, input);
    return { type: "lightning", address: input, localMemberId: local?.id };
  }
  if (EVM.test(input)) return { type: "evm", address: input };
  if (TRON.test(input)) return { type: "tron", address: input };
  if (MAINNET_BTC.test(input)) return { type: "bitcoin", address: input, mainnetLike: true };
  if (SOL.test(input) && !input.startsWith("sprk")) return { type: "solana", address: input };
  return { type: "unknown", raw: input };
}

export function chainsFor(parsed: Parsed): string[] {
  if (parsed.type === "evm") return ["Base", "Arbitrum", "Ethereum"];
  if (parsed.type === "solana") return ["Solana"];
  if (parsed.type === "tron") return ["Tron"];
  return [];
}

export type CashRoute = {
  id: string;
  asset: "USDC" | "USDT";
  chain: string;
  provider: string;
  bps: number;
};

export function routesFor(parsed: Parsed): CashRoute[] {
  if (parsed.type === "evm") {
    return [
      { id: "usdc-base", asset: "USDC", chain: "Base", provider: "Orchestra", bps: 35 },
      { id: "usdc-arb", asset: "USDC", chain: "Arbitrum", provider: "Orchestra", bps: 40 },
      { id: "usdt-eth", asset: "USDT", chain: "Ethereum", provider: "Orchestra", bps: 85 },
      { id: "usdc-eth", asset: "USDC", chain: "Ethereum", provider: "Orchestra", bps: 80 },
    ];
  }
  if (parsed.type === "solana") {
    return [
      { id: "usdc-sol", asset: "USDC", chain: "Solana", provider: "Orchestra", bps: 30 },
      { id: "usdt-sol", asset: "USDT", chain: "Solana", provider: "Orchestra", bps: 35 },
    ];
  }
  if (parsed.type === "tron") {
    return [{ id: "usdt-tron", asset: "USDT", chain: "Tron", provider: "Orchestra", bps: 45 }];
  }
  return [];
}
