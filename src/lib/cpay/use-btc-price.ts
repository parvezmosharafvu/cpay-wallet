import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBtcPrice, isPriceFresh, PRICE_REFRESH_MS } from "./price";
import { useCpay } from "./store";

export function useBtcPrice() {
  const [updatedAt, setUpdatedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(false);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    try {
      const quote = await fetchBtcPrice({ signal: request.signal });
      if (!active.current || request.signal.aborted) return;
      useCpay.getState().setPrice(quote.usd, true);
      setUpdatedAt(quote.fetchedAt);
      setStale(false);
      setError(null);
    } catch (cause) {
      if (!active.current || request.signal.aborted) return;
      const current = useCpay.getState();
      current.setPrice(current.btcUsd, false);
      setStale(true);
      setError(cause instanceof Error ? cause.message : "Price feed unavailable.");
    }
  }, []);
  useEffect(() => {
    active.current = true;
    const current = useCpay.getState();
    current.setPrice(current.btcUsd, false);
    void refresh();
    const timer = window.setInterval(() => void refresh(), PRICE_REFRESH_MS);
    const wake = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", wake);
    return () => {
      active.current = false;
      controller.current?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (isPriceFresh(updatedAt)) return;
      setStale(true);
      const current = useCpay.getState();
      current.setPrice(current.btcUsd, false);
    }, PRICE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [updatedAt]);
  return { refresh, updatedAt, error, stale };
}
