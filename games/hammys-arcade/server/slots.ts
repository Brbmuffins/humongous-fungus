// Hammy Slots on the server: solo spins, decided here. Nobody waits for anybody:
// a spin is rolled and paid the moment it's asked for, and the machines say
// nothing to the sky unless it's a big one (BIG WIN, 10x the bet, and up), so
// the other pages hear about a handful of wins, never every spin.
//
// Fairness is Poop Plinko's: spins are numbered (a nonce) and the seed is an
// "epoch": its SHA-256 is published before its first spin, it is used for the
// next SLOTS_EPOCH_SPINS spins (or SLOTS_EPOCH_MS), then revealed and replaced.
// Spin n is slotsSpinOf(seed, n): the pure rules in games/hammygotchi/src/slots.ts
// fed the seed's rolls for "slots:n", so anyone can play it again.
import { payMultiplier, tierOf, spin } from '@hammygotchi/slots';
import { ROCKET_CROWD } from '@hammygotchi/rocket';
import { randomInt } from 'node:crypto';
import { slotsSpinOf } from '../shared/derive';
import { commit } from '../shared/fair';
import { SLOTS_EPOCH_MS, SLOTS_EPOCH_SPINS, type SlotsBig } from '../shared/protocol';
import { Buckets } from './limits';
import { amountOf, fail, type Env, type Game, type Res } from './engine';
import type { Player } from './store';

/** The last big wins kept for a page that has just connected. */
export const FEED = 8;
/** A win at least this many times the bet is told to everybody (the BIG WIN tier). */
export const BIG_AT = 10;
/** The cast stays quiet for this long after any big win was announced. */
const QUIET_MS = 20_000;

export class SlotsGame implements Game {
  readonly id = 'slots' as const;
  private seed: string;
  private hash: string;
  private epoch = 1;
  private first = 1;
  private nonce = 1;
  private epochAt: number;
  private feed: SlotsBig[] = [];
  private lastBigAt = -Infinity;
  private botAt: number | null = null;
  private limit: Buckets;

  constructor(private env: Env) {
    this.seed = env.newSeed();
    this.hash = commit(this.seed);
    this.epochAt = env.now();
    // Five spins at once, then two and a half a second (as Plinko).
    this.limit = new Buckets(5, 2.5, () => env.now());
  }

  snapshot(): { hash: string; epoch: number; first: number; feed: SlotsBig[] } {
    return { hash: this.hash, epoch: this.epoch, first: this.first, feed: [...this.feed] };
  }

  private announce(who: { id: string; name: string; emoji: string; real: boolean }, n: number, bet: number, mult: number, at: number): void {
    const tier = tierOf(mult);
    if (!tier || mult < BIG_AT) return;
    const win: SlotsBig = { n, who: who.id, name: who.name, emoji: who.emoji, real: who.real, bet, mult, tier: tier.label, at };
    this.feed.push(win);
    if (this.feed.length > FEED) this.feed.shift();
    this.lastBigAt = at;
    this.env.emit('slots.big', { win });
  }

  /** Reveal the seed and start a new one when this one's had its share. */
  private rotate(at: number): void {
    if (this.nonce - this.first < SLOTS_EPOCH_SPINS && at - this.epochAt < SLOTS_EPOCH_MS) return;
    this.env.emit('slots.reveal', { epoch: this.epoch, seed: this.seed, hash: this.hash, first: this.first, last: this.nonce - 1 });
    this.seed = this.env.newSeed();
    this.hash = commit(this.seed);
    this.epoch += 1;
    this.first = this.nonce;
    this.epochAt = at;
    this.env.emit('slots.epoch', { epoch: this.epoch, hash: this.hash, first: this.first });
  }

  tick(): void {
    const now = this.env.now();
    if (this.env.clients() === 0) {
      this.botAt = null;
      return;
    }
    if (this.botAt === null) this.botAt = now + 2000;
    if (now < this.botAt) return;
    this.botAt = now + 700 + randomInt(1800);
    // The cast plays the machines too (their own luck, not under the seed: no coins ride on it), and
    // brags about a big win now and then, but only when it's quiet.
    const sp = spin(() => randomInt(2 ** 32) / 2 ** 32);
    if (sp.mult < BIG_AT || now - this.lastBigAt < QUIET_MS) return;
    const i = randomInt(ROCKET_CROWD.length);
    const c = ROCKET_CROWD[i];
    this.announce({ id: `b${i}`, name: c.name, emoji: c.emoji, real: false }, 0, [5, 10, 20, 25, 50, 100, 250][randomInt(7)], sp.mult, now);
  }

  nextAt(): number | null {
    if (this.env.clients() === 0) return null;
    return this.botAt ?? this.env.now() + 2000;
  }

  clientsChanged(): void {
    if (this.env.clients() > 0 && this.botAt === null) {
      this.botAt = this.env.now() + 2000;
      this.env.wake();
    }
  }

  shutdown(): void {
    // Every spin is paid the moment it's made: nothing is riding.
  }

  handle(action: string, p: Player, body: Record<string, unknown>): Res | null {
    if (action !== 'spin') return null;
    const amount = amountOf(body.amount);
    if (amount === null) return fail('amount');
    if (!this.limit.take(p.id)) return fail('rate', 'Easy there. The machine needs a moment.');
    if (p.coins < amount) return fail('coins');
    const at = this.env.now();
    const n = this.nonce++;
    const sp = slotsSpinOf(this.seed, n);
    // Take the coins and pay the result in one go (the page holds the win back until its reels have stopped).
    const won = this.env.store.instant(p, 'slots', amount, payMultiplier(amount, sp.units)) ?? 0;
    this.announce({ id: p.id, name: p.name, emoji: p.emoji, real: true }, n, amount, sp.mult, at);
    this.rotate(at);
    return { ok: true, n, spin: sp, won };
  }
}
