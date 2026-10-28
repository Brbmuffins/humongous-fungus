// Hammy Crossing on the server: one road, everyone crosses. A betting window,
// then the lanes step on a shared clock. For each lane the road draws ONE roll
// u (from the round's committed seed) for everybody: a crosser is flattened if
// u < the risk of the road they picked (Easy 4%, Medium 12%, Hard 20%,
// Daredevil 40%). So a very bad roll flattens everyone, a middling one only
// the Daredevils, and the same truck is what hits them.
//
// Each lane every crosser has LANE_MS to say Go. Not saying Go means standing
// still, and standing still means cashing out at what they have: the safe
// default, so walking away from the screen never walks Hammy into traffic.
// Pay is the game's own (laneMultiplier in crossing.ts): 0.99 / (1 - risk)^lanes.
import { DIFFICULTIES, DIFFICULTY_BY_ID, laneMultiplier, type Difficulty } from '@hammygotchi/crossing';
import { ROCKET_CROWD, crowd, type Punter } from '@hammygotchi/rocket';
import { laneRoll, truckOf } from '../shared/derive';
import { commit, rollAt, stream } from '../shared/fair';
import { CROSSING_BET_MS, CROSSING_LANE_MS, CROSSING_PAUSE_MS, type Crosser, type CrossingRound } from '../shared/protocol';
import { amountOf, fail, type Env, type Game, type Res } from './engine';
import type { Player } from './store';

/** How long the last step plays before the round is called over. */
const STEP_MS = 1500;

interface Walker extends Crosser {
  player?: Player;
  /** The lane this player said Go for (0: none yet). */
  go: number;
  /** The made-up ones cash out after this many lanes. */
  stop: number;
}

interface Round {
  id: number;
  seed: string;
  hash: string;
  phase: 'bet' | 'cross' | 'end';
  startedAt: number;
  goAt: number;
  /** The lane being decided now. */
  lane: number;
  walkers: Walker[];
  cast: number;
  /** Set when nobody's left to cross: the round ends then. */
  finishing: number | null;
  endedAt: number;
}

export const MAX_LANES = Math.max(...DIFFICULTIES.map((d) => d.lanes));
/** Real players on one road. */
export const MAX_CROSSERS = 100;

export class CrossingGame implements Game {
  readonly id = 'crossing' as const;
  private round: Round | null = null;
  private counter = 0;

  constructor(private env: Env) {}

  resolveAt(r: Round, lane: number): number {
    return r.goAt + lane * CROSSING_LANE_MS;
  }

  private open(at: number): void {
    const seed = this.env.newSeed();
    const bots: Punter[] = crowd(stream(seed, 'cast'));
    const r: Round = {
      id: ++this.counter,
      seed,
      hash: commit(seed),
      phase: 'bet',
      startedAt: at,
      goAt: at + CROSSING_BET_MS,
      lane: 0,
      walkers: bots.map((p, i) => {
        const roll = rollAt(seed, 'bot', i);
        const d = DIFFICULTIES[roll < 0.2 ? 0 : roll < 0.6 ? 1 : roll < 0.85 ? 2 : 3];
        const k = rollAt(seed, 'botstop', i);
        const stop = p.style === 'safe' ? 2 + Math.floor(k * 4) : p.style === 'mid' ? 5 + Math.floor(k * 6) : 99;
        return { id: `b${ROCKET_CROWD.findIndex((c) => c.name === p.name)}`, name: p.name, emoji: p.emoji, bet: p.bet, real: false, ...(p.target === null ? { never: true } : {}), difficulty: d.id, lane: 0, mult: 1, state: 'alive' as const, go: 0, stop };
      }),
      cast: bots.length,
      finishing: null,
      endedAt: 0,
    };
    this.round = r;
    this.env.emit('crossing.betting', { round: this.pub(r) });
    this.env.wake();
  }

  private pubWalker(w: Walker): Crosser {
    const { id, name, emoji, bet, real, never, difficulty, lane, mult, state } = w;
    return { id, name, emoji, bet, real, ...(never ? { never } : {}), difficulty, lane, mult, state };
  }

