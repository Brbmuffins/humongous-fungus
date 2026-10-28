// What every game on the server shares: the world it runs in (the clock, the
// players, the way to tell everyone connected), and how it answers a request.
import type { ArcadeGame } from '@hammygotchi/arcade';
import { randomBytes } from 'node:crypto';
import type { Player, Store } from './store';

export interface Env {
  now(): number;
  store: Store;
  /** Tell everyone connected. `name` is the event's name; the hub adds serverNow. */
  emit(name: string, data: Record<string, unknown>): void;
  /** Pages connected right now. */
  clients(): number;
  /** A fresh random seed: 64 hex characters. */
  newSeed(): string;
  /** A game's next deadline changed: the runner should look again. */
  wake(): void;
}

export const newSeed = (): string => randomBytes(32).toString('hex');

export type Res = { ok: true; [k: string]: unknown } | { ok: false; error: string; message: string };

const MESSAGES: Record<string, string> = {
  closed: 'Betting is closed for this one.',
  already: 'You are already in this one.',
  not_in: 'You are not in this one.',
  coins: 'Not enough coins for that bet.',
  amount: 'That is not a bet.',
  late: 'Too late.',
  bad_request: 'That did not make sense.',
  full: 'It is full. Try the next one.',
  wait: 'Hold on, wait for the next round.',
};

export const fail = (error: string, message?: string): Res => ({ ok: false, error, message: message ?? MESSAGES[error] ?? error });

/** A bet amount: a whole number of coins, at least the smallest bet. */
export function amountOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 ? v : null;
}

export interface Game {
  readonly id: ArcadeGame;
  /** Public state for a page that just connected. */
  snapshot(): unknown;
  /** Do whatever is due by now. */
  tick(): void;
  /** When the next thing is due (ms, server clock), or null. */
  nextAt(): number | null;
  /** Someone connected or left. */
  clientsChanged(): void;
  /** Stopping: give back coins that are riding on rounds that can't finish. */
  shutdown(): void;
  /** A player's request (`POST /arcade/api/<game>/<action>`); null if there's no such action. */
  handle(action: string, p: Player, body: Record<string, unknown>): Res | null;
}
