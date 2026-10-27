// Hammygotchi rules: needs that drain in real time, food that turns into gas
// and poop, the phone, the fits, and dying.
import {
  ANSWER_BONUS_MOOD,
  ANSWER_COINS,
  AWAY_CALL_GAP_MIN,
  AWAY_CALL_GAP_RANGE,
  BELLY_PER_HOUR,
  BOWL_MAX,
  BOWL_STINK_PER_HOUR,
  CALL_COINS,
  CAUGHT,
  CALL_COOLDOWN,
  CALL_GAP_MIN,
  CALL_GAP_RANGE,
  CALL_MAX_MOOD,
  CALL_MIN_SECONDS,
  CALL_MOOD_PER_SECOND,
  CAUSE_TEXT,
  CHILL_REPLIES,
  CHUNK_SECONDS,
  COINS_PER_HOUR,
  COIN_MOOD,
  DECLINE_MOOD,
  DIGEST_MIN,
  DIGEST_RANGE,
  ETA_MIN,
  ETA_RANGE,
  FART_GAS,
  FART_RATE,
  FART_RATE_PER_GAS,
  FART_STINK,
  FART_STINK_PER_GAS,
  FIT_BY_ID,
  FLING_MOOD,
  FLUSH_COINS,
  FLUSH_FRESH,
  FOODS,
  FOOD_BY_ID,
  FORMS,
  FURNITURE_BY_ID,
  FREE_UNREAD,
  FRESH_PER_HOUR,
  FUSS_COOLDOWN,
  HAMMY_TEXTS,
  HEALTH_DRAIN_PER_HOUR,
  HEALTH_REGEN_PER_HOUR,
  LITTER,
  LITTER_MIN,
  LITTER_RANGE,
  LIVE_SECONDS,
  LONELY_PER_UNREAD,
  MAX_AWAY_SECONDS,
  MAX_GAS,
  MAX_LONELY,
  MAX_MESSAGES,
  MAX_ORDERS,
  MAX_POOPS,
  MAX_TEXTS,
  MAX_TRASH,
  MEAT_PRICE,
  MISSED_CALL_MOOD,
  MOOD_PER_HOUR,
  NEED_OK,
  NEED_WORDS,
  PET_MOOD,
  PINCH_BELOW,
  PLAY_COOLDOWN,
  POOP_STINK_PER_HOUR,
  REPLY_DELAY_MIN,
  REPLY_DELAY_RANGE,
  REST,
  ROT_SECONDS,
  SCOOP_FRESH,
  SELF_ETA_MIN,
  SELF_ETA_RANGE,
  SELF_ORDER_BELOW,
  SELF_ORDER_TIP,
  SELF_TOILET_CHANCE,
  SHRUG_REPLIES,
  SHOWER_COOLDOWN,
  SHOWER_FRESH,
  SHOWER_MOOD,
  SOAP_FRESH,
  SOAP_MOOD,
  START_COINS,
  STREAM_PER_HOUR,
  TEXT_COINS,
  TEXT_GAP_MIN,
  TEXT_GAP_RANGE,
  TEXT_MOOD,
  TEXT_OPTIONS,
  TEXT_REFILL_SECONDS,
  TIDY_COINS,
  TIDY_FRESH,
  TOILET_FRESH,
  TOY_BY_ID,
  TRASH_STINK_PER_HOUR,
  UPGRADE_BY_ID,
  URGE_SECONDS,
  VACUUM_SECONDS,
  WELCOME_SECONDS,
  type CaughtId,
  type Cause,
  type FitId,
  type FoodId,
  type FormId,
  type FurnitureId,
  type Need,
  type SpotId,
  type TextOption,
  type ToyId,
  type TrashKind,
  type UpgradeId,
} from './defs';
import { rngStep } from '@shared/rng';
import { newHammy, type HammyState, type Message } from './state';

type Roll = () => number;

const clamp = (v: number): number => Math.min(100, Math.max(0, v));
const pick = <T>(list: readonly T[], roll: Roll): T => list[Math.min(list.length - 1, Math.floor(roll() * list.length))];

export const isAlive = (s: HammyState): boolean => s.diedAt === null;
export const NEEDS: readonly Need[] = ['belly', 'fresh', 'mood'];

/** A word for how full a meter is: "Snacky", "Rancid", "Crying". */
export function needWord(need: Need | 'health', value: number): string {
  const words = NEED_WORDS[need];
  if (value <= 0) return words[4];
  if (value < 20) return words[3];
  if (value < 45) return words[2];
  if (value < 75) return words[1];
  return words[0];
}

/** Texts from him that have arrived and that you haven't seen. */
export function unread(s: HammyState, now: number): number {
  return s.messages.filter((m) => m.from === 'hammy' && m.at > s.readAt && m.at <= now).length;
}

/** His reply is on its way (shown as "typing…"). */
export const typing = (s: HammyState, now: number): boolean => s.messages.some((m) => m.at > now);

export function markRead(s: HammyState, now: number): void {
  const seen = s.messages.reduce((t, m) => (m.at <= now ? Math.max(t, m.at) : t), s.readAt);
  s.readAt = seen;
}

