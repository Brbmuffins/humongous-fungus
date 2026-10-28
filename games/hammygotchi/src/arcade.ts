// Hammy's Arcade: the betting games on his phone. Fart Rocket, Hammy Mines,
// Hammy Crossing and Poop Plinko all bet Hammy coins through here, so the
// coins, the stats and what he says afterwards work the same in each. Every
// game pays back about 99 of every 100 coins bet, over many rounds.
import type { FitId } from './defs';

/**
 * What the arcade needs of whoever is betting: their coins, outfit, how fresh
 * they are (he goes green when he isn't), whether they're still around and the
 * game-by-game stats. Hammy's state is one; so is the standalone Hammy's
 * Arcade's own (games/hammys-arcade).
 */
export interface ArcadeSeat {
  coins: number;
  fit: FitId;
  fresh: number;
  diedAt: number | null;
  stats: { arcade: Record<ArcadeGame, BetStats> };
}

export type ArcadeGame = 'rocket' | 'mines' | 'crossing' | 'plinko' | 'deal';

/**
 * Betting coins is simulated gambling, which raises an app's store age
 * rating, so the arcade is left out of the iOS and Android builds and only
 * the browser version has it. Turning this on means new age-rating answers
 * in both stores (see docs/hammygotchi.md).
 */
export const ARCADE_IN_APPS = false;

/** What every game pays back over many rounds: a 1% house edge. */
export const RTP = 0.99;
export const MIN_BET = 1;

export interface ArcadeDef {
  id: ArcadeGame;
  name: string;
  emoji: string;
  /** The app icon's colour. */
  color: string;
  blurb: string;
}

export const ARCADE: readonly ArcadeDef[] = [
  { id: 'rocket', name: 'Fart Rocket', emoji: '💨', color: '#b5e33b', blurb: 'He rides his own fart. Bail out before it ends.' },
  { id: 'mines', name: 'Hammy Mines', emoji: '💩', color: '#ff9a2e', blurb: 'Dorkitos under his pizza boxes. And poop.' },
  { id: 'crossing', name: 'Hammy Crossing', emoji: '🚚', color: '#3d8bff', blurb: 'Walk him across the road. Lane by lane.' },
  { id: 'plinko', name: 'Poop Plinko', emoji: '🚽', color: '#ff6fa8', blurb: 'He drops one. It bounces. Somewhere.' },
  { id: 'deal', name: 'Pizza Boxes', emoji: '🍕', color: '#e8483a', blurb: 'Keep one box. Dr. Moss calls with offers.' },
];

export const ARCADE_BY_ID = Object.fromEntries(ARCADE.map((g) => [g.id, g])) as Record<ArcadeGame, ArcadeDef>;

export interface BetStats {
  /** Bets placed (taken-back bets don't count). */
  rounds: number;
  /** Coins up or down, all in. */
  net: number;
  /** The biggest multiplier that paid. */
  best: number;
}

export const noBets = (): Record<ArcadeGame, BetStats> =>
  Object.fromEntries(ARCADE.map((g) => [g.id, { rounds: 0, net: 0, best: 0 }])) as Record<ArcadeGame, BetStats>;

/** Put coins on him. False if you don't have them (or he's dead). */
export function placeBet(s: ArcadeSeat, game: ArcadeGame, amount: number): boolean {
  const bet = Math.floor(amount);
  if (s.diedAt !== null || !Number.isFinite(bet) || bet < MIN_BET || bet > s.coins) return false;
  s.coins -= bet;
  const st = s.stats.arcade[game];
  st.rounds += 1;
  st.net -= bet;
  return true;
}

/** A bet comes back times `mult`, rounded down. Returns what came back. */
export function payOut(s: ArcadeSeat, game: ArcadeGame, bet: number, mult: number): number {
  const won = Math.floor(bet * Math.max(0, mult));
  s.coins += won;
  const st = s.stats.arcade[game];
  st.net += won;
  if (mult > 0) st.best = Math.max(st.best, Math.floor(mult * 100) / 100);
  return won;
}

/** A bet that never got going comes back, as if it was never placed. */
export function refundBet(s: ArcadeSeat, game: ArcadeGame, bet: number): void {
  s.coins += bet;
  const st = s.stats.arcade[game];
  st.rounds = Math.max(0, st.rounds - 1);
  st.net += bet;
}

/** A multiplier for showing and paying: two decimals, rounded down. */
export const floor2 = (m: number): number => Math.floor(m * 100 + 1e-9) / 100;

/** What he says back in the unit after you've been betting on him. */
export const HOME_LINES: Record<ArcadeGame, { won: readonly string[]; lost: readonly string[]; even: readonly string[] }> = {
  rocket: {
    won: ['Told you I could fly.', 'Pilot Hammy, reporting for duty.', 'Spend it on me. Furniture. For me.', 'I’m basically an astronaut now.'],
    lost: ['My bad on the coins.', 'The beans betrayed us.', 'Run it back?', 'That seagull owes you money.'],
    even: ['I’m never eating beans again.', 'My butt is tired.', 'Same time tomorrow?'],
  },
  mines: {
    won: ['You found my Dorkito stash. Share.', 'Those were MY Dorkitos.', 'Nice. Don’t look under the couch.'],
    lost: ['I was gonna tell you about that one.', 'Watch your step in here.', 'You stepped in it. Literally.'],
    even: ['There’s more under the bed. Probably.', 'I forget where I put them all.'],
  },
  crossing: {
    won: ['I made it! What was on this side again?', 'Look both ways, they said.', 'Crossing guard Hammy.'],
    lost: ['I’m flat. I’m so flat.', 'Who taught that truck to drive?', 'I saw my life flash. It was mostly Dorkitos.'],
    even: ['Why did the Hammy cross the road?', 'I’m not doing that again. Tomorrow, maybe.'],
  },
  plinko: {
    won: ['That one was worth it.', 'Best poop of my life.', 'Gold. Pure gold.'],
    lost: ['Clogged. Again.', 'That one hurt, and it didn’t even pay.', 'I need more fiber.'],
    even: ['I’m all out. For now.', 'That’s enough plinking.'],
  },
  deal: {
    won: ['Dr. Moss paid up. She’s mad. Good.', 'Told you that box was the one.', 'Pizza night. On me. Well, on you.'],
    lost: ['She lowballed us. I felt it.', 'It was a crust. It was always a crust.', 'Dr. Moss hung up on me.'],
    even: ['We split the pizza. Fine.', 'Dr. Moss says “interesting” and writes something down.'],
  },
};
