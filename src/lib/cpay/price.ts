export const PRICE_REFRESH_MS = 60_000;
export const PRICE_MAX_AGE_MS = 5 * PRICE_REFRESH_MS;

export type BtcPrice = { usd: number; fetchedAt: number; source: "CoinGecko" };

export function isPriceFresh(fetchedAt: number, now = Date.now()): boolean {
  return fetchedAt > 0 && fetchedAt <= now && now - fetchedAt < PRICE_MAX_AGE_MS;
}

/** A display quote, never an executable exchange rate or payment amount. */
export async function fetchBtcPrice(options: {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetcher?: typeof fetch;
} = {}): Promise<BtcPrice> {
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("Price feed timed out.")), options.timeoutMs ?? 8_000);
  try {
    const response = await (options.fetcher ?? fetch)(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      { signal: controller.signal, cache: "no-store", credentials: "omit" },
    );
    if (!response.ok) throw new Error(`Price feed unavailable (${response.status}).`);
    const body: unknown = await response.json();
    const usd = (body as { bitcoin?: { usd?: unknown } })?.bitcoin?.usd;
    if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
      throw new Error("The price feed returned an invalid quote.");
    }
    return { usd, fetchedAt: Date.now(), source: "CoinGecko" };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancel);
  }
}