export function causeText(causes: readonly Cause[]): string {
  if (causes.length === 0) return 'Nobody knows. He just stopped.';
  return causes.map((c) => CAUSE_TEXT[c]).join(' ');
}

/** Seconds since he died, for the rot; null while he's alive. */
export function deadFor(s: HammyState, now: number): number | null {
  return s.diedAt === null ? null : Math.max(0, (now - s.diedAt) / 1000);
}

export const rotDone = (s: HammyState, now: number): boolean => (deadFor(s, now) ?? 0) >= ROT_SECONDS;

/** The unit came with a toilet and a shower; the rest has to be bought. */
export const hasFurniture = (s: HammyState, id: FurnitureId | SpotId): boolean => id === 'toilet' || id === 'shower' || s.furniture.includes(id as FurnitureId);

/** Too much in the toilet: it takes nothing more until you flush. */
export const bowlFull = (s: HammyState): boolean => s.bowl >= BOWL_MAX;

// ---------------------------------------------------------------------------
// Time

export type HammyEvent =
  | { type: 'fart'; size: number }
  | { type: 'poop' }
  | { type: 'urge' }
  /** `live` when you saw it land: then the scene drops the wrapper where he eats it. */
  | { type: 'delivery'; food: FoodId; self: boolean; live: boolean }
  | { type: 'selfOrder'; food: FoodId; cost: number }
  | { type: 'text'; text: string }
  | { type: 'ring' }
  | { type: 'missedCall' }
  | { type: 'died' };

export interface AwayReport {
  elapsed: number;
  farts: number;
  poops: number;
  /** Trips to the toilet he made by himself (and didn't flush). */
  selfToilet: number;
  /** What's in the bowl now. */
  bowl: number;
  /** Trash he left lying around, and how much of it the robot vacuums got. */
  littered: number;
  vacuumed: number;
  meals: number;
  texts: number;
  missedCalls: number;
  selfOrders: number;
  selfSpent: number;
  coins: number;
  died: boolean;
  before: Record<Need, number>;
  after: Record<Need, number>;
}

export interface StepResult {
  events: HammyEvent[];
  /** Set when the gap was long enough for a welcome-back screen. */
  away: AwayReport | null;
}

const needs = (s: HammyState): Record<Need, number> => ({ belly: s.belly, fresh: s.fresh, mood: s.mood });

export function fartRate(gas: number): number {
  return FART_RATE + gas * FART_RATE_PER_GAS;
}

/** Let one out. Returns how big it was, about 0.4 to 1.4. */
function fart(s: HammyState): number {
  const used = Math.min(s.gas, FART_GAS);
  s.gas -= used;
  s.fresh = clamp(s.fresh - FART_STINK - used * FART_STINK_PER_GAS);
  s.stats.farts += 1;
  return 0.4 + used / FART_GAS;
}

function eat(s: HammyState, id: FoodId, at: number, roll: Roll): void {
  const f = FOOD_BY_ID[id];
  // He is never full: food past a full belly just turns into gas.
  const over = Math.max(0, s.belly + f.belly - 100);
  s.belly = clamp(s.belly + f.belly);
  s.mood = clamp(s.mood + f.mood);
  s.gas = Math.min(MAX_GAS, s.gas + f.gas + over * 0.5);
  if (f.fresh) s.fresh = clamp(s.fresh + f.fresh);
  if (f.health) s.health = clamp(s.health + f.health);
  for (let i = 0; i < f.poops; i++) s.poopDue.push(at + (DIGEST_MIN + roll() * DIGEST_RANGE) * 1000);
  s.stats.meals += 1;
}

function die(s: HammyState, at: number, causes: Cause[]): void {
  s.diedAt = at;
  s.causes = causes;
  s.health = 0;
  s.orders = [];
  s.poopDue = [];
}

function hammyText(s: HammyState, roll: Roll): string {
  const moods: (keyof typeof HAMMY_TEXTS)[] = [];
  if (s.belly < 30) moods.push('hungry');
  if (s.fresh < 30) moods.push('stinky');
  if (s.mood < 30) moods.push('sad');
  if (s.poops.length >= 3) moods.push('poopy');
  if (s.urges.length) moods.push('urge');
  if (s.bowl >= 2) moods.push('bowl');
  if (s.trash.length >= 5) moods.push('messy');
  if (s.furniture.length === 0) moods.push('bare');
  const pool = moods.length && roll() < 0.75 ? HAMMY_TEXTS[pick(moods, roll)] : HAMMY_TEXTS.any;
  const last = [...s.messages].reverse().find((m) => m.from === 'hammy')?.text;
  const fresh = pool.filter((t) => t !== last);
  return pick(fresh.length ? fresh : pool, roll);
}

function pushMessage(s: HammyState, m: Message): void {
  s.messages.push(m);
  if (s.messages.length > MAX_MESSAGES) s.messages.splice(0, s.messages.length - MAX_MESSAGES);
}

