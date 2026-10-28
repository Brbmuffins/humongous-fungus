import { describe, expect, it } from 'vitest';
import { floor2 } from '../../games/hammygotchi/src/arcade';
import { crashPoint, multiplierAt } from '../../games/hammygotchi/src/rocket';
import { causeOf, crashOf } from '../../games/hammys-arcade/shared/derive';
import { commit, rollAt, verifySeed } from '../../games/hammys-arcade/shared/fair';
import { ROCKET_BET_MS, ROCKET_PAUSE_MS, START_COINS } from '../../games/hammys-arcade/shared/protocol';
import { RocketGame, msTo } from '../../games/hammys-arcade/server/rocket';
import { T0, world } from './harness';

/** A seed source whose rounds crash where we want, found by looking. */
function seedsCrashing(where: (c: number) => boolean): () => string {
  let n = 0;
  return () => {
    for (;;) {
      const s = Buffer.from(`crash-hunt-${n++}`).toString('hex').padEnd(64, '0');
      if (where(crashOf(s))) return s;
    }
  };
}

const flight = (g: RocketGame, w: ReturnType<typeof world>) => {
  g.tick();
  const bet = w.of('rocket.betting')[0].round;
  return { id: bet.id as number, hash: bet.hash as string, flightAt: bet.flightAt as number };
};

describe('Fart Rocket server: the round', () => {
  it('opens a round when someone is connected, with the seed hash published and a 7 second betting window', () => {
    const w = world();
    const g = new RocketGame(w.env);
    expect(g.snapshot().round).toBeNull();
    g.tick();
    const r = w.of('rocket.betting')[0].round;
    expect(r.phase).toBe('bet');
    expect(r.flightAt - r.startedAt).toBe(ROCKET_BET_MS);
    expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.crash).toBeUndefined();
    expect(r.seed).toBeUndefined();
    expect(JSON.stringify(g.snapshot())).not.toContain('"seed"');
  });

  it('derives the crash from the seed with the game\'s own formula, and reveals a seed that matches the hash', () => {
    const w = world();
    const g = new RocketGame(w.env);
    const { hash, flightAt } = flight(g, w);
    w.advance([g], flightAt + 200_000);
    const crash = w.of('rocket.crash')[0];
    const reveal = w.of('rocket.reveal')[0];
    expect(reveal.hash).toBe(hash);
    expect(verifySeed(reveal.seed, hash)).toBe(true);
    expect(commit(reveal.seed)).toBe(hash);
    expect(crash.crash).toBe(crashPoint(rollAt(reveal.seed, 'crash', 0)));
    expect(crash.crash).toBe(crashOf(reveal.seed));
    expect(crash.cause).toBe(causeOf(reveal.seed, crash.crash));
    // The flight ends the first millisecond the multiplier has reached the crash point.
    expect(crash.at).toBe(flightAt + msTo(crash.crash));
    expect(multiplierAt((crash.at - flightAt) / 1000)).toBeGreaterThanOrEqual(crash.crash);
    expect(multiplierAt((crash.at - 1 - flightAt) / 1000)).toBeLessThan(crash.crash);
  });

  it('runs betting, flight, a pause, then the next round with a new seed', () => {
    const w = world();
    const g = new RocketGame(w.env);
    g.tick();
    w.advance([g], T0 + 400_000);
    const rounds = w.of('rocket.betting').map((e) => e.round);
    expect(rounds.length).toBeGreaterThan(2);
    expect(new Set(rounds.map((r) => r.hash)).size).toBe(rounds.length);
    const crashes = w.of('rocket.crash');
    // The next round opens ROCKET_PAUSE_MS after a crash.
    expect(rounds[1].startedAt).toBe(crashes[0].at + ROCKET_PAUSE_MS);
    expect(g.history[0]).toBe(crashes[crashes.length - 1].crash);
  });

  it('sleeps with nobody connected and wakes when someone comes', () => {
    const w = world({ clients: 0 });
    const g = new RocketGame(w.env);
    g.tick();
    expect(g.current).toBeNull();
    expect(g.nextAt()).toBeNull();
    w.clients.n = 1;
    g.clientsChanged();
    expect(g.current?.phase).toBe('bet');
    // Everyone leaves during betting with nothing riding: back to sleep.
    w.clients.n = 0;
    w.advance([g], T0 + 20_000);
    expect(g.current).toBeNull();
  });

  it('finishes a flight that has bets on it even when everyone leaves', () => {
    const w = world();
    const g = new RocketGame(w.env);
    const p = w.player('Leaver');
    g.tick();
    expect(g.handle('bet', p, { amount: 100, auto: 1.2 })?.ok).toBe(true);
    w.clients.n = 0;
    w.advance([g], T0 + 600_000);
    expect(w.of('rocket.crash').length).toBeGreaterThan(0);
    expect(p.stakes.rocket).toBeUndefined();
    // After it ends with nobody there, it goes idle.
    expect(g.current).toBeNull();
  });
});

