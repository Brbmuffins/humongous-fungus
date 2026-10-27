import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../shared/rng';
import { BET_SECONDS, HISTORY, MAX_BET, MIN_BET, REFILL_COINS, REFILL_SECONDS, START_COINS } from '../../games/sugarcrash/src/defs';
import { timeFor } from '../../games/sugarcrash/src/fair';
import { Table, type RoundSpec } from '../../games/sugarcrash/src/game';
import {
  YOU,
  autoCashed,
  broke,
  cancelBet,
  cashOut,
  clampBet,
  clampTarget,
  crashed,
  loadSave,
  newSave,
  placeBet,
  placeQueued,
  profit,
  queueBet,
  settleLeft,
  tickRefill,
} from '../../games/sugarcrash/src/meta';

const T0 = 1_700_000_000_000;
const spec = (crash: number, id = 1): RoundSpec => ({ id, crash, hash: 'a'.repeat(64), seed: 'b'.repeat(64) });
const fly = (t: Table, seconds: number) => {
  const ev = [];
  for (let s = 0; s < seconds; s += 1 / 60) ev.push(...t.step(1 / 60));
  return ev;
};

describe('betting', () => {
  it('starts you with 1,000 coins; a bet leaves your balance right away', () => {
    const s = newSave(T0);
    expect(s.coins).toBe(START_COINS);
    const t = new Table(spec(3), mulberry32(1));
    expect(placeBet(s, t, 250, null)).toBe('ok');
    expect(s.coins).toBe(START_COINS - 250);
    expect(s.pending).toEqual({ round: 1, crash: 3, amount: 250, target: null });
    expect(placeBet(s, t, 100, null)).toBe('already');
    expect(t.yours!.who).toBe(YOU);
  });
  it('can be taken back before launch, not after', () => {
    const s = newSave(T0);
    const t = new Table(spec(3), mulberry32(11));
    placeBet(s, t, 300, null);
    expect(cancelBet(s, t)).toBe(true);
    expect(s.coins).toBe(START_COINS);
    expect(s.stats.wagered).toBe(0);
    expect(s.pending).toBeNull();
    expect(cancelBet(s, t)).toBe(false);
    placeBet(s, t, 300, null);
    fly(t, BET_SECONDS + 0.1);
    expect(cancelBet(s, t)).toBe(false);
  });
  it('needs the coins, at least the minimum, and the countdown', () => {
    const s = newSave(T0);
    const t = new Table(spec(3), mulberry32(2));
    expect(placeBet(s, t, MIN_BET - 1, null)).toBe('funds');
    expect(placeBet(s, t, s.coins + 1, null)).toBe('funds');
    fly(t, BET_SECONDS + 0.1);
    expect(placeBet(s, t, 100, null)).toBe('phase');
  });
  it('cashing out pays you and counts the win', () => {
    const s = newSave(T0);
    const t = new Table(spec(5), mulberry32(3));
    placeBet(s, t, 100, null);
    fly(t, BET_SECONDS + timeFor(2.5));
    const b = cashOut(s, t)!;
    expect(b.cashedAt).toBeGreaterThan(2.4);
    expect(s.coins).toBe(START_COINS - 100 + b.payout);
    expect(s.pending).toBeNull();
    expect(s.stats.wins).toBe(1);
    expect(s.stats.bestCashout).toBe(b.cashedAt);
    expect(profit(s)).toBe(b.payout - 100);
  });
  it('an auto cash-out pays through the table', () => {
    const s = newSave(T0);
    const t = new Table(spec(5), mulberry32(4));
    placeBet(s, t, 100, 1.5);
    for (const e of fly(t, BET_SECONDS + timeFor(1.6))) if (e.type === 'cashout') autoCashed(s, e.bet);
    expect(s.coins).toBe(START_COINS - 100 + 150);
  });
  it('a crash with your bet still in loses it, and goes in the history', () => {
    const s = newSave(T0);
    const t = new Table(spec(1.3), mulberry32(5));
    placeBet(s, t, 100, 2);
    fly(t, BET_SECONDS + timeFor(1.3) + 0.2);
    expect(t.phase).toBe('crashed');
    expect(crashed(s, t)).toBe(100);
    expect(s.coins).toBe(START_COINS - 100);
    expect(s.history[0]).toEqual({ id: 1, crash: 1.3, hash: 'a'.repeat(64), seed: 'b'.repeat(64) });
    expect(s.stats.highestCrash).toBe(1.3);
  });
  it('keeps only the last rounds', () => {
    const s = newSave(T0);
    for (let i = 0; i < HISTORY + 10; i++) {
      const t = new Table(spec(2, i), mulberry32(i));
      t.step(BET_SECONDS + timeFor(2) + 1);
      crashed(s, t);
    }
    expect(s.history).toHaveLength(HISTORY);
    expect(s.history[0].id).toBe(HISTORY + 9);
  });
});