/** He gets hungry and orders on your coins. Only paid food, and only what you can cover. */
function selfOrder(s: HammyState, at: number, roll: Roll): HammyEvent | null {
  const menu = FOODS.filter((f) => f.selfOrder && f.belly >= 20 && s.coins >= f.price + SELF_ORDER_TIP);
  if (menu.length === 0) return null;
  const f = pick(menu, roll);
  const cost = f.price + SELF_ORDER_TIP;
  s.coins -= cost;
  s.orders.push({ food: f.id, arriveAt: at + (SELF_ETA_MIN + roll() * SELF_ETA_RANGE) * 1000, self: true });
  s.stats.selfOrders += 1;
  s.stats.selfSpent += cost;
  return { type: 'selfOrder', food: f.id, cost };
}

/** Drop a piece of trash on the floor. Returns false when the floors can't take any more. */
export function addTrash(s: HammyState, kind: TrashKind, x: number, up: boolean): boolean {
  if (!isAlive(s) || s.trash.length >= MAX_TRASH) return false;
  s.trash.push({ x: Math.min(1, Math.max(0, x)), up, kind });
  s.stats.littered += 1;
  return true;
}

/** Somewhere he'd plausibly leave it: the loft if he has a bed or a PC up there. */
function strew(s: HammyState, kind: TrashKind, roll: Roll): void {
  const loft = hasFurniture(s, 'bed') || hasFurniture(s, 'pc');
  addTrash(s, kind, 0.05 + roll() * 0.9, loft && roll() < 0.4);
}

function tick(s: HammyState, from: number, to: number, live: boolean, roll: Roll, events: HammyEvent[]): void {
  const dt = (to - from) / 1000;
  const h = dt / 3600;

  // Deliveries and what comes out the other end.
  if (s.orders.some((o) => o.arriveAt <= to)) {
    const due = s.orders.filter((o) => o.arriveAt <= to).sort((a, b) => a.arriveAt - b.arriveAt);
    s.orders = s.orders.filter((o) => o.arriveAt > to);
    for (const o of due) {
      eat(s, o.food, o.arriveAt, roll);
      // Watching, you see where he leaves the wrapper; away, it's wherever.
      if (!live) strew(s, FOOD_BY_ID[o.food].trash, roll);
      events.push({ type: 'delivery', food: o.food, self: o.self, live });
      // Only one thing on the menu can kill him on its own.
      if (s.health <= 0) {
        die(s, o.arriveAt, ['sushi']);
        events.push({ type: 'died' });
        return;
      }
    }
  }
  // A meal ready to come out means he needs to go. He holds it a while; if
  // nobody puts him on the toilet, it ends up on the floor.
  if (s.poopDue.some((t) => t <= to)) {
    for (const t of s.poopDue.filter((t) => t <= to)) s.urges.push(t + URGE_SECONDS * 1000);
    s.poopDue = s.poopDue.filter((t) => t > to);
    events.push({ type: 'urge' });
  }
  if (s.urges.some((t) => t <= to)) {
    const due = s.urges.filter((t) => t <= to);
    s.urges = s.urges.filter((t) => t > to);
    for (let i = 0; i < due.length; i++) {
      // While you watch, the scene walks him there himself. Away, he usually
      // goes too, and doesn't flush, until it's full.
      if (!live && !bowlFull(s) && roll() < SELF_TOILET_CHANCE) {
        s.bowl += 1;
        s.fresh = clamp(s.fresh + TOILET_FRESH);
        s.stats.toilet += 1;
        s.stats.selfToilet += 1;
        continue;
      }
      if (s.poops.length >= MAX_POOPS) break;
      s.poops.push({ x: 0.12 + roll() * 0.76, up: false });
      events.push({ type: 'poop' });
    }
  }
  // Away, he leaves things lying around. Watching, you see him do it.
  if (!live && to >= s.litterAt) {
    strew(s, pick(LITTER, roll), roll);
    s.litterAt = to + (LITTER_MIN + roll() * LITTER_RANGE) * 1000;
  }
  // Robot vacuums pick up trash. While you watch, they drive to it themselves.
  const vacuums = s.upgrades.vacuum;
  if (!live && vacuums > 0 && s.trash.length && to >= s.vacuumAt) {
    s.vacuumAt = to + (VACUUM_SECONDS * 1000) / vacuums;
    s.trash.shift();
    s.stats.vacuumed += 1;
  }

  // Needs drain.
  s.belly = clamp(s.belly - BELLY_PER_HOUR * h);
  const mess = POOP_STINK_PER_HOUR * s.poops.length + BOWL_STINK_PER_HOUR * s.bowl + TRASH_STINK_PER_HOUR * s.trash.length;
  s.fresh = clamp(s.fresh - (FRESH_PER_HOUR + mess) * h);
  const lonely = Math.min(MAX_LONELY, LONELY_PER_UNREAD * Math.max(0, unread(s, to) - FREE_UNREAD));
  s.mood = clamp(s.mood - (MOOD_PER_HOUR + lonely) * h);

  // Gas. Live, at most one per frame; away, as many as fit in the step.
  const rate = fartRate(s.gas);
  const farts = live ? (roll() < rate * dt ? 1 : 0) : Math.floor(rate * dt + roll());
  for (let i = 0; i < farts; i++) events.push({ type: 'fart', size: fart(s) });

  if (s.mood >= COIN_MOOD) s.coins += (COINS_PER_HOUR + (!live && hasFurniture(s, 'pc') ? STREAM_PER_HOUR : 0)) * h;
  s.textBudget = Math.min(MAX_TEXTS, s.textBudget + dt / TEXT_REFILL_SECONDS);

  // The phone.
  while (s.nextTextAt <= to) {
    const at = Math.max(from, s.nextTextAt);
    const text = hammyText(s, roll);
    pushMessage(s, { at, from: 'hammy', text });
    events.push({ type: 'text', text });
    s.nextTextAt = at + (TEXT_GAP_MIN + roll() * TEXT_GAP_RANGE) * 1000;
  }
  if (s.nextCallAt <= to) {
    if (live) {
      events.push({ type: 'ring' });
      s.nextCallAt = to + (CALL_GAP_MIN + roll() * CALL_GAP_RANGE) * 1000;
    } else {
      const at = Math.max(from, s.nextCallAt);
      missCall(s, at);
      events.push({ type: 'missedCall' });
      s.nextCallAt = at + (AWAY_CALL_GAP_MIN + roll() * AWAY_CALL_GAP_RANGE) * 1000;
    }
  }

  if (s.belly < SELF_ORDER_BELOW && s.orders.length === 0) {
    const e = selfOrder(s, to, roll);
    if (e) events.push(e);
  }

  // Health only suffers while a need is empty.
  const empty = NEEDS.filter((n) => s[n] <= 0);
  if (empty.length) s.health = clamp(s.health - HEALTH_DRAIN_PER_HOUR * empty.length * h);
  else if (NEEDS.every((n) => s[n] >= NEED_OK)) s.health = clamp(s.health + HEALTH_REGEN_PER_HOUR * h);
  if (s.health <= 0) {
    die(s, to, empty);
    events.push({ type: 'died' });
  }
}

