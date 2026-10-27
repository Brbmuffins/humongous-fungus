// A token bucket per key (a player, an address): `cap` actions at once, then
// `perSec` more every second. Idle keys are dropped now and then.
export class Buckets {
  private map = new Map<string, { tokens: number; at: number }>();
  private calls = 0;

  constructor(
    private cap: number,
    private perSec: number,
    private now: () => number = Date.now,
  ) {}

  /** Spend `cost` tokens from `key`'s bucket. False (and nothing spent) if it hasn't got them. */
  take(key: string, cost = 1): boolean {
    const t = this.now();
    let b = this.map.get(key);
    if (!b) {
      b = { tokens: this.cap, at: t };
      this.map.set(key, b);
    } else {
      b.tokens = Math.min(this.cap, b.tokens + ((t - b.at) / 1000) * this.perSec);
      b.at = t;
    }
    if (++this.calls % 500 === 0) this.sweep(t);
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    return true;
  }

  /** Seconds until `key` has a token again. */
  wait(key: string): number {
    const b = this.map.get(key);
    return b ? Math.max(0, Math.ceil((1 - b.tokens) / this.perSec)) : 0;
  }

  get size(): number {
    return this.map.size;
  }

  private sweep(t: number): void {
    const full = (this.cap / this.perSec) * 1000 + 60_000;
    for (const [k, b] of this.map) if (t - b.at > full) this.map.delete(k);
  }
}
