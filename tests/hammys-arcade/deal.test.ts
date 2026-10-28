import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BOXES, PRIZES, ROUNDS } from '../../games/hammygotchi/src/deal';
import { dealLayoutOf } from '../../games/hammys-arcade/shared/derive';
import { commit, verifySeed } from '../../games/hammys-arcade/shared/fair';
import { DEAL_IDLE_MS, DEAL_REACTS, START_COINS } from '../../games/hammys-arcade/shared/protocol';
import { DealGame } from '../../games/hammys-arcade/server/deal';
import { Store, type Player } from '../../games/hammys-arcade/server/store';
import { T0, seeds, world, type World } from './harness';

const dirs: string[] = [];
const dir = () => {
  const d = mkdtempSync(join(tmpdir(), 'arcade-deal-'));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

type R = any;
const call = (g: DealGame, a: string, p: Player, body: Record<string, unknown> = {}): R => g.handle(a, p, body);

/** Open `n` boxes that are still shut (and aren't yours). */
function openSome(g: DealGame, p: Player, n: number, shut: Set<number>): R {
  let last: R;
  for (let i = 0; i < n; i++) {
    const box = [...shut][0];
    shut.delete(box);
    last = call(g, 'open', p, { box });
    expect(last.ok).toBe(true);
  }
  return last;
}

/** Play a whole round: pick box 0, open in order, decline every offer, then keep (or swap). */
function playOut(g: DealGame, p: Player, swap = false): R {
  expect(call(g, 'pick', p, { box: 0 }).ok).toBe(true);
  const shut = new Set(Array.from({ length: BOXES }, (_, i) => i).filter((i) => i !== 0));
  let r: R;
  for (let k = 0; k < ROUNDS.length; k++) {
    r = openSome(g, p, ROUNDS[k], shut);
    expect(r.table.phase).toBe('call');
    r = call(g, 'answer', p, { deal: false });
    expect(r.ok).toBe(true);
  }
  expect(r.table.phase).toBe('swap');
  return call(g, 'swap', p, { swap });
}

function setup(clients = 1): { w: World; g: DealGame; p: Player } {
  const w = world({ clients });
  const g = new DealGame(w.env);
  return { w, g, p: w.player('Boxer') };
}

describe('Pizza Boxes server: a round of it', () => {
  it('takes the stake, publishes the hash before any box is picked, and lays the boxes from the seed', () => {
    const { w, g, p } = setup();
    const r = call(g, 'bet', p, { amount: 100 });
    expect(r.ok).toBe(true);
    expect(p.coins).toBe(START_COINS - 100);
    expect(p.stakes.deal).toBe(100);
    expect(w.store.me(p).riding).toBe(true);
    expect(r.table).toMatchObject({ who: p.id, name: 'Boxer', bet: 100, phase: 'pick', mine: null, v: 0, opened: [], real: true });
    expect(r.table.hash).toBe(commit(w.given[0]));
    expect(r.table.seed).toBeUndefined();
    // Everybody hears of it, with the same table.
    expect(w.of('deal.step')[0]).toMatchObject({ table: r.table, events: [] });
    expect(g.snapshot().live).toEqual([r.table]);
  });

  it('plays out like the rules say, pays from the server wallet, and the revealed seed explains every box', () => {
    const { g, p } = setup();
    call(g, 'bet', p, { amount: 100 });
    const end = playOut(g, p, true);
    expect(end.ok).toBe(true);
    const t = end.table;
    expect(t.phase).toBe('done');
    expect(t.outcome.how).toBe('swap');
    // The seed is out now, matches the hash published first, and gives the floor.
    expect(verifySeed(t.seed, t.hash)).toBe(true);
    const floor = dealLayoutOf(t.seed).prizes;
    expect([...floor].sort((a, b) => a - b)).toEqual([...PRIZES]);
    for (const o of t.opened) expect(floor[o.box]).toBe(o.prize);
    expect(floor[t.outcome.box]).toBe(t.outcome.boxPrize);
    expect(t.outcome.mult).toBe(floor[t.outcome.box]);
    // The wallet: the stake is gone, the prize paid, the table down.
    expect(end.won).toBe(Math.floor(100 * t.outcome.mult));
    expect(p.coins).toBe(START_COINS - 100 + end.won);
    expect(p.stakes.deal).toBeUndefined();
    expect(p.stats.arcade.deal.rounds).toBe(1);
    expect(g.snapshot().live).toEqual([]);
    expect(call(g, 'mine', p).table).toBeNull();
    // And a new one can start.
    expect(call(g, 'bet', p, { amount: 10 }).ok).toBe(true);
  }, 20_000);

  it('a deal pays the offer, and the box it was on is shown only at the end', () => {
    const { w, g, p } = setup();
    call(g, 'bet', p, { amount: 1000 });
    call(g, 'pick', p, { box: 3 });
    const shut = new Set(Array.from({ length: BOXES }, (_, i) => i).filter((i) => i !== 3));
    const call1 = openSome(g, p, ROUNDS[0], shut);
    const offer = call1.table.offer;
    expect(offer).toBeGreaterThan(0);
    const mid = JSON.stringify(call1);
    expect(mid).not.toContain(w.given[0]);
    const end = call(g, 'answer', p, { deal: true });
    expect(end.table.outcome.how).toBe('deal');
    expect(end.won).toBe(Math.floor(1000 * offer));
    expect(p.coins).toBe(START_COINS - 1000 + end.won);
    expect(verifySeed(end.table.seed, end.table.hash)).toBe(true);
    // The event stream carried: opens, the offer, the deal and the reveal of the kept box.
    const types = w.of('deal.step').flatMap((e) => e.events.map((x: any) => x.type));
    expect(types).toEqual(['picked', ...Array(ROUNDS[0]).fill('opened'), 'offer', 'dealt', 'reveal']);
  });

  it('refuses what is not allowed: out of turn, a bad box, no coins, a second round, strangers', () => {
    const { g, p, w } = setup();
    const q = w.player('Other');
    expect(call(g, 'pick', p, { box: 1 })).toMatchObject({ ok: false, error: 'not_in' });
    expect(call(g, 'bet', p, { amount: 0 })).toMatchObject({ ok: false, error: 'amount' });
    expect(call(g, 'bet', p, { amount: 2.5 })).toMatchObject({ ok: false, error: 'amount' });
    expect(call(g, 'bet', p, { amount: START_COINS + 1 })).toMatchObject({ ok: false, error: 'coins' });
    expect(p.coins).toBe(START_COINS);
    call(g, 'bet', p, { amount: 10 });
    expect(call(g, 'bet', p, { amount: 10 })).toMatchObject({ ok: false, error: 'already' });
    expect(call(g, 'open', p, { box: 1 })).toMatchObject({ ok: false, error: 'bad_request' });
    expect(call(g, 'answer', p, { deal: true })).toMatchObject({ ok: false, error: 'bad_request' });
    expect(call(g, 'swap', p, { swap: true })).toMatchObject({ ok: false, error: 'bad_request' });
    for (const box of [-1, 20, 1.5, '3', null, NaN]) expect(call(g, 'pick', p, { box })).toMatchObject({ ok: false, error: 'bad_request' });
    expect(call(g, 'answer', p, { deal: 'yes' })).toMatchObject({ ok: false });
    // Somebody else's round isn't yours to play.
    expect(call(g, 'pick', q, { box: 1 })).toMatchObject({ ok: false, error: 'not_in' });
    expect(call(g, 'pick', p, { box: 1 }).ok).toBe(true);
    expect(call(g, 'pick', p, { box: 2 })).toMatchObject({ ok: false, error: 'bad_request' });
    expect(call(g, 'open', p, { box: 1 })).toMatchObject({ ok: false, error: 'bad_request' });
    expect(call(g, 'open', p, { box: 2 }).ok).toBe(true);
    expect(call(g, 'open', p, { box: 2 })).toMatchObject({ ok: false, error: 'bad_request' });
    expect(call(g, 'nonsense', p)).toBeNull();
  });

  it('gives the bet back when you leave before picking a box', () => {
    const { g, p } = setup();
    call(g, 'bet', p, { amount: 250 });
    const r = call(g, 'leave', p);
    expect(r.table.outcome.how).toBe('refund');
    expect(r.won).toBe(250);
    expect(p.coins).toBe(START_COINS);
    expect(p.stakes.deal).toBeUndefined();
    expect(p.stats.arcade.deal.rounds).toBe(0);
    expect(g.snapshot().live).toEqual([]);
  });

  it('limits how fast rounds can be started', () => {
    const { w, g, p } = setup();
    const ok = Array.from({ length: 6 }, () => {
      const r = call(g, 'bet', p, { amount: 1 });
      if (r.ok) call(g, 'leave', p);
      return r.ok;
    });
    expect(ok.filter(Boolean).length).toBe(4);
    expect(call(g, 'bet', p, { amount: 1 })).toMatchObject({ ok: false, error: 'rate' });
    w.clock.t += 16_000;
    expect(call(g, 'bet', p, { amount: 1 }).ok).toBe(true);
  });
});

describe('Pizza Boxes server: nothing leaks', () => {
  it('never sends a shut box, the seed or the layout before the round is over', () => {
    const { w, g, p } = setup();
    const watcher = w.player('Watcher');
    call(g, 'bet', p, { amount: 100 });
    const replies: R[] = [call(g, 'pick', p, { box: 7 })];
    const shut = new Set(Array.from({ length: BOXES }, (_, i) => i).filter((i) => i !== 7));
    replies.push(openSome(g, p, 3, shut));
    const seed = w.given[0];
    const everything = JSON.stringify([replies, w.events, g.snapshot(), call(g, 'mine', p), call(g, 'mine', watcher)]);
    expect(everything).not.toContain(seed);
    expect(everything).not.toMatch(/"(prizes|layout|wobble|all|seed)"/);
    // The only boxes with prizes in them are the three that were opened.
    const snap = g.snapshot().live[0];
    expect(snap.opened.map((o: any) => o.box).sort((a: number, b: number) => a - b)).toEqual([...Array(20).keys()].filter((i) => ![7, ...shut].includes(i)).sort((a, b) => a - b));
    expect(snap.opened.length).toBe(3);
    expect(snap.outcome).toBeUndefined();
    // A watcher can't look at a box either: they have no round to open one in.
    expect(call(g, 'open', watcher, { box: 12 })).toMatchObject({ ok: false, error: 'not_in' });
  });

  it('the offers and the swap card name boxes, not what is in them', () => {
    const { w, g, p } = setup();
    call(g, 'bet', p, { amount: 100 });
    call(g, 'pick', p, { box: 0 });
    const shut = new Set(Array.from({ length: BOXES }, (_, i) => i).filter((i) => i !== 0));
    for (let k = 0; k < ROUNDS.length; k++) {
      openSome(g, p, ROUNDS[k], shut);
      call(g, 'answer', p, { deal: false });
    }
    const t = g.snapshot().live[0];
    expect(t.phase).toBe('swap');
    expect(t.lastBox).toBe([...shut][0]);
    expect(t.opened.length).toBe(18);
    expect(JSON.stringify([t, w.events])).not.toContain(w.given[0]);
  }, 20_000);
});

describe('Pizza Boxes server: walking away', () => {
  const phases = async () => {
    // Stop in each phase and let the clock run out.
    const out: Record<string, { how: string; coins: number }> = {};
    for (const stop of ['pick', 'open', 'call', 'swap']) {
      const { w, g, p } = setup();
      call(g, 'bet', p, { amount: 100 });
      if (stop !== 'pick') {
        call(g, 'pick', p, { box: 0 });
        const shut = new Set(Array.from({ length: BOXES }, (_, i) => i).filter((i) => i !== 0));
        if (stop === 'open') openSome(g, p, 2, shut);
        else {
          for (let k = 0; k < ROUNDS.length; k++) {
            openSome(g, p, ROUNDS[k], shut);
            if (stop === 'call' && k === 1) break;
            call(g, 'answer', p, { deal: false });
          }
        }
      }
      const before = g.snapshot().live[0];
      expect(before.phase).toBe(stop);
      w.advance([g], T0 + DEAL_IDLE_MS - 1000);
      expect(g.snapshot().live.length).toBe(1);
      w.advance([g], T0 + DEAL_IDLE_MS + 1000);
      expect(g.snapshot().live).toEqual([]);
      const step = w.of('deal.step').at(-1)!;
      expect(step.table.phase).toBe('done');
      expect(verifySeed(step.table.seed, step.table.hash)).toBe(true);
      out[stop] = { how: step.table.outcome.how, coins: p.coins };
      expect(p.stakes.deal).toBeUndefined();
      // The coins match the rule: an offer on the table is taken, otherwise your box pays.
      const o = step.table.outcome;
      const want = o.how === 'refund' ? 100 : Math.floor(100 * o.mult);
      expect(p.coins).toBe(START_COINS - 100 + want);
    }
    return out;
  };

  it('an abandoned round settles itself after the timeout, by the same rule as leaving', async () => {
    const r = await phases();
    expect(r.pick.how).toBe('refund');
    expect(r.pick.coins).toBe(START_COINS);
    expect(r.open.how).toBe('left-box');
    expect(r.call.how).toBe('left-offer');
    expect(r.swap.how).toBe('left-box');
  }, 30_000);

  it('moves reset the timeout', () => {
    const { w, g, p } = setup(0);
    call(g, 'bet', p, { amount: 10 });
    w.clock.t += DEAL_IDLE_MS - 5000;
    expect(call(g, 'pick', p, { box: 4 }).ok).toBe(true);
    w.advance([g], w.clock.t + DEAL_IDLE_MS - 5000);
    expect(g.snapshot().live.length).toBe(1);
    expect(g.nextAt()).toBe(w.clock.t - (DEAL_IDLE_MS - 5000) + DEAL_IDLE_MS);
  });

  it('tells the clock when the next timeout is due, with no pages connected', () => {
    const { w, g, p } = setup(0);
    expect(g.nextAt()).toBeNull();
    call(g, 'bet', p, { amount: 10 });
    expect(g.nextAt()).toBe(T0 + DEAL_IDLE_MS);
    w.advance([g], T0 + DEAL_IDLE_MS);
    expect(p.stakes.deal).toBeUndefined();
    expect(g.nextAt()).toBeNull();
  });
});

describe('Pizza Boxes server: restarts', () => {
  function boot(file: string, clock: { t: number }, seed = seeds()) {
    const w = world({ seed });
    w.clock.t = clock.t;
    const store = new Store({ file, now: () => w.clock.t });
    store.load();
    const env = { ...w.env, store };
    const g = new DealGame(env);
    return { w, store, g, env };
  }

  it('a round carries on after a restart: same table, same boxes, the stake still held, then it pays', async () => {
    const d = dir();
    const file = join(d, 'wallets.json');
    const a = boot(file, { t: T0 });
    const made = a.store.create('Survivor');
    if (!made.ok) throw new Error('no player');
    const p = made.player;
    call(a.g, 'bet', p, { amount: 500 });
    call(a.g, 'pick', p, { box: 5 });
    const shut = new Set(Array.from({ length: BOXES }, (_, i) => i).filter((i) => i !== 5));
    openSome(a.g, p, ROUNDS[0], shut);
    call(a.g, 'answer', p, { deal: false });
    openSome(a.g, p, 2, shut);
    const before = a.g.snapshot().live[0];
    expect(before.opened.length).toBe(7);
    a.g.shutdown();
    await a.store.flush();

    // A new process: the same file.
    const b = boot(file, { t: T0 + 30_000 }, seeds());
    const q = b.store.players.get(p.id)!;
    expect(q.coins).toBe(START_COINS - 500);
    expect(q.stakes.deal).toBe(500);
    const after = b.g.snapshot().live[0];
    expect(after).toEqual({ ...before, expiresAt: T0 + 30_000 + DEAL_IDLE_MS });
    expect(b.w.woke.n).toBeGreaterThan(0);
    expect(call(b.g, 'mine', q).table).toEqual(after);
    // It goes on from where it was (the seed came back with it: the boxes are the same).
    const more = openSome(b.g, q, 1, shut);
    expect(more.table.opened.slice(0, 7)).toEqual(before.opened);
    openSome(b.g, q, 1, shut);
    let r: R = call(b.g, 'answer', q, { deal: false });
    expect(r.ok).toBe(true);
    for (let k = 2; k < ROUNDS.length; k++) {
      openSome(b.g, q, ROUNDS[k], shut);
      r = call(b.g, 'answer', q, { deal: false });
    }
    expect(r.table.phase).toBe('swap');
    const fin = call(b.g, 'swap', q, { swap: false });
    expect(fin.table.phase).toBe('done');
    expect(verifySeed(fin.table.seed, fin.table.hash)).toBe(true);
    const floor = dealLayoutOf(fin.table.seed).prizes;
    for (const o of fin.table.opened) expect(floor[o.box]).toBe(o.prize);
    expect(q.coins).toBe(START_COINS - 500 + Math.floor(500 * floor[5]));
    expect(q.stakes.deal).toBeUndefined();
  }, 30_000);

  it('an abandoned round still settles after a restart (the wait starts again)', async () => {
    const d = dir();
    const file = join(d, 'wallets.json');
    const a = boot(file, { t: T0 });
    const made = a.store.create('Gone');
    if (!made.ok) throw new Error('no player');
    call(a.g, 'bet', made.player, { amount: 80 });
    call(a.g, 'pick', made.player, { box: 1 });
    a.g.shutdown();
    await a.store.flush();
    const b = boot(file, { t: T0 + 3_600_000 });
    // An hour down is not the player's fault: they get a full wait.
    expect(b.g.nextAt()).toBe(T0 + 3_600_000 + DEAL_IDLE_MS);
    b.w.advance([b.g], T0 + 3_600_000 + DEAL_IDLE_MS + 1);
    const q = b.store.players.get(made.player.id)!;
    expect(q.stakes.deal).toBeUndefined();
    const step = b.w.of('deal.step').at(-1)!;
    expect(step.table.outcome.how).toBe('left-box');
    expect(q.coins).toBe(START_COINS - 80 + Math.floor(80 * step.table.outcome.mult));
  });

  it('gives the stake back if there is no round to match it, and drops a round with no stake', async () => {
    const d = dir();
    const file = join(d, 'wallets.json');
    const a = boot(file, { t: T0 });
    const m1 = a.store.create('Lost');
    const m2 = a.store.create('Free');
    if (!m1.ok || !m2.ok) throw new Error('no player');
    // One player has a stake and no saved round (the round's data is gone); the other has a round whose stake isn't there.
    a.store.stake(m1.player, 'deal', 70);
    call(a.g, 'bet', m2.player, { amount: 30 });
    m2.player.stakes = {};
    await a.store.flush();
    const b = boot(file, { t: T0 + 1000 });
    expect(b.store.players.get(m1.player.id)!.coins).toBe(START_COINS);
    expect(b.store.players.get(m1.player.id)!.stakes).toEqual({});
    expect(b.g.snapshot().live).toEqual([]);
  });

  it('rocket, crossing and mines stakes are still given back by a restart', async () => {
    const d = dir();
    const file = join(d, 'wallets.json');
    const a = boot(file, { t: T0 });
    const m = a.store.create('Mixed');
    if (!m.ok) throw new Error('no player');
    a.store.stake(m.player, 'rocket', 100);
    call(a.g, 'bet', m.player, { amount: 200 });
    await a.store.flush();
    const b = boot(file, { t: T0 });
    const q = b.store.players.get(m.player.id)!;
    expect(q.stakes).toEqual({ deal: 200 });
    expect(q.coins).toBe(START_COINS - 200);
  });
});

describe('Pizza Boxes server: watching', () => {
  it('sends every step, in order, with nothing a spectator could not see', () => {
    const { w, g, p } = setup();
    call(g, 'bet', p, { amount: 50 });
    call(g, 'pick', p, { box: 9 });
    const shut = new Set(Array.from({ length: BOXES }, (_, i) => i).filter((i) => i !== 9));
    openSome(g, p, ROUNDS[0], shut);
    call(g, 'answer', p, { deal: false });
    openSome(g, p, 1, shut);
    const steps = w.of('deal.step');
    expect(steps.map((s) => s.table.v)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(steps.map((s) => s.table.id)).size).toBe(1);
    expect(steps.map((s) => s.events.map((e: any) => e.type).join('+'))).toEqual(['', 'picked', 'opened', 'opened', 'opened', 'opened', 'opened+offer', 'declined', 'opened']);
  });

  it('lists the live rounds for a page that connects, newest first', () => {
    const { w, g, p } = setup();
    const q = w.player('Second');
    call(g, 'bet', p, { amount: 10 });
    w.clock.t += 1000;
    call(g, 'bet', q, { amount: 20 });
    const live = g.snapshot().live;
    expect(live.map((t) => t.name)).toEqual(['Second', 'Boxer']);
    expect(live.map((t) => t.bet)).toEqual([20, 10]);
  });

  it('lets a watcher send one of a few phrases, once every few seconds, and nothing else', () => {
    const { w, g, p } = setup();
    const watcher = w.player('Cheerer');
    const other = w.player('Heckler');
    const t = call(g, 'bet', p, { amount: 10 }).table;
    expect(call(g, 'react', watcher, { table: t.id, r: 1 }).ok).toBe(true);
    expect(w.of('deal.react')).toEqual([expect.objectContaining({ table: t.id, who: watcher.id, name: 'Cheerer', r: 1 })]);
    // Too soon, from the same watcher; another may.
    expect(call(g, 'react', watcher, { table: t.id, r: 0 })).toMatchObject({ ok: false, error: 'rate' });
    expect(call(g, 'react', other, { table: t.id, r: 0 }).ok).toBe(true);
    w.clock.t += 3100;
    expect(call(g, 'react', watcher, { table: t.id, r: 0 }).ok).toBe(true);
    // Phrases by number only: no free text, no numbers off the list, no round that isn't on.
    w.clock.t += 3100;
    for (const r of [-1, DEAL_REACTS.length, 1.5, 'No deal!', null, { x: 1 }]) expect(call(g, 'react', watcher, { table: t.id, r })).toMatchObject({ ok: false, error: 'bad_request' });
    expect(call(g, 'react', watcher, { table: t.id, text: 'hello', r: 0, name: 'x' }).ok).toBe(true);
    expect(w.of('deal.react').at(-1)).toEqual({ table: t.id, who: watcher.id, name: 'Cheerer', r: 0, serverNow: w.clock.t });
    w.clock.t += 3100;
    expect(call(g, 'react', watcher, { table: 9999, r: 0 })).toMatchObject({ ok: false, error: 'not_found' });
    expect(call(g, 'react', watcher, { r: 0 })).toMatchObject({ ok: false });
  });

  it('stops a crowd from drowning one round', () => {
    const { w, g, p } = setup();
    const t = call(g, 'bet', p, { amount: 10 }).table;
    const crowd = Array.from({ length: 10 }, (_, i) => w.player(`Fan${i}`));
    const ok = crowd.map((f) => call(g, 'react', f, { table: t.id, r: 0 }).ok);
    expect(ok.filter(Boolean).length).toBe(6);
    expect(call(g, 'react', crowd[9], { table: t.id, r: 0 })).toMatchObject({ error: 'rate' });
  });
});

describe('Pizza Boxes server: the made-up player', () => {
  it('sits down when it is quiet, plays a whole round for anyone to watch, and costs nobody anything', () => {
    const w = world({ clients: 1 });
    const g = new DealGame(w.env);
    g.clientsChanged();
    expect(g.snapshot().live).toEqual([]);
    expect(g.nextAt()).not.toBeNull();
    w.advance([g], T0 + 30_000);
    const first = w.of('deal.step')[0];
    expect(first.table).toMatchObject({ real: false, phase: 'pick', v: 0 });
    expect(first.table.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(w.store.players.size).toBe(0);
    // It carries on without anybody and finishes with the seed out.
    w.advance([g], T0 + 5 * 60_000);
    const ends = w.of('deal.step').filter((s) => s.table.phase === 'done');
    expect(ends.length).toBeGreaterThan(0);
    const e = ends[0];
    expect(verifySeed(e.table.seed, e.table.hash)).toBe(true);
    const floor = dealLayoutOf(e.table.seed).prizes;
    for (const o of e.table.opened) expect(floor[o.box]).toBe(o.prize);
    // Every step of that round was seen, one box at a time.
    const mine = w.of('deal.step').filter((s) => s.table.id === e.table.id);
    expect(mine.map((s) => s.table.v)).toEqual([...mine.keys()]);
  }, 30_000);

  it('does not sit down when a real player is playing, or when nobody is looking', () => {
    const quiet = world({ clients: 0 });
    const g0 = new DealGame(quiet.env);
    g0.clientsChanged();
    quiet.advance([g0], T0 + 120_000);
    expect(quiet.of('deal.step')).toEqual([]);
    expect(g0.nextAt()).toBeNull();

    const w = world({ clients: 1 });
    const g = new DealGame(w.env);
    const p = w.player('Busy');
    g.clientsChanged();
    call(g, 'bet', p, { amount: 10 });
    w.advance([g], T0 + 100_000);
    expect(w.of('deal.step').filter((s) => !s.table.real)).toEqual([]);
  });

  it('is not saved: a restart does not bring the cast back', async () => {
    const d = dir();
    const file = join(d, 'wallets.json');
    const w = world({ clients: 1 });
    const store = new Store({ file, now: () => w.clock.t });
    store.load();
    const g = new DealGame({ ...w.env, store });
    g.clientsChanged();
    w.advance([g], T0 + 15_000);
    expect(g.snapshot().live.length).toBe(1);
    store.touch();
    await store.flush();
    const raw = JSON.parse(await import('node:fs').then((f) => f.readFileSync(file, 'utf8')));
    expect(raw.kept.deal.tables).toEqual([]);
  });
});