/**
 * Advance to `now`: needs drain, food arrives, gas and poop come out, the
 * phone rings, and maybe he dies. Long gaps are simulated a minute at a time
 * and summed up for the welcome-back screen.
 */
export function step(s: HammyState, now: number, roll: Roll = Math.random): StepResult {
  const events: HammyEvent[] = [];
  const gap = (now - s.updatedAt) / 1000;
  if (gap <= 0) return { events, away: null };
  const away = gap >= WELCOME_SECONDS;
  const live = gap < LIVE_SECONDS;
  const before = needs(s);
  const coins = s.coins;
  const stats = { ...s.stats };
  // Past two weeks nothing changes any more, so skip ahead.
  let t = Math.max(s.updatedAt, now - MAX_AWAY_SECONDS * 1000);
  if (t > s.updatedAt) {
    s.nextTextAt = Math.max(s.nextTextAt, t);
    s.nextCallAt = Math.max(s.nextCallAt, t);
  }
  while (t < now && isAlive(s)) {
    const end = Math.min(now, t + CHUNK_SECONDS * 1000);
    tick(s, t, end, live, roll, events);
    t = end;
  }
  s.updatedAt = now;
  if (!away) return { events, away: null };
  const count = (type: HammyEvent['type']) => events.filter((e) => e.type === type).length;
  return {
    events,
    away: {
      elapsed: gap,
      farts: s.stats.farts - stats.farts,
      poops: count('poop'),
      selfToilet: s.stats.selfToilet - stats.selfToilet,
      bowl: s.bowl,
      littered: s.stats.littered - stats.littered,
      vacuumed: s.stats.vacuumed - stats.vacuumed,
      meals: s.stats.meals - stats.meals,
      texts: count('text'),
      missedCalls: count('missedCall'),
      selfOrders: s.stats.selfOrders - stats.selfOrders,
      selfSpent: s.stats.selfSpent - stats.selfSpent,
      coins: s.coins - coins,
      died: events.some((e) => e.type === 'died'),
      before,
      after: needs(s),
    },
  };
}

/** Coming back to the game: he calls soon, rather than hours from now. */
export function wake(s: HammyState, now: number, roll: Roll = Math.random): void {
  const soon = now + (2 + roll() * 4) * 60_000;
  if (s.nextCallAt > soon) s.nextCallAt = soon;
}

// ---------------------------------------------------------------------------
// Care

export function canOrder(s: HammyState, id: FoodId): boolean {
  return isAlive(s) && s.orders.length < MAX_ORDERS && s.coins >= FOOD_BY_ID[id].price;
}

export function order(s: HammyState, id: FoodId, now: number, roll: Roll = Math.random): boolean {
  if (!canOrder(s, id)) return false;
  s.coins -= FOOD_BY_ID[id].price;
  // Orders arrive one after another, not all at once.
  const after = s.orders.reduce((t, o) => Math.max(t, o.arriveAt), now);
  s.orders.push({ food: id, arriveAt: Math.max(now + (ETA_MIN + roll() * ETA_RANGE) * 1000, after + 2500), self: false });
  return true;
}

/** A floor poop goes in the toilet. False if it's clogged: flush first. */
export function dumpPoop(s: HammyState, index: number): boolean {
  if (!isAlive(s) || index < 0 || index >= s.poops.length || bowlFull(s)) return false;
  s.poops.splice(index, 1);
  s.bowl += 1;
  s.fresh = clamp(s.fresh + SCOOP_FRESH);
  s.stats.scooped += 1;
  return true;
}

