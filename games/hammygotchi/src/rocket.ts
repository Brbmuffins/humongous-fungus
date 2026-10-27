// Fart Rocket: Hammy's crash game, an app on his phone (and on his PC).
// Bet Hammy coins, he rides his own fart up out of the unit, past the
// seagulls, a plane, the moon and some aliens, and the multiplier climbs
// until something ridiculous ends it. Cash out before it does. Plain rules
// and content here; the screen is in rocketview.ts.
import { isAlive } from './game';
import type { HammyState } from './state';

type Roll = () => number;

/** How fast it climbs, per second: 2x at about 9 s, 10x at about 31 s. */
export const ROCKET_GROWTH = 0.075;
/** Seconds to bet before each launch, and to look at the wreckage after. */
export const ROCKET_BET_SECONDS = 5;
export const ROCKET_PAUSE_SECONDS = 3.5;
export const ROCKET_MIN_BET = 1;
/**
 * Fart Rocket is simulated gambling, which raises an app's store age rating,
 * so it's left out of the iOS and Android builds and only the browser version
 * has it. Turning this on means new age-rating answers in both stores (see
 * docs/hammygotchi.md).
 */
export const ROCKET_IN_APPS = false;

export const multiplierAt = (seconds: number): number => Math.exp(ROCKET_GROWTH * Math.max(0, seconds));
export const secondsTo = (mult: number): number => Math.log(Math.max(1, mult)) / ROCKET_GROWTH;

/**
 * Where a round ends, from a uniform roll in [0, 1). A 1% house edge: the
 * chance of getting past x is 0.99 / x, so any cash-out target pays back
 * 99% on average, and about 2 rounds in 100 end before he's off the roof.
 */
export function crashPoint(u: number): number {
  const x = Math.floor(99 / (1 - Math.min(0.999999, Math.max(0, u)))) / 100;
  return Math.max(1, Math.min(10_000, x));
}

/** What ends the flight. The higher he gets, the stranger it gets. */
export interface CrashDef {
  id: string;
  /** Only once he's at least this high. */
  from: number;
  emoji: string;
  /** "SHARTED @ 2.31×" */
  text: string;
  /** The sound of it, on screen. */
  word: string;
  /** What he (or someone) says about it. */
  line: string;
}

export const CRASHES: readonly CrashDef[] = [
  { id: 'gas', from: 1, emoji: '💨', text: 'RAN OUT OF GAS', word: 'pfffft…', line: 'pfft… pft… uh oh.' },
  { id: 'sneeze', from: 1, emoji: '🤧', text: 'SNEEZED', word: 'ACHOO!', line: 'ACHOO— oh no.' },
  { id: 'dorkito', from: 1, emoji: '🔺', text: 'SAW A DORKITO', word: 'MINE!', line: 'MINE! …wait.' },
  { id: 'shart', from: 1.4, emoji: '💩', text: 'SHARTED', word: '*SPLRT*', line: 'That was not just gas.' },
  { id: 'phone', from: 1.4, emoji: '📱', text: 'CHECKED HIS PHONE', word: '*bzzt*', line: 'Hold on, someone texted me.' },
  { id: 'seagull', from: 1.8, emoji: '🐦', text: 'HIT A SEAGULL', word: 'SQUAWK!', line: 'It wanted my Dorkitos!' },
  { id: 'plug', from: 2, emoji: '🔌', text: 'DR. MOSS PULLED THE PLUG', word: '*click*', line: 'Experiment over, Hammy.' },
  { id: 'plane', from: 2.6, emoji: '✈️', text: 'CLIPPED BY A PLANE', word: 'WHOOSH', line: 'Shotgun! …ow.' },
  { id: 'beans', from: 3, emoji: '🌯', text: 'BURRITO CRAMP', word: 'GRRRGLE', line: 'The beans. THE BEANS.' },
  { id: 'moon', from: 9, emoji: '🌕', text: 'BONKED THE MOON', word: 'BONK!', line: 'Who put that there?' },
  { id: 'aliens', from: 20, emoji: '🛸', text: 'ABDUCTED BY ALIENS', word: 'BEEP BOOP', line: 'Take me to your Dorkitos.' },
  { id: 'ohio', from: 50, emoji: '🌽', text: 'LANDED IN OHIO', word: 'OHIO!', line: 'Is this still Ohio? IT IS.' },
];

/** Pick the crash for a round that ends at `crash`: one of the highest few he's reached. */
export function crashCause(crash: number, roll: Roll = Math.random): CrashDef {
  const reached = CRASHES.filter((c) => c.from <= crash);
  const top = reached.slice(-4);
  return top[Math.min(top.length - 1, Math.floor(roll() * top.length))];
}

