import {
  CALL_GAP_MIN,
  FITS,
  FOODS,
  FORMS,
  MAX_MESSAGES,
  MAX_POOPS,
  MAX_TEXTS,
  START_COINS,
  START_TOYS,
  TOYS,
  UPGRADES,
  type Cause,
  type FitId,
  type FoodId,
  type FormId,
  type ToyId,
  type UpgradeId,
} from './defs';

export interface Message {
  at: number;
  from: 'hammy' | 'you';
  text: string;
  /** A missed call, shown as a call row instead of a bubble. */
  missed?: boolean;
}

export interface Order {
  food: FoodId;
  arriveAt: number;
  /** He ordered it himself, on your coins. */
  self: boolean;
}

/** A poop on the floor: where across the unit (0..1), and on which floor. */
export interface Poop {
  x: number;
  /** On the loft instead of the ground floor. */
  up: boolean;
}

export interface Grave {
  n: number;
  bornAt: number;
  diedAt: number;
  causes: Cause[];
  farts: number;
  fit: FitId;
}

export interface LifeStats {
  farts: number;
  meals: number;
  scooped: number;
  calls: number;
  texts: number;
  showers: number;
  /** Times he made it to the toilet. */
  toilet: number;
  flings: number;
  selfOrders: number;
  /** Coins he spent on his own orders. */
  selfSpent: number;
  /** Times a toy was used on him (and counted). */
  toys: number;
  /** Steaks you cooked him. */
  cooked: number;
  /** Poops the robot vacuums ate. */
  vacuumed: number;
}

export interface HammyState {
  version: 1;
  /** When this save began, with the first Hammy. */
  createdAt: number;
  /** Wall-clock ms the state has been simulated up to. */
  updatedAt: number;
  /** Which Hammy this is: 1, then 2 after the first one dies, and so on. */
  n: number;
  bornAt: number;
  /** Needs and health, 0..100, where full is good. */
  belly: number;
  fresh: number;
  mood: number;
  health: number;
  /** Builds up from food and comes out as farts. */
  gas: number;
  coins: number;
  poops: Poop[];
  /** When each meal still inside him will need to come out. */
  poopDue: number[];
  /** He needs to go: when each one ends up on the floor if he isn't on the toilet. */
  urges: number[];
  orders: Order[];
  messages: Message[];
  /** Newest message the player has seen in the Phone tab. */
  readAt: number;
  /** Texts you can send before he tells you to chill. */
  textBudget: number;
  callReadyAt: number;
  showerReadyAt: number;
  /** Petting and flinging only count every couple of seconds. */
  fussReadyAt: number;
  /** Lying on the bed, sitting in the chair or gaming only count every few seconds. */
  restReadyAt: number;
  /** When streaming next pays a coin. */
  streamCoinAt: number;
  /** When a robot vacuum next eats a poop while you're away. */
  vacuumAt: number;
  nextTextAt: number;
  nextCallAt: number;
  fit: FitId;
  owned: FitId[];
  toy: ToyId;
  toys: ToyId[];
  /** Toys only count every couple of seconds. */
  playReadyAt: number;
  upgrades: Record<UpgradeId, number>;
  /** The form the player last saw him in, to announce a new one. */
  seenForm: FormId;
  diedAt: number | null;
  causes: Cause[];
  graves: Grave[];
  sound: boolean;
  stats: LifeStats;
}

export const noStats = (): LifeStats => ({
  farts: 0,
  meals: 0,
  scooped: 0,
  calls: 0,
  texts: 0,
  showers: 0,
  toilet: 0,
  flings: 0,
  selfOrders: 0,
  selfSpent: 0,
  toys: 0,
  cooked: 0,
  vacuumed: 0,
});

const noUpgrades = (): Record<UpgradeId, number> => Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Record<UpgradeId, number>;

/** A fresh Hammy, a little hungry so the first thing you do is feed him. */
export function newHammy(now: number, n: number): Pick<
  HammyState,
  | 'n' | 'bornAt' | 'belly' | 'fresh' | 'mood' | 'health' | 'gas' | 'poops' | 'poopDue' | 'urges' | 'orders' | 'messages' | 'readAt'
  | 'textBudget' | 'callReadyAt' | 'showerReadyAt' | 'fussReadyAt' | 'restReadyAt' | 'streamCoinAt' | 'vacuumAt' | 'nextTextAt' | 'nextCallAt'
  | 'diedAt' | 'causes' | 'stats'