/** As many floor poops as the toilet takes. Returns how many went in. */
export function dumpAll(s: HammyState): number {
  let n = 0;
  while (s.poops.length && dumpPoop(s, 0)) n += 1;
  return n;
}

/** You moved a poop somewhere else. Why. */
export function movePoop(s: HammyState, index: number, x: number, up: boolean): boolean {
  if (!isAlive(s) || index < 0 || index >= s.poops.length) return false;
  s.poops[index] = { x: Math.min(1, Math.max(0, x)), up };
  return true;
}

/** Somebody has to. Returns how many loads went down (the coins are FLUSH_COINS each). */
export function flush(s: HammyState): number {
  if (!isAlive(s)) return 0;
  const n = s.bowl;
  s.bowl = 0;
  s.coins += n * FLUSH_COINS;
  s.fresh = clamp(s.fresh + n * FLUSH_FRESH);
  s.stats.flushed += n;
  return n;
}

/** Throw one piece of his trash down the chute. Returns the coins (one; he drops change). */
export function tidy(s: HammyState, index: number): number {
  if (!isAlive(s) || index < 0 || index >= s.trash.length) return 0;
  s.trash.splice(index, 1);
  s.coins += TIDY_COINS;
  s.fresh = clamp(s.fresh + TIDY_FRESH);
  s.stats.tidied += 1;
  return TIDY_COINS;
}

export function tidyAll(s: HammyState): number {
  let got = 0;
  while (s.trash.length && isAlive(s)) got += tidy(s, 0);
  return got;
}

export const canShower = (s: HammyState, now: number): boolean => isAlive(s) && now >= s.showerReadyAt;

/** Five minutes in the shower. Better with soap. */
export function shower(s: HammyState, now: number): boolean {
  if (!canShower(s, now)) return false;
  const soap = s.upgrades.soap;
  s.fresh = clamp(s.fresh + SHOWER_FRESH + SOAP_FRESH[soap]);
  s.mood = clamp(s.mood + SHOWER_MOOD + SOAP_MOOD[soap]);
  s.showerReadyAt = now + SHOWER_COOLDOWN * 1000;
  s.stats.showers += 1;
  return true;
}

/**
 * Sat on the toilet. Returns how many he got out: 0 if he didn't need to go
 * or the bowl is full. It stays in the bowl: he doesn't flush.
 */
export function useToilet(s: HammyState, self = false): number {
  if (!isAlive(s) || s.urges.length === 0) return 0;
  const n = Math.min(s.urges.length, BOWL_MAX - s.bowl);
  if (n <= 0) return 0;
  s.urges.splice(0, n);
  s.bowl += n;
  s.fresh = clamp(s.fresh + n * TOILET_FRESH);
  s.stats.toilet += n;
  if (self) s.stats.selfToilet += n;
  return n;
}

/**
 * He's lying on the bed, in his chair, or at the PC. Every few seconds that
 * lifts his mood a little (but only so far: he still wants you to call), and
 * at the PC his stream earns a coin now and then.
 */
export function rest(s: HammyState, spot: SpotId, now: number): { mood: number; coins: number } | null {
  const r = REST[spot];
  if (!r || !isAlive(s) || !hasFurniture(s, spot) || now < s.restReadyAt) return null;
  s.restReadyAt = now + r.every * 1000;
  const mood = Math.max(0, Math.min(r.mood, r.cap - s.mood));
  s.mood = clamp(s.mood + mood);
  let coins = 0;
  if (r.coins && r.coinEvery && now >= s.streamCoinAt) {
    coins = r.coins;
    s.coins += coins;
    s.streamCoinAt = now + r.coinEvery * 1000;
  }
  return { mood, coins };
}

/** A raw steak out of the fridge. */
export function buyMeat(s: HammyState): boolean {
  if (!isAlive(s) || !hasFurniture(s, 'fridge') || s.coins < MEAT_PRICE) return false;
  s.coins -= MEAT_PRICE;
  return true;
}

/** He ate something that didn't come by DoorDosh: raw, cooked or burnt steak. */
export function feed(s: HammyState, id: FoodId, now: number, roll: Roll = Math.random): boolean {
  if (!isAlive(s) || !FOOD_BY_ID[id]?.home) return false;
  eat(s, id, now, roll);
  if (id === 'steak') s.stats.cooked += 1;
  if (s.health <= 0) die(s, now, ['sushi']);
  return true;
}

/** A robot vacuum got to a piece of trash while you were watching. */
export function vacuumTrash(s: HammyState, index: number): boolean {
  if (!isAlive(s) || s.upgrades.vacuum === 0 || index < 0 || index >= s.trash.length) return false;
  s.trash.splice(index, 1);
  s.stats.vacuumed += 1;
  return true;
}

export function buyFurniture(s: HammyState, id: FurnitureId): boolean {
  const f = FURNITURE_BY_ID[id];
  if (!f || s.furniture.includes(id) || s.coins < f.price) return false;
  s.coins -= f.price;
  s.furniture.push(id);
  return true;
}

export function upgradeCost(s: HammyState, id: UpgradeId): number | null {
  const level = UPGRADE_BY_ID[id].levels[s.upgrades[id]];
  return level ? level.price : null;
}