describe('Fart Rocket server: bets and bailing', () => {
  it('takes whole-coin bets inside the window, within the wallet, once a round', () => {
    const w = world();
    const g = new RocketGame(w.env);
    const p = w.player('Bettor');
    g.tick();
    expect(g.handle('bet', p, { amount: 0 })).toMatchObject({ ok: false, error: 'amount' });
    expect(g.handle('bet', p, { amount: 2.5 })).toMatchObject({ ok: false, error: 'amount' });
    expect(g.handle('bet', p, { amount: '10' })).toMatchObject({ ok: false, error: 'amount' });
    expect(g.handle('bet', p, { amount: -5 })).toMatchObject({ ok: false, error: 'amount' });
    expect(g.handle('bet', p, { amount: START_COINS + 1 })).toMatchObject({ ok: false, error: 'coins' });
    expect(g.handle('bet', p, { amount: 10, auto: 1 })).toMatchObject({ ok: false, error: 'bad_request' });
    expect(p.coins).toBe(START_COINS);
    expect(g.handle('bet', p, { amount: 250 })?.ok).toBe(true);
    expect(p.coins).toBe(START_COINS - 250);
    expect(g.handle('bet', p, { amount: 10 })).toMatchObject({ ok: false, error: 'already' });
    expect(p.stats.arcade.rocket).toMatchObject({ rounds: 1, net: -250 });
  });

  it('closes betting at the launch, to the millisecond', () => {
    const w = world();
    const g = new RocketGame(w.env);
    const p = w.player('Late');
    const { flightAt } = flight(g, w);
    w.clock.t = flightAt - 1;
    expect(g.handle('bet', p, { amount: 10 })?.ok).toBe(true);
    const q = w.player('Later');
    w.clock.t = flightAt;
    expect(g.handle('bet', q, { amount: 10 })).toMatchObject({ ok: false, error: 'closed' });
  });

  it('takes a bet back during betting, and only then', () => {
    const w = world();
    const g = new RocketGame(w.env);
    const p = w.player('Fickle');
    const { flightAt } = flight(g, w);
    expect(g.handle('unbet', p, {})).toMatchObject({ ok: false, error: 'not_in' });
    g.handle('bet', p, { amount: 400 });
    expect(g.handle('unbet', p, {})?.ok).toBe(true);
    expect(p.coins).toBe(START_COINS);
    expect(p.stats.arcade.rocket.rounds).toBe(0);
    g.handle('bet', p, { amount: 400 });
    w.advance([g], flightAt + 1);
    expect(g.handle('unbet', p, {})).toMatchObject({ ok: false });
  });

  it('bails at the multiplier of the server clock when the request arrives, and pays floor(bet x that)', () => {
    const w = world({ seed: seedsCrashing((c) => c > 6) });
    const g = new RocketGame(w.env);
    const p = w.player('Pilot');
    const { flightAt } = flight(g, w);
    g.handle('bet', p, { amount: 333 });
    w.advance([g], flightAt + 12_345);
    const r = g.handle('bail', p, {});
    const mult = floor2(multiplierAt(12.345));
    expect(r).toMatchObject({ ok: true, mult, won: Math.floor(333 * mult) });
    expect(p.coins).toBe(START_COINS - 333 + Math.floor(333 * mult));
    expect(p.stakes.rocket).toBeUndefined();
    expect(p.stats.arcade.rocket.best).toBe(mult);
    expect(w.of('rocket.bail').find((e) => e.id === p.id)).toMatchObject({ mult });
    expect(g.handle('bail', p, {})).toMatchObject({ ok: false, error: 'already' });
  });

  it('rejects a bail that arrives at or after the crash, and the stake is lost', () => {
    const w = world({ seed: seedsCrashing((c) => c > 1.5 && c < 3) });
    const g = new RocketGame(w.env);
    const p = w.player('TooSlow');
    const { flightAt } = flight(g, w);
    g.handle('bet', p, { amount: 100 });
    const crashAt = flightAt + msTo(crashOf(w.given[0]));
    // One millisecond before the crash: still a bail.
    w.advance([g], crashAt - 1);
    const q = w.player('JustInTime');
    expect(g.handle('bail', q, {})).toMatchObject({ ok: false, error: 'not_in' });
    w.clock.t = crashAt;
    expect(g.handle('bail', p, {})).toMatchObject({ ok: false, error: 'late' });
    expect(p.coins).toBe(START_COINS - 100);
    expect(p.stakes.rocket).toBeUndefined();
    expect(p.stats.arcade.rocket).toMatchObject({ rounds: 1, net: -100 });
  });

  it('accepts a bail one millisecond before the crash', () => {
    const w = world({ seed: seedsCrashing((c) => c > 1.5 && c < 3) });
    const g = new RocketGame(w.env);
    const p = w.player('Nerves');
    const { flightAt } = flight(g, w);
    g.handle('bet', p, { amount: 100 });
    const crash = crashOf(w.given[0]);
    w.advance([g], flightAt + msTo(crash) - 1);
    const r = g.handle('bail', p, {});
    expect(r?.ok).toBe(true);
    expect(r && r.ok && (r.mult as number)).toBeLessThanOrEqual(crash);
    expect(r && r.ok && (r.mult as number)).toBeGreaterThan(1);
  });

  it('executes the auto bail-out on the server at exactly the target', () => {
    const w = world({ seed: seedsCrashing((c) => c > 4) });
    const g = new RocketGame(w.env);
    const p = w.player('Auto');
    const { flightAt } = flight(g, w);
    g.handle('bet', p, { amount: 200, auto: 2.5 });
    w.advance([g], flightAt + msTo(2.5) - 1);
    expect(p.stakes.rocket).toBe(200);
    w.advance([g], flightAt + msTo(2.5));
    expect(p.stakes.rocket).toBeUndefined();
    expect(p.coins).toBe(START_COINS - 200 + 500);
    expect(w.of('rocket.bail').find((e) => e.id === p.id)).toMatchObject({ mult: 2.5, at: flightAt + msTo(2.5) });
  });

  it('a target of 2.00 is exactly 2.00, not 1.99', () => {
    const w = world({ seed: seedsCrashing((c) => c > 3) });
    const g = new RocketGame(w.env);
    const p = w.player('Two');
    const { flightAt } = flight(g, w);
    g.handle('bet', p, { amount: 100, auto: 2 });
    w.advance([g], flightAt + 20_000);
    expect(p.coins).toBe(START_COINS + 100);
  });

  it('an auto bail-out at or above the crash point never fires: the bet is lost', () => {
    const w = world({ seed: seedsCrashing((c) => c > 1.2 && c < 2) });
    const g = new RocketGame(w.env);
    const p = w.player('Greedy');
    const { flightAt } = flight(g, w);
    g.handle('bet', p, { amount: 100, auto: 5 });
    w.advance([g], flightAt + 60_000);
    expect(p.coins).toBe(START_COINS - 100);
    expect(w.of('rocket.bail').some((e) => e.id === p.id)).toBe(false);
  });

  it('a crash at 1.00x ends the flight the moment it starts', () => {
    const w = world({ seed: seedsCrashing((c) => c === 1) });
    const g = new RocketGame(w.env);
    const p = w.player('Unlucky');
    const { flightAt } = flight(g, w);
    g.handle('bet', p, { amount: 100 });
    w.advance([g], flightAt);
    expect(w.of('rocket.crash')[0].crash).toBe(1);
    expect(p.coins).toBe(START_COINS - 100);
  });

  it('pays back about 99% over many rounds for a fixed cash-out target', () => {
    const w = world();
    const g = new RocketGame(w.env);
    const p = w.player('Whale');
    p.coins = 1e12;
    g.tick();
    let wagered = 0;
    for (let i = 0; i < 1500; i++) {
      const r = g.snapshot().round!;
      if (r.phase === 'bet') {
        g.handle('bet', p, { amount: 1000, auto: 2 });
        wagered += 1000;
      }
      w.advance([g], w.clock.t + 20_000);
    }
    const back = p.coins - 1e12 + wagered;
    expect(back / wagered).toBeGreaterThan(0.9);
    expect(back / wagered).toBeLessThan(1.08);
  });
});

