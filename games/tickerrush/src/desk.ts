// Your trading desk for the day: cash, positions, fills, fees, margin, the
// bracket orders that sell for you and the risk desk that takes your keys
// when you lose too much. Pure: it trades against a Market and never draws.
//
// Orders are market orders. Buys fill at the ask, sells at the bid, and big
// orders pay a little extra (and push the price) on thin stocks. You can go
// short. Long or short, the opposite button closes the whole position.
import { DAY_MINUTES, FEE_MIN, FEE_PER_SHARE, IMPACT, LOSS_LIMIT, type StockId } from './defs';
import type { Market } from './market';

export interface Position {
  /** Shares: positive long, negative short. */
  qty: number;
  /** Average entry price. */
  avg: number;
  /** Bracket levels, if any. */
  stop: number | null;
  target: number | null;
  /** When it was opened (market minute). */
  since: number;
  /** Biggest size it reached. */
  peak: number;
  /** Realized P&L so far on this trade, before fees. */
  realized: number;
  fees: number;
}

export type Why = 'manual' | 'stop' | 'target' | 'close' | 'risk';

export interface Trade {
  id: StockId;
  side: 'long' | 'short';
  /** Biggest size held. */
  qty: number;
  entry: number;
  exit: number;
  /** After fees. */
  pnl: number;
  t0: number;
  t1: number;
  why: Why;
}

export interface Fill {
  id: StockId;
  /** Signed shares: + bought, - sold. */
  qty: number;
  price: number;
  fee: number;
  why: Why;
  /** Set when this fill closed a trade. */
  closed: Trade | null;
}

export type Reject = 'halted' | 'closed' | 'locked' | 'no-room' | 'flat';

export interface DeskOptions {
  leverage: number;
  /** Commission multiplier (Pro pricing halves it). */
  feeMult: number;
  /** Bracket distances, or null without Bracket orders. */
  brackets: { stop: number; target: number } | null;
}

export class Desk {
  cash: number;
  readonly startEquity: number;
  readonly positions = new Map<StockId, Position>();
  readonly trades: Trade[] = [];
  fees = 0;
  /** The risk desk has taken over for the rest of the day. */
  locked = false;

  constructor(
    cash: number,
    readonly opts: DeskOptions,
  ) {
    this.cash = cash;
    this.startEquity = cash;
  }

  equity(m: Market): number {
    let e = this.cash;
    for (const [id, p] of this.positions) e += p.qty * m.get(id).price;
    return e;
  }

  /** Total size of every position, long or short. */
  exposure(m: Market): number {
    let x = 0;
    for (const [id, p] of this.positions) x += Math.abs(p.qty) * m.get(id).price;
    return x;
  }

  /** Dollars of new positions you can still open. */
  buyingPower(m: Market): number {
    return Math.max(0, this.equity(m) * this.opts.leverage - this.exposure(m));
  }

  dayPnl(m: Market): number {
    return this.equity(m) - this.startEquity;
  }

  /** Unrealized P&L on one position. */
  open(m: Market, id: StockId): number {
    const p = this.positions.get(id);
    return p ? (m.get(id).price - p.avg) * p.qty : 0;
  }

  fee(shares: number, price: number): number {
    const raw = Math.max(FEE_MIN, Math.abs(shares) * FEE_PER_SHARE);
    return Math.min(raw, Math.max(FEE_MIN, Math.abs(shares) * price * 0.01)) * this.opts.feeMult;
  }

  /**
   * Open or add: side +1 buys, -1 sells short. `share` is how much of your
   * biggest possible position to use (1 for everything you have left).
   * Holding the other way, this closes that position instead.
   */
  order(m: Market, id: StockId, side: 1 | -1, share: number): Fill | Reject {
    const why = this.blocked(m, id);
    if (why) return why;
    const p = this.positions.get(id);
    if (p && Math.sign(p.qty) !== side) return this.close(m, id, 'manual');
    const q = m.quote(id);
    const price = side > 0 ? q.ask : q.bid;
    const room = this.buyingPower(m);
    const want = share >= 1 ? room : Math.min(room, this.equity(m) * this.opts.leverage * share);
    // Leave room for the fee and the slippage on the way in.
    const shares = Math.floor((want * 0.995) / price);
    if (shares < 1) return 'no-room';
    return this.fill(m, id, side * shares, 'manual');
  }