export function buyUpgrade(s: HammyState, id: UpgradeId): boolean {
  const cost = upgradeCost(s, id);
  if (cost === null || s.coins < cost) return false;
  s.coins -= cost;
  s.upgrades[id] += 1;
  return true;
}

function fuss(s: HammyState, now: number, mood: number): boolean {
  if (!isAlive(s) || now < s.fussReadyAt) return false;
  s.mood = clamp(s.mood + mood);
  s.fussReadyAt = now + FUSS_COOLDOWN * 1000;
  return true;
}

export const pet = (s: HammyState, now: number): boolean => fuss(s, now, PET_MOOD);

/** He loves being thrown. Counts every throw; mood only every couple of seconds. */
export function fling(s: HammyState, now: number): boolean {
  if (!isAlive(s)) return false;
  s.stats.flings += 1;
  return fuss(s, now, FLING_MOOD);
}

// ---------------------------------------------------------------------------
// Phone

/** Three things you could text him right now. They change after every text. */
export function textOptions(s: HammyState): TextOption[] {
  const n = TEXT_OPTIONS.length;
  const start = (s.stats.texts * 3 + s.n) % n;
  return [0, 1, 2].map((i) => TEXT_OPTIONS[(start + i * 4) % n]);
}

export function replyTo(id: string, s: HammyState, roll: Roll): string {
  const by = (lines: string[]) => pick(lines, roll);
  switch (id) {
    case 'up':
      return by(['always. i dont sleep i just buffer', 'ya', 'i am now', 'no. this is a recording']);
    case 'ate':
      return s.belly < 40 ? by(['no 😭 order me dorkitos', 'define eat', 'i licked the dorkito dust off my hands. does that count']) : by(['yeah i ate like 4 bags', 'ya im stuffed', 'yes and i regret it']);
    case 'stink':
      return s.fresh < 40 ? by(['thats my natural musk', 'its the toilet', 'u get used to it', 'no u']) : by(['i showered last month', 'smell this 💨', 'lies']);
    case 'love':
      return by(['❤️ dont tell the scientist', 'love u too man', 'ok weirdo. ❤️', 'stop ur gonna make me cry']);
    case 'wyd':
      return by(['laying in my own filth. u?', 'staring at the glass', 'eating', 'trying to fight the robot vacuum', 'gaming', 'nothin']);
    case 'fart':
      return by(['i cant control the wind', 'never', 'thats not a fart its a feeling', 'make me']);
    case 'there':
      return by(['recalculating…', '5 more minutes', 'we been there', 'r u driving??']);
    case 'tank':
      return s.fresh < PINCH_BELOW ? by(['the scientist sounds like shes in a gas mask lol', 'kinda foggy in here', 'the plant died']) : by(['its chill', 'the scientist said hi on the intercom', 'cozy. 10/10']);
    case 'lol':
      return by(['lmao', 'lol', '😂', 'what r we laughing at']);
    case 'pic':
      return by(['📸 [blurry photo of a dorkito]', '📸 [selfie, mostly nostril]', '📸 [the toilet. unflushed]', 'no ur gonna post it']);
    case 'proud':
      return by(['aw 🥹', 'of what lol', 'thanks i pooped earlier', 'finally someone notices']);
    case 'clean':
      return by(['u clean it', 'its organized chaos', 'ur not my mom', 'ok (i will not)']);
    default:
      return 'k';
  }
}
/**
 * Send him a text. It lifts his mood unless you've been spamming him. His
 * reply arrives a moment later. Returns false if he can't get texts.
 */
export function sendText(s: HammyState, id: string, now: number, roll: Roll = Math.random): boolean {
  const option = TEXT_OPTIONS.find((o) => o.id === id);
  if (!option || !isAlive(s)) return false;
  pushMessage(s, { at: now, from: 'you', text: option.text });
  const counts = s.textBudget >= 1;
  if (counts) {
    s.textBudget -= 1;
    s.mood = clamp(s.mood + TEXT_MOOD);
    s.coins += TEXT_COINS;
  }
  s.stats.texts += 1;
  const reply = counts ? replyTo(id, s, roll) : pick(CHILL_REPLIES, roll);
  pushMessage(s, { at: now + (REPLY_DELAY_MIN + roll() * REPLY_DELAY_RANGE) * 1000, from: 'hammy', text: reply });
  markRead(s, now);
  return true;
}

/**
 * You typed him something of your own. Counts like a quick reply (mood and a
 * coin) while he isn't sick of texts. Returns whether it counted, or null if
 * he can't get texts (he's dead). His reply comes separately, with `hammyText`.
 */
export function sendOwnText(s: HammyState, text: string, now: number): boolean | null {
  const said = text.trim().slice(0, 300);
  if (!said || !isAlive(s)) return null;
  pushMessage(s, { at: now, from: 'you', text: said });
  const counts = s.textBudget >= 1;
  if (counts) {
    s.textBudget -= 1;
    s.mood = clamp(s.mood + TEXT_MOOD);
    s.coins += TEXT_COINS;
  }
  s.stats.texts += 1;
  markRead(s, now);
  return counts;
}

