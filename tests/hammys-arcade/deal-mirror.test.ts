// The page's side of Pizza Boxes (DealMirror) run against the real server game:
// the "network" is a function call, the sky is the real Sky object fed by the
// game's own events, so a player's page and a spectator's page both get what a
// browser would.
import { describe, expect, it } from 'vitest';
import type { DealEvent } from '../../games/hammygotchi/src/deal';
import { BOXES, ROUNDS } from '../../games/hammygotchi/src/deal';
import type { LiveDealTable } from '../../games/hammygotchi/src/roundsource';
import { dealLayoutOf } from '../../games/hammys-arcade/shared/derive';
import { DealGame } from '../../games/hammys-arcade/server/deal';
import type { Player } from '../../games/hammys-arcade/server/store';
import { DealMirror } from '../../games/hammys-arcade/src/online/mirrors';
import { Sky } from '../../games/hammys-arcade/src/online/sky';
import { OnlineWallet } from '../../games/hammys-arcade/src/online/wallet';
import type { Api } from '../../games/hammys-arcade/src/online/api';
import { START_COINS } from '../../games/hammys-arcade/shared/protocol';
import { world } from './harness';

(globalThis as any).window = globalThis;

/** A page: its own sky, wallet and mirror, talking to the game as `p` (or as nobody, to just watch). */
function page(game: () => DealGame, p: Player | null, store: { me(p: Player): any }) {
  const sky = new Sky();
  const api = {
    secret: p ? 'secret' : '',
    async post(path: string, body: Record<string, unknown> = {}) {
      await Promise.resolve();
      const [, action] = path.split('/');
      const r = p ? game().handle(action, p, body) : null;
      if (!r) return { ok: false, error: 'unauthorized', message: 'no' };
      return { ...r, me: store.me(p!), serverNow: 0 };
    },
  } as unknown as Api;
  const wallet = new OnlineWallet(api);
  if (p) wallet.applyMe(store.me(p));
  const mirror = new DealMirror(sky, api, wallet);
  const steps: { t: LiveDealTable; events: DealEvent[] }[] = [];
  mirror.onStep((t, events) => steps.push({ t, events }));
  return { sky, wallet, mirror, steps, emit: (n: string, d: unknown) => (sky as any).emit(n, d) };
}

function rig() {
  const w = world({ clients: 1 });
  const pages: ReturnType<typeof page>[] = [];
  let g!: DealGame;
  const env = { ...w.env, emit: (name: string, data: Record<string, unknown>) => { w.events.push({ name, data }); for (const pg of pages) pg.emit(name, { ...data, serverNow: w.clock.t }); } };
  g = new DealGame(env);
  const mk = (p: Player | null) => {
    const pg = page(() => g, p, w.store);
    pages.push(pg);
    return pg;
  };
  return { w, g: () => g, mk };
}

const shutBoxes = (mine: number) => Array.from({ length: BOXES }, (_, i) => i).filter((i) => i !== mine);

