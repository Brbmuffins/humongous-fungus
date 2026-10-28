// What each game derives from a round's seed. The server uses these to play
// the round; the page uses the very same ones to check it afterwards.
import { crashCause, crashPoint } from '@hammygotchi/rocket';
import { VEHICLES } from '@hammygotchi/crossing';
import { clampMines, layMines } from '@hammygotchi/mines';
import { layBoxes, type DealLayout } from '@hammygotchi/deal';
import { dropPath, binOf, plinkoTable, type PlinkoRisk, type PlinkoRows } from '@hammygotchi/plinko';
import { spin as slotsSpin, type SlotSpin } from '@hammygotchi/slots';
import { rollAt, stream } from './fair';

/** Fart Rocket: where the flight ends. */
export const crashOf = (seed: string): number => crashPoint(rollAt(seed, 'crash'));

/** Fart Rocket: what ends it. */
export const causeOf = (seed: string, crash: number): string => crashCause(crash, stream(seed, 'cause')).id;

/** Hammy Crossing: the one roll for lane `lane`, the same for everybody. Under your road's risk, you're flattened. */
export const laneRoll = (seed: string, lane: number): number => rollAt(seed, 'lane', lane);

/** Hammy Crossing: which truck is in lane `lane`. */
export const truckOf = (seed: string, lane: number): string => VEHICLES[Math.floor(rollAt(seed, 'truck', lane) * VEHICLES.length)].id;

/** Hammy Mines: which boxes hide poop. The same seed, board and poop count always give the same floor. */
export function floorOf(seed: string, grid: 4 | 8 | 16, mines: number): boolean[] {
  const n = clampMines(grid, mines);
  return layMines(grid, n, stream(seed, `mines:${grid}:${n}`));
}

/** Poop Plinko: the path of drop number `nonce` under a seed (true is right). */
export const plinkoPathOf = (seed: string, nonce: number, rows: number): boolean[] => dropPath(rows, stream(seed, `plinko:${nonce}`));

/** Poop Plinko: what that path pays. */
export function plinkoResult(path: readonly boolean[], rows: PlinkoRows, risk: PlinkoRisk): { bin: number; mult: number } {
  const bin = binOf(path);
  return { bin, mult: plinkoTable(rows, risk)[bin] };
}

/** Hammy Slots: spin number `nonce` under a seed, worked out from the seed's rolls alone (the rules are pure). */
export const slotsSpinOf = (seed: string, nonce: number): SlotSpin => slotsSpin(stream(seed, `slots:${nonce}`));
/** Pizza Boxes: which prize is under which box, and the wobble in each offer, from the round's seed. */
export const dealLayoutOf = (seed: string): DealLayout => layBoxes(stream(seed, 'deal'));
