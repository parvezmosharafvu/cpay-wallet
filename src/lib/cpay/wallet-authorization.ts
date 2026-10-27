/** An in-memory capability: an async operation belongs to exactly one vault unlock. */
export class WalletAuthorization {
  private epoch = 0;
  private allowed = false;
  unlock() {
    this.epoch++;
    this.allowed = true;
  }
  lock() {
    this.epoch++;
    this.allowed = false;
  }
  capture() {
    if (!this.allowed) throw new Error("Unlock the vault before using the live wallet.");
    return this.epoch;
  }
  isCurrent(ticket: number | null) {
    return this.allowed && ticket === this.epoch;
  }
  assert(ticket: number) {
    if (!this.isCurrent(ticket))
      throw new Error("The vault locked or changed. Unlock and start again.");
  }
}
