// Sugar Crash balance check: deal a lot of rounds and see what each auto
// cash-out target pays back, how often rounds bust on the pad, and how long a
// round lasts. Usage: npm run sim:sugarcrash -- [rounds]
import { mulberry32 } from '../shared/rng';
import { BET_SECONDS, PAUSE_SECONDS } from '../games/sugarcrash/src/defs';
import { crashFromUniform, timeFor } from '../games/sugarcrash/src/fair';
import { payoutFor } from '../games/sugarcrash/src/game';

const n = Number(process.argv[2] ?? 1_000_000);
const roll = mulberry32(2026);
const crashes = Array.from({ length: n }, () => crashFromUniform(roll()));

const bet = 100;
console.log(`${n.toLocaleString()} rounds`);
console.log(`bust at 1.00×: ${((crashes.filter((c) => c === 1).length / n) * 100).toFixed(2)}%`);
const sorted = [...crashes].sort((a, b) => a - b);
for (const q of [0.5, 0.9, 0.99, 0.999]) {
  console.log(`p${q * 100}: ${sorted[Math.floor(q * n)].toFixed(2)}×`);
}
console.log(`highest: ${sorted[n - 1].toFixed(2)}×`);
const seconds = crashes.reduce((s, c) => s + timeFor(c), 0) / n + BET_SECONDS + PAUSE_SECONDS;
console.log(`average round: ${seconds.toFixed(1)} s (flight ${(seconds - BET_SECONDS - PAUSE_SECONDS).toFixed(1)} s)`);
console.log('\ntarget   wins    return');
for (const target of [1.1, 1.5, 2, 3, 5, 10, 25, 100]) {
  let back = 0;
  let wins = 0;
  for (const c of crashes) {
    if (c >= target) {
      back += payoutFor(bet, target);
      wins++;
    }
  }
  console.log(`${target.toFixed(2).padStart(6)}×  ${((wins / n) * 100).toFixed(1).padStart(5)}%  ${((back / (bet * n)) * 100).toFixed(2)}%`);
}
