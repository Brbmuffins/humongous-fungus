// What the page and the server say to each other. The server (games/hammys-arcade/server)
// is the only thing that rolls dice, holds coins or keeps time; the page draws what it's told.
import type { ArcadeGame, BetStats } from '@hammygotchi/arcade';
import type { LiveDealTable } from '@hammygotchi/roundsource';

/** Everything lives under this path, on the same origin as the page. */
export const API = '/arcade/api/';

/** What a new player starts with. */
export const START_COINS = 1000;
/** What the free top-up gives, when you're out. */
export const TOP_UP_COINS = 500;
/** Play money never gets silly: no more than this in a wallet. */
export const MAX_COINS = 1e15;

/** Timing of each game's rounds, in milliseconds (the server's clock). */
export const ROCKET_BET_MS = 7000;
export const ROCKET_PAUSE_MS = 5000;
export const CROSSING_BET_MS = 10_000;
/** Each lane: this long to say Go (or not) before the road decides. */
export const CROSSING_LANE_MS = 4000;
export const CROSSING_PAUSE_MS = 7000;
export const MINES_ROUND_MS = 60_000;
/** Once everyone's runs are over, a floor can end this early. */
export const MINES_MIN_ROUND_MS = 20_000;
export const MINES_PAUSE_MS = 6000;
/** No new run starts in the last moments of a floor. */
export const MINES_LAST_START_MS = 3000;
/** Plinko seeds rotate (and the old seed is revealed) after this many drops or this long. */
export const PLINKO_EPOCH_DROPS = 100;
export const PLINKO_EPOCH_MS = 15 * 60_000;

/** A Pizza Boxes round nobody has touched for this long settles itself (the same as walking away). */
export const DEAL_IDLE_MS = 120_000;
/** The most live rounds a page is told about at once. */
export const DEAL_LIVE_MAX = 40;
/** What a watcher can say: the page sends a number, never words. */
export const DEAL_REACTS: readonly string[] = ['No deal!', 'Take it!', 'Open that one!', 'Bold.', 'Ouch.', 'Nice box!'];

/** The games with rounds the server holds coins in until they finish. */
export type StakeGame = 'rocket' | 'crossing' | 'mines' | 'deal';

export interface Me {
  id: string;
  name: string;
  emoji: string;
  coins: number;
  topUps: number;
  /** Coins are riding on a round that hasn't finished (so there is no top-up yet). */
  riding: boolean;
  stats: Record<ArcadeGame, BetStats>;
}

/** Someone on a flight, a road or a floor: a real player or one of the made-up cast. */
export interface Rider {
  id: string;
  name: string;
  emoji: string;
  bet: number;
  real: boolean;
  /** The plant never gets out. */
  never?: boolean;
}

export interface RocketRider extends Rider {
  /** Where they bailed, once they have. */
  out: number | null;
}

export interface RocketRound {
  id: number;
  phase: 'bet' | 'fly' | 'crash';
  /** Published before anyone bets. */
  hash: string;
  startedAt: number;
  /** When the flight starts (and betting stops). */
  flightAt: number;
  riders: RocketRider[];
  /** Only once it's over. */
  crash?: number;
  cause?: string;
  endedAt?: number;
  seed?: string;
}

export type CrosserState = 'alive' | 'flat' | 'cashed' | 'done';

export interface Crosser extends Rider {
  difficulty: string;
  lane: number;
  mult: number;
  state: CrosserState;
}

export interface CrossingRound {
  id: number;
  phase: 'bet' | 'cross' | 'end';
  hash: string;
  startedAt: number;
  /** Lane 1 resolves at goAt + laneMs, lane 2 at goAt + 2 laneMs, and so on. */
  goAt: number;
  laneMs: number;
  /** The lane being decided now (0 while betting). */
  lane: number;
  crossers: Crosser[];
  endedAt?: number;
  seed?: string;
}

export type RunState = 'alive' | 'hit' | 'cashed' | 'cleared';

export interface Runner extends Rider {
  grid: number;
  mines: number;
  picks: number;
  mult: number;
  state: RunState;
}

export interface MinesRound {
  id: number;
  phase: 'open' | 'end';
  hash: string;
  startedAt: number;
  endsAt: number;
  runners: Runner[];
  seed?: string;
}

export interface PlinkoDrop {
  /** The drop's number: its nonce in the seed's epoch. */
  n: number;
  who: string;
  name: string;
  emoji: string;
  real: boolean;
  bet: number;
  rows: number;
  risk: string;
  /** Left and right bounces as 0s and 1s. */
  path: string;
  bin: number;
  mult: number;
  at: number;
}

/** A Pizza Boxes round as the sky shows it: no box contents that are still shut. */
export type DealTable = Omit<LiveDealTable, 'all'>;

/** Everything a page needs the moment it connects. */
export interface Snapshot {
  serverNow: number;
  cid: string;
  players: number;
  rocket: { round: RocketRound | null; history: number[] };
  crossing: { round: CrossingRound | null };
  mines: { round: MinesRound | null };
  plinko: { hash: string; epoch: number; first: number; recent: PlinkoDrop[] };
  deal: { live: DealTable[] };
}

/** The answer to every POST. */
export type Reply<T extends object = object> = ({ ok: true; serverNow: number } & T) | { ok: false; error: string; message: string; serverNow: number };
