import { describe, expect, it } from 'vitest';
import {
  AWAY_THRESHOLD_SECONDS,
  BASE_AWAY_HOURS,
  FRENZY_MULT,
  PRODUCER_BY_ID,
  SPECIMENS,
  SPORE_REQUIREMENT,
} from '../src/game/defs';
import {
  availableUpgrades,
  awayCapSeconds,
  baseRate,
  buyProducer,
  buyUpgrade,
  costOf,
  harvest,
  maxBuyable,
  producerVisibility,
  sealJar,
  specimenStatus,
  sporesOnSeal,
  startCultivation,
  startFrenzy,
  step,
  tapValue,
  totalRate,
  unitRate,
} from '../src/game/economy';
import { newGame } from '../src/game/state';

const T0 = 1_700_000_000_000;
const game = () => newGame(T0, 7);

describe('costs', () => {
  const hyphae = PRODUCER_BY_ID.hyphae;
  it('grows 15% per purchase', () => {
    expect(costOf(hyphae, 0)).toBe(15);
    expect(costOf(hyphae, 1)).toBe(Math.ceil(15 * 1.15));
  });
  it('prices a bulk buy as the sum of single buys (within rounding)', () => {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += 15 * 1.15 ** (20 + i);
    expect(costOf(hyphae, 20, 10)).toBe(Math.ceil(sum));
  });
  it('finds the most you can afford', () => {
    const budget = 10_000;
    const n = maxBuyable(hyphae, 5, budget);
    expect(costOf(hyphae, 5, n)).toBeLessThanOrEqual(budget);
    expect(costOf(hyphae, 5, n + 1)).toBeGreaterThan(budget);
    expect(maxBuyable(hyphae, 0, 14)).toBe(0);
  });
});

describe('buying and production', () => {
  it('spends nutrients and adds production', () => {
    const s = game();
    s.nutrients = 100;
    expect(buyProducer(s, 'hyphae', 1)).toBe(true);
    expect(s.nutrients).toBe(85);
    expect(baseRate(s)).toBeCloseTo(0.1);
    expect(s.discovered).toContain('hyphae');
  });
  it('refuses purchases you cannot afford', () => {
    const s = game();
    s.nutrients = 10;
    expect(buyProducer(s, 'hyphae', 1)).toBe(false);
    expect(s.nutrients).toBe(10);
  });
  it('doubles a producer at each milestone', () => {
    const s = game();
    s.producers.hyphae = 24;
    const before = unitRate(s, 'hyphae');
    s.producers.hyphae = 25;
    expect(unitRate(s, 'hyphae')).toBeCloseTo(before * 2);
  });
  it('applies upgrades only once unlocked', () => {
    const s = game();
    s.nutrients = 1e6;
    expect(buyUpgrade(s, 'hyphae-1')).toBe(false);
    s.producers.hyphae = 1;
    expect(availableUpgrades(s).map((u) => u.id)).toContain('hyphae-1');
    expect(buyUpgrade(s, 'hyphae-1')).toBe(true);
    expect(unitRate(s, 'hyphae')).toBeCloseTo(0.2);
  });
  it('reveals one producer ahead and one silhouette', () => {
    const s = game();
    expect(producerVisibility(s).slice(0, 3)).toEqual(['open', 'mystery', 'hidden']);
    s.producers.hyphae = 1;
    expect(producerVisibility(s).slice(0, 3)).toEqual(['open', 'open', 'mystery']);
  });
  it('taps scale with upgrades and the per-second rate', () => {
    const s = game();
    expect(tapValue(s, T0)).toBe(1);
    s.upgrades.push('enzymes', 'exoenzymes');
    s.producers.bonnet = 10; // 10/s
    expect(tapValue(s, T0)).toBeCloseTo(2 + 0.02 * 10);
  });
  it('frenzy multiplies the live rate', () => {
    const s = game();
    s.producers.bonnet = 10;
    startFrenzy(s, T0);
    expect(totalRate(s, T0 + 1000)).toBeCloseTo(10 * FRENZY_MULT);
    expect(totalRate(s, T0 + 31_000)).toBeCloseTo(10);
  });
});

