// Hammy Mines on the server: the same floor for everyone, as a race. A floor
// lasts about a minute (MINES_ROUND_MS; sooner, but never before
// MINES_MIN_ROUND_MS, once every run on it is over); you can start your run
// any time before it ends. Each round has a committed seed. A player's floor
// is derived from the seed plus the board and poop count they pick
// (floorOf in shared/derive.ts), so everyone who picks the same settings gets
// the identical hidden floor. Players open boxes on their own copy through
// the server, which answers safe or poop and keeps the multiplier. Everyone
// sees how far the others got (boxes opened, multiplier, hit, cashed out),
// never which boxes. When the floor ends, open runs cash out at what they
// have (a run with nothing opened is given back) and the seed is revealed.
//
// One run per player per floor: a second run on the same floor would start
// from what the first one learned.
import { MINES_DEFAULT, MINES_GRIDS, clampMines, minesMultiplier, tilesOf, type MinesGrid } from '@hammygotchi/mines';
import { ROCKET_CROWD, crowd, type Punter } from '@hammygotchi/rocket';
import { floorOf } from '../shared/derive';
import { commit, rollAt, stream } from '../shared/fair';
import { MINES_LAST_START_MS, MINES_MIN_ROUND_MS, MINES_PAUSE_MS, MINES_ROUND_MS, type MinesRound, type Runner } from '../shared/protocol';
import { amountOf, fail, type Env, type Game, type Res } from './engine';
import type { Player } from './store';

interface Run extends Runner {
  player?: Player;
  floor: boolean[];
  opened: Set<number>;
  /** The made-up ones: the order they open boxes in, how many they open, and when they do it next. */
  order: number[];
  target: number;
  step: number;
  nextAt: number;
  /** Which of the cast this is, for its own rolls. */
  slot: number;
}

interface Round {
  id: number;
  seed: string;
  hash: string;
  phase: 'open' | 'end';
  startedAt: number;
  endsAt: number;
  runs: Run[];
  cast: number;
  floors: Map<string, boolean[]>;
  endedAt: number;
}

export const MAX_RUNNERS = 100;

export class MinesGame implements Game {
  readonly id = 'mines' as const;
  private round: Round | null = null;
  private counter = 0;

  constructor(private env: Env) {}

  private floor(r: Round, grid: MinesGrid, mines: number): boolean[] {
    const key = `${grid}:${mines}`;
    let f = r.floors.get(key);
    if (!f) {
      f = floorOf(r.seed, grid, mines);
      r.floors.set(key, f);
    }
    return f;
  }

  private open(at: number): void {
    const seed = this.env.newSeed();
    const bots: Punter[] = crowd(stream(seed, 'cast'));
    const r: Round = { id: ++this.counter, seed, hash: commit(seed), phase: 'open', startedAt: at, endsAt: at + MINES_ROUND_MS, runs: [], cast: bots.length, floors: new Map(), endedAt: 0 };
    bots.forEach((p, i) => {
      const k = rollAt(seed, 'botgrid', i);
      const grid: MinesGrid = k < 0.7 ? 8 : k < 0.85 ? 4 : 16;
      const mines = MINES_DEFAULT[grid];
      const floor = this.floor(r, grid, mines);
      // Their order of opening boxes: a shuffle of the board.
      const order = Array.from({ length: tilesOf(grid) }, (_, j) => j);
      const roll = stream(seed, `botorder:${i}`);
      for (let j = order.length - 1; j > 0; j--) {
        const t = Math.floor(roll() * (j + 1));
        [order[j], order[t]] = [order[t], order[j]];
      }
      const safe = tilesOf(grid) - mines;
      const q = rollAt(seed, 'botstop', i);
      const target = Math.min(safe, p.style === 'safe' ? 1 + Math.floor(q * 3) : p.style === 'mid' ? 3 + Math.floor(q * 5) : 6 + Math.floor(q * 9));
      const run: Run = {
        id: `b${ROCKET_CROWD.findIndex((c) => c.name === p.name)}`,
        name: p.name,
        emoji: p.emoji,
        bet: p.bet,
        real: false,
        ...(p.target === null ? { never: true } : {}),
        grid,
        mines,
        picks: 0,
        mult: 1,
        state: 'alive',
        floor,
        opened: new Set(),
        order,
        target,
        step: 0,
        nextAt: 0,
        slot: i,
      };
      run.nextAt = at + this.gap(r, i, 0, 2500);
      r.runs.push(run);
    });
    this.round = r;
    this.env.emit('mines.round', { round: this.pub(r) });
    this.env.wake();
  }

