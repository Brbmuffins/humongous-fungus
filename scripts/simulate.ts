// Pacing simulator: a greedy player buys whatever pays for itself fastest.
// The player opens the game every `gap` minutes for `session` minutes,
// tapping `taps` times a second while it is open.
// Usage: npm run sim -- [taps=3] [hours=24] [gap=60] [session=3]
import { PRODUCERS, PRODUCER_BY_ID, SPECIMENS, SPORE_REQUIREMENT } from '../src/game/defs';
import {
  availableUpgrades,
  baseRate,
  buyProducer,
  buyUpgrade,
  costOf,
  harvest,
  owned,
  producerVisibility,
  startCultivation,
  step,
  tapValue,
  earn,
} from '../src/game/economy';
import { fmt, fmtDuration } from '../src/game/format';
import { newGame, type GameState } from '../src/game/state';

const taps = Number(process.argv[2] ?? 3);
const hours = Number(process.argv[3] ?? 24);
const gap = Number(process.argv[4] ?? 60);
const session = Number(process.argv[5] ?? 3);
const TICK = 5; // seconds between player decisions while the game is open

const s: GameState = newGame(0, 1);
let now = 0;
const marks = [...new Set([1e4, 1e6, 1e8, 1e9, SPORE_REQUIREMENT, 1e10, 1e11, 1e12])].sort((a, b) => a - b);
const hit = new Map<number, number>();
const firsts = new Map<string, number>();

function bestPurchase(): (() => boolean) | null {
  const rate = Math.max(baseRate(s), 0.1);
  let best: { payback: number; buy: () => boolean } | null = null;
  const vis = producerVisibility(s);
  PRODUCERS.forEach((p, i) => {
    if (vis[i] !== 'open') return;
    const cost = costOf(p, owned(s, p.id), 1);
    const before = baseRate(s);
    s.producers[p.id] = owned(s, p.id) + 1;
    const gain = baseRate(s) - before;
    s.producers[p.id] = owned(s, p.id) - 1;
    // Waiting time counts too, so prefer things affordable soon.
    const payback = cost / Math.max(gain, 1e-9) + Math.max(0, cost - s.nutrients) / rate;
    if (!best || payback < best.payback) best = { payback, buy: () => buyProducer(s, p.id, 1) };
  });
  for (const u of availableUpgrades(s)) {
    const before = baseRate(s);
    s.upgrades.push(u.id);
    const gain = baseRate(s) - before;
    s.upgrades.pop();
    if (gain <= 0) {
      // Tap and away upgrades: buy when cheap relative to income.
      if (u.cost < rate * 60) return () => buyUpgrade(s, u.id);
      continue;
    }
    const payback = u.cost / gain + Math.max(0, u.cost - s.nutrients) / rate;
    if (!best || payback < best.payback) best = { payback, buy: () => buyUpgrade(s, u.id) };
  }
  return best ? (best as { buy: () => boolean }).buy : null;
}

const isOpen = (t: number) => t / 1000 < 600 || (t / 1000) % (gap * 60) < session * 60;
while (now < hours * 3600 * 1000) {
  now += TICK * 1000;
  if (!isOpen(now)) continue;
  step(s, now);
  if (taps > 0) earn(s, tapValue(s, now) * taps * TICK);
  harvest(s, now);
  for (const sp of SPECIMENS) if (s.nutrients > sp.cost * 3) startCultivation(s, sp.id, now);
  for (let i = 0; i < 50; i++) {
    const buy = bestPurchase();
    if (!buy || !buy()) break;
  }
  for (const m of marks) if (!hit.has(m) && s.jarTotal >= m) hit.set(m, now / 1000);
  for (const p of PRODUCERS) if (!firsts.has(p.id) && owned(s, p.id) > 0) firsts.set(p.id, now / 1000);
  for (const id of s.specimens) if (!firsts.has(id)) firsts.set(id, now / 1000);
}

console.log(`Greedy player, ${taps} taps/s, opens every ${gap}m for ${session}m, ${hours}h`);
for (const m of marks) console.log(`  ${fmt(m).padStart(6)} digested at ${hit.has(m) ? fmtDuration(hit.get(m)!) : '—'}`);
console.log('First of each:');
for (const [id, t] of firsts) console.log(`  ${(PRODUCER_BY_ID as Record<string, { plural: string }>)[id]?.plural ?? id}: ${fmtDuration(t)}`);
console.log(`End: ${fmt(s.jarTotal)} digested, ${fmt(baseRate(s))}/s, upgrades ${s.upgrades.length}`);
console.log('Owned:', PRODUCERS.map((p) => `${p.id}=${owned(s, p.id)}`).join(' '));