describe('time', () => {
  it('earns at the live rate during play', () => {
    const s = game();
    s.producers.bonnet = 10;
    expect(step(s, T0 + 1000)).toBeNull();
    expect(s.nutrients).toBeCloseTo(10);
  });
  it('treats long gaps as time away, capped', () => {
    const s = game();
    s.producers.bonnet = 10;
    const away = (BASE_AWAY_HOURS + 3) * 3600;
    const r = step(s, T0 + away * 1000)!;
    expect(r).not.toBeNull();
    expect(r.capped).toBe(true);
    expect(r.credited).toBe(BASE_AWAY_HOURS * 3600);
    expect(s.nutrients).toBeCloseTo(10 * BASE_AWAY_HOURS * 3600);
  });
  it('does not pay frenzy rates while away', () => {
    const s = game();
    s.producers.bonnet = 10;
    startFrenzy(s, T0);
    step(s, T0 + 60_000);
    expect(s.nutrients).toBeCloseTo(600);
  });
  it('ignores a clock that moved backwards', () => {
    const s = game();
    s.producers.bonnet = 10;
    expect(step(s, T0 - 3600_000)).toBeNull();
    expect(s.nutrients).toBe(0);
    expect(s.updatedAt).toBe(T0 - 3600_000);
  });
  it('dormancy and specimens extend the away limit', () => {
    const s = game();
    s.upgrades.push('dormancy-1');
    s.specimens.push('ghostpipe');
    expect(awayCapSeconds(s)).toBe((BASE_AWAY_HOURS + 2 + 8) * 3600);
  });
  it('the away threshold is a few seconds', () => {
    expect(AWAY_THRESHOLD_SECONDS).toBeLessThanOrEqual(10);
  });
});

describe('cultivation', () => {
  it('grows in real time, then harvests for good', () => {
    const s = game();
    const glowcap = SPECIMENS[0];
    s.nutrients = glowcap.cost;
    expect(startCultivation(s, glowcap.id, T0)).toBe(true);
    expect(s.nutrients).toBe(0);
    expect(harvest(s, T0 + 1000)).toBeNull();
    expect(specimenStatus(s, glowcap, T0 + glowcap.seconds * 1000)).toBe('ready');
    expect(harvest(s, T0 + glowcap.seconds * 1000)).toBe('glowcap');
    expect(s.specimens).toEqual(['glowcap']);
    expect(s.cultivating).toBeNull();
  });
  it('reports a specimen that finished while away', () => {
    const s = game();
    s.nutrients = 1e6;
    startCultivation(s, 'glowcap', T0);
    const r = step(s, T0 + 3600_000)!;
    expect(r.specimenReady).toBe('glowcap');
  });
  it('unlocks specimens in order, one bed at a time', () => {
    const s = game();
    s.nutrients = 1e15;
    expect(startCultivation(s, 'sundew', T0)).toBe(false);
    expect(startCultivation(s, 'glowcap', T0)).toBe(true);
    expect(startCultivation(s, 'glowcap', T0)).toBe(false);
  });
});

describe('sealing the jar', () => {
  it('needs a full jar', () => {
    const s = game();
    s.jarTotal = SPORE_REQUIREMENT - 1;
    expect(sporesOnSeal(s)).toBe(0);
    expect(sealJar(s, 1)).toBe(0);
  });
  it('resets the jar but keeps spores, specimens and dormancy', () => {
    const s = game();
    s.jarTotal = SPORE_REQUIREMENT;
    s.lifetime = SPORE_REQUIREMENT;
    s.nutrients = 5e9;
    s.producers = { hyphae: 50, frog: 3 };
    s.upgrades = ['hyphae-1', 'dormancy-1'];
    s.specimens = ['glowcap'];
    const gain = sealJar(s, 99);
    expect(gain).toBe(10);
    expect(s.spores).toBe(10);
    expect(s.jarIndex).toBe(1);
    expect(s.nutrients).toBe(0);
    expect(s.jarTotal).toBe(0);
    expect(s.lifetime).toBe(SPORE_REQUIREMENT);
    expect(s.producers).toEqual({});
    expect(s.upgrades).toEqual(['dormancy-1']);
    expect(s.specimens).toEqual(['glowcap']);
    expect(s.seed).toBe(99);
  });
  it('each spore adds 10% production', () => {
    const s = game();
    s.producers.bonnet = 10;
    s.spores = 10;
    expect(baseRate(s)).toBeCloseTo(20);
  });
});
