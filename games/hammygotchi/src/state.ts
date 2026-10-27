import {
  CALL_GAP_MIN,
  FITS,
  FOODS,
  MAX_MESSAGES,
  MAX_POOPS,
  MAX_TEXTS,
  START_COINS,
  type Cause,
  type FitId,
  type FoodId,
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
  hoses: number;
  flings: number;
  selfOrders: number;
  /** Coins he spent on his own orders. */
  selfSpent: number;
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
  /** Poops on the floor, by position across the tank (0..1). */
  poops: number[];
  /** When each meal still inside him comes out. */
  poopDue: number[];
  orders: Order[];
  messages: Message[];
  /** Newest message the player has seen in the Phone tab. */
  readAt: number;
  /** Texts you can send before he tells you to chill. */
  textBudget: number;
  callReadyAt: number;
  hoseReadyAt: number;
  /** Petting and flinging only count every couple of seconds. */
  fussReadyAt: number;
  nextTextAt: number;
  nextCallAt: number;
  fit: FitId;
  owned: FitId[];
  diedAt: number | null;
  causes: Cause[];
  graves: Grave[];
  sound: boolean;
  stats: LifeStats;
}

export const noStats = (): LifeStats => ({ farts: 0, meals: 0, scooped: 0, calls: 0, texts: 0, hoses: 0, flings: 0, selfOrders: 0, selfSpent: 0 });

/** A fresh Hammy, a little hungry so the first thing you do is feed him. */
export function newHammy(now: number, n: number): Pick<
  HammyState,
  | 'n' | 'bornAt' | 'belly' | 'fresh' | 'mood' | 'health' | 'gas' | 'poops' | 'poopDue' | 'orders' | 'messages' | 'readAt'
  | 'textBudget' | 'callReadyAt' | 'hoseReadyAt' | 'fussReadyAt' | 'nextTextAt' | 'nextCallAt' | 'diedAt' | 'causes' | 'stats'
> {
  const hello =
    n === 1
      ? ['yo its hammy. i live in ur terrarium now', 'can u doordosh me something. im starving']
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
    orders: [],
    messages: hello.map((text, i) => ({ at: now + i, from: 'hammy', text })),
    readAt: 0,
    textBudget: MAX_TEXTS,
    callReadyAt: now,
    hoseReadyAt: now,
    fussReadyAt: now,
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
const FIT_SET = new Set<string>(FITS.map((f) => f.id));
const FOOD_SET = new Set<string>(FOODS.map((f) => f.id));
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
  const poops = times(d.poops)
    .map((x) => Math.min(1, Math.max(0, x)))
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

  const st = obj(d.stats);
  const stat = (k: keyof ReturnType<typeof noStats>) => pos(st[k], 0);
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
    orders,
    messages,
    readAt: pos(d.readAt, 0),
    textBudget: Math.min(MAX_TEXTS, pos(d.textBudget, MAX_TEXTS)),
    callReadyAt: pos(d.callReadyAt, 0),
    hoseReadyAt: pos(d.hoseReadyAt, 0),
    fussReadyAt: pos(d.fussReadyAt, 0),
    nextTextAt: pos(d.nextTextAt, base.nextTextAt),
    nextCallAt: pos(d.nextCallAt, base.nextCallAt),
    fit,
    owned,
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
      hoses: Math.floor(stat('hoses')),
      flings: Math.floor(stat('flings')),
      selfOrders: Math.floor(stat('selfOrders')),
      selfSpent: stat('selfSpent'),
    },
  };
}