  /** How long a made-up runner thinks before step `m`, from `from` onward. */
  private gap(r: Round, i: number, m: number, base = 0): number {
    return base + 1500 + Math.floor(rollAt(r.seed, `bott${i}`, m) * 2500);
  }

  private pubRun(x: Run): Runner {
    const { id, name, emoji, bet, real, never, grid, mines, picks, mult, state } = x;
    return { id, name, emoji, bet, real, ...(never ? { never } : {}), grid, mines, picks, mult, state };
  }

  private pub(r: Round): MinesRound {
    const out: MinesRound = { id: r.id, phase: r.phase, hash: r.hash, startedAt: r.startedAt, endsAt: r.endsAt, runners: r.runs.map((x) => this.pubRun(x)) };
    if (r.phase === 'end') out.seed = r.seed;
    return out;
  }

  snapshot(): { round: MinesRound | null } {
    return { round: this.round ? this.pub(this.round) : null };
  }

  private progress(r: Round, x: Run, at: number): void {
    this.env.emit('mines.progress', { round: r.id, id: x.id, picks: x.picks, mult: x.mult, state: x.state, at });
  }

  // Time ------------------------------------------------------------------------

  private aliveRuns(r: Round): boolean {
    return r.runs.some((x) => x.state === 'alive');
  }

  tick(): void {
    for (let guard = 0; guard < 500; guard++) {
      const now = this.env.now();
      const r = this.round;
      if (!r) {
        if (this.env.clients() > 0) this.open(now);
        return;
      }
      if (r.phase === 'open') {
        const due = r.runs.filter((x) => !x.real && x.state === 'alive' && x.nextAt <= now && x.nextAt < r.endsAt).sort((a, b) => a.nextAt - b.nextAt)[0];
        const early = r.startedAt + MINES_MIN_ROUND_MS;
        if (due) {
          this.botStep(r, due);
        } else if (now >= r.endsAt) this.end(r, r.endsAt);
        else if (!this.aliveRuns(r) && now >= early) this.end(r, early);
        else if (this.env.clients() === 0 && !r.runs.some((x) => x.real && x.state === 'alive')) {
          this.round = null;
          return;
        } else return;
      } else {
        if (now < r.endedAt + MINES_PAUSE_MS) return;
        if (this.env.clients() > 0) this.open(r.endedAt + MINES_PAUSE_MS);
        else {
          this.round = null;
          return;
        }
      }
    }
  }

  nextAt(): number | null {
    const r = this.round;
    if (!r) return null;
    if (r.phase === 'end') return r.endedAt + MINES_PAUSE_MS;
    let t = this.aliveRuns(r) ? r.endsAt : Math.min(r.endsAt, r.startedAt + MINES_MIN_ROUND_MS);
    for (const x of r.runs) if (!x.real && x.state === 'alive' && x.nextAt < t) t = x.nextAt;
    return t;
  }

  clientsChanged(): void {
    if (!this.round && this.env.clients() > 0) this.open(this.env.now());
  }

  /** A made-up runner opens a box, or cashes out. */
  private botStep(r: Round, x: Run): void {
    const at = x.nextAt;
    if (x.step >= x.target) {
      x.state = 'cashed';
    } else {
      const i = x.order[x.step];
      x.opened.add(i);
      if (x.floor[i]) x.state = 'hit';
      else {
        x.picks += 1;
        x.mult = minesMultiplier(x.grid as MinesGrid, x.mines, x.picks);
        if (x.picks >= tilesOf(x.grid as MinesGrid) - x.mines) x.state = 'cleared';
      }
      x.step += 1;
    }
    if (x.state === 'alive') x.nextAt = at + this.gap(r, x.slot, x.step);
    this.progress(r, x, at);
  }

  private end(r: Round, at: number): void {
    r.phase = 'end';
    r.endedAt = at;
    for (const x of r.runs) {
      if (x.state !== 'alive') continue;
      x.state = 'cashed';
      if (x.player) {
        if (x.picks > 0) this.env.store.win(x.player, 'mines', x.mult);
        else this.env.store.giveBack(x.player, 'mines');
      }
    }
    this.env.emit('mines.end', { round: r.id, seed: r.seed, hash: r.hash, at, runners: r.runs.map((x) => this.pubRun(x)) });
  }

