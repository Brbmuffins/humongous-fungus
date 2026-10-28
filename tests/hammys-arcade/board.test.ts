import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Board, BOARD_KEEP, weekEndET, weekStartET } from '../../games/hammys-arcade/server/board';
import { PlinkoGame } from '../../games/hammys-arcade/server/plinko';
import { RocketGame } from '../../games/hammys-arcade/server/rocket';
import { SlotsGame } from '../../games/hammys-arcade/server/slots';
import { Store, type Player } from '../../games/hammys-arcade/server/store';
import { BOARD_TOP } from '../../games/hammys-arcade/shared/protocol';
import { world } from './harness';

const Z = (iso: string): number => Date.parse(iso);
const dir = () => mkdtempSync(join(tmpdir(), 'arcade-board-'));
const make = (s: Store, name: string): Player => {
  const r = s.create(name);
  if (!r.ok) throw new Error(r.error);
  r.player.coins = 1e9;
  return r.player;
};
const names = (s: Store) => (id: string) => s.players.get(id);
const top = (s: Store, kind: 'win' | 'mult', period: 'week' | 'all') => s.board.top(kind, period, names(s));
/** A clock to move by hand, starting mid-week. */
const clockAt = (iso: string) => {
  const c = { t: Z(iso) };
  return { c, store: new Store({ now: () => c.t }) };
};

describe('the week: Monday 00:00 in US Eastern, daylight saving and all', () => {
  it('turns over at midnight EDT (04:00 UTC) in October', () => {
    expect(weekStartET(Z('2026-10-26T03:59:59Z'))).toBe(Z('2026-10-19T04:00:00Z'));
    expect(weekStartET(Z('2026-10-26T04:00:00Z'))).toBe(Z('2026-10-26T04:00:00Z'));
    expect(weekStartET(Z('2026-10-27T15:00:00Z'))).toBe(Z('2026-10-26T04:00:00Z'));
  });

  it('turns over at midnight EST (05:00 UTC) once the clocks go back, in the week that has 25 hours', () => {
    // Clocks went back on Sunday 1 Nov 2026: that week is a hour longer.
    expect(weekStartET(Z('2026-11-02T04:59:59Z'))).toBe(Z('2026-10-26T04:00:00Z'));
    expect(weekStartET(Z('2026-11-02T05:00:00Z'))).toBe(Z('2026-11-02T05:00:00Z'));
    expect(weekEndET(Z('2026-10-26T04:00:00Z'))).toBe(Z('2026-11-02T05:00:00Z'));
  });

  it('and when they go forward, a week that is an hour short', () => {
    expect(weekStartET(Z('2026-03-09T03:59:59Z'))).toBe(Z('2026-03-02T05:00:00Z'));
    expect(weekStartET(Z('2026-03-09T04:00:00Z'))).toBe(Z('2026-03-09T04:00:00Z'));
    expect(weekEndET(Z('2026-03-02T05:00:00Z'))).toBe(Z('2026-03-09T04:00:00Z'));
  });

  it('puts a Sunday evening in Eastern, which is already Monday in UTC, in the old week', () => {
    // Sunday 25 Oct 2026, 23:30 EDT = Monday 03:30 UTC.
    expect(weekStartET(Z('2026-10-26T03:30:00Z'))).toBe(Z('2026-10-19T04:00:00Z'));
  });
});

