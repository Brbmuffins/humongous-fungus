// Poop Plinko on the server: one shared board. Drop whenever you like; the
// server rolls the path of each drop and tells everyone, and every page draws
// every player's poop bouncing down with their name.
//
// Fairness: there are no rounds, so drops are numbered (a nonce) and the seed
// is an "epoch": a seed whose SHA-256 is published before its first drop, used
// for the next PLINKO_EPOCH_DROPS drops (or PLINKO_EPOCH_MS), then revealed
// and replaced. Drop n's path is plinkoPathOf(seed, n, rows).
import { PLINKO_RISKS, PLINKO_ROWS, type PlinkoRisk, type PlinkoRows } from '@hammygotchi/plinko';
import { ROCKET_CROWD } from '@hammygotchi/rocket';
import { randomInt } from 'node:crypto';
import { plinkoPathOf, plinkoResult } from '../shared/derive';
import { commit } from '../shared/fair';
import { PLINKO_EPOCH_DROPS, PLINKO_EPOCH_MS, type PlinkoDrop } from '../shared/protocol';
import { Buckets } from './limits';
import { amountOf, fail, type Env, type Game, type Res } from './engine';
import type { Player } from './store';

export const RECENT = 12;
const BOT_BETS = [5, 10, 20, 25, 50, 100, 250];

export class PlinkoGame implements Game {
  readonly id = 'plinko' as const;
  private seed: string;
  private hash: string;
  private epoch = 1;
  /** The first drop number under this seed, and the next one. */
  private first = 1;
  private nonce = 1;
  private epochAt: number;
  private recent: PlinkoDrop[] = [];
  private realAt: number[] = [];
  private botAt: number | null = null;
  private limit: Buckets;

  constructor(private env: Env) {
    this.seed = env.newSeed();
    this.hash = commit(this.seed);
    this.epochAt = env.now();
    // Five drops at once, then two and a half a second.
    this.limit = new Buckets(5, 2.5, () => env.now());
  }

  snapshot(): { hash: string; epoch: number; first: number; recent: PlinkoDrop[] } {
    return { hash: this.hash, epoch: this.epoch, first: this.first, recent: [...this.recent] };
  }

  private make(who: { id: string; name: string; emoji: string; real: boolean }, bet: number, rows: PlinkoRows, risk: PlinkoRisk, at: number): PlinkoDrop {
    const n = this.nonce++;
    const path = plinkoPathOf(this.seed, n, rows);
    const { bin, mult } = plinkoResult(path, rows, risk);
    const drop: PlinkoDrop = { n, who: who.id, name: who.name, emoji: who.emoji, real: who.real, bet, rows, risk, path: path.map((b) => (b ? '1' : '0')).join(''), bin, mult, at };
    this.recent.push(drop);
    if (this.recent.length > RECENT) this.recent.shift();
    if (who.real) {
      this.realAt.push(at);
      if (this.realAt.length > 20) this.realAt.shift();
    }
    this.env.emit('plinko.drop', { drop });
    this.rotate(at);
    return drop;
  }

  /** Reveal the seed and start a new one when this one's had its share. */
  private rotate(at: number): void {
    if (this.nonce - this.first < PLINKO_EPOCH_DROPS && at - this.epochAt < PLINKO_EPOCH_MS) return;
    this.env.emit('plinko.reveal', { epoch: this.epoch, seed: this.seed, hash: this.hash, first: this.first, last: this.nonce - 1 });
    this.seed = this.env.newSeed();
    this.hash = commit(this.seed);
    this.epoch += 1;
    this.first = this.nonce;
    this.epochAt = at;
    this.env.emit('plinko.epoch', { epoch: this.epoch, hash: this.hash, first: this.first });
  }

  tick(): void {
    const now = this.env.now();
    if (this.env.clients() === 0) {
      this.botAt = null;
      return;
    }
    if (this.botAt === null) this.botAt = now + 1500;
    if (now < this.botAt) return;
    // The cast drops one now and then, but only when it's quiet.
    this.realAt = this.realAt.filter((t) => now - t < 10_000);
    this.botAt = now + 2500 + randomInt(3500);
    if (this.realAt.length >= 3) return;
    const i = randomInt(ROCKET_CROWD.length);
    const c = ROCKET_CROWD[i];
    const rows = PLINKO_ROWS[randomInt(PLINKO_ROWS.length)];
    const risk = PLINKO_RISKS[randomInt(PLINKO_RISKS.length)];
    this.make({ id: `b${i}`, name: c.name, emoji: c.emoji, real: false }, BOT_BETS[randomInt(BOT_BETS.length)], rows, risk, now);
  }

  nextAt(): number | null {
    if (this.env.clients() === 0) return null;
    return this.botAt ?? this.env.now() + 1500;
  }

  clientsChanged(): void {
    if (this.env.clients() > 0 && this.botAt === null) {
      this.botAt = this.env.now() + 1500;
      this.env.wake();
    }
  }

  shutdown(): void {
    // Every drop is paid the moment it's made: nothing is riding.
  }

  handle(action: string, p: Player, body: Record<string, unknown>): Res | null {
    if (action !== 'drop') return null;
    const amount = amountOf(body.amount);
    if (amount === null) return fail('amount');
    const rows = PLINKO_ROWS.find((r) => r === body.rows);
    const risk = PLINKO_RISKS.find((r) => r === body.risk);
    if (!rows || !risk) return fail('bad_request', 'Pick the rows and the risk.');
    if (!this.limit.take(p.id)) return fail('rate', 'Easy there. One poop at a time.');
    if (p.coins < amount) return fail('coins');
    // Roll the drop, then take the coins and pay the result in one go (the page holds the win back until the poop lands).
    const drop = this.make({ id: p.id, name: p.name, emoji: p.emoji, real: true }, amount, rows, risk, this.env.now());
    const won = this.env.store.instant(p, 'plinko', amount, drop.mult) ?? 0;
    return { ok: true, drop, won };
  }
}
