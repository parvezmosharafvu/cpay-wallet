export type SessionIdentity = Readonly<{
  key: string;
  network: "mainnet" | "regtest";
  account: number;
}>;

export class StaleSessionError extends Error {
  constructor() {
    super("The wallet session changed. Select the wallet and try again.");
    this.name = "StaleSessionError";
  }
}

/** Serializes SDK ownership and revokes access before any asynchronous teardown. */
export class LiveSession<T> {
  private active: { identity: SessionIdentity; client: T } | null = null;
  private pending: { key: string; promise: Promise<T> } | null = null;
  private epoch = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly dispose: (client: T) => Promise<void>;
  private readonly onInvalidate: () => void;

  constructor(dispose: (client: T) => Promise<void>, onInvalidate: () => void = () => undefined) {
    this.dispose = dispose;
    this.onInvalidate = onInvalidate;
  }

  current() {
    return this.active;
  }

  isCurrent(key: string) {
    return this.active?.identity.key === key;
  }

  need() {
    if (!this.active) throw new Error("Connect the selected live wallet first.");
    return this.active;
  }

  connect(identity: SessionIdentity, create: () => Promise<T>): Promise<T> {
    if (this.active?.identity.key === identity.key) return Promise.resolve(this.active.client);
    if (this.pending?.key === identity.key) return this.pending.promise;
    const ticket = ++this.epoch;
    const previous = this.active;
    this.active = null;
    this.onInvalidate();
    const result = this.queue
      .catch(() => undefined)
      .then(async () => {
        if (previous) await this.dispose(previous.client);
        if (ticket !== this.epoch) throw new StaleSessionError();
        const client = await create();
        if (ticket !== this.epoch) {
          await this.dispose(client);
          throw new StaleSessionError();
        }
        this.active = { identity, client };
        return client;
      });
    this.queue = result;
    this.pending = { key: identity.key, promise: result };
    void result
      .finally(() => {
        if (this.pending?.promise === result) this.pending = null;
      })
      .catch(() => undefined);
    return result;
  }

  disconnect(): Promise<void> {
    ++this.epoch;
    const previous = this.active;
    this.active = null;
    this.pending = null;
    this.onInvalidate();
    const result = this.queue
      .catch(() => undefined)
      .then(async () => {
        if (previous) await this.dispose(previous.client);
      });
    this.queue = result;
    return result;
  }
}

export function normalizeMnemonic(value: string) {
  return value.normalize("NFKD").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function sessionIdentity(input: {
  mnemonic: string;
  network: "mainnet" | "regtest";
  account: number;
}): Promise<SessionIdentity> {
  if (!Number.isSafeInteger(input.account) || input.account < 0 || input.account > 2_147_483_647)
    throw new Error("Account must be a whole number between 0 and 2147483647.");
  const mnemonic = normalizeMnemonic(input.mnemonic);
  if (!mnemonic) throw new Error("A recovery phrase is required.");
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`cpay-session-v2\0${input.network}\0${input.account}\0${mnemonic}`),
  );
  const key = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return Object.freeze({ key, network: input.network, account: input.account });
}