describe('Fart Rocket server: the made-up riders', () => {
  it('fills the sky with 4 to 7 when it is quiet, the same for everyone, and never reveals their nerve', () => {
    const w = world();
    const g = new RocketGame(w.env);
    g.tick();
    const riders = w.of('rocket.betting')[0].round.riders;
    expect(riders.length).toBeGreaterThanOrEqual(4);
    expect(riders.length).toBeLessThanOrEqual(7);
    expect(riders.every((r: any) => r.real === false && r.out === null)).toBe(true);
    expect(JSON.stringify(riders)).not.toMatch(/target|auto/);
    expect(g.snapshot().round!.riders.map((r) => r.id)).toEqual(riders.map((r: any) => r.id));
  });

  it('step aside as real players join: never more riders than the cast was, and none left once there are enough real ones', () => {
    const w = world();
    const g = new RocketGame(w.env);
    g.tick();
    const cast = g.snapshot().round!.riders.length;
    const names: string[] = [];
    for (let i = 0; i < cast + 2; i++) {
      const p = w.player(`Real${i}`);
      names.push(p.id);
      g.handle('bet', p, { amount: 10 });
      const riders = g.snapshot().round!.riders;
      expect(riders.length).toBe(Math.max(cast, i + 1));
      expect(riders.filter((r) => r.real).length).toBe(i + 1);
    }
    expect(g.snapshot().round!.riders.some((r) => !r.real)).toBe(false);
    expect(w.of('rocket.left').length).toBe(cast);
  });

  it('bail on the server, at their nerve, and are seen by everyone at the same multiplier', () => {
    const w = world({ seed: seedsCrashing((c) => c > 30) });
    const g = new RocketGame(w.env);
    const { flightAt } = flight(g, w);
    w.advance([g], flightAt + 60_000);
    const bails = w.of('rocket.bail');
    expect(bails.length).toBeGreaterThan(0);
    for (const b of bails) {
      expect(b.mult).toBeGreaterThanOrEqual(1.1);
      expect(b.at).toBeGreaterThanOrEqual(flightAt + msTo(b.mult) - 100);
      expect(b.at).toBeLessThanOrEqual(flightAt + msTo(b.mult) + 100);
    }
    // In time order.
    expect(bails.map((b) => b.at)).toEqual([...bails.map((b) => b.at)].sort((a, b) => a - b));
  });

  it('shutdown gives back riding coins', () => {
    const w = world();
    const g = new RocketGame(w.env);
    const p = w.player('Unlucky');
    g.tick();
    g.handle('bet', p, { amount: 400 });
    g.shutdown();
    expect(p.coins).toBe(START_COINS);
    expect(p.stakes.rocket).toBeUndefined();
    expect(p.stats.arcade.rocket.rounds).toBe(0);
  });
});
