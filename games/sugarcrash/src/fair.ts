// Provably fair, the way the real crash games do it. Every round has a secret
// seed. Before the round you see SHA-256(seed): the round is locked in. After
// the crash the seed is revealed, and anyone can check both that it matches
// the hash you saw and that it gives the crash point the round had.
//
//   commitment  = SHA-256(seed)
//   outcome     = SHA-256(seed + ":sugar-crash")
//   u           = first 52 bits of outcome / 2^52        (uniform in [0, 1))
//   crash       = max(1.00, floor(99 / (1 − u)) / 100)
//
// so P(crash ≥ x) = 0.99 / x: a 1% house edge at every cash-out target.
import { GROWTH, HOUSE_EDGE } from './defs';

export const SALT = 'sugar-crash';

/** The multiplier t seconds after launch. */
export const multiplierAt = (t: number): number => Math.exp(GROWTH * Math.max(0, t));

/** Seconds after launch the multiplier reaches m. */
export const timeFor = (m: number): number => Math.log(Math.max(1, m)) / GROWTH;

/** Round down to the cent, the way multipliers are shown and paid: 2.3456 → 2.34. */
export const cents = (m: number): number => Math.floor(m * 100 + 1e-9) / 100;

/** The crash point for a uniform u in [0, 1). */
export function crashFromUniform(u: number): number {
  const x = Math.min(Math.max(u, 0), 1 - 2 ** -52);
  // The epsilon keeps exact boundaries (u = 0.99 → 99.00×) from losing a cent to float error.
  return Math.max(1, Math.floor((100 * (1 - HOUSE_EDGE)) / (1 - x) + 1e-7) / 100);
}

/** u from a hex hash: its first 52 bits, over 2^52. */
export function uniformFromHash(hex: string): number {
  return parseInt(hex.slice(0, 13), 16) / 2 ** 52;
}

export const crashFromHash = (hex: string): number => crashFromUniform(uniformFromHash(hex));

export async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A fresh secret seed: 32 random bytes as hex. */
export function newSeed(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export interface Sealed {
  seed: string;
  /** SHA-256(seed): shown before the round. */
  hash: string;
  crash: number;
}

/** Everything about a round, from its seed. */
export async function seal(seed: string): Promise<Sealed> {
  const [hash, outcome] = await Promise.all([sha256(seed), sha256(`${seed}:${SALT}`)]);
  return { seed, hash, crash: crashFromHash(outcome) };
}

/** Check a revealed round: the seed matches the hash, and gives that crash point. */
export async function verify(seed: string, hash: string, crash: number): Promise<boolean> {
  const s = await seal(seed);
  return s.hash === hash && Math.abs(s.crash - crash) < 1e-9;
}
