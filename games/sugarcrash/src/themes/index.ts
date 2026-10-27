// The looks of the game. Each theme is one file: its picture (drawn on the
// canvas), colors, shouts, gauge, crashes, crowd and sounds. The rules,
// crash points, betting and wallet are the same in all of them.
import { DEFAULT_THEME } from '../defs';
import type { Theme } from './kit';
import { sugar } from './sugar';
import { balloons } from './balloons';
import { cart } from './cart';
import { espresso } from './espresso';
import { wings } from './wings';

export type { Theme } from './kit';

/** In the order the picker shows them. */
export const THEMES: readonly Theme[] = [sugar, wings, balloons, cart, espresso];

/** A theme by id; anything unknown (or missing) is the default look. */
export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME) ?? THEMES[0];
}
