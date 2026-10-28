import { describe, expect, it } from 'vitest';
import { payOut, placeBet, RTP, noBets, refundBet, type ArcadeSeat } from '../../games/hammygotchi/src/arcade';
import {
  BOXES,
  OFFER_MAX,
  OFFER_SHARE,
  OFFER_WOBBLE,
  PRIZES,
  ROUNDS,
  DealRound,
  average,
  layBoxes,
  makeOffer,
  offerShare,
  type DealEvent,
  type DealLayout,
  type DealOutcome,
} from '../../games/hammygotchi/src/deal';
import { Wallet } from '../../games/hammys-arcade/src/wallet';

/** A repeatable stand-in for the browser's random numbers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** A layout with the prizes in order and the same wobble everywhere. */
const ordered = (wobble = 0): DealLayout => ({ prizes: [...PRIZES], wobble: ROUNDS.map(() => wobble) });

/** Play a whole round with `decide` choosing: open boxes in ascending order of index. */
type Decide = (r: DealRound) => { deal: boolean; swap: boolean };
function play(layout: DealLayout, mine: number, decide: Decide): DealOutcome {
  const r = new DealRound(layout);
  r.pick(mine);
  while (r.phase !== 'done') {
    if (r.phase === 'open') r.open(r.openable[0]);
    else if (r.phase === 'call') {
      if (decide(r).deal) r.answer(true);
      else r.answer(false);
    } else if (r.phase === 'swap') r.swap(decide(r).swap);
  }
  return r.outcome as DealOutcome;
}

describe('the prizes', () => {
  it('average exactly 0.99 of the bet, and there is one for every box', () => {
    expect(PRIZES.length).toBe(BOXES);
    // Whole cents, so the sum is exact.
    const cents = PRIZES.reduce((a, b) => a + Math.round(b * 100), 0);
    expect(cents).toBe(Math.round(RTP * BOXES * 100));
    expect(average(PRIZES)).toBeCloseTo(RTP, 12);
    expect(new Set(PRIZES).size).toBe(PRIZES.length);
    for (const p of PRIZES) expect(Math.round(p * 100) / 100).toBe(p);
  });

  it('are sorted from tiny to big', () => {
    expect([...PRIZES].sort((a, b) => a - b)).toEqual([...PRIZES]);
    expect(PRIZES[0]).toBe(0.01);
  });

  it('are shuffled under the boxes, all of them, every time', () => {
    const roll = seeded(7);
    let moved = false;
    for (let n = 0; n < 50; n++) {
      const l = layBoxes(roll);
      expect([...l.prizes].sort((a, b) => a - b)).toEqual([...PRIZES]);
      expect(l.wobble.length).toBe(ROUNDS.length);
      for (const w of l.wobble) expect(w >= -1 && w < 1).toBe(true);
      if (l.prizes.some((p, i) => p !== PRIZES[i])) moved = true;
    }
    expect(moved).toBe(true);
  });

  it('put each prize under each box about equally often', () => {
    // Exact mean of a random box over many layouts is the mean of the prizes.
    const roll = seeded(11);
    const n = 20000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += layBoxes(roll).prizes[3];
    expect(Math.abs(sum / n - RTP)).toBeLessThan(0.05);
  });
});