describe('what counts, and who', () => {
  it('records a win from any game through the store, and not a loss, a refund, an even cash-out or a payout under the bet', () => {
    const { store: s } = clockAt('2026-10-27T15:00:00Z');
    const p = make(s, 'Winner');
    // Lost.
    s.stake(p, 'rocket', 100);
    s.lose(p, 'rocket');
    // A bet that never started is given back.
    s.stake(p, 'mines', 100);
    s.giveBack(p, 'mines');
    // Cashed out at exactly 1x, and at less than 1x: nothing gained.
    s.stake(p, 'crossing', 100);
    s.win(p, 'crossing', 1);
    s.instant(p, 'slots', 100, 0.5);
    s.instant(p, 'plinko', 100, 0);
    expect(top(s, 'win', 'all')).toEqual([]);
    expect(top(s, 'mult', 'week')).toEqual([]);
    // A real win through each of the settle paths.
    s.stake(p, 'rocket', 100);
    s.win(p, 'rocket', 2.5);
    expect(top(s, 'win', 'all')).toMatchObject([{ rank: 1, who: p.id, name: 'Winner', game: 'rocket', bet: 100, won: 250, mult: 2.5 }]);
  });

  it('counts the multiplier the game paid, to the hundredth, and the coins that came back', () => {
    const { store: s } = clockAt('2026-10-27T15:00:00Z');
    const p = make(s, 'Exact');
    s.instant(p, 'slots', 20, 137.0049);
    const [row] = top(s, 'mult', 'all');
    expect(row).toMatchObject({ game: 'slots', bet: 20, mult: 137, won: Math.floor(20 * 137.0049) });
  });

  it('keeps one entry per player on each board: their best, and the two boards can hold different spins', () => {
    const { store: s } = clockAt('2026-10-27T15:00:00Z');
    const p = make(s, 'Twice');
    const q = make(s, 'Other');
    s.instant(p, 'plinko', 1000, 2); // won 2,000, 2x
    s.instant(p, 'slots', 10, 50); // won 500, 50x
    s.instant(p, 'plinko', 1000, 1.5); // won 1,500: worse on both
    s.instant(q, 'plinko', 10, 5); // 50 coins, 5x
    expect(top(s, 'win', 'all').map((r) => [r.name, r.won, r.game])).toEqual([['Twice', 2000, 'plinko'], ['Other', 50, 'plinko']]);
    expect(top(s, 'mult', 'all').map((r) => [r.name, r.mult, r.game])).toEqual([['Twice', 50, 'slots'], ['Other', 5, 'plinko']]);
    expect(s.board.mine(p.id, names(s)).win.week?.rank).toBe(1);
    expect(s.board.mine(q.id, names(s)).mult.all?.rank).toBe(2);
  });

  it('breaks a tie by who got there first, and a repeat of the same value does not take the place', () => {
    const { c, store: s } = clockAt('2026-10-27T15:00:00Z');
    const a = make(s, 'First');
    const b = make(s, 'Second');
    s.instant(a, 'plinko', 100, 3);
    c.t += 1000;
    s.instant(b, 'plinko', 100, 3);
    c.t += 1000;
    s.instant(a, 'plinko', 100, 3); // again, same value: it stays where it was
    expect(top(s, 'win', 'all').map((r) => r.name)).toEqual(['First', 'Second']);
    expect(top(s, 'win', 'all')[0].at).toBe(Z('2026-10-27T15:00:00Z'));
    // A tie at the same millisecond still goes to whoever settled first.
    const x = make(s, 'Ex');
    const y = make(s, 'Why');
    s.instant(y, 'slots', 10, 9);
    s.instant(x, 'slots', 10, 9);
    expect(top(s, 'mult', 'all').slice(0, 2).map((r) => r.name)).toEqual(['Why', 'Ex']);
  });

  it('has only real players on it: the cast plays all game and never appears', { timeout: 60_000 }, () => {
    const w = world({ clients: 1 });
    const games = [new RocketGame(w.env), new PlinkoGame(w.env), new SlotsGame(w.env)];
    const real = w.player('Only Me');
    w.advance(games, w.clock.t + 40 * 60_000);
    expect(w.of('slots.big').length).toBeGreaterThan(0); // the cast did brag
    expect(w.of('board')).toEqual([]);
    expect(top(w.store, 'win', 'all')).toEqual([]);
    w.store.instant(real, 'plinko', 10, 10);
    const rows = [...top(w.store, 'win', 'all'), ...top(w.store, 'mult', 'all')];
    expect(rows.length).toBe(2);
    expect(rows.every((r) => w.store.players.has(r.who))).toBe(true);
  });

  it('shows a player by their name now, after a rename', () => {
    const { store: s } = clockAt('2026-10-27T15:00:00Z');
    const p = make(s, 'Old Name');
    s.instant(p, 'plinko', 10, 4);
    expect(top(s, 'win', 'all')[0].name).toBe('Old Name');
    s.rename(p, 'New Name');
    expect(top(s, 'win', 'all')[0].name).toBe('New Name');
    expect(s.board.mine(p.id, names(s)).mult.week?.name).toBe('New Name');
  });
});