describe('Pizza Boxes page: the mirror of the server’s rounds', () => {
  it('a player and a watcher both see every step, once, in order, and the watcher can check the seed', async () => {
    const { w, mk } = rig();
    const p = w.player('Boxer');
    const me = mk(p);
    const eye = mk(null);
    const bet = await me.mirror.bet(100);
    expect(bet.ok).toBe(true);
    await me.mirror.pick(4);
    const shut = shutBoxes(4);
    for (let i = 0; i < ROUNDS[0]; i++) await me.mirror.open(shut.shift()!);
    // The watcher saw the round start, the pick, the five boxes, and Dr. Moss's offer.
    expect(eye.steps.map((s) => s.t.v)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(me.steps.map((s) => s.t.v)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(eye.steps.at(-1)!.events.map((e) => e.type)).toEqual(['opened', 'offer']);
    expect(eye.mirror.live().map((t) => t.name)).toEqual(['Boxer']);
    expect(eye.mirror.mineTable()).toBeNull();
    expect(me.mirror.mineTable()?.phase).toBe('call');
    expect(eye.mirror.live()[0].offer).toBe(me.mirror.mineTable()!.offer);
    expect(eye.mirror.fairOf(eye.steps[0].t.id)).toContain('the seed is shown when it ends');
    // Dr. Moss's offer goes to the watcher too; the player turns it down and plays on to the end.
    await me.mirror.answer(false);
    for (let k = 1; k < ROUNDS.length; k++) {
      for (let i = 0; i < ROUNDS[k]; i++) await me.mirror.open(shut.shift()!);
      await me.mirror.answer(false);
    }
    const end = await me.mirror.swap(false);
    expect(end.ok).toBe(true);
    const last = eye.steps.at(-1)!.t;
    expect(last.phase).toBe('done');
    expect(eye.mirror.live()).toEqual([]);
    expect(eye.mirror.table(last.id)).toBe(last);
    // The seed was checked, the floor laid out again, and it agrees.
    expect(eye.mirror.fairOf(last.id)).toContain('✓');
    expect(last.all).toHaveLength(BOXES);
    expect(last.all![last.outcome!.box!]).toBe(last.outcome!.boxPrize);
    expect(me.mirror.fairOf(last.id)).toContain('✓');
    expect(me.mirror.mineTable()).toBeNull();
  }, 30_000);

  it('says so when a revealed seed does not match what was promised', async () => {
    const { w, mk } = rig();
    const eye = mk(null);
    const p = w.player('Cheat');
    const me = mk(p);
    await me.mirror.bet(10);
    const step = w.events.find((e) => e.name === 'deal.step')!;
    const table = { ...step.data.table, v: 5, phase: 'done', seed: 'ab'.repeat(32), opened: [], outcome: { how: 'left-box', mult: 1, box: 0, boxPrize: 1, otherPrize: null } };
    eye.emit('deal.step', { table, events: [] });
    expect(eye.mirror.fairOf(table.id)).toContain('DOES NOT MATCH');
    expect(eye.mirror.table(table.id)!.all).toBeUndefined();
  });

  it('holds a kept box’s winnings back until the reveal is over; a deal is paid straight away', async () => {
    const { w, mk } = rig();
    const p = w.player('Holder');
    const me = mk(p);
    await me.mirror.bet(100);
    await me.mirror.pick(0);
    const shut = shutBoxes(0);
    for (let i = 0; i < ROUNDS[0]; i++) await me.mirror.open(shut.shift()!);
    const offer = me.mirror.mineTable()!.offer!;
    // Take the deal: coins show at once.
    const r = await me.mirror.answer(true);
    expect(r.ok && r.won).toBe(Math.floor(100 * offer));
    expect(me.wallet.coins).toBe(START_COINS - 100 + Math.floor(100 * offer));

    // Now one that goes to the end and keeps the box (the one with the top prize: the server's second seed is known to this test).
    await me.mirror.bet(100);
    const top = dealLayoutOf(w.given[1]).prizes.indexOf(8);
    await me.mirror.pick(top);
    const s2 = shutBoxes(top);
    for (let k = 0; k < ROUNDS.length; k++) {
      for (let i = 0; i < ROUNDS[k]; i++) await me.mirror.open(s2.shift()!);
      await me.mirror.answer(false);
    }
    const end = await me.mirror.swap(false);
    expect(end.ok && end.won).toBe(800);
    // It is in the wallet on the server, but the page's coins don't show it until the reveal is done.
    expect(p.coins).toBeGreaterThanOrEqual(800);
    expect(me.wallet.coins).toBe(p.coins - 800);
    me.mirror.release();
    expect(me.wallet.coins).toBe(p.coins);
  }, 30_000);

  it('picks a round up again when the page comes back', async () => {
    const { w, mk } = rig();
    const p = w.player('Returner');
    const first = mk(p);
    await first.mirror.bet(50);
    await first.mirror.pick(2);
    const again = mk(p);
    expect(again.mirror.mineTable()).toBeNull();
    await again.mirror.resume();
    expect(again.mirror.mineTable()).toMatchObject({ phase: 'open', mine: 2, bet: 50, who: p.id });
    expect(again.steps.at(-1)!.t.id).toBe(first.mirror.mineTable()!.id);
  });

  it('claims its own round when the snapshot lands before the answer to "do I have one"', async () => {
    const { w, g, mk } = rig();
    const p = w.player('Early');
    const first = mk(p);
    await first.mirror.bet(20);
    await first.mirror.pick(3);
    const again = mk(p);
    again.emit('snapshot', { serverNow: 0, cid: 'x', players: 1, deal: g().snapshot() });
    expect(again.mirror.mineTable()).toMatchObject({ mine: 3, bet: 20 });
    // The later answer adds nothing and breaks nothing.
    await again.mirror.resume();
    expect(again.mirror.mineTable()).toMatchObject({ mine: 3, bet: 20 });
    expect(again.mirror.live()).toHaveLength(1);
  });

  it('sends reactions by number; the page hears them', async () => {
    const { w, mk } = rig();
    const p = w.player('Host');
    const q = w.player('Fan');
    const host = mk(p);
    const fan = mk(q);
    const heard: unknown[] = [];
    host.mirror.onReact((r) => heard.push(r));
    await host.mirror.bet(10);
    const id = fan.mirror.live()[0].id;
    expect((await fan.mirror.react(id, 1)).ok).toBe(true);
    expect(heard).toEqual([{ table: id, who: q.id, name: 'Fan', r: 1, serverNow: w.clock.t }]);
    expect(fan.mirror.reacts[1]).toBe('Take it!');
    const again = await fan.mirror.react(id, 0);
    expect(again.ok).toBe(false);
  });
});