  /** Close one position at market. */
  close(m: Market, id: StockId, why: Why): Fill | Reject {
    const p = this.positions.get(id);
    if (!p) return 'flat';
    if (why === 'manual' || why === 'stop' || why === 'target') {
      const no = this.blocked(m, id);
      if (no) return no;
    }
    return this.fill(m, id, -p.qty, why);
  }

  /** Close everything (the bell, or the risk desk). Halted stocks wait unless it's the bell. */
  flattenAll(m: Market, why: Why): Fill[] {
    const out: Fill[] = [];
    for (const id of [...this.positions.keys()]) {
      if (why !== 'close' && m.quote(id).halted) continue;
      const f = this.close(m, id, why);
      if (typeof f !== 'string') out.push(f);
    }
    return out;
  }

  /** Each step: brackets, the risk desk and the closing bell. */
  check(m: Market): Fill[] {
    const out: Fill[] = [];
    if (m.done || m.t >= DAY_MINUTES) {
      out.push(...this.flattenAll(m, 'close'));
      return out;
    }
    for (const [id, p] of [...this.positions]) {
      const q = m.quote(id);
      if (q.halted) continue;
      const mark = p.qty > 0 ? q.bid : q.ask;
      const long = p.qty > 0;
      if (p.stop !== null && (long ? mark <= p.stop : mark >= p.stop)) {
        const f = this.close(m, id, 'stop');
        if (typeof f !== 'string') out.push(f);
      } else if (p.target !== null && (long ? mark >= p.target : mark <= p.target)) {
        const f = this.close(m, id, 'target');
        if (typeof f !== 'string') out.push(f);
      }
    }
    if (!this.locked && this.equity(m) <= this.startEquity * (1 - LOSS_LIMIT)) {
      this.locked = true;
      out.push(...this.flattenAll(m, 'risk'));
    } else if (this.locked && this.positions.size) {
      // Anything that was halted when the risk desk stepped in goes when it reopens.
      out.push(...this.flattenAll(m, 'risk'));
    }
    return out;
  }

  private blocked(m: Market, id: StockId): Reject | null {
    if (m.done) return 'closed';
    if (this.locked) return 'locked';
    if (m.quote(id).halted) return 'halted';
    return null;
  }

  /** Trade `qty` shares (signed) at market, with slippage, fees and price impact. */
  private fill(m: Market, id: StockId, qty: number, why: Why): Fill {
    const tk = m.get(id);
    const q = m.quote(id);
    const notional = Math.abs(qty) * tk.price;
    const impact = (IMPACT * notional) / tk.def.liquidity;
    const price = qty > 0 ? q.ask * (1 + impact) : q.bid * (1 - impact);
    const fee = this.fee(qty, price);
    this.cash -= qty * price + fee;
    this.fees += fee;
    m.push(id, Math.sign(qty) * impact * 0.5);

    let closed: Trade | null = null;
    const p = this.positions.get(id);
    if (!p) {
      this.positions.set(id, { qty, avg: price, stop: null, target: null, since: m.t, peak: Math.abs(qty), realized: 0, fees: fee });
      this.bracket(this.positions.get(id)!);
    } else if (Math.sign(qty) === Math.sign(p.qty)) {
      p.avg = (p.avg * p.qty + price * qty) / (p.qty + qty);
      p.qty += qty;
      p.peak = Math.max(p.peak, Math.abs(p.qty));
      p.fees += fee;
      this.bracket(p);
    } else {
      // Closing (always the whole thing: orders never flip a position).
      p.realized += (price - p.avg) * -qty;
      p.fees += fee;
      p.qty += qty;
      if (Math.abs(p.qty) < 1e-9) {
        closed = {
          id,
          side: qty < 0 ? 'long' : 'short',
          qty: p.peak,
          entry: p.avg,
          exit: price,
          pnl: p.realized - p.fees,
          t0: p.since,
          t1: m.t,
          why,
        };
        this.trades.push(closed);
        this.positions.delete(id);
      }
    }
    return { id, qty, price, fee, why, closed };
  }

  private bracket(p: Position): void {
    const b = this.opts.brackets;
    if (!b) return;
    const long = p.qty > 0;
    p.stop = p.avg * (long ? 1 - b.stop : 1 + b.stop);
    p.target = p.avg * (long ? 1 + b.target : 1 - b.target);
  }
}