describe('the next round', () => {
  it('a bet placed while one is flying goes on the next one', () => {
    const s = newSave(T0);
    expect(queueBet(s, 200, 3)).toBe(true);
    const t = new Table(spec(2, 2), mulberry32(6));
    expect(placeQueued(s, t)).toBe('ok');
    expect(s.queued).toBeNull();
    expect(t.yours!.amount).toBe(200);
    expect(t.yours!.target).toBe(3);
  });
  it("is dropped if you can't cover it any more", () => {
    const s = newSave(T0);
    queueBet(s, 900, null);
    s.coins = 50;
    expect(placeQueued(s, new Table(spec(2), mulberry32(7)))).toBe('funds');
    expect(s.coins).toBe(50);
  });
});

describe('leaving mid-round', () => {
  it('settles the bet the way the round went', () => {
    const win = newSave(T0);
    win.coins = 0;
    win.pending = { round: 4, crash: 3.1, amount: 100, target: 2 };
    expect(settleLeft(win)).toBe(200);
    expect(win.coins).toBe(200);
    const lose = newSave(T0);
    lose.pending = { round: 4, crash: 1.4, amount: 100, target: 2 };
    expect(settleLeft(lose)).toBe(0);
    const hand = newSave(T0);
    hand.pending = { round: 4, crash: 50, amount: 100, target: null };
    expect(settleLeft(hand)).toBe(0);
    expect(settleLeft(hand)).toBeNull();
  });
});

describe("Mom's wire", () => {
  it('lands a while after you go broke', () => {
    const s = newSave(T0);
    s.coins = 3;
    expect(broke(s)).toBe(true);
    expect(tickRefill(s, T0)).toBe(false);
    expect(s.refillAt).toBe(T0 + REFILL_SECONDS * 1000);
    expect(tickRefill(s, T0 + 1000)).toBe(false);
    expect(tickRefill(s, T0 + REFILL_SECONDS * 1000)).toBe(true);
    expect(s.coins).toBe(3 + REFILL_COINS);
    expect(s.stats.refills).toBe(1);
  });
  it("doesn't come while a bet is still riding", () => {
    const s = newSave(T0);
    s.coins = 0;
    s.pending = { round: 1, crash: 2, amount: 100, target: null };
    expect(broke(s)).toBe(false);
    expect(tickRefill(s, T0 + 1e9)).toBe(false);
  });
});

describe('limits', () => {
  it('clamp bets and targets', () => {
    expect(clampBet(5, 1000)).toBe(MIN_BET);
    expect(clampBet(5000, 1000)).toBe(1000);
    expect(clampBet(1e9, 1e9)).toBe(MAX_BET);
    expect(clampBet(Number.NaN, 1000)).toBe(MIN_BET);
    expect(clampTarget(1)).toBe(1.01);
    expect(clampTarget(2.345)).toBe(2.34);
    expect(clampTarget(1e6)).toBe(1000);
  });
});

describe('saves', () => {
  it('round-trip', () => {
    const s = newSave(T0);
    const t = new Table(spec(2), mulberry32(8));
    placeBet(s, t, 100, 1.5);
    queueBet(s, 50, null);
    s.history = [{ id: 1, crash: 2, hash: 'c'.repeat(64), seed: 'd'.repeat(64) }];
    expect(loadSave(JSON.stringify(s))).toEqual(s);
  });
  it('reject garbage', () => {
    expect(loadSave(null)).toBeNull();
    expect(loadSave('nope')).toBeNull();
    expect(loadSave('{"version":2}')).toBeNull();
  });
  it('repair what is damaged', () => {
    const raw = JSON.parse(JSON.stringify(newSave(T0)));
    raw.coins = -50;
    raw.settings = { sound: 'loud', bet: 1e12, auto: 0.5 };
    raw.stats = { wins: 'many', paid: 100 };
    raw.history = [{ id: 1, crash: 2, hash: 'xyz', seed: 'b'.repeat(64) }, { id: 2, crash: 3.456, hash: 'a'.repeat(64), seed: 'b'.repeat(64) }];
    raw.pending = { round: 3, crash: 2, amount: 3, target: null };
    raw.queued = { amount: 500, target: 9999 };
    const s = loadSave(JSON.stringify(raw))!;
    expect(s.coins).toBe(0);
    expect(s.settings.sound).toBe(true);
    expect(s.settings.bet).toBe(MAX_BET);
    expect(s.settings.auto).toBe(1.01);
    expect(s.stats.wins).toBe(0);
    expect(s.stats.paid).toBe(100);
    expect(s.history).toEqual([{ id: 2, crash: 3.45, hash: 'a'.repeat(64), seed: 'b'.repeat(64) }]);
    expect(s.pending).toBeNull();
    expect(s.queued).toEqual({ amount: 500, target: 1000 });
  });
});