describe('the rounds', () => {
  it('leave exactly two boxes after the last one', () => {
    expect(ROUNDS.reduce((a, b) => a + b, 0)).toBe(BOXES - 2);
    expect(ROUNDS[ROUNDS.length - 1]).toBe(1);
  });

  it('go pick, open round by round with a call after each, then the swap', () => {
    const r = new DealRound(ordered());
    expect(r.phase).toBe('pick');
    expect(r.open(0)).toEqual([]);
    expect(r.pick(4).map((e) => e.type)).toEqual(['picked']);
    expect(r.phase).toBe('open');
    const sizes: number[] = [];
    for (let round = 0; round < ROUNDS.length; round++) {
      expect(r.round).toBe(round);
      expect(r.toOpen).toBe(ROUNDS[round]);
      let opened = 0;
      while (r.phase === 'open') {
        // Your own box, and boxes already open, don't open.
        expect(r.open(4)).toEqual([]);
        r.open(r.openable[0]);
        opened += 1;
      }
      sizes.push(opened);
      expect(r.phase as string).toBe('call');
      expect(r.offer).not.toBeNull();
      // No opening while the phone is ringing.
      expect(r.open(r.inPlay.length ? 19 : 0)).toEqual([]);
      r.answer(false);
    }
    expect(sizes).toEqual([...ROUNDS]);
    expect(r.phase).toBe('swap');
    expect(r.inPlay.length).toBe(2);
    expect(r.lastBox).not.toBeNull();
    r.swap(false);
    expect(r.phase).toBe('done');
    expect(r.outcome?.how).toBe('keep');
  });

  it('write every move out as events a spectator can follow', () => {
    const r = new DealRound(ordered());
    r.pick(19);
    const seen: DealEvent[] = [];
    let steps = 0;
    while (r.phase !== 'done' && steps++ < 100) {
      if (r.phase === 'open') seen.push(...r.open(r.openable[0]));
      else if (r.phase === 'call') seen.push(...r.answer(false));
      else seen.push(...r.swap(true));
    }
    expect(r.events.slice(1)).toEqual(seen);
    const types = r.events.map((e) => e.type);
    expect(types[0]).toBe('picked');
    expect(types.filter((t) => t === 'opened').length).toBe(BOXES - 2);
    expect(types.filter((t) => t === 'offer').length).toBe(ROUNDS.length);
    expect(types.filter((t) => t === 'declined').length).toBe(ROUNDS.length);
    expect(types.slice(-2)).toEqual(['final', 'reveal']);
    // An opened event carries the prize; an offer carries the number and what was in play.
    const opened = r.events.find((e) => e.type === 'opened');
    expect(opened && opened.type === 'opened' && PRIZES.includes(opened.prize)).toBe(true);
    const offer = r.events.find((e) => e.type === 'offer');
    expect(offer && offer.type === 'offer' && offer.boxesLeft).toBe(BOXES - ROUNDS[0]);
  });

  it('end on a deal: the offer is the payout and your box is revealed', () => {
    const l = ordered();
    const r = new DealRound(l);
    r.pick(19); // the 8× box
    for (const b of r.openable.slice(0, ROUNDS[0])) r.open(b);
    const offer = r.offer as number;
    const ev = r.average;
    const out = r.answer(true);
    expect(out.map((e) => e.type)).toEqual(['dealt', 'reveal']);
    expect(r.phase).toBe('done');
    expect(r.outcome).toEqual({ how: 'deal', mult: offer, box: 19, boxPrize: 8, otherPrize: null });
    expect(offer).toBeLessThanOrEqual(ev);
    // Nothing more to do once it's over.
    expect(r.answer(true)).toEqual([]);
    expect(r.open(0)).toEqual([]);
    expect(r.swap(true)).toEqual([]);
    // Everything is face up for the reveal.
    expect(r.prizeAt(0)).toBe(PRIZES[0]);
  });

  it('keep the prizes secret until a box is opened', () => {
    const r = new DealRound(ordered());
    r.pick(5);
    expect(r.prizeAt(5)).toBeNull();
    expect(r.prizeAt(6)).toBeNull();
    r.open(6);
    expect(r.prizeAt(6)).toBe(PRIZES[6]);
    expect(r.inPlay).not.toContain(PRIZES[6]);
    expect(r.inPlay).toContain(PRIZES[5]);
  });

  it('swap at the end: you get the last unopened box, and know what you gave up', () => {
    const l = ordered();
    const pickMine = 0; // the 0.01 box
    const keep = play(l, pickMine, () => ({ deal: false, swap: false }));
    expect(keep).toEqual({ how: 'keep', mult: PRIZES[0], box: 0, boxPrize: PRIZES[0], otherPrize: PRIZES[19] });
    const swap = play(l, pickMine, () => ({ deal: false, swap: true }));
    // Boxes are opened in ascending order, so box 19 is the one that is left.
    expect(swap.how).toBe('swap');
    expect(swap.box).toBe(19);
    expect(swap.mult).toBe(8);
    expect(swap.otherPrize).toBe(PRIZES[0]);
  });
});