/** His answer to what you typed shows up in the thread. */
export function hammyReplies(s: HammyState, text: string, now: number): void {
  const said = text.trim().slice(0, 400);
  if (!said || !isAlive(s)) return;
  pushMessage(s, { at: now, from: 'hammy', text: said });
  markRead(s, now);
}

/** Words that steer a typed text to one of his canned answers, for when there's no brain to ask. */
const CANNED: readonly [RegExp, string][] = [
  [/\b(ate|eat|food|hungry|dinner|lunch|snack|dorkitos?)\b/i, 'ate'],
  [/\b(stink|smell|shower|wash|gross|nasty)\b/i, 'stink'],
  [/\b(love|miss|bestie|bro ❤️)\b/i, 'love'],
  [/\b(wyd|doing|up to)\b/i, 'wyd'],
  [/\b(fart|gas|toot)\b/i, 'fart'],
  [/\b(there yet|road ?trip|drive|driving)\b/i, 'there'],
  [/\b(unit|room|tank|cell|place)\b/i, 'tank'],
  [/\b(lol|lmao|haha|😂)\b/i, 'lol'],
  [/\b(pic|photo|selfie|picture)\b/i, 'pic'],
  [/\b(proud|good job|nice)\b/i, 'proud'],
  [/\b(clean|flush|trash|tidy|mess)\b/i, 'clean'],
  [/\b(up|awake|sleep)\b/i, 'up'],
];

/** What he says back when nobody's there to think for him. */
export function cannedReply(s: HammyState, said: string, roll: Roll = Math.random): string {
  const hit = CANNED.find(([re]) => re.test(said));
  return hit ? replyTo(hit[1], s, roll) : pick(SHRUG_REPLIES, roll);
}

/**
 * What you walk in on after being away. Whatever the unit has going for it
 * is likelier: a pile of trash to dig through, an unflushed toilet to stare
 * into, a fridge to put his face in.
 */
export function pickCaught(s: HammyState, roll: Roll = Math.random): CaughtId {
  const options: CaughtId[] = ['sock', 'nap', 'lick'];
  if (s.trash.length >= 2) options.push('dig', 'dig', 'dig');
  if (s.bowl > 0) options.push('toilet', 'toilet');
  if (hasFurniture(s, 'fridge')) options.push('fridge', 'fridge');
  return pick(options, roll);
}

export const caughtLine = (id: CaughtId, roll: Roll = Math.random): string => pick(CAUGHT[id].says, roll);

