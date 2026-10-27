// The table: one round at a time. A countdown while bets come in, then the
// sugar rush starts and the multiplier climbs until the round's crash point,
// cashing out everyone whose auto target it passes. Then the wreck, a pause,
// and the next round. Pure and stepped by the caller, so a seeded table plays
// the same every time.
import { BET_SECONDS, BOT_BETS, BOT_NAMES, BOT_STYLES, CROWD_MAX, CROWD_MIN, MILESTONES, PAUSE_SECONDS } from './defs';
import { cents, multiplierAt } from './fair';

export type Phase = 'betting' | 'flying' | 'crashed';

/** A round, sealed before it starts. */
export interface RoundSpec {
  id: number;
  crash: number;
  /** SHA-256 of the seed: public from the start. */
  hash: string;
  /** Secret until the crash. */
  seed: string;
}

export interface Bet {
  who: string;
  you: boolean;
  amount: number;
  /** Auto cash-out, or null to cash out by hand. */
  target: number | null;
  /** The multiplier it cashed out at, or null. */
  cashedAt: number | null;
  payout: number;
}

export type TableEvent =
  | { type: 'join'; bet: Bet }
  | { type: 'launch' }
  | { type: 'milestone'; at: number }
  | { type: 'cashout'; bet: Bet }
  | { type: 'crash'; at: number }
  /** The pause is over: start the next round with `begin`. */
  | { type: 'next' };

/** What a bet pays when it cashes out at m: whole coins, rounded down. */
export const payoutFor = (amount: number, m: number): number => Math.floor(amount * cents(m) + 1e-9);

type Roll = () => number;

export class Table {
  phase: Phase = 'betting';
  /** Seconds since this phase began. */
  t = 0;
  round: RoundSpec;
  bets: Bet[] = [];
  /** The crowd, waiting to join during the countdown. */
  private joining: { at: number; bet: Bet }[] = [];
  private nextMilestone = 0;
  private waiting = false;

  constructor(round: RoundSpec, private roll: Roll) {
    this.round = round;
    this.begin(round);
  }

  /** A new round: open the betting and seat the crowd. */
  begin(round: RoundSpec): void {
    this.round = round;
    this.phase = 'betting';
    this.t = 0;
    this.bets = [];
    this.nextMilestone = 0;
    this.waiting = false;
    this.joining = crowd(this.roll).sort((a, b) => a.at - b.at);
  }

  /** The multiplier right now. */
  get multiplier(): number {
    if (this.phase === 'betting') return 1;
    if (this.phase === 'crashed') return this.round.crash;
    return Math.min(this.round.crash, multiplierAt(this.t));
  }

  /** Seconds until launch, while betting. */
  get countdown(): number {
    return this.phase === 'betting' ? Math.max(0, BET_SECONDS - this.t) : 0;
  }

  get wagered(): number {
    return this.bets.reduce((s, b) => s + b.amount, 0);
  }

  get yours(): Bet | null {
    return this.bets.find((b) => b.you) ?? null;
  }

  /** Take a bet. Only during the countdown, and only one per player. */
  join(bet: Omit<Bet, 'cashedAt' | 'payout'>): Bet | null {
    if (this.phase !== 'betting' || this.bets.some((b) => b.who === bet.who)) return null;
    const b: Bet = { ...bet, cashedAt: null, payout: 0 };
    this.bets.push(b);
    return b;
  }

  /** Take a bet back, before launch. */
  leave(who: string): Bet | null {
    if (this.phase !== 'betting') return null;
    const i = this.bets.findIndex((b) => b.who === who);
    return i < 0 ? null : this.bets.splice(i, 1)[0];
  }

  /** Cash out by hand at the current multiplier. */
  cashOut(who: string): Bet | null {
    if (this.phase !== 'flying') return null;
    const b = this.bets.find((x) => x.who === who && x.cashedAt === null);
    if (!b) return null;
    return this.pay(b, this.multiplier);
  }

  private pay(b: Bet, m: number): Bet {
    b.cashedAt = cents(m);
    b.payout = payoutFor(b.amount, m);
    return b;
  }

  step(dt: number): TableEvent[] {
    const events: TableEvent[] = [];
    this.t += Math.max(0, dt);
    if (this.phase === 'betting') {
      while (this.joining.length && this.joining[0].at <= Math.min(this.t, BET_SECONDS)) {
        const { bet } = this.joining.shift()!;
        if (this.bets.some((b) => b.who === bet.who)) continue;
        this.bets.push(bet);
        events.push({ type: 'join', bet });
      }
      if (this.t < BET_SECONDS) return events;
      this.phase = 'flying';
      this.t -= BET_SECONDS;
      events.push({ type: 'launch' });
    }
    if (this.phase === 'flying') {
      const crash = this.round.crash;
      const m = Math.min(crash, multiplierAt(this.t));
      // Auto cash-outs it passed, lowest first. A target right at the crash point still pays.
      const due = this.bets.filter((b) => b.cashedAt === null && b.target !== null && b.target <= m + 1e-9).sort((a, b) => a.target! - b.target!);
      for (const b of due) events.push({ type: 'cashout', bet: this.pay(b, b.target!) });
      while (this.nextMilestone < MILESTONES.length && MILESTONES[this.nextMilestone] <= m + 1e-9) {
        events.push({ type: 'milestone', at: MILESTONES[this.nextMilestone] });
        this.nextMilestone++;
      }
      if (multiplierAt(this.t) < crash) return events;
      this.phase = 'crashed';
      this.t = 0;
      events.push({ type: 'crash', at: crash });
      return events;
    }
    if (this.phase === 'crashed' && this.t >= PAUSE_SECONDS && !this.waiting) {
      this.waiting = true;
      events.push({ type: 'next' });
    }
    return events;
  }
}

/** Everyone else at the table this round: who, how much, where they bail, and when they sit down. */
export function crowd(roll: Roll): { at: number; bet: Bet }[] {
  const n = CROWD_MIN + Math.floor(roll() * (CROWD_MAX - CROWD_MIN + 1));
  const names = [...BOT_NAMES];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(roll() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  return names.slice(0, Math.min(n, names.length)).map((who) => {
    // Small bets far more often than big ones.
    const amount = BOT_BETS[Math.min(BOT_BETS.length - 1, Math.floor(roll() ** 2.2 * BOT_BETS.length))];
    let r = roll();
    let style = BOT_STYLES[BOT_STYLES.length - 1];
    for (const s of BOT_STYLES) {
      if (r < s.share) {
        style = s;
        break;
      }
      r -= s.share;
    }
    const target = cents(style.lo * (style.hi / style.lo) ** roll());
    return { at: roll() * (BET_SECONDS - 0.4), bet: { who, you: false, amount, target: Math.max(1.01, target), cashedAt: null, payout: 0 } };
  });
}
