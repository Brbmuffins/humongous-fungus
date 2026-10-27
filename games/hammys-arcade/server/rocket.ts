// Fart Rocket on the server: one flight everyone rides. A betting window, the
// climb (from the server's clock), the crash, a pause, again. The rules are
// the game's own (games/hammygotchi/src/rocket.ts and arcade.ts); this only
// keeps time, holds the coins and tells everyone what happened.
//
// Fairness: each round has a secret seed whose SHA-256 is published when
// betting opens. The crash point is crashPoint(rollAt(seed, 'crash')), what
// ends it is picked from the seed too, and the seed is revealed at the crash.
import { floor2 } from '@hammygotchi/arcade';
import { CRASHES, ROCKET_CROWD, crowd, multiplierAt, secondsTo, type Punter } from '@hammygotchi/rocket';
import { causeOf, crashOf } from '../shared/derive';
import { commit, stream } from '../shared/fair';
import { ROCKET_BET_MS, ROCKET_PAUSE_MS, type RocketRider, type RocketRound } from '../shared/protocol';
import { amountOf, fail, type Env, type Game, type Res } from './engine';
import type { Player } from './store';

interface Rider extends RocketRider {
  /** A player's bet, held in their wallet until the round ends. */
  player?: Player;
  /** Bails automatically at this multiplier. */
  auto: number | null;
  /** The made-up ones bail here (null: never). */
  target: number | null;
}

interface Round {
  id: number;
  seed: string;
  hash: string;
  crash: number;
  cause: string;
  phase: 'bet' | 'fly' | 'crash';
  startedAt: number;
  flightAt: number;
  /** When the flight ends: the first moment the multiplier has reached the crash point. */
  crashAt: number;
  endedAt: number;
  riders: Rider[];
  /** How many riders the made-up cast and real players make up between them. */
  cast: number;
  /** Bails still to come in flight, in order. */
  agenda: { at: number; rider: Rider; mult: number }[];
}

export const HISTORY = 14;

/** The moment the multiplier gets to `mult`, as milliseconds after the flight starts (rounded up). */
export const msTo = (mult: number): number => Math.ceil(secondsTo(mult) * 1000);

export class RocketGame implements Game {
  readonly id = 'rocket' as const;
  private round: Round | null = null;
  private counter = 0;
  readonly history: number[] = [];

  constructor(private env: Env) {}

  // Rounds ----------------------------------------------------------------------

  private open(at: number): void {
    const seed = this.env.newSeed();
    const crash = crashOf(seed);
    const bots: Punter[] = crowd(stream(seed, 'cast'));
    const r: Round = {
      id: ++this.counter,
      seed,
      hash: commit(seed),
      crash,
      cause: causeOf(seed, crash),
      phase: 'bet',
      startedAt: at,
      flightAt: at + ROCKET_BET_MS,
      crashAt: at + ROCKET_BET_MS + msTo(crash),
      endedAt: 0,
      riders: bots.map((p) => ({ id: `b${ROCKET_CROWD.findIndex((c) => c.name === p.name)}`, name: p.name, emoji: p.emoji, bet: p.bet, real: false, out: null, never: p.target === null || undefined, auto: null, target: p.target })),
      cast: bots.length,
      agenda: [],
    };
    this.round = r;
    this.env.emit('rocket.betting', { round: this.pub(r) });
    this.env.wake();
  }

  private pub(r: Round): RocketRound {
    const out: RocketRound = {
      id: r.id,
      phase: r.phase,
      hash: r.hash,
      startedAt: r.startedAt,
      flightAt: r.flightAt,
      riders: r.riders.map((x) => ({ id: x.id, name: x.name, emoji: x.emoji, bet: x.bet, real: x.real, out: x.out, ...(x.never ? { never: true } : {}) })),
    };
    if (r.phase === 'crash') {
      out.crash = r.crash;
      out.cause = r.cause;
      out.endedAt = r.endedAt;
      out.seed = r.seed;
    }
    return out;
  }

  snapshot(): { round: RocketRound | null; history: number[] } {
    return { round: this.round ? this.pub(this.round) : null, history: [...this.history] };
  }

  private hasStakes(r: Round): boolean {
    return r.riders.some((x) => x.real && x.player && x.out === null);
  }

  /** Real players step in, the made-up ones step aside: never more than the cast's size between them. */
  private makeRoom(r: Round): void {
    while (r.riders.length > r.cast) {
      const i = r.riders.map((x) => x.real).lastIndexOf(false);
      if (i < 0) break;
      const [gone] = r.riders.splice(i, 1);
      this.env.emit('rocket.left', { round: r.id, id: gone.id });
    }
  }

  // Time ------------------------------------------------------------------------

