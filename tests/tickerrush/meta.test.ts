import { describe, expect, it } from 'vitest';
import { BLOWN_BELOW, STOCK, START_CASH, TOOL } from '../../games/tickerrush/src/defs';
import type { Trade } from '../../games/tickerrush/src/desk';
import {
  buyTool,
  canBuy,
  deskOptions,
  finishDay,
  gradeFor,
  loadCareer,
  newCareer,
  settleLeftDay,
  setupFor,
  watchlist,
} from '../../games/tickerrush/src/meta';

const trade = (pnl: number): Trade => ({ id: 'SPUD', side: 'long', qty: 10, entry: 100, exit: 100 + pnl / 10, pnl, t0: 0, t1: 5, why: 'manual' });
const day = (equity: number, trades: Trade[] = []) => ({ equity, trades, fees: 4, closes: { SPUD: 101 }, halts: 1, locked: false });

describe('the career', () => {
  it('starts with $10,000 and no tools', () => {
    const c = newCareer(7);
    expect(c.cash).toBe(START_CASH);
    expect(c.day).toBe(1);
    expect(c.tools).toEqual([]);
    expect(deskOptions(c)).toEqual({ leverage: 2, feeMult: 1, brackets: null });
  });

  it('saves and loads', () => {
    const c = newCareer(7);
    c.cash = 12_345;
    c.tools = ['level2', 'brackets'];
    c.closes = { MUFN: 31.2 };
    c.settings.length = 'blitz';
    const back = loadCareer(JSON.stringify(c));
    expect(back).toEqual(c);
  });

  it('mends a damaged save, and ignores one that isn\'t ours', () => {
    expect(loadCareer(null)).toBeNull();
    expect(loadCareer('nope')).toBeNull();
    expect(loadCareer(JSON.stringify({ version: 2 }))).toBeNull();
    const c = loadCareer(JSON.stringify({ version: 1, seed: 3, cash: -50, day: 0, tools: ['level2', 'laser'], closes: { MUFN: 'x', SPUD: 90, NOPE: 1 }, settings: { length: 'forever', stop: 0.5 } }))!;
    expect(c.cash).toBe(0);
    expect(c.day).toBe(1);
    expect(c.tools).toEqual(['level2']);
    expect(c.closes).toEqual({ SPUD: 90 });
    expect(c.settings.length).toBe('normal');
    expect(c.settings.stop).toBe(0.02);
  });

  it('picks five different tickers a day, the same ones on a replay, with something wild and something calm', () => {
    const c = newCareer(99);
    for (let d = 1; d <= 40; d++) {
      const ids = watchlist(c, d);
      expect(ids).toHaveLength(5);
      expect(new Set(ids).size).toBe(5);
      expect(ids).toEqual(watchlist(c, d));
      expect(ids.some((id) => STOCK[id].vol >= 0.08)).toBe(true);
      expect(ids.some((id) => STOCK[id].vol < 0.08)).toBe(true);
    }
    expect(watchlist(c, 1)).not.toEqual(watchlist(c, 2));
    c.tools.push('scanner');
    expect(watchlist(c, 1)).toHaveLength(7);
  });

  it('buys tools with account cash, in order', () => {
    const c = newCareer(1);
    expect(canBuy(c, 'margin6')).toBe('needs');
    expect(buyTool(c, 'level2')).toBe(true);
    expect(c.cash).toBe(START_CASH - TOOL.level2.cost);
    expect(canBuy(c, 'level2')).toBe('owned');
    expect(buyTool(c, 'level2')).toBe(false);
    c.cash = 500;
    expect(canBuy(c, 'brackets')).toBe('cash');
    c.cash = 100_000;
    expect(buyTool(c, 'margin4')).toBe(true);
    expect(buyTool(c, 'margin6')).toBe(true);
    expect(buyTool(c, 'squawk')).toBe(true);
    expect(buyTool(c, 'feecut')).toBe(true);
    expect(buyTool(c, 'brackets')).toBe(true);
    const o = deskOptions(c);
    expect(o.leverage).toBe(6);
    expect(o.feeMult).toBe(0.5);
    expect(o.brackets).toEqual({ stop: c.settings.stop, target: c.settings.target });
    expect(setupFor(c).lead).toBeGreaterThan(0);
  });

  it('books a green day', () => {
    const c = newCareer(1);
    const s = finishDay(c, day(10_400, [trade(300), trade(-50), trade(150)]));
    expect(s.pnl).toBe(400);
    expect(s.pct).toBeCloseTo(0.04, 9);
    expect(s.grade).toBe('A');
    expect(s.goal).toBe(true);
    expect(s.wins).toBe(2);
    expect(s.best!.pnl).toBe(300);
    expect(s.worst!.pnl).toBe(-50);
    expect(c.cash).toBe(10_400);
    expect(c.day).toBe(2);
    expect(c.streak).toBe(1);
    expect(c.closes.SPUD).toBe(101);
    expect(c.history).toHaveLength(1);
    expect(c.stats.green).toBe(1);
    expect(c.stats.bestTrade).toBe(300);
  });

  it('breaks the streak on a red day, and starts over when the account is blown', () => {
    const c = newCareer(1);
    finishDay(c, day(10_100));
    finishDay(c, day(9_000));
    expect(c.streak).toBe(0);
    const s = finishDay(c, day(BLOWN_BELOW - 1));
    expect(s.blown).toBe(true);
    expect(c.cash).toBe(START_CASH);
    expect(c.stats.blown).toBe(1);
    expect(c.day).toBe(4);
  });

  it('settles a session that was left running at its last checkpoint', () => {
    const c = newCareer(1);
    expect(settleLeftDay(c)).toBeNull();
    c.live = { day: 1, equity: 9_500 };
    const s = settleLeftDay(c)!;
    expect(s.pnl).toBe(-500);
    expect(c.cash).toBe(9_500);
    expect(c.live).toBeNull();
    expect(c.day).toBe(2);
  });

  it('grades days', () => {
    expect(gradeFor(0.08)).toBe('A+');
    expect(gradeFor(0.03)).toBe('A');
    expect(gradeFor(0.015)).toBe('B');
    expect(gradeFor(0)).toBe('C');
    expect(gradeFor(-0.02)).toBe('D');
    expect(gradeFor(-0.2)).toBe('F');
  });
});
