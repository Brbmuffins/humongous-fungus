// Last Muffin Standing balance sim: a bot that kites the swarm and grabs
// sprinkles plays whole nights, and this prints how each one went.
//   npx tsx scripts/lastmuffin-sim.ts [muffin] [nights] [pantry level for everything]
//   npx tsx scripts/lastmuffin-sim.ts blueberry 6 2
import { RUN_SECONDS, type MuffinId } from '../games/lastmuffin/src/defs';
import { Run, type Input, type Offer } from '../games/lastmuffin/src/run';

const muffin = (process.argv[2] ?? 'blueberry') as MuffinId;
const seeds = Number(process.argv[3] ?? 5);
const pl = Number(process.argv[4] ?? 0);
const pantry = pl ? { might: pl, health: pl, armor: Math.min(3, pl), speed: Math.min(3, pl), magnet: Math.min(3, pl), growth: pl, cooldown: Math.min(3, pl) } : {};

function bot(r: Run, t: number): Input {
  let ax = 0, ay = 0;
  let close = 1e9;
  for (const e of r.enemies) {
    const dx = r.x - e.x, dy = r.y - e.y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2);
    if (d < close) close = d - e.def.radius;
    if (d < 260) {
      const w = (e.def.boss ? 4 : 1) / Math.max(400, d2);
      ax += dx * w;
      ay += dy * w;
    }
  }
  // Circle around a bit so you don't just run in a line forever.
  const swirl = 0.6;
  let mx = ax - ay * swirl, my = ay + ax * swirl;
  const ml = Math.hypot(mx, my);
  if (ml > 1e-6) { mx /= ml; my /= ml; }
  // Go for sprinkles when nothing is close.
  if (close > 70) {
    let best = null as null | { x: number; y: number }, bd = 1e9;
    for (const p of r.pickups) {
      const d = Math.hypot(p.x - r.x, p.y - r.y);
      if (d < bd && d < 300) { bd = d; best = p; }
    }
    if (best) {
      const gx = (best.x - r.x) / bd, gy = (best.y - r.y) / bd;
      mx = mx * 0.4 + gx * 0.6; my = my * 0.4 + gy * 0.6;
    }
  }
  return { x: mx || Math.cos(t * 0.3), y: my || Math.sin(t * 0.3), hop: close < 16 };
}

function choose(r: Run): void {
  const score = (o: Offer) => {
    if (o.type === 'weapon') return r.weapons.some((w) => w.id === o.id) ? 10 + o.level : 8;
    if (o.type === 'passive') return (r.weapons.length >= 3 ? 9 : 5) + o.level;
    return 1;
  };
  let bi = 0;
  r.offers.forEach((o, i) => { if (score(o) > score(r.offers[bi])) bi = i; });
  r.choose(bi);
}

const results: string[] = [];
for (let seed = 1; seed <= seeds; seed++) {
  const r = new Run({ muffin, pantry, seed });
  const dt = 1 / 30;
  let t = 0;
  let nextLog = 60;
  const log: string[] = [];
  let maxEnemies = 0;
  while (r.state !== 'dead' && r.state !== 'won' && t < RUN_SECONDS + 5) {
    r.step(dt, bot(r, t));
    t += dt;
    maxEnemies = Math.max(maxEnemies, r.enemies.length);
    if (r.state === 'levelup') choose(r);
    if (r.state === 'chest') r.closeChest();
    if (r.t >= nextLog) {
      log.push(`${Math.round(r.t / 60)}m L${r.level} hp${Math.round(r.hp)}/${r.stats.maxHp} e${r.enemies.length} k${r.kills}`);
      nextLog += 60;
    }
  }
  const w = r.weapons.map((w) => `${w.id}${w.evolved ? '*' : w.level}:${Math.round(w.damage / 1000)}k`).join(' ');
  results.push(`seed ${seed}: ${r.state} at ${Math.round(r.t)}s L${r.level} kills ${r.kills} crumbs ${Math.floor(r.crumbs)} bosses ${r.bosses} max ${maxEnemies}\n   ${w}\n   ${r.passives.map((p) => p.id + p.level).join(' ')}\n   ${log.join(' | ')}`);
}
console.log(results.join('\n'));