describe('the weekly board turns over, the all-time one does not', () => {
  it('empties this week at Monday 00:00 Eastern and keeps all-time, and tells the sky', () => {
    // Sunday 25 Oct 2026, 23:59:50 EDT.
    const { c, store: s } = clockAt('2026-10-26T03:59:50Z');
    const told: string[] = [];
    s.onBoard = (ch) => told.push(...ch.map((x) => `${x.kind}.${x.period}`));
    const p = make(s, 'Night Owl');
    s.instant(p, 'plinko', 100, 5);
    expect(told.sort()).toEqual(['mult.all', 'mult.week', 'win.all', 'win.week']);
    expect(top(s, 'win', 'week').length).toBe(1);
    told.length = 0;
    // Midnight comes: the timer's tick says so, once, for the two weekly lists.
    expect(s.board.nextAt()).toBe(Z('2026-10-26T04:00:00Z'));
    c.t = Z('2026-10-26T03:59:59.999Z');
    expect(s.board.tick()).toEqual([]);
    c.t = Z('2026-10-26T04:00:00Z');
    expect(s.board.tick().map((x) => `${x.kind}.${x.period}`).sort()).toEqual(['mult.week', 'win.week']);
    expect(s.board.tick()).toEqual([]);
    expect(top(s, 'win', 'week')).toEqual([]);
    expect(top(s, 'mult', 'week')).toEqual([]);
    expect(top(s, 'win', 'all').length).toBe(1);
    expect(s.board.mine(p.id, names(s)).win.week).toBeNull();
    expect(s.board.mine(p.id, names(s)).win.all?.won).toBe(500);
    expect(s.board.nextAt()).toBe(Z('2026-11-02T05:00:00Z'));
    // The first win of the new week starts it afresh, even a smaller one than last week's.
    s.instant(p, 'plinko', 10, 2);
    expect(top(s, 'win', 'week').map((r) => r.won)).toEqual([20]);
    expect(top(s, 'win', 'all').map((r) => r.won)).toEqual([500]);
  });

  it('turns over on a payout that arrives first, even with nobody listening for the clock', () => {
    const { c, store: s } = clockAt('2026-10-27T15:00:00Z');
    const p = make(s, 'Lazy');
    s.instant(p, 'plinko', 100, 3);
    c.t = Z('2026-11-02T05:00:00Z');
    s.instant(p, 'plinko', 10, 2);
    expect(top(s, 'win', 'week').map((r) => r.won)).toEqual([20]);
  });
});