  shutdown(): void {
    const r = this.round;
    if (!r || r.phase === 'end') return;
    for (const x of r.runs) if (x.player && x.state === 'alive') this.env.store.giveBack(x.player, 'mines');
  }

  // Players ---------------------------------------------------------------------

  private makeRoom(r: Round): void {
    while (r.runs.length > r.cast) {
      const i = r.runs.map((x) => x.real).lastIndexOf(false);
      if (i < 0) break;
      const [gone] = r.runs.splice(i, 1);
      this.env.emit('mines.left', { round: r.id, id: gone.id });
    }
  }

  handle(action: string, p: Player, body: Record<string, unknown>): Res | null {
    if (!['start', 'open', 'cash'].includes(action)) return null;
    this.tick();
    const r = this.round;
    const now = this.env.now();
    const mine = r?.runs.find((x) => x.player === p);
    if (action === 'start') {
      if (!r || r.phase !== 'open' || now >= r.endsAt - MINES_LAST_START_MS) return fail('closed', 'This floor is about to end. Next one in a moment.');
      if (mine) return fail('already', 'You already had a go on this floor. Wait for the next one.');
      const amount = amountOf(body.amount);
      if (amount === null) return fail('amount');
      const grid = MINES_GRIDS.find((g) => g === body.grid);
      if (!grid) return fail('bad_request', 'Pick a board.');
      if (typeof body.mines !== 'number' || !Number.isFinite(body.mines)) return fail('bad_request', 'Pick how much poop.');
      const mines = clampMines(grid, body.mines);
      if (r.runs.filter((x) => x.real).length >= MAX_RUNNERS) return fail('full');
      if (!this.env.store.stake(p, 'mines', amount)) return fail('coins');
      const x: Run = { id: p.id, name: p.name, emoji: p.emoji, bet: amount, real: true, grid, mines, picks: 0, mult: 1, state: 'alive', player: p, floor: this.floor(r, grid, mines), opened: new Set(), order: [], target: 0, step: 0, nextAt: 0, slot: -1 };
      r.runs.push(x);
      this.env.emit('mines.run', { round: r.id, runner: this.pubRun(x) });
      this.makeRoom(r);
      this.env.wake();
      return { ok: true, round: r.id, grid, mines, tiles: tilesOf(grid), endsAt: r.endsAt };
    }
    if (!r || !mine) return fail('not_in');
    if (r.phase !== 'open' || mine.state !== 'alive') return fail('late', 'Your run is over.');
    if (action === 'open') {
      const i = body.index;
      if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= mine.floor.length) return fail('bad_request', 'No such box.');
      if (mine.opened.has(i)) return fail('already', 'That box is open.');
      mine.opened.add(i);
      if (mine.floor[i]) {
        mine.state = 'hit';
        this.env.store.lose(p, 'mines');
      } else {
        mine.picks += 1;
        mine.mult = minesMultiplier(mine.grid as MinesGrid, mine.mines, mine.picks);
        if (mine.picks >= tilesOf(mine.grid as MinesGrid) - mine.mines) {
          mine.state = 'cleared';
          this.env.store.win(p, 'mines', mine.mult);
        }
      }
      this.progress(r, mine, now);
      this.env.wake();
      return { ok: true, safe: mine.state !== 'hit', picks: mine.picks, mult: mine.mult, state: mine.state, ...(mine.state === 'hit' ? { poop: i } : {}), ...(mine.state === 'cleared' ? { won: Math.floor(mine.bet * mine.mult) } : {}) };
    }
    // cash
    mine.state = 'cashed';
    if (mine.picks > 0) this.env.store.win(p, 'mines', mine.mult);
    else this.env.store.giveBack(p, 'mines');
    this.progress(r, mine, now);
    this.env.wake();
    return { ok: true, mult: mine.picks ? mine.mult : 1, won: mine.picks ? Math.floor(mine.bet * mine.mult) : mine.bet };
  }

  get current(): { id: number; phase: string } | null {
    return this.round ? { id: this.round.id, phase: this.round.phase } : null;
  }
}
