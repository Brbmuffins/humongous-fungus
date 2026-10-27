import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../shared/rng';
import { BET_SECONDS, BOT_NAMES, CROWD_MAX, CROWD_MIN, PAUSE_SECONDS } from '../../games/sugarcrash/src/defs';
import { timeFor } from '../../games/sugarcrash/src/fair';
import { Table, crowd, payoutFor, type RoundSpec, type TableEvent } from '../../games/sugarcrash/src/game';

const spec = (crash: number, id = 1): RoundSpec => ({ id, crash, hash: 'a'.repeat(64), seed: 'b'.repeat(64) });

/** Step a table in small slices until `until` returns true, collecting events. */
function run(t: Table, seconds: number, dt = 1 / 60): TableEvent[] {
  const out: TableEvent[] = [];
  for (let s = 0; s < seconds; s += dt) out.push(...t.step(dt));
  return out;
}

describe('a round', () => {
  it('counts down, launches, climbs and crashes at its crash point', () => {
    const t = new Table(spec(2.5), mulberry32(1));
    expect(t.phase).toBe('betting');
    expect(t.countdown).toBeCloseTo(BET_SECONDS, 5);
    const pre = run(t, BET_SECONDS - 0.1);
    expect(pre.some((e) => e.type === 'launch')).toBe(false);
    expect(t.multiplier).toBe(1);
    const ev = run(t, 0.2);
    expect(ev.some((e) => e.type === 'launch')).toBe(true);
    expect(t.phase).toBe('flying');
    run(t, timeFor(2) - 0.2);
    expect(t.multiplier).toBeGreaterThan(1.9);
    expect(t.multiplier).toBeLessThan(2.01);
    const end = run(t, timeFor(2.5) - timeFor(2) + 0.5);
    const crash = end.find((e) => e.type === 'crash');
    expect(crash).toEqual({ type: 'crash', at: 2.5 });
    expect(t.phase).toBe('crashed');
    expect(t.multiplier).toBe(2.5);
    expect(end.filter((e) => e.type === 'milestone')).toEqual([{ type: 'milestone', at: 2 }]);
    const after = run(t, PAUSE_SECONDS + 0.1);
    expect(after.filter((e) => e.type === 'next')).toHaveLength(1);
  });
  it('a 1.00× round busts the moment it launches', () => {
    const t = new Table(spec(1), mulberry32(2));
    t.join({ who: 'You', you: true, amount: 100, target: 1.01 });
    const ev = run(t, BET_SECONDS + 0.05);
    expect(ev.map((e) => e.type)).toContain('crash');
    expect(t.yours!.cashedAt).toBeNull();
  });
  it('survives a long frame (a tab coming back) without skipping the crash', () => {
    const t = new Table(spec(3), mulberry32(3));
    const ev = t.step(BET_SECONDS + timeFor(3) + 5);
    expect(ev.map((e) => e.type)).toEqual(expect.arrayContaining(['launch', 'crash']));
    expect(t.phase).toBe('crashed');
  });
});

describe('cashing out', () => {
  it('pays the bet times the multiplier, rounded down to whole coins', () => {
    expect(payoutFor(100, 2)).toBe(200);
    expect(payoutFor(10, 1.555)).toBe(15);
    expect(payoutFor(333, 1.01)).toBe(336);
  });
  it('by hand, at the multiplier right now', () => {
    const t = new Table(spec(10), mulberry32(4));
    expect(t.join({ who: 'You', you: true, amount: 100, target: null })).not.toBeNull();
    expect(t.cashOut('You')).toBeNull();
    run(t, BET_SECONDS + timeFor(3));
    const m = t.multiplier;
    const b = t.cashOut('You')!;
    expect(b.cashedAt).toBeCloseTo(Math.floor(m * 100) / 100, 9);
    expect(b.payout).toBe(Math.floor(100 * b.cashedAt!));
    expect(t.cashOut('You')).toBeNull();
  });
  it('automatically at the target, if the round gets there', () => {
    const t = new Table(spec(4.2), mulberry32(5));
    t.join({ who: 'A', you: false, amount: 50, target: 2 });
    t.join({ who: 'B', you: false, amount: 50, target: 4.2 });
    t.join({ who: 'C', you: false, amount: 50, target: 4.21 });
    const ev = run(t, BET_SECONDS + timeFor(4.2) + 0.5);
    const cashed = ev
      .filter((e) => e.type === 'cashout' && ['A', 'B', 'C'].includes(e.bet.who))
      .map((e) => (e.type === 'cashout' ? [e.bet.who, e.bet.cashedAt] : null));
    expect(cashed).toEqual([
      ['A', 2],
      ['B', 4.2],
    ]);
    expect(t.bets.find((b) => b.who === 'C')!.cashedAt).toBeNull();
  });
  it('only takes bets in the countdown, one each', () => {
    const t = new Table(spec(5), mulberry32(6));
    expect(t.join({ who: 'You', you: true, amount: 10, target: null })).not.toBeNull();
    expect(t.join({ who: 'You', you: true, amount: 10, target: null })).toBeNull();
    run(t, BET_SECONDS + 0.1);
    expect(t.join({ who: 'Late', you: false, amount: 10, target: null })).toBeNull();
  });
});

describe('the crowd', () => {
  it('is 15 to 30 made-up players with bets and targets', () => {
    for (let seed = 1; seed < 40; seed++) {
      const c = crowd(mulberry32(seed));
      expect(c.length).toBeGreaterThanOrEqual(CROWD_MIN);
      expect(c.length).toBeLessThanOrEqual(CROWD_MAX);
      expect(new Set(c.map((x) => x.bet.who)).size).toBe(c.length);
      for (const x of c) {
        expect(BOT_NAMES).toContain(x.bet.who);
        expect(x.bet.amount).toBeGreaterThanOrEqual(10);
        expect(x.bet.target).toBeGreaterThanOrEqual(1.01);
        expect(x.at).toBeLessThan(BET_SECONDS);
      }
    }
  });
  it('sits down during the countdown, and mostly plays it safe', () => {
    const t = new Table(spec(1000), mulberry32(9));
    const early = run(t, 1).filter((e) => e.type === 'join').length;
    const all = run(t, BET_SECONDS).filter((e) => e.type === 'join').length + early;
    expect(early).toBeGreaterThan(0);
    expect(all).toBe(t.bets.length);
    let low = 0;
    let total = 0;
    for (let seed = 1; seed < 60; seed++) {
      for (const x of crowd(mulberry32(seed))) {
        total++;
        if (x.bet.target! <= 2) low++;
      }
    }
    expect(low / total).toBeGreaterThan(0.35);
    expect(low / total).toBeLessThan(0.6);
  });
  it('is the same for the same seed', () => {
    expect(crowd(mulberry32(11))).toEqual(crowd(mulberry32(11)));
  });
});