describe('leaving mid-round settles the way it was going', () => {
  it('before you pick a box, the bet comes back', () => {
    const r = new DealRound(ordered());
    expect(r.leave()).toEqual({ how: 'refund', mult: 1, box: null, boxPrize: null, otherPrize: null });
    expect(r.phase).toBe('done');
  });

  it('with the phone ringing, you take the offer on the table', () => {
    const r = new DealRound(ordered());
    r.pick(10);
    for (let i = 0; i < ROUNDS[0]; i++) r.open(r.openable[0]);
    const offer = r.offer as number;
    const out = r.leave();
    expect(out.how).toBe('left-offer');
    expect(out.mult).toBe(offer);
    expect(out.boxPrize).toBe(PRIZES[10]);
  });

  it('with no offer out, you keep your box and get its prize', () => {
    const r = new DealRound(ordered());
    r.pick(18);
    r.open(0);
    const out = r.leave();
    expect(out).toEqual({ how: 'left-box', mult: PRIZES[18], box: 18, boxPrize: PRIZES[18], otherPrize: null });
    // And again at the swap.
    const s = new DealRound(ordered());
    s.pick(3);
    while (s.phase !== 'swap') {
      if (s.phase === 'open') s.open(s.openable[0]);
      else s.answer(false);
    }
    expect(s.leave().how).toBe('left-box');
    // Leaving twice settles once.
    expect(s.leave()).toBe(s.outcome);
  });

  it('can not do better than the average of what was in play, whenever you leave', () => {
    // Exact: for any layout and any set of boxes already open, your box is equally likely
    // to have been any of the others, so what leaving pays (its prize) averages out to the
    // average of the prizes still in play. An offer on the table is below that.
    const roll = seeded(5);
    let checked = 0;
    for (let g = 0; g < 30; g++) {
      const layout = layBoxes(roll);
      const order = layout.prizes.map((_, i) => i).sort(() => roll() - 0.5);
      for (let k = 0; k <= BOXES - 2; k += 1) {
        // k boxes opened (in rounds: the opening stops wherever the rounds put it).
        const shutAfter = order.slice(k);
        const pays: number[] = [];
        let average = 0;
        let offers = false;
        for (const mine of shutAfter) {
          const r = new DealRound(layout);
          r.pick(mine);
          let opened = 0;
          for (const b of order.slice(0, k)) {
            if (r.phase !== 'open') break;
            r.open(b);
            opened += 1;
          }
          if (opened < k) break; // a call interrupted: covered below
          average = r.average;
          const out = r.leave();
          offers = out.how === 'left-offer';
          pays.push(out.mult);
        }
        if (pays.length !== shutAfter.length) continue;
        const mean = pays.reduce((a, b) => a + b, 0) / pays.length;
        // With the phone ringing you take the offer: below the average. Otherwise your box: exactly the average.
        if (offers) expect(mean).toBeLessThanOrEqual(average);
        else expect(mean).toBeCloseTo(average, 9);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe('Dr. Moss’s offers', () => {
  it('are a share of the prizes in play that starts low and rises toward fair', () => {
    expect(OFFER_SHARE.length).toBe(ROUNDS.length);
    expect(OFFER_WOBBLE.length).toBe(ROUNDS.length);
    expect(OFFER_SHARE[0]).toBeGreaterThanOrEqual(0.3);
    expect(OFFER_SHARE[0]).toBeLessThanOrEqual(0.5);
    expect(OFFER_SHARE[OFFER_SHARE.length - 1]).toBeGreaterThanOrEqual(0.9);
    for (let i = 1; i < OFFER_SHARE.length; i++) expect(OFFER_SHARE[i]).toBeGreaterThan(OFFER_SHARE[i - 1]);
    for (let r = 0; r < ROUNDS.length; r++) {
      expect(OFFER_SHARE[r] + OFFER_WOBBLE[r]).toBeLessThanOrEqual(OFFER_MAX);
      for (const w of [-1, -0.3, 0, 0.7, 0.9999, 1, 5, Number.NaN]) {
        const s = offerShare(r, w);
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThanOrEqual(OFFER_MAX);
      }
    }
    expect(OFFER_MAX).toBeLessThan(1);
  });

  it('are never above what’s in play, in any state, with any wobble', () => {
    // Every round of a random game, at the worst wobble and at random ones.
    const roll = seeded(99);
    let checked = 0;
    for (let g = 0; g < 400; g++) {
      const layout = layBoxes(roll);
      const worst: DealLayout = { prizes: layout.prizes, wobble: ROUNDS.map(() => 1) };
      for (const l of [layout, worst]) {
        const r = new DealRound(l);
        r.pick(Math.floor(roll() * BOXES));
        while (r.phase === 'open') {
          const shut = r.openable;
          r.open(shut[Math.floor(roll() * shut.length)]);
          if ((r.phase as string) === 'call') {
            const offer = r.offer as number;
            expect(offer).toBeLessThanOrEqual(r.average + 1e-12);
            expect(offer).toBeGreaterThan(0);
            // Two decimals, like every multiplier.
            expect(Math.round(offer * 100) / 100).toBeCloseTo(offer, 9);
            checked += 1;
            r.answer(false);
          }
        }
      }
    }
    expect(checked).toBe(400 * 2 * ROUNDS.length);
  });

  it('never beat the average of the prizes in play, even for tiny or odd boards', () => {
    for (const board of [[0.01], [8, 0.01], [0.01, 0.05, 0.1], [...PRIZES]]) {
      for (let r = 0; r < ROUNDS.length; r++) for (const w of [-1, 0, 1]) expect(makeOffer(board, r, w)).toBeLessThanOrEqual(average(board));
    }
    expect(makeOffer([], 0, 0)).toBe(0);
  });

  it('wobble, but not much, and never out of order on average', () => {
    const base = makeOffer(PRIZES, 0, 0);
    expect(makeOffer(PRIZES, 0, 1)).toBeGreaterThan(base);
    expect(makeOffer(PRIZES, 0, -1)).toBeLessThan(base);
    // Round 1 on the whole board, no wobble: a third of 0.99.
    expect(base).toBeCloseTo(0.33, 2);
  });
});

/** The strategies the simulation tries. */
interface Strategy {
  name: string;
  decide: Decide;
}
const strategies: Strategy[] = [
  { name: 'always deal on the first call', decide: () => ({ deal: true, swap: false }) },
  { name: 'never deal, keep', decide: () => ({ deal: false, swap: false }) },
  { name: 'never deal, swap', decide: () => ({ deal: false, swap: true }) },
  { name: 'deal at the first offer of 80% or more', decide: (r) => ({ deal: (r.offer as number) >= 0.8 * r.average, swap: false }) },
  { name: 'deal at the first offer of 90% or more', decide: (r) => ({ deal: (r.offer as number) >= 0.9 * r.average, swap: true }) },
  { name: 'deal when the offer beats the average of the box prizes still up (greedy)', decide: (r) => ({ deal: (r.offer as number) >= 0.95 * r.average, swap: false }) },
  { name: 'deal on the call before the end', decide: (r) => ({ deal: r.round === ROUNDS.length - 2, swap: false }) },
  { name: 'deal only when the big ones are gone', decide: (r) => ({ deal: (r.offer as number) > 0.5 && !r.inPlay.some((p) => p >= 2), swap: true }) },
];

describe('payback by strategy (seeded simulation)', () => {
  const N = 25000;
  const result = new Map<string, number>();
  for (const s of strategies) {
    it(`${s.name}: never above 0.99`, () => {
      const roll = seeded(1234);
      let total = 0;
      for (let g = 0; g < N; g++) {
        const layout = layBoxes(roll);
        total += play(layout, Math.floor(roll() * BOXES), s.decide).mult;
      }
      const rtp = total / N;
      result.set(s.name, rtp);
      // Sampling error for a game this swingy is about 0.01 at 40,000 rounds; the true value is at most 0.99.
      expect(rtp).toBeLessThan(RTP + 0.04);
    });
  }

  it('never dealing pays 0.99 exactly in the long run, swapping or keeping', () => {
    // Exactly: your box is a uniform draw from the prizes, and so is the last one.
    let keep = 0;
    let swap = 0;
    let count = 0;
    const roll = seeded(42);
    for (let g = 0; g < 20000; g++) {
      const layout = layBoxes(roll);
      const mine = Math.floor(roll() * BOXES);
      const k = play(layout, mine, () => ({ deal: false, swap: false }));
      const s = play(layout, mine, () => ({ deal: false, swap: true }));
      keep += k.mult;
      swap += s.mult;
      count += 1;
      // Same layout, same opening order: the two boxes swap prizes.
      expect(s.mult).toBe(k.otherPrize);
      expect(s.otherPrize).toBe(k.mult);
    }
    expect(Math.abs(keep / count - RTP)).toBeLessThan(0.05);
    expect(Math.abs(swap / count - RTP)).toBeLessThan(0.05);
  });

  it('sensible play (waiting for a fair offer, or never dealing) pays back close to 99', () => {
    const roll = seeded(2024);
    const run = (decide: Decide) => {
      let total = 0;
      const n = 25000;
      for (let g = 0; g < n; g++) total += play(layBoxes(roll), Math.floor(roll() * BOXES), decide).mult;
      return total / n;
    };
    const patient = run((r) => ({ deal: (r.offer as number) >= 0.95 * r.average, swap: true }));
    const never = run(() => ({ deal: false, swap: true }));
    expect(patient).toBeGreaterThan(0.93);
    expect(patient).toBeLessThan(RTP + 0.04);
    expect(never).toBeGreaterThan(0.94);
    expect(never).toBeLessThan(RTP + 0.04);
    // Dealing at the very first call is the way to lose money.
    const eager = run(() => ({ deal: true, swap: false }));
    expect(eager).toBeLessThan(0.5);
  });

  it('keeps the eager dealer under the first round’s best share', () => {
    // E[payout] = E[share × average of the unopened] ≤ share × 0.99: enumerate the offer's share exactly.
    const roll = seeded(3);
    let total = 0;
    const n = 20000;
    for (let g = 0; g < n; g++) total += play(layBoxes(roll), 0, () => ({ deal: true, swap: false })).mult;
    const maxShare = OFFER_SHARE[0] + OFFER_WOBBLE[0];
    expect(total / n).toBeLessThan(maxShare * RTP + 0.02);
  });
});

describe('the wallet', () => {
  const seat = (): ArcadeSeat => ({ coins: 1000, fit: 'classic', fresh: 100, diedAt: null, stats: { arcade: noBets() } });

  it('takes the bet up front and pays the prize on the multiplier', () => {
    const s = seat();
    expect(placeBet(s, 'deal', 100)).toBe(true);
    expect(s.coins).toBe(900);
    // A 2.25× box.
    expect(payOut(s, 'deal', 100, 2.25)).toBe(225);
    expect(s.coins).toBe(1125);
    expect(s.stats.arcade.deal).toEqual({ rounds: 1, net: 125, best: 2.25 });
  });

  it('pays a small prize less than the bet, rounded down, and a tiny one nothing', () => {
    const s = seat();
    placeBet(s, 'deal', 10);
    expect(payOut(s, 'deal', 10, 0.45)).toBe(4);
    placeBet(s, 'deal', 10);
    expect(payOut(s, 'deal', 10, 0.01)).toBe(0);
    expect(s.stats.arcade.deal.rounds).toBe(2);
    expect(s.stats.arcade.deal.net).toBe(-6 - 10);
  });

  it('settles a round left before a box was picked as a refund', () => {
    const s = seat();
    placeBet(s, 'deal', 40);
    const out = new DealRound(layBoxes(seeded(1))).leave();
    expect(out.how).toBe('refund');
    refundBet(s, 'deal', 40);
    expect(s.coins).toBe(1000);
    expect(s.stats.arcade.deal).toEqual({ rounds: 0, net: 0, best: 0 });
  });

  it('goes through the arcade’s wallet and its saved stats', () => {
    const store = { load: () => null as string | null, save: (_: string) => {} };
    const w = new Wallet(store as never, 'cube');
    expect(w.state.stats.arcade.deal).toEqual({ rounds: 0, net: 0, best: 0 });
    expect(w.bet('deal', 100)).toBe(true);
    const out = play({ prizes: [...PRIZES], wobble: ROUNDS.map(() => 0) }, 19, () => ({ deal: false, swap: false }));
    expect(out.mult).toBe(8);
    expect(w.payOut('deal', 100, out.mult)).toBe(800);
    expect(w.coins).toBe(1700);
    expect(w.toSave().arcade.deal).toEqual({ rounds: 1, net: 700, best: 8 });
  });
});
