// Hammy's Pizza Boxes: he hides coin prizes under twenty of his pizza boxes.
// You keep ONE box, open the rest a few at a time, and after every round
// Dr. Moss rings with an offer for the box you're holding: Deal (take it, the
// round is over, and then you find out what was in your box) or Keep going. At
// the end you can swap your box for the last one still shut.
//
// These are the rules and nothing else: no screen, no DOM, no clock. The only
// luck is `layBoxes(roll)`, which is handed its random source, so a server can
// run exactly this later and the screen (dealview.ts) is just one more client.
// The whole layout (which prize is under which box, and the wobble in Dr.
// Moss's offers) is decided when the bet goes down, so nothing you do changes
// what is where; every move is also written out as a plain list of events
// (`DealEvent`) for whoever wants to watch.
//
// Payback. The twenty prizes are multiples of your bet that average exactly
// 0.99 (RTP), so a box picked at random is worth 0.99 of the bet. Every offer
// is a share of the prizes still in play (the average of the unopened boxes,
// yours included), never above it, so by the usual stopping argument no way
// of playing (deal early, deal late, never deal, swap, keep) can beat 0.99 in
// the long run. Only the share changes: it starts low and creeps toward 98%.
// The test file simulates the strategies and checks the sums.
import { floor2 } from './arcade';

type Roll = () => number;

/** Boxes on the floor. */
export const BOXES = 20;
/** How many boxes you open in each round, in order. After the last one, two are left: yours and one more. */
export const ROUNDS: readonly number[] = [5, 4, 3, 2, 1, 1, 1, 1];

/**
 * What's under the boxes, as multiples of the bet, smallest first. They sum to
 * `BOXES × RTP` (19.8, RTP being 0.99 in arcade.ts), which is also why none can be much bigger than 8×: the
 * average has to come out at 0.99.
 */
export const PRIZES: readonly number[] = [0.01, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.75, 0.9, 0.99, 1.1, 1.2, 1.25, 2.25, 8];
/** A prize this big makes him gasp. */
export const BIG_PRIZE = 2;

/**
 * What share of the prizes in play Dr. Moss offers after each round: stingy at
 * first, close to fair at the end. `OFFER_WOBBLE` is how far (up or down) the
 * layout's seeded wobble may push each round's share, so the offers feel like
 * a person's. No share is ever above `OFFER_MAX`, so no offer is ever above
 * the value of what's left.
 */
export const OFFER_SHARE: readonly number[] = [0.34, 0.44, 0.54, 0.64, 0.74, 0.84, 0.92, 0.96];
export const OFFER_WOBBLE: readonly number[] = [0.07, 0.08, 0.09, 0.09, 0.08, 0.06, 0.04, 0.02];
export const OFFER_MAX = 0.98;

/** What a box is worth to you before you know: the average of the prizes still in play. */
export const average = (prizes: readonly number[]): number => (prizes.length ? prizes.reduce((a, b) => a + b, 0) / prizes.length : 0);

/** The share of the prizes in play offered after round `round` (0-based), with the layout's wobble for it in [-1, 1). */
export function offerShare(round: number, wobble: number): number {
  const r = Math.min(ROUNDS.length - 1, Math.max(0, Math.floor(round)));
  const w = Math.min(1, Math.max(-1, Number.isFinite(wobble) ? wobble : 0));
  return Math.min(OFFER_MAX, Math.max(0.05, OFFER_SHARE[r] + w * OFFER_WOBBLE[r]));
}

/** Dr. Moss's offer, as a multiple of the bet: a share of the average of `inPlay`, to two decimals, rounded down so it can't come out above it. */
export function makeOffer(inPlay: readonly number[], round: number, wobble: number): number {
  const ev = average(inPlay);
  return Math.min(ev, floor2(ev * offerShare(round, wobble)));
}

/** Everything the bet decides up front: which prize is under which box, and the wobble in each round's offer. */
export interface DealLayout {
  /** The prize (a multiple of the bet) under each box. */
  prizes: number[];
  /** One number in [-1, 1) per round, scaling how far the offer strays from its usual share. */
  wobble: number[];
}

