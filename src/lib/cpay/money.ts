export const SATS = 100_000_000;

export type Speed = "slow" | "medium" | "fast";

export const SPEED_FEE: Record<Speed, number> = {
  slow: 420,
  medium: 980,
  fast: 2100,
};

export function formatSats(sats: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(sats)));
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatBtc(sats: number): string {
  const btc = sats / SATS;
  return btc.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 8 });
}

export function satsToUsd(sats: number, btcUsd: number): number {
  return (sats / SATS) * btcUsd;
}

export function usdToSats(usd: number, btcUsd: number): number {
  if (btcUsd <= 0) return 0;
  return Math.round((usd / btcUsd) * SATS);
}

export function lightningFee(amountSats: number): number {
  if (amountSats <= 0) return 0;
  return Math.max(2, Math.ceil(amountSats * 0.001) + 2);
}

export function maxLightning(balance: number): number {
  let amt = Math.max(0, balance - 2);
  for (let i = 0; i < 5; i += 1) {
    amt = Math.max(0, balance - lightningFee(amt));
  }
  return amt;
}

export function stableFeeCents(amountCents: number): number {
  if (amountCents <= 0) return 0;
  return Math.max(5, Math.round(amountCents * 0.004));
}

export function maxStable(balanceCents: number): number {
  let amt = balanceCents;
  for (let i = 0; i < 5; i += 1) {
    amt = Math.max(0, balanceCents - stableFeeCents(amt));
  }
  return amt;
}

export function convertFeeSats(sats: number): number {
  return Math.max(1, Math.ceil(sats * 0.0015));
}

export function convertFeeCents(cents: number): number {
  return Math.max(1, Math.round(cents * 0.0015));
}

export function cashFee(amountUsd: number, bps: number): number {
  return Math.max(0.25, (amountUsd * bps) / 10_000);
}

export function shortAddr(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function relTime(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 45) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function uid(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);
  return base || "wallet";
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