/** What's going on in the unit, in a few lines, for him to talk about. */
export function situation(s: HammyState, now: number, form: FormId): string {
  const lines = [
    `Today you are ${FORMS.find((f) => f.id === form)?.name ?? 'Cube Hammy'}.`,
    `Belly: ${needWord('belly', s.belly)} (${Math.round(s.belly)}/100). Freshness: ${needWord('fresh', s.fresh)} (${Math.round(s.fresh)}/100). Mood: ${needWord('mood', s.mood)} (${Math.round(s.mood)}/100). Health: ${needWord('health', s.health)}.`,
  ];
  if (s.urges.length) lines.push('You have to poop right now.');
  if (s.bowl >= BOWL_MAX) lines.push('The toilet is clogged with poop nobody flushed.');
  else if (s.bowl) lines.push(`There's unflushed poop in the toilet (${s.bowl} ${s.bowl === 1 ? 'load' : 'loads'}). You did that.`);
  if (s.poops.length) lines.push(`${s.poops.length} ${s.poops.length === 1 ? 'poop is' : 'poops are'} on the floor.`);
  if (s.trash.length) lines.push(`${s.trash.length} ${s.trash.length === 1 ? 'piece of your trash is' : 'pieces of your trash are'} lying around (${[...new Set(s.trash.map((t) => t.kind))].join(', ')}).`);
  if (s.orders.length) lines.push(`DoorDosh is on the way: ${s.orders.map((o) => FOOD_BY_ID[o.food].name).join(', ')}.`);
  const has = s.furniture.map((f) => FURNITURE_BY_ID[f].name.toLowerCase());
  lines.push(has.length ? `Your furniture: ${has.join(', ')}. The unit also has a toilet and a shower.` : 'The unit is bare: just a toilet and a shower. No bed, no chair, no PC.');
  lines.push(`Your friend has ${Math.floor(s.coins)} Hammy coins.`);
  if (s.fresh < PINCH_BELOW) lines.push('Dr. Moss is wearing a gas mask because of you.');
  const ago = (now - s.bornAt) / 3_600_000;
  lines.push(`You've been in the unit ${ago < 1 ? 'less than an hour' : `${Math.floor(ago)} hours`}${s.n > 1 ? `, and you're Hammy #${s.n} (the ones before you died)` : ''}.`);
  return lines.join('\n');
}

export const canCall = (s: HammyState, now: number): boolean => isAlive(s) && now >= s.callReadyAt;

export function callMood(seconds: number, incoming: boolean): number {
  return Math.min(CALL_MAX_MOOD, Math.max(0, seconds) * CALL_MOOD_PER_SECOND) + (incoming ? ANSWER_BONUS_MOOD : 0);
}

/** Hang up. Returns the mood and coins the call was worth. */
export function endCall(s: HammyState, seconds: number, now: number, incoming: boolean): { mood: number; coins: number } {
  if (!isAlive(s)) return { mood: 0, coins: 0 };
  const mood = callMood(seconds, incoming);
  const coins = seconds >= CALL_MIN_SECONDS ? (incoming ? ANSWER_COINS : CALL_COINS) : 0;
  s.mood = clamp(s.mood + mood);
  s.coins += coins;
  s.callReadyAt = now + CALL_COOLDOWN * 1000;
  s.nextCallAt = Math.max(s.nextCallAt, now + CALL_GAP_MIN * 1000);
  s.stats.calls += 1;
  return { mood, coins };
}

function missCall(s: HammyState, at: number): void {
  s.mood = clamp(s.mood + MISSED_CALL_MOOD);
  pushMessage(s, { at, from: 'hammy', text: 'Missed call', missed: true });
}

/** You let it ring out, or hit decline (which hurts more). */
export function declineCall(s: HammyState, now: number, missed: boolean): void {
  if (!isAlive(s)) return;
  if (missed) {
    missCall(s, now);
  } else {
    s.mood = clamp(s.mood + DECLINE_MOOD);
    pushMessage(s, { at: now + 1500, from: 'hammy', text: 'u declined me?? 💔' });
  }
}

// ---------------------------------------------------------------------------
// Fits

export function buyFit(s: HammyState, id: FitId): boolean {
  const f = FIT_BY_ID[id];
  if (!f || s.owned.includes(id) || s.coins < f.price) return false;
  s.coins -= f.price;
  s.owned.push(id);
  s.fit = id;
  return true;
}

export function wearFit(s: HammyState, id: FitId): boolean {
  if (!s.owned.includes(id)) return false;
  s.fit = id;
  return true;
}

// ---------------------------------------------------------------------------
// Toys

export function buyToy(s: HammyState, id: ToyId): boolean {
  const t = TOY_BY_ID[id];
  if (!t || s.toys.includes(id) || s.coins < t.price) return false;
  s.coins -= t.price;
  s.toys.push(id);
  s.toy = id;
  return true;
}

export function pickToy(s: HammyState, id: ToyId): boolean {
  if (!s.toys.includes(id)) return false;
  s.toy = id;
  return true;
}

/**
 * A toy landed on him. Every use is a show, but it only changes his mood and
 * pays coins every couple of seconds. Returns what it was worth, or null.
 */
export function play(s: HammyState, id: ToyId, now: number): { mood: number; coins: number } | null {
  const t = TOY_BY_ID[id];
  if (!t || !isAlive(s) || !s.toys.includes(id) || now < s.playReadyAt) return null;
  s.playReadyAt = now + PLAY_COOLDOWN * 1000;
  s.mood = clamp(s.mood + t.mood);
  if (t.fresh) s.fresh = clamp(s.fresh + t.fresh);
  if (t.belly) s.belly = clamp(s.belly + t.belly);
  s.coins += t.coins;
  s.stats.toys += 1;
  return { mood: t.mood, coins: t.coins };
}

// ---------------------------------------------------------------------------
// Forms

const DAY_MS = 86_400_000;

/** Days since 1970 on the player's own calendar, so forms change at local midnight. */
export function localDay(now: number): number {
  return Math.floor((now - new Date(now).getTimezoneOffset() * 60_000) / DAY_MS);
}

/**
 * What he is on a given day. His first day he's Cube Hammy; after that each
 * day picks another form at random (Cube Hammy most often), never the same
 * two days running.
 */
export function formOnDay(day: number, firstDay: number, seed: number): FormId {
  if (day <= firstDay) return FORMS[0].id;
  let i = 0;
  // Walked from his first day, so no two days in a row ever match.
  for (let d = firstDay + 1; d <= day; d++) {
    const [, roll] = rngStep((seed ^ Math.imul(d, 0x9e3779b1)) >>> 0);
    const others = FORMS.map((f, k) => ({ f, k })).filter((x) => x.k !== i);
    let left = roll * others.reduce((sum, x) => sum + x.f.weight, 0);
    i = others[others.length - 1].k;
    for (const x of others) {
      left -= x.f.weight;
      if (left < 0) {
        i = x.k;
        break;
      }
    }
  }
  return FORMS[i].id;
}

export function formFor(s: HammyState, now: number): FormId {
  return formOnDay(localDay(now), localDay(s.createdAt), s.createdAt % 2 ** 31);
}

// ---------------------------------------------------------------------------
// Death

/**
 * Bury him and get a new Hammy. Fits, toys and furniture stay yours; coins
 * start over (he spent most of them anyway), and the unit gets hosed out.
 */
export function adopt(s: HammyState, now: number): boolean {
  if (s.diedAt === null) return false;
  s.graves.unshift({ n: s.n, bornAt: s.bornAt, diedAt: s.diedAt, causes: s.causes, farts: s.stats.farts, fit: s.fit });
  if (s.graves.length > 30) s.graves.length = 30;
  Object.assign(s, newHammy(now, s.n + 1));
  s.coins = START_COINS;
  s.updatedAt = now;
  return true;
}