  private pub(r: Round): CrossingRound {
    const out: CrossingRound = { id: r.id, phase: r.phase, hash: r.hash, startedAt: r.startedAt, goAt: r.goAt, laneMs: CROSSING_LANE_MS, lane: r.lane, crossers: r.walkers.map((w) => this.pubWalker(w)) };
    if (r.phase === 'end') {
      out.endedAt = r.endedAt;
      out.seed = r.seed;
    }
    return out;
  }

  snapshot(): { round: CrossingRound | null } {
    return { round: this.round ? this.pub(this.round) : null };
  }

  // Time ------------------------------------------------------------------------

  tick(): void {
    for (let guard = 0; guard < 200; guard++) {
      const now = this.env.now();
      const r = this.round;
      if (!r) {
        if (this.env.clients() > 0) this.open(now);
        return;
      }
      if (r.phase === 'bet') {
        if (now >= r.goAt) {
          r.phase = 'cross';
          r.lane = 1;
          this.env.emit('crossing.start', { round: r.id, goAt: r.goAt, laneMs: CROSSING_LANE_MS, crossers: r.walkers.map((w) => this.pubWalker(w)) });
        } else if (this.env.clients() === 0 && !r.walkers.some((w) => w.player)) {
          this.round = null;
          return;
        } else return;
      } else if (r.phase === 'cross') {
        if (r.finishing !== null) {
          if (now >= r.finishing) this.end(r);
          else return;
        } else if (now >= this.resolveAt(r, r.lane)) this.resolve(r);
        else return;
      } else {
        if (now < r.endedAt + CROSSING_PAUSE_MS) return;
        if (this.env.clients() > 0) this.open(r.endedAt + CROSSING_PAUSE_MS);
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
    if (r.phase === 'bet') return r.goAt;
    if (r.phase === 'cross') return r.finishing ?? this.resolveAt(r, r.lane);
    return r.endedAt + CROSSING_PAUSE_MS;
  }

  clientsChanged(): void {
    if (!this.round && this.env.clients() > 0) this.open(this.env.now());
  }

  /** The road decides lane `r.lane` for everyone who's still crossing. */
  private resolve(r: Round): void {
    const k = r.lane;
    const at = this.resolveAt(r, k);
    const u = laneRoll(r.seed, k);
    const truck = truckOf(r.seed, k);
    const results: { id: string; state: Walker['state']; lane: number; mult: number }[] = [];
    for (const w of r.walkers) {
      if (w.state !== 'alive') continue;
      const goes = w.player ? w.go === k : w.lane < w.stop;
      if (!goes) {
        this.cash(w, 'cashed');
      } else if (u < DIFFICULTY_BY_ID[w.difficulty as Difficulty].risk) {
        w.state = 'flat';
        if (w.player) this.env.store.lose(w.player, 'crossing');
      } else {
        w.lane = k;
        w.mult = laneMultiplier(w.difficulty as Difficulty, k);
        if (k >= DIFFICULTY_BY_ID[w.difficulty as Difficulty].lanes) this.cash(w, 'done');
      }
      results.push({ id: w.id, state: w.state, lane: w.lane, mult: w.mult });
    }
    r.lane = k + 1;
    this.env.emit('crossing.lane', { round: r.id, lane: k, u, truck, at, results });
    this.checkEnd(r, at);
  }

  /** Pay out a crosser at what they have. */
  private cash(w: Walker, state: 'cashed' | 'done'): void {
    w.state = state;
    if (w.player) this.env.store.win(w.player, 'crossing', w.mult);
  }

  /** Nobody real is left crossing (and somebody real was, or nobody at all is): call it. */
  private checkEnd(r: Round, at: number): void {
    if (r.finishing !== null) return;
    const aliveReal = r.walkers.some((w) => w.real && w.state === 'alive');
    const anyReal = r.walkers.some((w) => w.real);
    const alive = r.walkers.some((w) => w.state === 'alive');
    if (!aliveReal && (anyReal || !alive)) r.finishing = at + STEP_MS;
  }

  private end(r: Round): void {
    r.phase = 'end';
    r.endedAt = r.finishing ?? this.env.now();
    const results: { id: string; state: Walker['state']; lane: number; mult: number }[] = [];
    for (const w of r.walkers) {
      if (w.state !== 'alive') continue;
      // Still on the road when it's over (the made-up ones): they stop where they are.
      this.cash(w, 'cashed');
      results.push({ id: w.id, state: w.state, lane: w.lane, mult: w.mult });
    }
    this.env.emit('crossing.end', { round: r.id, seed: r.seed, hash: r.hash, at: r.endedAt, results });
  }

  shutdown(): void {
    const r = this.round;
    if (!r || r.phase === 'end') return;
    for (const w of r.walkers) if (w.player && w.state === 'alive') this.env.store.giveBack(w.player, 'crossing');
  }

  // Players ---------------------------------------------------------------------

  private makeRoom(r: Round): void {
    while (r.walkers.length > r.cast) {
      const i = r.walkers.map((w) => w.real).lastIndexOf(false);
      if (i < 0) break;
      const [gone] = r.walkers.splice(i, 1);
      this.env.emit('crossing.left', { round: r.id, id: gone.id });
    }
  }

  handle(action: string, p: Player, body: Record<string, unknown>): Res | null {
    if (!['bet', 'unbet', 'go', 'cash'].includes(action)) return null;
    this.tick();
    const r = this.round;
    const now = this.env.now();
    const mine = r?.walkers.find((w) => w.player === p);
    if (action === 'bet') {
      if (!r || r.phase !== 'bet' || now >= r.goAt) return fail('closed');
      if (mine) return fail('already');
      const amount = amountOf(body.amount);
      if (amount === null) return fail('amount');
      const d = typeof body.difficulty === 'string' && Object.hasOwn(DIFFICULTY_BY_ID, body.difficulty) ? (body.difficulty as Difficulty) : null;
      if (!d) return fail('bad_request', 'Pick a road.');
      if (r.walkers.filter((w) => w.real).length >= MAX_CROSSERS) return fail('full');
      if (!this.env.store.stake(p, 'crossing', amount)) return fail('coins');
      const w: Walker = { id: p.id, name: p.name, emoji: p.emoji, bet: amount, real: true, difficulty: d, lane: 0, mult: 1, state: 'alive', player: p, go: 0, stop: 0 };
      r.walkers.push(w);
      this.env.emit('crossing.bet', { round: r.id, crosser: this.pubWalker(w) });
      this.makeRoom(r);
      return { ok: true, round: r.id };
    }
    if (action === 'unbet') {
      if (!r || !mine) return fail('not_in');
      if (r.phase !== 'bet' || now >= r.goAt) return fail('closed');
      this.env.store.giveBack(p, 'crossing');
      r.walkers.splice(r.walkers.indexOf(mine), 1);
      this.env.emit('crossing.left', { round: r.id, id: p.id });
      return { ok: true };
    }
    if (!r || !mine) return fail('not_in');
    if (r.phase !== 'cross' || r.finishing !== null || mine.state !== 'alive') return fail('late', 'That one is over for you.');
    if (action === 'go') {
      const lane = body.lane;
      if (lane !== r.lane || mine.lane !== r.lane - 1) return fail('late', 'That lane is already decided.');
      mine.go = r.lane;
      return { ok: true, lane: r.lane };
    }
    // cash: take what you have, before the road decides the next lane.
    this.cash(mine, 'cashed');
    this.env.emit('crossing.cash', { round: r.id, id: mine.id, lane: mine.lane, mult: mine.mult, at: now });
    this.checkEnd(r, now);
    this.env.wake();
    return { ok: true, lane: mine.lane, mult: mine.mult, won: Math.floor(mine.bet * mine.mult) };
  }

  get current(): { id: number; phase: string } | null {
    return this.round ? { id: this.round.id, phase: this.round.phase } : null;
  }
}
