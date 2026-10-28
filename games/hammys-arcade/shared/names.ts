// Player names for Hammy's Arcade: no login, just a name you make up.
// 2 to 16 characters of letters, digits, spaces, underscores and dashes.

export const NAME_MIN = 2;
export const NAME_MAX = 16;

/** Silly names for the box the first time, so Enter alone gets you in. */
export const SILLY_NAMES: readonly string[] = [
  'Dorkito Dan',
  'Sir Farts-a-Lot',
  'Captain Beans',
  'Mystery Moss',
  'Gassy Gary',
  'Pizza Box Pete',
  'Lord Plop',
  'Sneezy Seagull',
  'Burrito Bandit',
  'Toilet Wizard',
  'Cube Cousin',
  'Ohio Man',
  'Moss Boss',
  'Baron Von Bean',
  'Soggy Dorkito',
  'Turbo Tush',
];

/**
 * Starting list of words nobody gets to be called. Kept rot13-encoded so the
 * source doesn't spell them out; matched against the name with the usual
 * look-alike digits and the spaces and punctuation taken out. Add to it as
 * needed.
 */
const BLOCKED = ['avttre', 'avtten', 'snttbg', 'xvxr', 'puvax', 'genaal', 'ergneq', 'jrgonpx', 'qlxr', 'gbjryurnq'];
const rot13 = (s: string): string => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
const BLOCKED_WORDS = BLOCKED.map(rot13);

/** Is this a name nobody may use? Looks through look-alike digits and symbols. */
export function blocked(name: string): boolean {
  const flat = name
    .toLowerCase()
    .replace(/[01345$@!7]/g, (c) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', $: 's', '@': 'a', '!': 'i', '7': 't' })[c] ?? c)
    .replace(/[^a-z]/g, '');
  return BLOCKED_WORDS.some((w) => flat.includes(w));
}

export type NameError = 'name_length' | 'name_chars' | 'name_blocked';
export type NameCheck = { ok: true; name: string } | { ok: false; error: NameError };

/** Tidy and check a name: trim, squash runs of spaces, then the length and character rules. */
export function checkName(raw: unknown): NameCheck {
  if (typeof raw !== 'string') return { ok: false, error: 'name_length' };
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (name.length < NAME_MIN || name.length > NAME_MAX) return { ok: false, error: 'name_length' };
  if (!/^[A-Za-z0-9 _-]+$/.test(name)) return { ok: false, error: 'name_chars' };
  if (blocked(name)) return { ok: false, error: 'name_blocked' };
  return { ok: true, name };
}