/** What he shouts on the way up. */
export const MILESTONES: readonly (readonly [number, string])[] = [
  [2, 'WINDOWS DOWN!'],
  [3, 'SHOTGUN!'],
  [5, 'ARE WE THERE YET'],
  [10, 'TO THE MOON'],
  [25, 'HELLO ALIENS'],
  [50, 'I CAN TASTE COLORS'],
  [100, 'IS THIS STILL OHIO'],
];

/** Things he yells while flying. */
export const FLIGHT_LINES: readonly string[] = ['WEEEEE', 'I can see my house!', 'Don’t look down!', 'Windows down!', 'Who needs a rocket?', 'This is fine.', 'Mom, look!', 'I regret the burrito.'];

// ---------------------------------------------------------------------------
// Who else is betting on him

export type Style = 'safe' | 'mid' | 'yolo' | 'never';

export interface PunterDef {
  name: string;
  emoji: string;
  style: Style;
}

export const ROCKET_CROWD: readonly PunterDef[] = [
  { name: 'Dr. Moss', emoji: '🧪', style: 'safe' },
  { name: 'Robot Vacuum', emoji: '🤖', style: 'safe' },
  { name: 'DoorDosh Driver', emoji: '🛵', style: 'mid' },
  { name: 'The Plant', emoji: '🪴', style: 'never' },
  { name: 'Grandma', emoji: '👵', style: 'yolo' },
  { name: 'A Seagull', emoji: '🐦', style: 'mid' },
  { name: 'War', emoji: '😎', style: 'yolo' },
  { name: 'Hammy’s Mom', emoji: '📞', style: 'safe' },
  { name: 'The Intern', emoji: '📋', style: 'mid' },
  { name: 'The Toilet', emoji: '🚽', style: 'mid' },
];

export interface Punter extends PunterDef {
  bet: number;
  /** Cashes out here; null never does (the plant is a plant). */
  target: number | null;
  /** Where it got out, once it has. */
  out: number | null;
}

function targetFor(style: Style, roll: Roll): number | null {
  const r = roll();
  if (style === 'never') return null;
  if (style === 'safe') return 1.15 + r * 0.8;
  if (style === 'mid') return 1.8 + r * 4;
  return 8 + r * r * 140;
}

/** This round's crowd: four to seven of them, with their bets and their nerve. */
export function crowd(roll: Roll = Math.random): Punter[] {
  const pool = [...ROCKET_CROWD];
  const n = 4 + Math.floor(roll() * 4);
  const out: Punter[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const [p] = pool.splice(Math.floor(roll() * pool.length), 1);
    out.push({ ...p, bet: [5, 10, 20, 25, 50, 100, 250][Math.floor(roll() * 7)], target: targetFor(p.style, roll), out: null });
  }
  return out;
}

/** Everyone whose nerve ran out at or below `mult` gets out there. Returns who just did. */
export function cashCrowd(punters: Punter[], mult: number, crash: number): Punter[] {
  const now: Punter[] = [];
  for (const p of punters) {
    if (p.out !== null || p.target === null || p.target > mult || p.target >= crash) continue;
    p.out = Math.floor(p.target * 100) / 100;
    now.push(p);
  }
  return now;
}

// ---------------------------------------------------------------------------
// Your coins

/** Put coins on him. False if you don't have them (or he's dead). */
export function rocketBet(s: HammyState, amount: number): boolean {
  const bet = Math.floor(amount);
  if (!isAlive(s) || !Number.isFinite(bet) || bet < ROCKET_MIN_BET || bet > s.coins) return false;
  s.coins -= bet;
  s.stats.rocketRounds += 1;
  s.stats.rocketNet -= bet;
  return true;
}

/** Out in time: the bet times the multiplier, rounded down. Returns what came back. */
export function rocketCashOut(s: HammyState, bet: number, mult: number): number {
  const won = Math.floor(bet * Math.max(1, mult));
  s.coins += won;
  s.stats.rocketNet += won;
  s.stats.rocketBest = Math.max(s.stats.rocketBest, Math.floor(mult * 100) / 100);
  return won;
}

/** What he says back in the unit after you've been betting on him. */
export const ROCKET_HOME = {
  won: ['Told you I could fly.', 'Pilot Hammy, reporting for duty.', 'Spend it on me. Furniture. For me.', 'I’m basically an astronaut now.'],
  lost: ['My bad on the coins.', 'The beans betrayed us.', 'Run it back?', 'That seagull owes you money.'],
  even: ['I’m never eating beans again.', 'My butt is tired.', 'Same time tomorrow?'],
} as const;

/** A bet that never launched comes back. */
export function rocketRefund(s: HammyState, bet: number): void {
  s.coins += bet;
  s.stats.rocketRounds = Math.max(0, s.stats.rocketRounds - 1);
  s.stats.rocketNet += bet;
}