  tick(): void {
    for (let guard = 0; guard < 50; guard++) {
      const now = this.env.now();
      const r = this.round;
      if (!r) {
        if (this.env.clients() > 0) this.open(now);
        return;
      }
      if (r.phase === 'bet') {
        if (now >= r.flightAt) this.launch(r);
        else if (this.env.clients() === 0 && !this.hasStakes(r)) {
          // Nobody's here and nobody's bet: let the sky sleep.
          this.round = null;
          return;
        } else return;
      } else if (r.phase === 'fly') {
        const until = Math.min(now, r.crashAt);
        while (r.agenda.length && r.agenda[0].at <= until) this.bail(r, r.agenda.shift()!);
        if (now >= r.crashAt) this.boom(r);
        else return;
      } else {
        if (now < r.endedAt + ROCKET_PAUSE_MS) return;
        if (this.env.clients() > 0) this.open(r.endedAt + ROCKET_PAUSE_MS);
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
    if (r.phase === 'bet') return r.flightAt;
    if (r.phase === 'fly') return Math.min(r.crashAt, r.agenda[0]?.at ?? Infinity);
    return r.endedAt + ROCKET_PAUSE_MS;
  }

  clientsChanged(): void {
    if (!this.round && this.env.clients() > 0) this.open(this.env.now());
  }

  private launch(r: Round): void {
    r.phase = 'fly';
    // Who bails when: the made-up cast at their nerve, players at the target they set.
    for (const x of r.riders) {
      const mult = x.real ? x.auto : x.target;
      if (x.out === null && mult !== null && mult >= 1.01 && mult < r.crash) r.agenda.push({ at: r.flightAt + msTo(mult), rider: x, mult: floor2(mult) });
    }
    r.agenda.sort((a, b) => a.at - b.at);
    this.env.emit('rocket.start', { round: r.id, flightAt: r.flightAt, riders: this.pub(r).riders });
  }

  private bail(r: Round, a: { at: number; rider: Rider; mult: number }): void {
    const x = a.rider;
    if (x.out !== null) return;
    x.out = a.mult;
    if (x.player) this.env.store.win(x.player, 'rocket', a.mult);
    this.env.emit('rocket.bail', { round: r.id, id: x.id, mult: a.mult, at: a.at });
  }

  private boom(r: Round): void {
    r.phase = 'crash';
    r.endedAt = r.crashAt;
    for (const x of r.riders) if (x.player && x.out === null) this.env.store.lose(x.player, 'rocket');
    this.history.unshift(r.crash);
    if (this.history.length > HISTORY) this.history.pop();
    this.env.emit('rocket.crash', { round: r.id, crash: r.crash, cause: r.cause, at: r.crashAt });
    this.env.emit('rocket.reveal', { round: r.id, seed: r.seed, hash: r.hash });
  }

  shutdown(): void {
    const r = this.round;
    if (!r || r.phase === 'crash') return;
    for (const x of r.riders) if (x.player && x.out === null) this.env.store.giveBack(x.player, 'rocket');
  }

  // Players ---------------------------------------------------------------------

  handle(action: string, p: Player, body: Record<string, unknown>): Res | null {
    if (action !== 'bet' && action !== 'unbet' && action !== 'bail') return null;
    this.tick();
    const r = this.round;
    const now = this.env.now();
    const mine = r?.riders.find((x) => x.player === p);
    if (action === 'bet') {
      if (!r || r.phase !== 'bet' || now >= r.flightAt) return fail('closed');
      if (mine) return fail('already');
      const amount = amountOf(body.amount);
      if (amount === null) return fail('amount');
      let auto: number | null = null;
      if (body.auto !== undefined && body.auto !== null) {
        const a = Number(body.auto);
        if (!Number.isFinite(a) || a < 1.01 || a > 10_000) return fail('bad_request', 'The bail-out has to be between 1.01 and 10000.');
        auto = Math.round(a * 100) / 100;
      }
      if (!this.env.store.stake(p, 'rocket', amount)) return fail('coins');
      const x: Rider = { id: p.id, name: p.name, emoji: p.emoji, bet: amount, real: true, out: null, player: p, auto, target: null };
      r.riders.push(x);
      this.env.emit('rocket.bet', { round: r.id, rider: { id: x.id, name: x.name, emoji: x.emoji, bet: x.bet, real: true, out: null } });
      this.makeRoom(r);
      return { ok: true, round: r.id };
    }
    if (action === 'unbet') {
      if (!r || r.phase !== 'bet' || now >= r.flightAt || !mine) return fail(mine ? 'closed' : 'not_in');
      this.env.store.giveBack(p, 'rocket');
      r.riders.splice(r.riders.indexOf(mine), 1);
      this.env.emit('rocket.left', { round: r.id, id: p.id });
      return { ok: true };
    }
    // bail: the multiplier at this moment on the server's clock, if the flight is still on.
    if (!mine) return fail('not_in');
    if (!r || r.phase !== 'fly' || now >= r.crashAt) return fail('late', 'Too late. It already ended.');
    if (mine.out !== null) return fail('already', 'You already bailed.');
    const mult = floor2(multiplierAt((now - r.flightAt) / 1000));
    const i = r.agenda.findIndex((a) => a.rider === mine);
    if (i >= 0) r.agenda.splice(i, 1);
    this.bail(r, { at: now, rider: mine, mult: Math.max(1, mult) });
    this.env.wake();
    return { ok: true, mult: mine.out, won: Math.floor(mine.bet * (mine.out ?? 1)) };
  }

  /** For tests and /health. */
  get current(): { id: number; phase: string } | null {
    return this.round ? { id: this.round.id, phase: this.round.phase } : null;
  }

  /** The cast, for the tests. */
  static readonly causes: readonly string[] = CRASHES.map((c) => c.id);
}
