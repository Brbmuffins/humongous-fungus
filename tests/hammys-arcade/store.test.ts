import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIN_BET } from '../../games/hammygotchi/src/arcade';
import { MAX_COINS, START_COINS, TOP_UP_COINS } from '../../games/hammys-arcade/shared/protocol';
import { Buckets } from '../../games/hammys-arcade/server/limits';
import { Store, hashSecret } from '../../games/hammys-arcade/server/store';

const dir = () => mkdtempSync(join(tmpdir(), 'arcade-store-'));
const make = (s: Store, name = 'Tester') => {
  const r = s.create(name);
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe('wallets on the server', () => {
  it('starts a player on 1,000 coins with a secret that is shown once and stored only as a hash', () => {
    const s = new Store();
    const { player, secret } = make(s);
    expect(player.coins).toBe(START_COINS);
    expect(secret.length).toBeGreaterThan(20);
    expect(s.auth(secret)).toBe(player);
    expect(s.auth(secret + 'x')).toBeNull();
    expect(s.auth(undefined)).toBeNull();
    expect(s.auth('short')).toBeNull();
    expect(player.secretHash).toBe(hashSecret(secret));
    expect(JSON.stringify(s.me(player))).not.toContain(secret);
    expect(JSON.stringify(s.me(player))).not.toContain(player.secretHash);
  });

  it('keeps bets within MIN_BET..coins, whole coins only, and holds a stake until the round settles', () => {
    const s = new Store();
    const { player: p } = make(s);
    expect(s.stake(p, 'rocket', 0)).toBe(false);
    expect(s.stake(p, 'rocket', MIN_BET - 1)).toBe(false);
    expect(s.stake(p, 'rocket', 1.5)).toBe(false);
    expect(s.stake(p, 'rocket', START_COINS + 1)).toBe(false);
    expect(s.stake(p, 'rocket', Number.NaN)).toBe(false);
    expect(s.stake(p, 'rocket', START_COINS)).toBe(true);
    expect(p.coins).toBe(0);
    expect(s.stake(p, 'rocket', 1)).toBe(false);
    expect(s.win(p, 'rocket', 2.5)).toBe(2500);
    expect(p.coins).toBe(2500);
    expect(s.win(p, 'rocket', 2.5)).toBe(0);
    expect(p.coins).toBe(2500);
  });

  it('never lets a wallet go past the cap', () => {
    const s = new Store();
    const { player: p } = make(s);
    p.coins = MAX_COINS - 10;
    expect(s.stake(p, 'mines', MAX_COINS - 10)).toBe(true);
    s.win(p, 'mines', 1_000_000);
    expect(p.coins).toBe(MAX_COINS);
  });

  it('gives the free top-up of 500 only when broke and nothing is riding', () => {
    const s = new Store();
    const { player: p } = make(s);
    expect(s.topUp(p)).toBe(0);
    s.stake(p, 'rocket', START_COINS);
    expect(p.coins).toBe(0);
    // Out of coins but 1,000 are still riding on a flight: no top-up yet.
    expect(s.topUp(p)).toBe(0);
    s.lose(p, 'rocket');
    expect(s.topUp(p)).toBe(TOP_UP_COINS);
    expect(p.coins).toBe(TOP_UP_COINS);
    expect(p.topUps).toBe(1);
    expect(s.topUp(p)).toBe(0);
    p.coins = MIN_BET - 1;
    expect(s.topUp(p)).toBe(TOP_UP_COINS);
  });

  it('refunds a taken-back stake as if never placed, and an instant bet pays at once', () => {
    const s = new Store();
    const { player: p } = make(s);
    s.stake(p, 'crossing', 300);
    s.giveBack(p, 'crossing');
    expect(p.coins).toBe(START_COINS);
    expect(p.stats.arcade.crossing).toMatchObject({ rounds: 0, net: 0 });
    expect(s.instant(p, 'plinko', 100, 3)).toBe(300);
    expect(p.coins).toBe(START_COINS + 200);
    expect(s.instant(p, 'plinko', START_COINS * 5, 3)).toBeNull();
    expect(p.stats.arcade.plinko).toMatchObject({ rounds: 1, net: 200, best: 3 });
  });

  it('names: unique-ish with #digits on a clash, renames keep coins, blocked and bad ones are refused', () => {
    const s = new Store();
    const a = make(s, 'Hammy Fan').player;
    const b = make(s, 'hammy fan').player;
    expect(a.name).toBe('Hammy Fan');
    expect(b.name).toMatch(/^hammy fan#\d{3,4}$/);
    expect(make(s, 'Hammy Fan').player.name).toMatch(/^Hammy Fan#\d{3,4}$/);
    a.coins = 4242;
    expect(s.rename(a, 'Renamed')).toEqual({ ok: true, name: 'Renamed' });
    expect(a.coins).toBe(4242);
    expect(make(s, 'Hammy Fan').player.name).toBe('Hammy Fan');
    expect(s.rename(b, 'x')).toMatchObject({ ok: false });
    expect(s.create('<script>')).toMatchObject({ ok: false, error: 'name_chars' });
    expect(s.create('')).toMatchObject({ ok: false, error: 'name_length' });
    // Renaming to your own name in another case is fine.
    expect(s.rename(a, 'RENAMED')).toEqual({ ok: true, name: 'RENAMED' });
  });

  it('saves and loads: coins, stats, names and secrets survive, the secret itself is never on disk', async () => {
    const d = dir();
    const file = join(d, 'wallets.json');
    const s = new Store({ file, saveDelayMs: 5 });
    const { player: p, secret } = make(s, 'Persistent');
    s.stake(p, 'rocket', 100);
    s.win(p, 'rocket', 3);
    s.instant(p, 'plinko', 50, 0.5);
    p.topUps = 2;
    await s.flush();
    const text = readFileSync(file, 'utf8');
    expect(text).not.toContain(secret);
    const t = new Store({ file });
    expect(t.load()).toMatchObject({ players: 1, refunded: 0 });
    const q = t.auth(secret)!;
    expect(q.id).toBe(p.id);
    expect(q.name).toBe('Persistent');
    expect(q.coins).toBe(p.coins);
    expect(q.topUps).toBe(2);
    expect(q.stats.arcade).toEqual(p.stats.arcade);
    expect(q.emoji).toBe(p.emoji);
  });

  it('debounces saves and replaces the file atomically (no half-written file, no leftovers)', async () => {
    const d = dir();
    const file = join(d, 'wallets.json');
    const s = new Store({ file, saveDelayMs: 20 });
    const { player: p } = make(s);
    for (let i = 0; i < 50; i++) s.stake(p, 'rocket', 1), s.lose(p, 'rocket');
    await new Promise((r) => setTimeout(r, 120));
    expect(JSON.parse(readFileSync(file, 'utf8')).players[0].coins).toBe(START_COINS - 50);
    const { readdirSync } = await import('node:fs');
    expect(readdirSync(d)).toEqual(['wallets.json']);
    p.coins = 7;
    s.flushSync();
    expect(JSON.parse(readFileSync(file, 'utf8')).players[0].coins).toBe(7);
    expect(readdirSync(d)).toEqual(['wallets.json']);
  });

  it('gives back the stake of a round a restart cut short', async () => {
    const d = dir();
    const file = join(d, 'wallets.json');
    const s = new Store({ file });
    const { player: p, secret } = make(s);
    s.stake(p, 'rocket', 300);
    s.stake(p, 'mines', 200);
    s.flushSync();
    const t = new Store({ file });
    expect(t.load().refunded).toBe(500);
    const q = t.auth(secret)!;
    expect(q.coins).toBe(START_COINS);
    expect(q.stakes).toEqual({});
    expect(q.stats.arcade.rocket.rounds).toBe(0);
  });

  it('starts empty, and keeps a damaged file aside instead of overwriting it', () => {
    const d = dir();
    const file = join(d, 'wallets.json');
    writeFileSync(file, '{not json');
    const s = new Store({ file });
    expect(s.load().players).toBe(0);
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    expect(readdirSync(d).some((f) => f.startsWith('wallets.json.damaged-'))).toBe(true);
  });

  it('survives hand-edited junk in the file', () => {
    const d = dir();
    const file = join(d, 'wallets.json');
    writeFileSync(file, JSON.stringify({ players: [{ id: 'a', name: 'A', secretHash: 'h', coins: -5, stats: { rocket: { rounds: 'x' } }, stakes: { rocket: -3, mines: 'a' } }, { nope: 1 }, null] }));
    const s = new Store({ file });
    expect(s.load().players).toBe(1);
    const p = s.players.get('a')!;
    expect(p.coins).toBe(0);
    expect(p.stats.arcade.rocket.rounds).toBe(0);
    expect(p.stakes).toEqual({});
  });
});

describe('rate limits', () => {
  it('a token bucket: a burst, then a steady trickle, per key', () => {
    let t = 0;
    const b = new Buckets(3, 2, () => t);
    expect([b.take('a'), b.take('a'), b.take('a'), b.take('a')]).toEqual([true, true, true, false]);
    expect(b.take('b')).toBe(true);
    t += 500;
    expect(b.take('a')).toBe(true);
    expect(b.take('a')).toBe(false);
    t += 10_000;
    expect([b.take('a'), b.take('a'), b.take('a'), b.take('a')]).toEqual([true, true, true, false]);
    expect(b.wait('a')).toBeGreaterThanOrEqual(1);
  });

  it('forgets keys that have been idle', () => {
    let t = 0;
    const b = new Buckets(2, 1, () => t);
    for (let i = 0; i < 400; i++) b.take(`k${i}`);
    expect(b.size).toBe(400);
    t += 10 * 60_000;
    for (let i = 0; i < 100; i++) b.take('same');
    expect(b.size).toBeLessThan(10);
  });
});
