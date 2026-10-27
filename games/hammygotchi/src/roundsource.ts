// Where a game's rounds come from. Hammygotchi's own arcade rolls every round
// on the phone itself. Hammy's Arcade, when its server is there, hands the
// same screens a "round source" instead: one shared round that everyone is
// in, decided on the server. The screens draw what the source says and send
// the player's choices to it; nothing in here rolls a die or holds a coin.
// Types only: the server and its client live in games/hammys-arcade.

export type SourceReply<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };

/** Someone in a round: another player, or one of the made-up cast. */
export interface LiveRider {
  id: string;
  name: string;
  emoji: string;
  bet: number;
  /** A real player (the rest are the made-up cast). */
  real: boolean;
  /** The plant never gets out. */
  never?: boolean;
}

/** What every source can say. */
export interface SourceBase {
  /** Your own id in the rounds. */
  readonly me: string;
  /** The server's clock now, in ms. */
  now(): number;
  /** One line about the round's fairness (the committed hash, then whether the revealed seed checked out). */
  fair(): string;
  /** Whether the connection is up. */
  online(): boolean;
}

// Fart Rocket -------------------------------------------------------------------

export interface LiveRocket {
  id: number;
  phase: 'bet' | 'fly' | 'crash';
  startedAt: number;
  /** When the flight starts, on the server's clock. */
  flightAt: number;
  riders: (LiveRider & { out: number | null })[];
  crash?: number;
  cause?: string;
}

export interface RocketSource extends SourceBase {
  round(): LiveRocket | null;
  /** Where the last flights ended, newest first. */
  history(): readonly number[];
  bet(amount: number, auto: number | null): Promise<SourceReply>;
  unbet(): Promise<SourceReply>;
  bail(): Promise<SourceReply>;
}

// Hammy Crossing ----------------------------------------------------------------

export interface LiveCrosser extends LiveRider {
  difficulty: string;
  lane: number;
  mult: number;
  state: 'alive' | 'flat' | 'cashed' | 'done';
}

export interface LiveLane {
  lane: number;
  u: number;
  truck: string;
  at: number;
  results: { id: string; state: LiveCrosser['state']; lane: number; mult: number }[];
}

export interface LiveCrossing {
  id: number;
  phase: 'bet' | 'cross' | 'end';
  startedAt: number;
  /** Lane k is decided at goAt + k * laneMs. */
  goAt: number;
  laneMs: number;
  /** The lane being decided now (0 while betting). */
  lane: number;
  crossers: LiveCrosser[];
  /** Lanes decided so far this round. */
  lanes: LiveLane[];
}

export interface CrossingSource extends SourceBase {
  round(): LiveCrossing | null;
  bet(amount: number, difficulty: string): Promise<SourceReply>;
  unbet(): Promise<SourceReply>;
  go(lane: number): Promise<SourceReply>;
  cash(): Promise<SourceReply>;
}

// Hammy Mines -------------------------------------------------------------------

export interface LiveRunner extends LiveRider {
  grid: number;
  mines: number;
  picks: number;
  mult: number;
  state: 'alive' | 'hit' | 'cashed' | 'cleared';
}

export interface LiveMines {
  id: number;
  phase: 'open' | 'end';
  startedAt: number;
  endsAt: number;
  runners: LiveRunner[];
}

export interface MinesSource extends SourceBase {
  round(): LiveMines | null;
  start(amount: number, grid: number, mines: number): Promise<SourceReply<{ endsAt: number }>>;
  open(index: number): Promise<SourceReply<{ safe: boolean; picks: number; mult: number; state: string; won?: number }>>;
  cash(): Promise<SourceReply<{ mult: number; won: number }>>;
  /** The floor you were on, once the round's seed is out: which boxes hid poop. */
  floor(grid: number, mines: number): boolean[] | null;
}

// Poop Plinko -------------------------------------------------------------------

export interface LiveDrop {
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

export interface PlinkoSource extends SourceBase {
  /** The last drops from everybody, newest first. */
  recent(): readonly LiveDrop[];
  /** Called with every drop but your own, as it happens. Returns a way to stop. */
  onDrop(f: (d: LiveDrop) => void): () => void;
  drop(amount: number, rows: number, risk: string): Promise<SourceReply<{ drop: LiveDrop; won: number }>>;
  /** A drop's winnings are on the server already; the wallet keeps them back until the ball lands. */
  release(coins: number): void;
}