/** Shuffle the prizes under the boxes and draw the wobble, from `roll` (a uniform number in [0, 1)). */
export function layBoxes(roll: Roll = Math.random): DealLayout {
  const prizes = [...PRIZES];
  for (let i = prizes.length - 1; i > 0; i--) {
    const j = Math.floor(roll() * (i + 1));
    [prizes[i], prizes[j]] = [prizes[j], prizes[i]];
  }
  return { prizes, wobble: ROUNDS.map(() => roll() * 2 - 1) };
}

// A round of it ---------------------------------------------------------------

export type DealPhase = 'pick' | 'open' | 'call' | 'swap' | 'done';

/** How it ended. */
export interface DealOutcome {
  /**
   * deal: took Dr. Moss's offer; keep / swap: played it out and kept your box
   * or took the last one; left-offer / left-box: walked away with an offer on
   * the table / without one (see `leave`); refund: walked away before picking a
   * box and the bet comes back.
   */
  how: 'deal' | 'keep' | 'swap' | 'left-offer' | 'left-box' | 'refund';
  /** What the bet comes back times (1 for a refund, which is handed back as a refund, not paid). */
  mult: number;
  /** Your box. */
  box: number | null;
  /** What was in your box (the prize you'd have had if you hadn't dealt), or null if you never picked one. */
  boxPrize: number | null;
  /** After playing it out: what was in the other of the last two boxes (the one you didn't end up with). Null otherwise. */
  otherPrize: number | null;
}

/** What happened, in order: enough for a spectator to follow the whole round. */
export type DealEvent =
  | { type: 'picked'; box: number }
  | { type: 'opened'; box: number; prize: number; round: number; left: number }
  | { type: 'offer'; round: number; offer: number; average: number; boxesLeft: number }
  | { type: 'dealt'; offer: number }
  | { type: 'declined'; offer: number }
  | { type: 'final'; swapped: boolean; box: number; other: number }
  | { type: 'left'; how: DealOutcome['how'] }
  | { type: 'reveal'; box: number; prize: number; mult: number; how: DealOutcome['how'] };

export class DealRound {
  readonly layout: DealLayout;
  readonly events: DealEvent[] = [];
  phase: DealPhase = 'pick';
  /** The box you're keeping. */
  mine: number | null = null;
  /** Round being played, 0-based. */
  round = 0;
  /** Boxes still to open this round. */
  toOpen = 0;
  /** The offer on the table (a multiple of the bet), when the phone is ringing. */
  offer: number | null = null;
  outcome: DealOutcome | null = null;
  private shut: boolean[] = Array.from({ length: BOXES }, () => true);

  constructor(layout: DealLayout) {
    if (layout.prizes.length !== BOXES) throw new Error('A layout needs one prize per box');
    this.layout = layout;
  }

  /** Whether box `i` has been opened. */
  isOpen(i: number): boolean {
    return !this.shut[i];
  }

  /** The prizes under boxes that are still shut, yours included: what's still in play. */
  get inPlay(): number[] {
    return this.layout.prizes.filter((_, i) => this.shut[i]);
  }

  /** The prizes already out of play, in the order they were opened (or all of them, once it's over). */
  get seen(): number[] {
    return this.layout.prizes.filter((_, i) => !this.shut[i]);
  }

  /** What your box is worth to you now: the average of what's in play. */
  get average(): number {
    return average(this.inPlay);
  }

  /** The prize under box `i`: only for a box that has been opened, or any once the round is over. */
  prizeAt(i: number): number | null {
    return !this.shut[i] || this.phase === 'done' ? this.layout.prizes[i] : null;
  }

  /** The one other box left after the last round, while you can still swap. */
  get lastBox(): number | null {
    if (this.phase !== 'swap' && this.phase !== 'call') return null;
    const left = this.shut.map((s, i) => (s && i !== this.mine ? i : -1)).filter((i) => i >= 0);
    return left.length === 1 ? left[0] : null;
  }

