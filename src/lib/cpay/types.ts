export type Lang = "en" | "bn";

export type TokenHolding = {
  id: string;
  ticker: string;
  name: string;
  amount: number;
};

export type Member = {
  id: string;
  name: string;
  seed: string[];
  spark: string;
  lightning: string;
  bitcoin: string;
  sats: number;
  usdbCents: number;
  tokens: TokenHolding[];
  createdAt: number;
};

export type PayKind =
  | "lightning"
  | "spark"
  | "bitcoin"
  | "stable"
  | "cashapp"
  | "buy"
  | "convert"
  | "token"
  | "lnurl"
  | "claim"
  | "faucet";

export type Payment = {
  id: string;
  memberId: string;
  direction: "in" | "out";
  kind: PayKind;
  status: "pending" | "completed" | "failed";
  title: string;
  detail: string;
  counterparty: string;
  sats: number;
  usd: number;
  feeSats: number;
  feeUsd: number;
  createdAt: number;
};

export type Contact = {
  id: string;
  name: string;
  address: string;
};

export type Deposit = {
  id: string;
  memberId: string;
  sats: number;
  address: string;
  createdAt: number;
};

export type SendKind = "lightning" | "spark" | "bitcoin" | "stable" | "lnurl";
