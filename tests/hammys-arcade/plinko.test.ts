import { describe, expect, it } from 'vitest';
import { binOdds, plinkoReturn, plinkoTable } from '../../games/hammygotchi/src/plinko';
import { plinkoPathOf, plinkoResult } from '../../games/hammys-arcade/shared/derive';
import { verifySeed } from '../../games/hammys-arcade/shared/fair';
import { PLINKO_EPOCH_DROPS, START_COINS } from '../../games/hammys-arcade/shared/protocol';
import { PlinkoGame } from '../../games/hammys-arcade/server/plinko';
import { world } from './harness';

describe('Poop Plinko server: the shared board', () => {
  it('rolls the drop on the server from the committed seed, pays it at once and broadcasts it', () => {
    const w = world();
    const g = new PlinkoGame(w.env);
    const hash = g.snapshot().hash;
    const p = w.player('Dropper');
    const r = g.handle('drop', p, { amount: 100, rows: 12, risk: 'medium' });
    expect(r?.ok).toBe(true);
    const d = (r as any).drop;
    expect(d).toMatchObject({ n: 1, who: p.id, name: 'Dropper', rows: 12, risk: 'medium', bet: 100, real: true });
    expect(d.path).toMatch(/^[01]{12}$/);
    expect(d.bin).toBe([...d.path].filter((c) => c === '1').length);
    expect(d.mult).toBe(plinkoTable(12, 'medium')[d.bin]);
    expect(p.coins).toBe(START_COINS - 100 + Math.floor(100 * d.mult));
    expect((r as any).won).toBe(Math.floor(100 * d.mult));
    expect(w.of('plinko.drop')[0].drop).toEqual(d);
    expect(p.stats.arcade.plinko.rounds).toBe(1);
    // Under the committed seed: anyone can recompute it once the seed is out.
    expect(hash).toBe(g.snapshot().hash);
    expect(plinkoPathOf(w.given[0], 1, 12).map((b) => (b ? '1' : '0')).join('')).toBe(d.path);
  });

  it('validates: whole-coin bets you have, the rows and risks the game has', () => {
    const w = world();
    const g = new PlinkoGame(w.env);
    const p = w.player('Picky');
    expect(g.handle('drop', p, { amount: 0, rows: 12, risk: 'low' })).toMatchObject({ error: 'amount' });
    expect(g.handle('drop', p, { amount: 1.5, rows: 12, risk: 'low' })).toMatchObject({ error: 'amount' });
    expect(g.handle('drop', p, { amount: START_COINS + 1, rows: 12, risk: 'low' })).toMatchObject({ error: 'coins' });
    expect(g.handle('drop', p, { amount: 5, rows: 10, risk: 'low' })).toMatchObject({ error: 'bad_request' });
    expect(g.handle('drop', p, { amount: 5, rows: 12, risk: 'insane' })).toMatchObject({ error: 'bad_request' });
    expect(p.coins).toBe(START_COINS);
    expect(w.of('plinko.drop').length).toBe(0);
  });

  it('rate-limits drops per player: a burst of five, then two and a half a second', () => {
    const w = world();
    const g = new PlinkoGame(w.env);
    const p = w.player('Spammer');
    const q = w.player('Other');
    const ok = Array.from({ length: 8 }, () => g.handle('drop', p, { amount: 1, rows: 8, risk: 'low' })?.ok);
    expect(ok.filter(Boolean).length).toBe(5);
    expect(g.handle('drop', p, { amount: 1, rows: 8, risk: 'low' })).toMatchObject({ error: 'rate' });
    expect(g.handle('drop', q, { amount: 1, rows: 8, risk: 'low' })?.ok).toBe(true);
    w.clock.t += 1000;
    expect(g.handle('drop', p, { amount: 1, rows: 8, risk: 'low' })?.ok).toBe(true);
    expect(g.handle('drop', p, { amount: 1, rows: 8, risk: 'low' })?.ok).toBe(true);
    expect(g.handle('drop', p, { amount: 1, rows: 8, risk: 'low' })?.ok).toBe(false);
  });

  it('rotates the seed after a while, revealing the old one: every drop in it can be checked', () => {
    const w = world();
    const g = new PlinkoGame(w.env);
    const p = w.player('Whale');
    p.coins = 1e9;
    const hash1 = g.snapshot().hash;
    for (let i = 0; i < PLINKO_EPOCH_DROPS + 5; i++) {
      w.clock.t += 500;
      g.handle('drop', p, { amount: 10, rows: 8, risk: 'low' });
    }
    const reveal = w.of('plinko.reveal')[0];
    expect(reveal).toMatchObject({ epoch: 1, hash: hash1, first: 1, last: PLINKO_EPOCH_DROPS });
    expect(verifySeed(reveal.seed, hash1)).toBe(true);
    for (const e of w.of('plinko.drop').slice(0, PLINKO_EPOCH_DROPS)) {
      const d = e.drop;
      const path = plinkoPathOf(reveal.seed, d.n, d.rows);
      expect(path.map((b) => (b ? '1' : '0')).join('')).toBe(d.path);
      expect(plinkoResult(path, d.rows, d.risk)).toEqual({ bin: d.bin, mult: d.mult });
    }
    // The new epoch has a new hash, published before its first drop.
    const epoch = w.of('plinko.epoch')[0];
    expect(epoch).toMatchObject({ epoch: 2, first: PLINKO_EPOCH_DROPS + 1 });
    expect(epoch.hash).not.toBe(hash1);
    expect(g.snapshot().hash).toBe(epoch.hash);
  });

  it('lands in the toilets with the binomial odds, and pays back about 99% (fixed seed)', () => {
    const seed = 'f00dcafe'.repeat(8);
    for (const [rows, risk] of [[8, 'low'], [12, 'medium'], [16, 'high']] as const) {
      const odds = binOdds(rows);
      const hits = new Array(rows + 1).fill(0);
      const N = 4000;
      let total = 0;
      for (let n = 1; n <= N; n++) {
        const { bin, mult } = plinkoResult(plinkoPathOf(seed, n, rows), rows, risk);
        hits[bin]++;
        total += mult;
      }
      // Each toilet within 4 standard deviations of its expected share.
      hits.forEach((h, i) => {
        const sd = Math.sqrt(N * odds[i] * (1 - odds[i]));
        expect(Math.abs(h - N * odds[i])).toBeLessThanOrEqual(4 * sd + 1);
      });
      expect(plinkoReturn(rows, risk)).toBeGreaterThan(0.97);
      expect(plinkoReturn(rows, risk)).toBeLessThan(1);
      if (rows !== 16) expect(total / N).toBeGreaterThan(0.9);
    }
    // And the same seed always gives the same drop.
    expect(plinkoPathOf(seed, 7, 12)).toEqual(plinkoPathOf(seed, 7, 12));
    expect(plinkoPathOf(seed, 7, 12)).not.toEqual(plinkoPathOf(seed, 8, 12));
  });

  it('the cast drops one now and then, only while somebody is connected and it is quiet', () => {
    const w = world({ clients: 0 });
    const g = new PlinkoGame(w.env);
    w.advance([g], w.clock.t + 60_000);
    expect(w.of('plinko.drop').length).toBe(0);
    w.clients.n = 1;
    g.clientsChanged();
    w.advance([g], w.clock.t + 60_000);
    const bots = w.of('plinko.drop');
    expect(bots.length).toBeGreaterThan(5);
    expect(bots.every((e) => e.drop.real === false && e.drop.who.startsWith('b'))).toBe(true);
    // Busy board: real players dropping, so the cast keeps quiet.
    const p = w.player('Busy');
    const before = w.of('plinko.drop').length;
    for (let i = 0; i < 20; i++) {
      w.advance([g], w.clock.t + 500);
      g.handle('drop', p, { amount: 1, rows: 8, risk: 'low' });
    }
    const during = w.of('plinko.drop').slice(before);
    expect(during.filter((e) => !e.drop.real).length).toBeLessThanOrEqual(2);
  });
});
