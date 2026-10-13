import {
  AWAY_THRESHOLD_SECONDS,
  BASE_AWAY_HOURS,
  COST_GROWTH,
  FRENZY_MULT,
  FRENZY_SECONDS,
  MILESTONES,
  PRODUCERS,
  PRODUCER_BY_ID,
  SPECIMENS,
  SPECIMEN_BY_ID,
  SPORE_BONUS,
  SPORE_DIVISOR,
  SPORE_REQUIREMENT,
  UPGRADES,
  UPGRADE_BY_ID,
  type Effect,
  type ProducerDef,
  type ProducerId,
  type SpecimenDef,
  type UpgradeDef,
} from './defs';
import type { GameState } from './state';

// ---------------------------------------------------------------------------
// Costs

/** Cost of buying `count` more of a producer when `owned` are already owned. */
export function costOf(def: ProducerDef, owned: number, count = 1): number {
  const r = COST_GROWTH;
  return Math.ceil((def.baseCost * r ** owned * (r ** count - 1)) / (r - 1));
}

/** How many of a producer the budget can buy right now. */
export function maxBuyable(def: ProducerDef, owned: number, budget: number): number {
  const r = COST_GROWTH;
  const first = def.baseCost * r ** owned;
  if (budget < Math.ceil(first)) return 0;
  let n = Math.floor(Math.log((budget * (r - 1)) / first + 1) / Math.log(r));
  while (n > 0 && costOf(def, owned, n) > budget) n -= 1;
  while (costOf(def, owned, n + 1) <= budget) n += 1;
  return n;
}

export function owned(s: GameState, id: ProducerId): number {
  return s.producers[id] ?? 0;
}

// ---------------------------------------------------------------------------
// Effects from upgrades and specimens

function* activeEffects(s: GameState): Generator<Effect> {
  for (const id of s.upgrades) {
    const u = UPGRADE_BY_ID.get(id);
    if (u) yield u.effect;
  }
  for (const id of s.specimens) {
    const sp = SPECIMEN_BY_ID.get(id);
    if (sp) yield sp.effect;
  }
}

export function milestonesReached(count: number): number {
  let n = 0;
  for (const m of MILESTONES) if (count >= m) n += 1;
  return n;
}

export function nextMilestone(count: number): number | null {
  for (const m of MILESTONES) if (count < m) return m;
  return null;
}

/** Nutrients per second from ONE of this producer, with every bonus but frenzy. */
export function unitRate(s: GameState, id: ProducerId): number {
  let mult = 2 ** milestonesReached(owned(s, id));
  for (const e of activeEffects(s)) {
    if (e.type === 'producerMult' && e.target === id) mult *= e.mult;
    else if (e.type === 'synergy' && e.target === id) mult *= 1 + e.perSource * owned(s, e.source);
  }
  return PRODUCER_BY_ID[id].baseRate * mult * globalMult(s);
}

export function globalMult(s: GameState): number {
  let mult = 1 + s.spores * SPORE_BONUS;
  for (const e of activeEffects(s)) if (e.type === 'globalMult') mult *= e.mult;
  return mult;
}

/** Nutrients per second, ignoring frenzy. This is what counts while away. */
export function baseRate(s: GameState): number {
  let total = 0;
  for (const p of PRODUCERS) {
    const n = owned(s, p.id);
    if (n > 0) total += n * unitRate(s, p.id);
  }
  return total;
}

export function frenzyActive(s: GameState, now: number): boolean {
  return s.frenzyUntil > now;
}

export function totalRate(s: GameState, now: number): number {
  return baseRate(s) * (frenzyActive(s, now) ? FRENZY_MULT : 1);
}

export function tapValue(s: GameState, now: number): number {
  let flat = 1;
  let mult = 1;
  let pct = 0;
  for (const e of activeEffects(s)) {
    if (e.type === 'tapFlat') flat += e.amount;
    else if (e.type === 'tapMult') mult *= e.mult;
    else if (e.type === 'tapRatePct') pct += e.pct;
  }
  return (flat + pct * totalRate(s, now)) * mult;
}

export function awayCapSeconds(s: GameState): number {
  let hours = BASE_AWAY_HOURS;
  for (const e of activeEffects(s)) if (e.type === 'awayHours') hours += e.hours;
  return hours * 3600;
}

export function bloomRateMult(s: GameState): number {
  let mult = 1;
  for (const e of activeEffects(s)) if (e.type === 'bloomRate') mult *= e.mult;
  return mult;
}

// ---------------------------------------------------------------------------
// Earning and time

export function earn(s: GameState, amount: number): void {
  if (!(amount > 0)) return;
  s.nutrients += amount;
  s.jarTotal += amount;
  s.lifetime += amount;
}

export interface AwayReport {
  /** Seconds since the state was last simulated. */
  elapsed: number;
  /** Seconds of production actually credited (capped). */
  credited: number;
  earned: number;
  capped: boolean;
  /** Specimen that finished growing while away. */
  specimenReady: string | null;
}

/**
 * Advance the simulation to `now`. Short gaps (a frame) earn at the full
 * live rate. Long gaps (app closed, tab hidden) earn at the base rate up to
 * the away limit, and return a report for the welcome-back screen.
 */
