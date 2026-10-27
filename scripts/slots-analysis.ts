// Hammy Slots: the exact payback, hit rate and biggest wins, by walking every
// combination of stops. Run once after changing the reels, the pay table or
// the orb:  nice -n 10 npx tsx scripts/slots-analysis.ts
import { analyse } from '../games/hammygotchi/src/slotsmath';

const t0 = Date.now();
const a = analyse();
console.log(JSON.stringify(a, null, 2));
console.log(`${a.combos.toLocaleString()} combinations in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`RTP ${(a.rtp * 100).toFixed(3)}%  (lines only ${(a.rtpLines * 100).toFixed(2)}%, orb spins ${(a.rtpOrb * 100).toFixed(2)}%)`);
console.log(`hit ${(a.hit * 100).toFixed(2)}%  line hit ${(a.lineHit * 100).toFixed(2)}%  orb ${(a.orb * 100).toFixed(2)}%  >=1x ${(a.hitBet * 100).toFixed(2)}%`);