  /** The boxes you could open right now. */
  get openable(): number[] {
    if (this.phase !== 'open') return [];
    return this.shut.map((s, i) => (s && i !== this.mine ? i : -1)).filter((i) => i >= 0);
  }

  /** Choose the box you're keeping. */
  pick(box: number): DealEvent[] {
    if (this.phase !== 'pick' || !this.valid(box)) return [];
    this.mine = box;
    this.phase = 'open';
    this.round = 0;
    this.toOpen = ROUNDS[0];
    return this.emit({ type: 'picked', box });
  }

  /** Open a box. When the round's last box comes up, Dr. Moss rings with an offer. */
  open(box: number): DealEvent[] {
    if (this.phase !== 'open' || !this.valid(box) || box === this.mine || !this.shut[box]) return [];
    this.shut[box] = false;
    this.toOpen -= 1;
    const out = this.emit({ type: 'opened', box, prize: this.layout.prizes[box], round: this.round, left: this.toOpen });
    if (this.toOpen === 0) {
      this.offer = makeOffer(this.inPlay, this.round, this.layout.wobble[this.round] ?? 0);
      this.phase = 'call';
      out.push(...this.emit({ type: 'offer', round: this.round, offer: this.offer, average: this.average, boxesLeft: this.inPlay.length }));
    }
    return out;
  }

  /** Answer the phone: `true` takes the offer (and the round is over), `false` keeps going. */
  answer(deal: boolean): DealEvent[] {
    if (this.phase !== 'call' || this.offer === null) return [];
    const offer = this.offer;
    if (deal) {
      const out = this.emit({ type: 'dealt', offer });
      return [...out, ...this.finish('deal', offer)];
    }
    const out = this.emit({ type: 'declined', offer });
    this.offer = null;
    if (this.round + 1 < ROUNDS.length) {
      this.round += 1;
      this.toOpen = ROUNDS[this.round];
      this.phase = 'open';
    } else {
      this.phase = 'swap';
    }
    return out;
  }

  /** The last choice: swap your box for the one still shut, or keep yours. */
  swap(swapIt: boolean): DealEvent[] {
    const last = this.lastBox;
    if (this.phase !== 'swap' || this.mine === null || last === null) return [];
    const mine = this.mine;
    const out = this.emit({ type: 'final', swapped: swapIt, box: swapIt ? last : mine, other: swapIt ? mine : last });
    if (swapIt) this.mine = last;
    const other = this.layout.prizes[swapIt ? mine : last];
    return [...out, ...this.finish(swapIt ? 'swap' : 'keep', this.layout.prizes[this.mine as number], other)];
  }

  /**
   * Walk away mid-round (closing the game, leaving the page). The rule: with an
   * offer on the table you take it; otherwise you keep your box and get what
   * was in it (it was settled at bet time, so leaving tells you nothing); and
   * if you haven't picked a box yet, the bet is refunded. None of these can
   * pay more than the average of what was in play, so leaving is never a way
   * to get ahead.
   */
  leave(): DealOutcome {
    if (this.outcome) return this.outcome;
    const how: DealOutcome['how'] = this.mine === null ? 'refund' : this.phase === 'call' ? 'left-offer' : 'left-box';
    this.emit({ type: 'left', how });
    const mult = how === 'refund' ? 1 : how === 'left-offer' ? (this.offer as number) : this.layout.prizes[this.mine as number];
    this.finish(how, mult);
    return this.outcome ?? { how, mult, box: this.mine, boxPrize: null, otherPrize: null };
  }

  private valid(box: number): boolean {
    return Number.isInteger(box) && box >= 0 && box < BOXES;
  }

  private emit(e: DealEvent): DealEvent[] {
    this.events.push(e);
    return [e];
  }

  /** The round is over: everything is face up, your box is revealed. */
  private finish(how: DealOutcome['how'], mult: number, otherPrize: number | null = null): DealEvent[] {
    this.phase = 'done';
    this.offer = null;
    this.toOpen = 0;
    const box = this.mine;
    const boxPrize = box === null ? null : this.layout.prizes[box];
    this.outcome = { how, mult, box, boxPrize, otherPrize };
    if (box === null || boxPrize === null) return [];
    return this.emit({ type: 'reveal', box, prize: boxPrize, mult, how });
  }
}