export function step(s: GameState, now: number): AwayReport | null {
  const dtMs = now - s.updatedAt;
  if (dtMs <= 0) {
    // Clock moved backwards: resync without paying out.
    s.updatedAt = now;
    return null;
  }
  const dt = dtMs / 1000;
  if (dt <= AWAY_THRESHOLD_SECONDS) {
    earn(s, totalRate(s, now) * dt);
    s.stats.playSeconds += dt;
    s.updatedAt = now;
    s.stats.bestRate = Math.max(s.stats.bestRate, baseRate(s));
    return null;
  }

  const cap = awayCapSeconds(s);
  const credited = Math.min(dt, cap);
  const earned = baseRate(s) * credited;
  earn(s, earned);
  const c = s.cultivating;
  const specimenReady = c && c.endsAt > s.updatedAt && c.endsAt <= now ? c.id : null;
  if (s.frenzyUntil <= now) s.frenzyUntil = 0;
  s.updatedAt = now;
  return { elapsed: dt, credited, earned, capped: dt > cap, specimenReady };
}

// ---------------------------------------------------------------------------
// Buying

export function buyProducer(s: GameState, id: ProducerId, count: number): boolean {
  if (count < 1) return false;
  const def = PRODUCER_BY_ID[id];
  const cost = costOf(def, owned(s, id), count);
  if (s.nutrients < cost) return false;
  s.nutrients -= cost;
  s.producers[id] = owned(s, id) + count;
  if (!s.discovered.includes(id)) s.discovered.push(id);
  return true;
}

export function isUnlocked(s: GameState, u: UpgradeDef): boolean {
  if ('producer' in u.unlock) return owned(s, u.unlock.producer) >= u.unlock.owned;
  return s.jarTotal >= u.unlock.jarTotal;
}

/** Upgrades the player can see and buy now, cheapest first. */
export function availableUpgrades(s: GameState): UpgradeDef[] {
  return UPGRADES.filter((u) => !s.upgrades.includes(u.id) && isUnlocked(s, u)).sort((a, b) => a.cost - b.cost);
}

export function buyUpgrade(s: GameState, id: string): boolean {
  const u = UPGRADE_BY_ID.get(id);
  if (!u || s.upgrades.includes(id) || !isUnlocked(s, u) || s.nutrients < u.cost) return false;
  s.nutrients -= u.cost;
  s.upgrades.push(id);
  return true;
}

export type Visibility = 'open' | 'mystery' | 'hidden';

/** Owned producers and the next one are open; the one after is a silhouette. */
export function producerVisibility(s: GameState): Visibility[] {
  let furthest = -1;
  PRODUCERS.forEach((p, i) => {
    if (owned(s, p.id) > 0 || s.discovered.includes(p.id)) furthest = i;
  });
  return PRODUCERS.map((_, i) => (i <= furthest + 1 ? 'open' : i === furthest + 2 ? 'mystery' : 'hidden'));
}

// ---------------------------------------------------------------------------
// Cultivation (real-time growth)

export type SpecimenStatus = 'harvested' | 'growing' | 'ready' | 'available' | 'mystery' | 'hidden';

export function specimenStatus(s: GameState, sp: SpecimenDef, now: number): SpecimenStatus {
  if (s.specimens.includes(sp.id)) return 'harvested';
  if (s.cultivating?.id === sp.id) return now >= s.cultivating.endsAt ? 'ready' : 'growing';
  const i = SPECIMENS.indexOf(sp);
  const prevDone = i === 0 || s.specimens.includes(SPECIMENS[i - 1].id);
  if (prevDone) return 'available';
  const prevPrevDone = i === 1 || (i > 1 && s.specimens.includes(SPECIMENS[i - 2].id));
  return prevPrevDone ? 'mystery' : 'hidden';
}

export function startCultivation(s: GameState, id: string, now: number): boolean {
  const sp = SPECIMEN_BY_ID.get(id);
  if (!sp || s.cultivating || specimenStatus(s, sp, now) !== 'available' || s.nutrients < sp.cost) return false;
  s.nutrients -= sp.cost;
  s.cultivating = { id, startedAt: now, endsAt: now + sp.seconds * 1000 };
  return true;
}

export function harvest(s: GameState, now: number): string | null {
  const c = s.cultivating;
  if (!c || now < c.endsAt) return null;
  s.cultivating = null;
  if (!s.specimens.includes(c.id)) s.specimens.push(c.id);
  if (!s.discovered.includes(c.id)) s.discovered.push(c.id);
  return c.id;
}

// ---------------------------------------------------------------------------
// Sealing the jar (prestige)

export function sporesOnSeal(s: GameState): number {
  if (s.jarTotal < SPORE_REQUIREMENT) return 0;
  return Math.floor(Math.sqrt(s.jarTotal / SPORE_DIVISOR));
}

/**
 * Seal this jar: release spores and start the next jar. Producers, nutrients
 * and most upgrades reset. Spores, specimens, the journal and dormancy
 * upgrades carry over, and a specimen still growing keeps growing.
 */
export function sealJar(s: GameState, newSeed: number): number {
  const gain = sporesOnSeal(s);
  if (gain <= 0) return 0;
  s.spores += gain;
  s.jarIndex += 1;
  s.nutrients = 0;
  s.jarTotal = 0;
  s.producers = {};
  s.upgrades = s.upgrades.filter((id) => UPGRADE_BY_ID.get(id)?.keep);
  s.frenzyUntil = 0;
  s.seed = newSeed;
  return gain;
}

export function startFrenzy(s: GameState, now: number): void {
  s.frenzyUntil = now + FRENZY_SECONDS * 1000;
}