> {
  const hello =
    n === 1
      ? ['yo its hammy. they put me in some kind of containment unit', 'can u doordosh me something. im starving']
      : ['hey its hammy. the new one', 'what happened to the last guy', 'why are there mushrooms in here'];
  return {
    n,
    bornAt: now,
    belly: 55,
    fresh: 85,
    mood: 70,
    health: 100,
    gas: 0,
    poops: [],
    poopDue: [],
    urges: [],
    orders: [],
    messages: hello.map((text, i) => ({ at: now + i, from: 'hammy', text })),
    readAt: 0,
    textBudget: MAX_TEXTS,
    callReadyAt: now,
    showerReadyAt: now,
    fussReadyAt: now,
    restReadyAt: now,
    streamCoinAt: now,
    vacuumAt: now,
    nextTextAt: now + 4 * 60_000,
    nextCallAt: now + CALL_GAP_MIN * 1000,
    diedAt: null,
    causes: [],
    stats: noStats(),
  };
}

export function newGame(now: number): HammyState {
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...newHammy(now, 1),
    coins: START_COINS,
    fit: 'classic',
    owned: ['classic'],
    toy: 'hand',
    toys: [...START_TOYS],
    playReadyAt: 0,
    upgrades: noUpgrades(),
    seenForm: FORMS[0].id,
    graves: [],
    sound: true,
  };
}