// What he says ---------------------------------------------------------------

/** Hammy, when you've kept a box. */
export const DEAL_PICKED: readonly string[] = [
  'That one? Bold. I sat on that one.',
  'Good box. Smells like destiny. And onions.',
  'Ooh. I wouldn’t have picked that one. But I’m a cube.',
  'Don’t let anybody tell you it’s the wrong one.',
];
/** Hammy, when a small prize comes out (good for you). */
export const DEAL_SMALL: readonly string[] = ['Phew. Junk. Good junk.', 'Crumbs. A whole box of crumbs.', 'Nothing in there. Lovely.', 'Just a coupon. Gone.', 'That one smelled like Grandma’s casserole.', 'Get it out of here.'];
/** Hammy, when a middling one comes out. */
export const DEAL_MID: readonly string[] = ['Eh. A normal box.', 'Fine. That’s fine.', 'Roach in there. Employee of the month.', 'Some coins and a crust.'];
/** Hammy, when a big one comes out (bad for you: it's off the board). */
export const DEAL_BIG: readonly string[] = ['OOOF. That was a big one.', 'Nooo. Put it back.', 'That’s coins I could have spent on me.', 'The toilet is laughing. I can hear it.', 'War is gonna be so mad.'];
/** Hammy, when the top prize comes out. */
export const DEAL_TOP: readonly string[] = ['THE BIG ONE. Gone. Just gone.', 'I can’t look. Somebody look for me.', 'Eight times. In a greasy box. Wasted.'];

/** Dr. Moss on the phone, by how fair the offer is (its share of what's in play). */
export const MOSS_LOW: readonly string[] = [
  'I’m authorized to offer you this. It is not much. It is, however, science.',
  'The lab’s budget is a coupon and a bad feeling. Take it.',
  'Hammy, put the box down. Here is a number. It is a small number.',
  'The data suggests you should accept this. The data was written by me.',
];
export const MOSS_MID: readonly string[] = [
  'It’s an offer. I have seen worse. I have made worse.',
  'The robot vacuum ran the numbers. It said “beep”. I rounded up.',
  'Interesting. Your pulse is up. Here is a number.',
  'I can go a little higher if you stop touching the intercom.',
];
export const MOSS_HIGH: readonly string[] = [
  'This is as generous as I get. Please take it so I can go home.',
  'Honestly? That is a good number. I’m not allowed to say that. Take it.',
  'Fine. Almost fair. Don’t tell the committee.',
  'Last call. Grandma already took the deal. Twice.',
];
/** Hammy, reacting to an offer. */
export const HAMMY_LOW_OFFER: readonly string[] = ['That’s an insult. Make me an angrier cube.', 'Pass. That’s a rip-off. She’s ripping us off.', 'My butt says no.'];
export const HAMMY_HIGH_OFFER: readonly string[] = ['Ooh. That’s a real number. Careful.', 'Hmm. That’s tempting. Don’t be a hero.', 'I would take that. I would take that so fast.'];

/** Hammy, after you take a deal and find out what your box held. */
export const DEAL_SMART: readonly string[] = ['SMART. Your box was junk. Dr. Moss just got robbed.', 'Look at you. Cashing out right before the dumpster.', 'Nice deal. Your box was kind of a dud.'];
export const DEAL_OUCH: readonly string[] = ['OUCH. Your box had way more. Way more.', 'Oh no. Oh no no no. Look at that.', 'You folded on a good one. I’m sorry. I’m so sorry.'];
export const DEAL_EVEN: readonly string[] = ['Right on the money. Weird.', 'Basically even. Annoyingly fair.'];
/** Hammy, after the last box. */
export const FINAL_WIN: readonly string[] = ['Look at that! The good box!', 'That’s the one. Dr. Moss is crying.', 'Winner winner pizza dinner.'];
export const FINAL_LOSE: readonly string[] = ['Aaand it’s a crust. Sorry.', 'The other box. It was the other box.', 'I’m telling you, it’s the cheese.'];
