import type {
  Payment,
  PrepareSendPaymentResponse,
  OnchainConfirmationSpeed,
} from "@breeztech/breez-sdk-spark/web";

export type LivePayment = Readonly<{
  id: string;
  status: "pending" | "completed" | "failed";
  amountSats: number;
  feeSats: number;
  timestamp: number;
  method: string;
  direction: "in" | "out";
}>;

export type LiveQuote = Readonly<{
  id: string;
  sessionKey: string;
  destination: string;
  amountSats: number;
  feeSats: number;
  totalSats: number;
  network: "mainnet" | "regtest";
  expiresAt: number;
  speed: OnchainConfirmationSpeed;
}>;

export function safeSats(value: bigint | number | string, label = "Amount"): number {
  if (typeof value === "string" && !/^\d+$/.test(value))
    throw new Error(`${label} is not a whole number.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new Error(`${label} is outside the supported range.`);
  return number;
}

export function quotedFee(response: PrepareSendPaymentResponse, speed: OnchainConfirmationSpeed) {
  const method = response.paymentMethod;
  switch (method.type) {
    case "bitcoinAddress": {
      const fees =
        speed === "fast"
          ? method.feeQuote.speedFast
          : speed === "slow"
            ? method.feeQuote.speedSlow
            : method.feeQuote.speedMedium;
      return safeSats(fees.userFeeSat + fees.l1BroadcastFeeSat, "Fee");
    }
    // send uses preferSpark:false so the displayed routing fee is the approved fee.
    case "bolt11Invoice":
      return safeSats(method.lightningFeeSats, "Fee");
    case "sparkAddress":
    case "sparkInvoice":
      return safeSats(method.fee, "Fee");
    default:
      throw new Error(
        "Use the advanced SDK panel for cross-chain or token conversions; a sats-only quote cannot represent their fees safely.",
      );
  }
}

export function normalizePayment(payment: Payment): LivePayment {
  return Object.freeze({
    id: payment.id,
    status: payment.status,
    amountSats: safeSats(payment.amount),
    feeSats: safeSats(payment.fees, "Fee"),
    timestamp: payment.timestamp > 1e12 ? payment.timestamp : payment.timestamp * 1000,
    method: payment.method,
    direction: payment.paymentType === "receive" ? "in" : "out",
  });
}

/** Keeps the prepared SDK response private and executes each reviewed quote once. */
export class QuoteBook<T> {
  private quotes = new Map<
    string,
    { quote: LiveQuote; prepared: T; result?: Promise<LivePayment> }
  >();
  private epoch = 0;
  private readonly isSessionCurrent: (key: string) => boolean;
  private readonly now: () => number;

  constructor(isSessionCurrent: (key: string) => boolean, now = () => Date.now()) {
    this.isSessionCurrent = isSessionCurrent;
    this.now = now;
  }

  generation() {
    return this.epoch;
  }

  invalidate() {
    ++this.epoch;
    this.quotes.clear();
  }

  add(quote: LiveQuote, prepared: T, generation = this.epoch) {
    if (generation !== this.epoch || !this.isSessionCurrent(quote.sessionKey))
      throw new Error("The wallet or payment details changed. Prepare a new quote.");
    // A bounded book also ensures an abandoned quote cannot live indefinitely in memory.
    for (const [id, item] of this.quotes)
      if (item.quote.expiresAt <= this.now()) this.quotes.delete(id);
    if (this.quotes.size >= 20)
      throw new Error("Too many outstanding quotes. Clear the payment and try again.");
    const frozen = Object.freeze({ ...quote });
    this.quotes.set(frozen.id, { quote: frozen, prepared });
    return frozen;
  }

  execute(
    id: string,
    send: (prepared: T, quote: LiveQuote) => Promise<LivePayment>,
  ): Promise<LivePayment> {
    const item = this.quotes.get(id);
    if (!item) return Promise.reject(new Error("The payment quote was cleared. Prepare it again."));
    // An identical retry shares the same result, including an ambiguous network failure.
    if (item.result) return item.result;
    if (!this.isSessionCurrent(item.quote.sessionKey))
      return Promise.reject(new Error("The selected wallet changed. Prepare a new quote."));
    if (item.quote.expiresAt <= this.now())
      return Promise.reject(new Error("The payment quote expired. Prepare it again."));
    item.result = Promise.resolve().then(() => {
      if (!this.isSessionCurrent(item.quote.sessionKey))
        throw new Error("The selected wallet changed. Prepare a new quote.");
      return send(item.prepared, item.quote);
    });
    return item.result;
  }
}