describe('the board is kept with the wallets', () => {
  it('survives a restart: the same rankings, ties and all, and carries on after it', async () => {
    const d = dir();
    const file = join(d, 'wallets.json');
    const c = { t: Z('2026-10-27T15:00:00Z') };
    const s = new Store({ file, saveDelayMs: 5, now: () => c.t });
    const a = make(s, 'Alpha');
    const b = make(s, 'Bravo');
    const k = make(s, 'Charlie');
    s.instant(a, 'plinko', 100, 3);
    c.t += 5;
    s.instant(b, 'slots', 100, 3);
    c.t += 5;
    s.instant(k, 'plinko', 10, 90);
    await s.flush();
    const t = new Store({ file, now: () => c.t });
    t.load();
    expect(top(t, 'win', 'all')).toEqual(top(s, 'win', 'all'));
    expect(top(t, 'mult', 'week')).toEqual(top(s, 'mult', 'week'));
    // Alpha and Bravo tied at 300 coins: Alpha was first, and still is.
    expect(top(t, 'win', 'all').map((r) => r.name)).toEqual(['Charlie', 'Alpha', 'Bravo']);
    // And the order of arrival carries on: a new tie goes behind the old ones.
    const e = make(t, 'Echo');
    t.instant(e, 'plinko', 100, 3);
    const win = top(t, 'win', 'all').map((r) => r.name);
    expect(win.indexOf('Alpha')).toBeLessThan(win.indexOf('Bravo'));
    expect(win.indexOf('Bravo')).toBeLessThan(win.indexOf('Echo'));
  });

  it('is in the same file as the wallets, bounded, with no secret in it', async () => {
    const d = dir();
    const file = join(d, 'wallets.json');
    const s = new Store({ file, saveDelayMs: 5 });
    const { player: p, secret } = (() => {
      const r = s.create('Filed');
      if (!r.ok) throw new Error(r.error);
      return r;
    })();
    s.instant(p, 'plinko', 10, 7);
    await s.flush();
    const text = readFileSync(file, 'utf8');
    expect(text).not.toContain(secret);
    const saved = JSON.parse(text);
    expect(saved.board.lists.win.all).toHaveLength(1);
    expect(saved.board.lists.win.all[0]).toMatchObject({ who: p.id, game: 'plinko', bet: 10, won: 70, mult: 7 });
  });

  it('drops last week from a file that was saved before the weekend, and keeps all-time', async () => {
    const d = dir();
    const file = join(d, 'wallets.json');
    const c = { t: Z('2026-10-22T15:00:00Z') };
    const s = new Store({ file, saveDelayMs: 5, now: () => c.t });
    const p = make(s, 'Oldtimer');
    s.instant(p, 'plinko', 10, 7);
    await s.flush();
    c.t = Z('2026-10-27T15:00:00Z'); // the server was off over Monday
    const t = new Store({ file, now: () => c.t });
    t.load();
    expect(top(t, 'win', 'week')).toEqual([]);
    expect(top(t, 'win', 'all').map((r) => r.won)).toEqual([70]);
  });

  it('shrugs off a damaged or hand-edited board, and a file from before there was one', () => {
    const d = dir();
    const file = join(d, 'wallets.json');
    const base = { players: [{ id: 'a', name: 'A', secretHash: 'h', coins: 5, stats: {}, stakes: {} }] };
    for (const board of [undefined, null, 5, 'x', { lists: 3 }, { lists: { win: { all: 'nope', week: [null, 4, { who: 1 }] } } }, { lists: { win: { all: [{ who: 'a', game: 'plinko', bet: 10, won: 5, mult: 0.5, at: 1, seq: 1 }] } } }]) {
      writeFileSync(file, JSON.stringify({ ...base, board }));
      const s = new Store({ file });
      s.load();
      expect(s.players.size).toBe(1);
      expect(top(s, 'win', 'all')).toEqual([]);
    }
  });

  it('is bounded: only the best few hundred of each list are kept', () => {
    const b = new Board(() => Z('2026-10-27T15:00:00Z'));
    const who = (id: string) => ({ name: id, emoji: '🐸' });
    for (let i = 1; i <= BOARD_KEEP + 100; i++) b.record(`p${i}`, 'plinko', 10, 10 + i, 1 + i / 100);
    const saved = b.save() as { lists: Record<string, Record<string, unknown[]>> };
    expect(saved.lists.win.all).toHaveLength(BOARD_KEEP);
    expect(saved.lists.mult.week).toHaveLength(BOARD_KEEP);
    expect(b.top('win', 'all', who)).toHaveLength(BOARD_TOP);
    expect(b.top('win', 'all', who)[0].who).toBe(`p${BOARD_KEEP + 100}`);
    expect(b.mine('p1', who).win.all).toBeNull(); // too far down to have a rank
    expect(b.mine(`p${BOARD_KEEP + 100 - 14}`, who).win.all?.rank).toBe(15);
  });
});

describe('telling the sky', () => {
  it('says so when the top ten changes, and not when only the places below it do', () => {
    const { c, store: s } = clockAt('2026-10-27T15:00:00Z');
    const told: unknown[] = [];
    s.onBoard = (ch) => told.push(ch.map((x) => `${x.kind}.${x.period}`));
    const ps = Array.from({ length: 12 }, (_, i) => make(s, `P${i}`));
    ps.slice(0, 10).forEach((p, i) => {
      c.t += 1;
      s.instant(p, 'plinko', 100, 10 + i);
    });
    expect(told.length).toBe(10);
    told.length = 0;
    // The eleventh player's win lands outside the top ten on both boards: nothing to say.
    s.instant(ps[10], 'plinko', 100, 2);
    expect(told).toEqual([]);
    expect(s.board.mine(ps[10].id, names(s)).win.all?.rank).toBe(11);
    // But one that lands inside it does, for every list it moved.
    s.instant(ps[11], 'plinko', 100, 100);
    expect(told.length).toBe(1);
    expect((told[0] as string[]).sort()).toEqual(['mult.all', 'mult.week', 'win.all', 'win.week']);
    expect(top(s, 'win', 'all')[0].name).toBe('P11');
  });
});