export function serialize(s: HammyState): string {
  return JSON.stringify(s);
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const pos = (v: unknown, fallback: number): number => Math.max(0, num(v, fallback));
const pct = (v: unknown, fallback: number): number => Math.min(100, pos(v, fallback));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const unit = (v: number): number => Math.min(1, Math.max(0, v));
const FIT_SET = new Set<string>(FITS.map((f) => f.id));
const FOOD_SET = new Set<string>(FOODS.map((f) => f.id));
const TOY_SET = new Set<string>(TOYS.map((t) => t.id));
const FORM_SET = new Set<string>(FORMS.map((f) => f.id));
const CAUSES = new Set<string>(['belly', 'fresh', 'mood', 'sushi']);
const isCause = (c: unknown): c is Cause => typeof c === 'string' && CAUSES.has(c);

/** Parse a save, repairing anything damaged. Null if unusable. */
export function deserialize(raw: string): HammyState | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.version !== 1) return null;
  const now = Date.now();
  const createdAt = pos(d.createdAt, now);
  const base = newGame(createdAt);

  const owned = Array.isArray(d.owned) ? [...new Set(d.owned.filter((f): f is FitId => typeof f === 'string' && FIT_SET.has(f)))] : [];
  if (!owned.includes('classic')) owned.unshift('classic');
  const fit = typeof d.fit === 'string' && owned.includes(d.fit as FitId) ? (d.fit as FitId) : 'classic';
  const toys = [...new Set([...START_TOYS, ...(Array.isArray(d.toys) ? d.toys.filter((t): t is ToyId => typeof t === 'string' && TOY_SET.has(t)) : [])])];
  const toy = typeof d.toy === 'string' && toys.includes(d.toy as ToyId) ? (d.toy as ToyId) : 'hand';

  const messages = Array.isArray(d.messages)
    ? d.messages
        .filter(
          (m): m is Message =>
            !!m &&
            typeof m === 'object' &&
            typeof (m as Message).text === 'string' &&
            ((m as Message).from === 'hammy' || (m as Message).from === 'you') &&
            Number.isFinite((m as Message).at),
        )
        .map((m) => (m.missed ? { at: m.at, from: m.from, text: m.text, missed: true } : { at: m.at, from: m.from, text: m.text }))
        .slice(-MAX_MESSAGES)
    : base.messages;

  const orders = Array.isArray(d.orders)
    ? d.orders
        .filter((o): o is Order => !!o && typeof o === 'object' && FOOD_SET.has((o as Order).food) && Number.isFinite((o as Order).arriveAt))
        .map((o) => ({ food: o.food, arriveAt: o.arriveAt, self: o.self === true }))
    : [];

  const times = (v: unknown): number[] => (Array.isArray(v) ? v.filter((t): t is number => typeof t === 'number' && Number.isFinite(t)) : []);
  // Older saves kept poops as plain positions on one floor.
  const poops = (Array.isArray(d.poops) ? d.poops : [])
    .map((p): Poop | null => {
      if (typeof p === 'number' && Number.isFinite(p)) return { x: unit(p), up: false };
      const o = obj(p);
      return typeof o.x === 'number' && Number.isFinite(o.x) ? { x: unit(o.x), up: o.up === true } : null;
    })
    .filter((p): p is Poop => p !== null)
    .slice(0, MAX_POOPS);

  const graves = Array.isArray(d.graves)
    ? d.graves
        .filter((g): g is Grave => !!g && typeof g === 'object' && Number.isFinite((g as Grave).diedAt) && Number.isFinite((g as Grave).bornAt))
        .map((g) => ({
          n: Math.max(1, Math.floor(num(g.n, 1))),
          bornAt: g.bornAt,
          diedAt: g.diedAt,
          causes: Array.isArray(g.causes) ? g.causes.filter(isCause) : [],
          farts: Math.floor(pos(g.farts, 0)),
          fit: typeof g.fit === 'string' && FIT_SET.has(g.fit) ? g.fit : 'classic',
        }))
    : [];

  const ups = obj(d.upgrades);
  const upgrades = noUpgrades();
  for (const u of UPGRADES) upgrades[u.id] = Math.min(u.levels.length, Math.floor(pos(ups[u.id], 0)));

  const st = obj(d.stats);
  const stat = (k: string) => pos(st[k], 0);
  const diedAt = typeof d.diedAt === 'number' && Number.isFinite(d.diedAt) ? d.diedAt : null;

  return {
    ...base,
    updatedAt: Math.min(now, pos(d.updatedAt, now)),
    n: Math.max(1, Math.floor(num(d.n, 1))),
    bornAt: pos(d.bornAt, createdAt),
    belly: pct(d.belly, base.belly),
    fresh: pct(d.fresh, base.fresh),
    mood: pct(d.mood, base.mood),
    health: pct(d.health, base.health),
    gas: pct(d.gas, 0),
    coins: pos(d.coins, START_COINS),
    poops,
    poopDue: times(d.poopDue),
    urges: times(d.urges),
    orders,
    messages,
    readAt: pos(d.readAt, 0),
    textBudget: Math.min(MAX_TEXTS, pos(d.textBudget, MAX_TEXTS)),
    callReadyAt: pos(d.callReadyAt, 0),
    // The shower replaced the hose.
    showerReadyAt: pos(d.showerReadyAt ?? d.hoseReadyAt, 0),
    fussReadyAt: pos(d.fussReadyAt, 0),
    restReadyAt: pos(d.restReadyAt, 0),
    streamCoinAt: pos(d.streamCoinAt, 0),
    vacuumAt: pos(d.vacuumAt, 0),
    nextTextAt: pos(d.nextTextAt, base.nextTextAt),
    nextCallAt: pos(d.nextCallAt, base.nextCallAt),
    fit,
    owned,
    toy,
    toys,
    playReadyAt: pos(d.playReadyAt, 0),
    upgrades,
    seenForm: typeof d.seenForm === 'string' && FORM_SET.has(d.seenForm) ? (d.seenForm as FormId) : base.seenForm,
    diedAt,
    causes: diedAt !== null && Array.isArray(d.causes) ? d.causes.filter(isCause) : [],
    graves,
    sound: d.sound !== false,
    stats: {
      farts: Math.floor(stat('farts')),
      meals: Math.floor(stat('meals')),
      scooped: Math.floor(stat('scooped')),
      calls: Math.floor(stat('calls')),
      texts: Math.floor(stat('texts')),
      showers: Math.floor(stat('showers') || stat('hoses')),
      toilet: Math.floor(stat('toilet')),
      flings: Math.floor(stat('flings')),
      selfOrders: Math.floor(stat('selfOrders')),
      selfSpent: stat('selfSpent'),
      toys: Math.floor(stat('toys')),
      cooked: Math.floor(stat('cooked')),
      vacuumed: Math.floor(stat('vacuumed')),
    },
  };
}
