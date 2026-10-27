// Hammy Crossing: walk him across a road that never ends, one lane at a
// time. Every lane he makes it across raises what you'd get back; one of
// them flattens him and the bet is gone. Bail out on any lane. Harder roads
// get him more often and pay more. Plain rules and content here; the screen
// is in crossingview.ts, the coins in arcade.ts.
import { RTP, floor2 } from './arcade';

type Roll = () => number;

export type Difficulty = 'easy' | 'medium' | 'hard' | 'daredevil';

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  /** Chance any one lane gets him. */
  risk: number;
  /** Lanes to the other side. */
  lanes: number;
}

export const DIFFICULTIES: readonly DifficultyDef[] = [
  { id: 'easy', name: 'Easy', risk: 0.04, lanes: 24 },
  { id: 'medium', name: 'Medium', risk: 0.12, lanes: 22 },
  { id: 'hard', name: 'Hard', risk: 0.2, lanes: 20 },
  { id: 'daredevil', name: 'Daredevil', risk: 0.4, lanes: 15 },
];

export const DIFFICULTY_BY_ID = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d])) as Record<Difficulty, DifficultyDef>;

/** What getting `lanes` lanes across pays: the fair odds, less the 1% edge. */
export function laneMultiplier(d: Difficulty, lanes: number): number {
  const def = DIFFICULTY_BY_ID[d];
  const k = Math.max(0, Math.min(def.lanes, Math.floor(lanes)));
  return k ? floor2(RTP / (1 - def.risk) ** k) : 1;
}

/** One step: does he make it across this lane? */
export const crossLane = (d: Difficulty, roll: Roll = Math.random): boolean => roll() >= DIFFICULTY_BY_ID[d].risk;

/** What's coming down the road, drawn from above in cars.ts. */
export type CarKind = 'scooter' | 'dorkitos' | 'train' | 'garbage' | 'ambulance' | 'cart' | 'tractor' | 'racecar' | 'bus' | 'grandma' | 'cops' | 'pickup';

export interface VehicleDef {
  id: CarKind;
  /** "a garbage truck" */
  name: string;
  /** Lanes' worth of screen per second, about. */
  speed: number;
}

export const VEHICLES: readonly VehicleDef[] = [
  { id: 'scooter', name: 'a DoorDosh driver', speed: 3.4 },
  { id: 'dorkitos', name: 'the Dorkitos truck', speed: 2.6 },
  { id: 'train', name: 'Train Hammy', speed: 3 },
  { id: 'garbage', name: 'a garbage truck', speed: 2.2 },
  { id: 'ambulance', name: 'the ambulance that was coming for him anyway', speed: 3.6 },
  { id: 'cart', name: 'a runaway shopping cart', speed: 2 },
  { id: 'tractor', name: 'a tractor (in Ohio)', speed: 1.6 },
  { id: 'racecar', name: 'a race car', speed: 4.4 },
  { id: 'bus', name: 'the school bus', speed: 2.4 },
  { id: 'grandma', name: 'Grandma', speed: 2.8 },
  { id: 'cops', name: 'the cops', speed: 3.8 },
  { id: 'pickup', name: 'a pickup with a couch in the back', speed: 3 },
];

/** He comments on the way. */
export const CROSS_SAFE: readonly string[] = ['Made it!', 'Close one.', 'HONK all you want.', 'Watch where you’re going!', 'I have the right of way!', 'Not today.'];
export const CROSS_START: readonly string[] = ['Why did the Hammy cross the road?', 'Look both ways. Or don’t.', 'Here goes nothing.'];
export const CROSS_DONE = 'The other side! It’s just more road.';
