// The arcade's coins and stats: play money only, kept in local storage. It
// is what the five games bet through (an ArcadeHost, like Hammygotchi's own
// game), so the rules in arcade.ts (bets up front, wins paid on the
// multiplier, bets that never started refunded) are the very same ones.
import { ARCADE, MIN_BET, noBets, payOut, placeBet, refundBet, type ArcadeGame, type ArcadeSeat, type BetStats } from '@hammygotchi/arcade';
import type { ArcadeHost } from '@hammygotchi/arcadeview';
import type { FitId, FormId } from '@hammygotchi/defs';
import { localSave, type LocalSave } from '@shared/storage';
import { MAX_COINS, START_COINS, TOP_UP_COINS } from '../shared/protocol';

// The same numbers the server uses (what a new player starts with, the free top-up, the cap).
export { MAX_COINS, START_COINS, TOP_UP_COINS };

const SAVE_KEY = 'hammys-arcade.save.v1';

export interface WalletSave {
  v: 1;
  coins: number;
  topUps: number;
  sound: boolean;
  arcade: Record<ArcadeGame, BetStats>;
}

const FORMS: readonly FormId[] = ['cube', 'cube', 'cube', 'hamster', 'sub', 'train'];

/** What Hammy is today: mostly a cube, and the same all day for everyone. */
export function formOfTheDay(now: Date = new Date()): FormId {
  const day = Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);
  // A cheap scramble, so the days don't just go round in order.
  const x = Math.imul(day ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return FORMS[(x ^ (x >>> 13)) % FORMS.length];
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Read a saved wallet, trusting none of it. Anything unusable is a fresh start. */
export function parseSave(raw: string | null): WalletSave | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Record<string, unknown> | null;
    if (!d || typeof d !== 'object' || typeof d.coins !== 'number' || !Number.isFinite(d.coins)) return null;
    const saved = (d.arcade ?? {}) as Record<string, Partial<BetStats> | undefined>;
    const arcade = noBets();
    for (const g of ARCADE) {
      const b = saved[g.id];
      if (!b || typeof b !== 'object') continue;
      arcade[g.id] = { rounds: Math.max(0, Math.floor(num(b.rounds, 0))), net: Math.floor(num(b.net, 0)), best: Math.max(0, num(b.best, 0)) };
    }
    return {
      v: 1,
      coins: Math.min(MAX_COINS, Math.max(0, Math.floor(d.coins))),
      topUps: Math.max(0, Math.floor(num(d.topUps, 0))),
      sound: d.sound !== false,
      arcade,
    };
  } catch {
    return null;
  }
}

export class Wallet implements ArcadeHost {
  readonly state: ArcadeSeat = { coins: START_COINS, fit: 'classic' as FitId, fresh: 100, diedAt: null, stats: { arcade: noBets() } };
  /** What Hammy is today. */
  readonly form: FormId;
  /** Free top-ups taken, ever. */
  topUps = 0;
  sound = true;
  private listeners: (() => void)[] = [];

  constructor(
    private store: LocalSave = localSave(SAVE_KEY),
    form: FormId = formOfTheDay(),
  ) {
    this.form = form;
    const saved = parseSave(store.load());
    if (saved) {
      this.state.coins = saved.coins;
      this.state.stats.arcade = saved.arcade;
      this.topUps = saved.topUps;
      this.sound = saved.sound;
    }
  }

  get coins(): number {
    return this.state.coins;
  }

  /** Not enough left for the smallest bet. */
  get broke(): boolean {
    return this.state.coins < MIN_BET;
  }

  /** Call `f` whenever the coins, stats or settings change. */
  onChange(f: () => void): void {
    this.listeners.push(f);
  }

  bet(game: ArcadeGame, amount: number): boolean {
    if (!placeBet(this.state, game, amount)) return false;
    this.changed();
    return true;
  }

  payOut(game: ArcadeGame, bet: number, mult: number): number {
    const won = payOut(this.state, game, bet, mult);
    // However lucky: a wallet stays a number a screen can show.
    this.state.coins = Math.min(MAX_COINS, this.state.coins);
    this.changed();
    return won;
  }

  refund(game: ArcadeGame, bet: number): void {
    refundBet(this.state, game, bet);
    this.changed();
  }

  /** The free coins for when you're out. Returns what you got: 0 if you aren't out. */
  topUp(): number {
    if (!this.broke) return 0;
    this.state.coins += TOP_UP_COINS;
    this.topUps += 1;
    this.changed();
    return TOP_UP_COINS;
  }

  setSound(on: boolean): void {
    this.sound = on;
    this.changed();
  }

  /** Back to a new player's coins and stats. */
  reset(): void {
    this.state.coins = START_COINS;
    this.state.stats.arcade = noBets();
    this.topUps = 0;
    this.changed();
  }

  toSave(): WalletSave {
    return { v: 1, coins: this.state.coins, topUps: this.topUps, sound: this.sound, arcade: structuredClone(this.state.stats.arcade) };
  }

  save(): void {
    this.store.save(JSON.stringify(this.toSave()));
  }

  private changed(): void {
    this.save();
    for (const f of this.listeners) f();
  }
}
