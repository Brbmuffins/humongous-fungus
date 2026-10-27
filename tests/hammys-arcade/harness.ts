// A fake world for the server's games: a clock you move by hand, a wallet
// store in memory and a list of every event the games sent.
import { createHash } from 'node:crypto';
import { type Env } from '../../games/hammys-arcade/server/engine';
import { Store, type Player } from '../../games/hammys-arcade/server/store';

export interface World {
  env: Env;
  store: Store;
  clock: { t: number };
  events: { name: string; data: Record<string, any> }[];
  clients: { n: number };
  /** Move the clock to `t` (ms since the start), ticking the games on the way, event by event. */
  advance(games: { tick(): void; nextAt(): number | null }[], to: number): void;
  player(name: string): Player;
  of(name: string): any[];
  woke: { n: number };
  /** Every seed handed out, in order. */
  given: string[];
}

export const T0 = 1_800_000_000_000;

/** Seeds that come out the same every run. */
export function seeds(): () => string {
  let n = 0;
  return () => createHash('sha256').update(`test seed ${n++}`).digest('hex');
}

export function world(opts: { seed?: () => string; clients?: number } = {}): World {
  const clock = { t: T0 };
  const events: World['events'] = [];
  const clients = { n: opts.clients ?? 1 };
  const woke = { n: 0 };
  const store = new Store({ now: () => clock.t });
  const gen = opts.seed ?? seeds();
  const given: string[] = [];
  const next = () => {
    const s = gen();
    given.push(s);
    return s;
  };
  const env: Env = {
    now: () => clock.t,
    store,
    emit: (name, data) => events.push({ name, data: { ...data, serverNow: clock.t } }),
    clients: () => clients.n,
    newSeed: next,
    wake: () => void woke.n++,
  };
  return {
    env,
    store,
    clock,
    events,
    clients,
    woke,
    given,
    advance(games, to) {
      for (let guard = 0; guard < 10_000; guard++) {
        const due = games.map((g) => g.nextAt()).filter((t): t is number => t !== null && t <= to);
        const t = due.length ? Math.min(...due) : to;
        clock.t = Math.max(clock.t, Math.min(t, to));
        for (const g of games) g.tick();
        if (clock.t >= to && !games.some((g) => (g.nextAt() ?? Infinity) <= to)) return;
      }
      throw new Error('advance did not settle');
    },
    player(name) {
      const made = store.create(name);
      if (!made.ok) throw new Error(made.error);
      return made.player;
    },
    of(name) {
      return events.filter((e) => e.name === name).map((e) => e.data);
    },
  };
}

/** A seed source that only hands out seeds that satisfy `where`, found by looking. */
export function seedsWhere(where: (seed: string) => boolean): () => string {
  let n = 0;
  return () => {
    for (;;) {
      const s = createHash('sha256').update(`hunt ${n++}`).digest('hex');
      if (where(s)) return s;
    }
  };
}
