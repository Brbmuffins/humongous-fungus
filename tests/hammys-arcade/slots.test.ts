import { describe, expect, it } from 'vitest';
import { LINE_COUNT, MAX_UNITS, payMultiplier, spin, tierOf } from '../../games/hammygotchi/src/slots';
import { slotsSpinOf } from '../../games/hammys-arcade/shared/derive';
import { stream, verifySeed } from '../../games/hammys-arcade/shared/fair';
import { SLOTS_EPOCH_SPINS, START_COINS } from '../../games/hammys-arcade/shared/protocol';
import { BIG_AT, FEED, SlotsGame } from '../../games/hammys-arcade/server/slots';
import { seedsWhere, world } from './harness';

describe('Hammy Slots server: spins decided here', () => {
  it('rolls the spin from the committed seed, pays it at once, and tells nobody about an ordinary spin', () => {
    const w = world();
    const g = new SlotsGame(w.env);
    const hash = g.snapshot().hash;
    const p = w.player('Spinner');
    const r = g.handle('spin', p, { amount: 100 }) as any;
    expect(r.ok).toBe(true);
    // The very spin the committed seed gives for spin number 1, rules and all.
    expect(r.n).toBe(1);
    expect(r.spin).toEqual(slotsSpinOf(w.given[0], 1));
    expect(r.spin).toEqual(JSON.parse(JSON.stringify(spin(stream(w.given[0], 'slots:1')))));
    expect(r.won).toBe(Math.floor((100 * r.spin.units) / LINE_COUNT));
    expect(p.coins).toBe(START_COINS - 100 + r.won);
    expect(p.stats.arcade.slots.rounds).toBe(1);
    expect(p.stats.arcade.slots.net).toBe(r.won - 100);
    expect(g.snapshot().hash).toBe(hash);
    // Quiet: a spin that isn't a big win is not announced at all.
    if (r.spin.mult < BIG_AT) expect(w.events.length).toBe(0);
  });

  it('validates: whole coins, that you have', () => {
    const w = world();
    const g = new SlotsGame(w.env);
    const p = w.player('Picky');
    expect(g.handle('spin', p, { amount: 0 })).toMatchObject({ error: 'amount' });
    expect(g.handle('spin', p, { amount: 2.5 })).toMatchObject({ error: 'amount' });
    expect(g.handle('spin', p, { amount: '10' })).toMatchObject({ error: 'amount' });
    expect(g.handle('spin', p, { amount: START_COINS + 1 })).toMatchObject({ error: 'coins' });
    expect(g.handle('nonsense', p, { amount: 10 })).toBeNull();
    expect(p.coins).toBe(START_COINS);
    expect(p.stats.arcade.slots.rounds).toBe(0);
    // A refused spin doesn't use up a spin number.
    expect((g.handle('spin', p, { amount: 10 }) as any).n).toBe(1);
  });

  it('rate-limits spins per player like Plinko: a burst of five, then two and a half a second', () => {
    const w = world();
    const g = new SlotsGame(w.env);
    const p = w.player('Spammer');
    const q = w.player('Other');
    const ok = Array.from({ length: 8 }, () => g.handle('spin', p, { amount: 1 })?.ok);
    expect(ok.filter(Boolean).length).toBe(5);
    expect(g.handle('spin', p, { amount: 1 })).toMatchObject({ error: 'rate' });
    expect(g.handle('spin', q, { amount: 1 })?.ok).toBe(true);
    w.clock.t += 1000;
    expect(g.handle('spin', p, { amount: 1 })?.ok).toBe(true);
    expect(g.handle('spin', p, { amount: 1 })?.ok).toBe(true);
    expect(g.handle('spin', p, { amount: 1 })?.ok).toBe(false);
  });

  it('tells everyone about a big win, by name, and nothing else about the spins', () => {
    // Spin 1 under this seed is a BIG WIN (10x to under 50x).
    const w = world({ seed: seedsWhere((s) => { const m = slotsSpinOf(s, 1).mult; return m >= 10 && m < 50; }) });
    const g = new SlotsGame(w.env);
    const p = w.player('Lucky');
    const r = g.handle('spin', p, { amount: 20 }) as any;
    const win = w.of('slots.big')[0].win;
    expect(win).toMatchObject({ n: 1, who: p.id, name: 'Lucky', real: true, bet: 20, mult: r.spin.mult, tier: 'BIG WIN' });
    expect(tierOf(win.mult)?.label).toBe('BIG WIN');
    expect(g.snapshot().feed).toEqual([win]);
    // Only the win is said: no spin, no grid, no seed.
    expect(JSON.stringify(w.events)).not.toMatch(/"stops"|"grid"|"seed"/);
    expect(w.events.map((e) => e.name)).toEqual(['slots.big']);
    // It was paid as well as told.
    expect(p.coins).toBe(START_COINS - 20 + r.won);
  });

  it('only big wins are announced, across a lot of spins, and the feed is short', () => {
    const w = world();
    const g = new SlotsGame(w.env);
    const p = w.player('Whale');
    p.coins = 1e12;
    let bigs = 0;
    for (let i = 0; i < 400; i++) {
      w.clock.t += 500;
      const r = g.handle('spin', p, { amount: 10 }) as any;
      if (r.spin.mult >= BIG_AT) bigs++;
      // Not even the ones just under the line.
      if (r.spin.mult < BIG_AT) expect(w.of('slots.big').length).toBe(bigs);
    }
    expect(w.of('slots.big').length).toBe(bigs);
    expect(w.events.filter((e) => !['slots.big', 'slots.reveal', 'slots.epoch'].includes(e.name))).toEqual([]);
    expect(g.snapshot().feed.length).toBeLessThanOrEqual(FEED);
  });

  it('rotates the seed after a while, revealing the old one: every spin in it can be checked', () => {
    const w = world();
    const g = new SlotsGame(w.env);
    const p = w.player('Checker');
    p.coins = 1e12;
    const hash1 = g.snapshot().hash;
    const spins: any[] = [];
    for (let i = 0; i < SLOTS_EPOCH_SPINS + 5; i++) {
      w.clock.t += 500;
      spins.push(g.handle('spin', p, { amount: 10 }));
    }
    const reveal = w.of('slots.reveal')[0];
    expect(reveal).toMatchObject({ epoch: 1, hash: hash1, first: 1, last: SLOTS_EPOCH_SPINS });
    expect(verifySeed(reveal.seed, hash1)).toBe(true);
    for (const r of spins.slice(0, SLOTS_EPOCH_SPINS)) expect(slotsSpinOf(reveal.seed, r.n)).toEqual(r.spin);
    const epoch = w.of('slots.epoch')[0];
    expect(epoch).toMatchObject({ epoch: 2, first: SLOTS_EPOCH_SPINS + 1 });
    expect(epoch.hash).not.toBe(hash1);
    expect(g.snapshot().hash).toBe(epoch.hash);
    expect(spins[SLOTS_EPOCH_SPINS].spin).toEqual(slotsSpinOf(w.given[1], SLOTS_EPOCH_SPINS + 1));
  });

  it('is the same spin for the same seed and number, and a different one for the next number', () => {
    const seed = 'f00dcafe'.repeat(8);
    expect(slotsSpinOf(seed, 7)).toEqual(slotsSpinOf(seed, 7));
    expect(slotsSpinOf(seed, 7).stops).not.toEqual(slotsSpinOf(seed, 8).stops);
    for (let n = 1; n <= 300; n++) {
      const s = slotsSpinOf(seed, n);
      expect(s.units).toBeLessThanOrEqual(MAX_UNITS);
      expect(Number.isInteger(s.units)).toBe(true);
      // Whatever the spin, the coins are exactly what the rules say.
      expect(Math.floor(100 * payMultiplier(100, s.units))).toBe(Math.floor((100 * s.units) / LINE_COUNT));
    }
  });

  it('the cast brags about a big win now and then, only while somebody is connected and it is quiet', () => {
    const w = world({ clients: 0 });
    const g = new SlotsGame(w.env);
    w.advance([g], w.clock.t + 120_000);
    expect(w.of('slots.big').length).toBe(0);
    w.clients.n = 1;
    g.clientsChanged();
    w.advance([g], w.clock.t + 3_600_000);
    const bragged = w.of('slots.big');
    expect(bragged.length).toBeGreaterThan(2);
    expect(bragged.every((e) => e.win.real === false && e.win.who.startsWith('b') && e.win.mult >= BIG_AT && e.win.n === 0)).toBe(true);
    // Never two in a row within the quiet spell: this is a ticker, not a stream.
    for (let i = 1; i < bragged.length; i++) expect(bragged[i].win.at - bragged[i - 1].win.at).toBeGreaterThanOrEqual(20_000);
    // The cast's spins take no spin numbers, so players' spins are still the seed's own.
    const p = w.player('Real');
    expect((g.handle('spin', p, { amount: 10 }) as any).n).toBe(1);
  }, 60_000);
});
