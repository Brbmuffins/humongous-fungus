// The Pizza Boxes screen: twenty of Hammy's greasy boxes between two prize
// boards, Dr. Moss on the phone, and Hammy's running commentary. The rules
// are in deal.ts (they produce the events this screen reacts to); your coins
// go through arcadeview.ts.
import './deal.css';
import { h, setDisabled, setText } from '@shared/dom';
import { fmt } from '@shared/format';
import { BetPicker, Ledger, arcadeCard, fairRoll, fitCanvas, pick, x2, type ArcadeHost, type ArcadeScreen, type ArcadeSession } from './arcadeview';
import { isAlive } from './alive';
import { paintPortrait, type Face } from './hammy';
import { buzz } from './haptics';
import { sfx } from './sound';
import {
  BIG_PRIZE,
  BOXES,
  DEAL_BIG,
  DEAL_EVEN,
  DEAL_MID,
  DEAL_OUCH,
  DEAL_PICKED,
  DEAL_SMALL,
  DEAL_SMART,
  DEAL_TOP,
  FINAL_LOSE,
  FINAL_WIN,
  HAMMY_HIGH_OFFER,
  HAMMY_LOW_OFFER,
  MOSS_HIGH,
  MOSS_LOW,
  MOSS_MID,
  PRIZES,
  ROUNDS,
  DealRound,
  layBoxes,
  type DealEvent,
  type DealOutcome,
} from './deal';
import { drawBox, type BoxLook } from './dealart';

/** A prize for showing: 0.01×, 1.1×, 8×. */
export const mx = (m: number): string => `${Number(m.toFixed(2))}×`;

/** How long the phone rings before Dr. Moss says anything, and the pauses in the reveal at the end. */
const RING_MS = 1500;
const REVEAL_MINE_MS = 1100;
const REVEAL_ALL_MS = 1000;

const TOP_PRIZE = PRIZES[PRIZES.length - 1];

export class DealApp implements ArcadeScreen {
  readonly card: HTMLElement;
  private ledger: Ledger;
  private picker: BetPicker;
  private syncCoins: (coins: number) => void;
  private round: DealRound | null = null;
  private bet = 0;
  /** What the finished round is owed, until it's paid (a reveal pays a moment after the choice). */
  private pending: DealOutcome | null = null;
  private paid = 0;
  /** 0: shut, 1: your box is open, 2: all of them. */
  private stage = 0;
  private ringing = false;
  private moss = '';
  private offerShown = false;
  /** One-shot timers (the ring, the reveal) and the ticker that keeps the coins fresh. */
  private timers: number[] = [];
  private ticker = 0;
  private closed = false;
  private looks: string[] = [];
  private resizer: ResizeObserver | null = null;

  private gridEl = h('div', { class: 'deal-grid', role: 'group', 'aria-label': 'Hammy’s pizza boxes' });
  private boxes: { btn: HTMLButtonElement; cv: HTMLCanvasElement }[] = [];
  private lows = h('ol', { class: 'deal-board low', 'aria-label': 'Smaller prizes' });
  private highs = h('ol', { class: 'deal-board high', 'aria-label': 'Bigger prizes' });
  private boardCells: { el: HTMLLIElement; prize: number }[] = [];
  private face = h('canvas', { class: 'deal-face', 'aria-hidden': 'true' });
  private says = h('p', { class: 'deal-says' });
  private status = h('p', { class: 'arcade-status deal-status', 'aria-live': 'polite' });
  private hint = h('p', { class: 'deal-hint' });
  private go = h('button', { class: 'btn btn-cheese arcade-go', type: 'button' });
  private take = h('button', { class: 'btn btn-quiet arcade-go2', type: 'button' });
  private random = h('button', { class: 'btn btn-quiet arcade-go2', type: 'button' }, 'Random box');
  private result = h('p', { class: 'deal-result', 'aria-live': 'polite' });

  private phone = h('span', { class: 'deal-phone', 'aria-hidden': 'true' }, '📞');
  private callTitle = h('span', { class: 'deal-call-title' });
  private callLine = h('p', { class: 'deal-call-line' });
  private callOffer = h('p', { class: 'deal-call-offer' });
  private dealBtn = h('button', { class: 'btn btn-cheese arcade-go', type: 'button' });
  private keepBtn = h('button', { class: 'btn btn-quiet arcade-go2', type: 'button' }, 'Keep going');
  private callEl = h(
    'div',
    { class: 'deal-call', role: 'group', 'aria-label': 'Dr. Moss is calling' },
    h('div', { class: 'deal-call-head' }, this.phone, h('span', { class: 'deal-call-who' }, h('b', null, 'Dr. Moss'), this.callTitle)),
    this.callLine,
    this.callOffer,
    h('div', { class: 'deal-call-buttons' }, this.dealBtn, this.keepBtn),
  );
  private finalTitle = h('p', { class: 'deal-final-title' });
  private keepBox = h('button', { class: 'btn btn-quiet arcade-go2', type: 'button' });
  private swapBox = h('button', { class: 'btn btn-cheese arcade-go', type: 'button' });
  private finalEl = h('div', { class: 'deal-final', role: 'group', 'aria-label': 'Swap your box or keep it' }, this.finalTitle, h('div', { class: 'deal-call-buttons' }, this.keepBox, this.swapBox));

  constructor(
    private host: ArcadeHost,
    close: () => void,
  ) {
    this.ledger = new Ledger(host, 'deal');
    this.picker = new BetPicker(() => host.state.coins);
    this.go.addEventListener('click', () => this.start());
    this.take.addEventListener('click', () => this.takeBack());
    this.random.addEventListener('click', () => {
      const shut = this.round?.openable ?? [];
      if (shut.length) this.openBox(shut[Math.floor(Math.random() * shut.length)]);
    });
    this.dealBtn.addEventListener('click', () => this.answer(true));
    this.keepBtn.addEventListener('click', () => this.answer(false));
    this.keepBox.addEventListener('click', () => this.final(false));
    this.swapBox.addEventListener('click', () => this.final(true));

    // The prize boards: the smaller half down the left, the bigger down the right.
    PRIZES.forEach((prize, i) => {
      const el = h('li', { class: `deal-prize${prize >= 1 ? ' hot' : ''}${prize >= BIG_PRIZE ? ' big' : ''}` }, mx(prize));
      this.boardCells.push({ el, prize });
      (i < PRIZES.length / 2 ? this.lows : this.highs).append(el);
    });
    for (let i = 0; i < BOXES; i++) {
      const cv = h('canvas', { 'aria-hidden': 'true' });
      const btn = h('button', { class: 'deal-box', type: 'button', onclick: () => this.tapBox(i) }, cv);
      this.boxes.push({ btn, cv });
    }
    this.gridEl.append(...this.boxes.map((b) => b.btn));

    const { card, syncCoins } = arcadeCard(
      'deal',
      close,
      h('div', { class: 'deal-head' }, this.face, h('div', { class: 'deal-head-text' }, this.says, this.status)),
      h('div', { class: 'deal-stage' }, this.lows, this.gridEl, this.highs),
      this.hint,
      h('div', { class: 'deal-panel' }, this.callEl, this.finalEl, this.result, h('div', { class: 'arcade-buttons' }, this.go, this.take, this.random)),
      this.picker.el,
    );
    this.card = card;
    this.syncCoins = syncCoins;
    this.setFace('smug', 'Twenty boxes. One of them is yours. Pick wisely, or don’t.');
    setText(this.status, 'Bet, then pick the box you’re keeping. Dr. Moss will call.');
    this.sync();
    // The boxes are drawn once the card is on screen and has a size.
    this.resizer = new ResizeObserver(() => this.drawBoxes(true));
    this.resizer.observe(this.gridEl);
    this.ticker = window.setInterval(() => this.sync(), 400);
  }

  get focus(): HTMLElement {
    return this.go;
  }

  /** Walking away settles the round the way it was going (see DealRound.leave). */
  close(): ArcadeSession {
    if (this.closed) return this.ledger.session;
    this.closed = true;
    this.resizer?.disconnect();
    clearInterval(this.ticker);
    this.clearTimers();
    const r = this.round;
    if (r && this.bet) {
      if (r.phase !== 'done') this.pending = r.leave();
      this.payPending();
    }
    return this.ledger.session;
  }

  // Bets and rounds -----------------------------------------------------------

  private start(): void {
    if (this.closed) return;
    if (this.round) {
      if (this.round.phase !== 'done') return;
      this.reset();
    }
    const amount = this.ledger.bet(this.picker.amount);
    if (!amount) {
      setText(this.status, isAlive(this.host.state) ? 'Not enough coins for that bet.' : 'Hammy is dead. The boxes are just boxes.');
      return;
    }
    this.bet = amount;
    this.round = new DealRound(layBoxes(fairRoll));
    sfx.coin();
    this.setFace('smug', 'Pick one. Any one. Not that one. Okay, that one.');
    setText(this.status, `You’re in for ${fmt(amount)}. Pick the box you’re keeping.`);
    this.sync();
  }

  /** Back to a clean floor (anything owed has been paid). */
  private reset(): void {
    this.clearTimers();
    this.payPending();
    this.round = null;
    this.bet = 0;
    this.stage = 0;
    this.ringing = false;
    this.offerShown = false;
    this.paid = 0;
  }

  private takeBack(): void {
    const r = this.round;
    if (this.closed || !r || r.phase !== 'pick') return;
    r.leave();
    this.ledger.refund(this.bet);
    this.reset();
    setText(this.status, 'Bet taken back.');
    this.setFace('meh', 'Chicken.');
    this.sync();
  }

  private tapBox(i: number): void {
    const r = this.round;
    if (this.closed || !r) {
      setText(this.status, 'Bet first, then pick a box.');
      return;
    }
    if (r.phase === 'pick') this.pickBox(i);
    else if (r.phase === 'open') this.openBox(i);
  }

  private pickBox(i: number): void {
    const r = this.round;
    if (!r) return;
    this.handle(r.pick(i));
  }

  private openBox(i: number): void {
    const r = this.round;
    if (!r) return;
    this.handle(r.open(i));
  }

  private answer(deal: boolean): void {
    const r = this.round;
    if (this.closed || !r || r.phase !== 'call' || this.ringing) return;
    this.handle(r.answer(deal));
    if (r.outcome) this.finish();
  }

  private final(swap: boolean): void {
    const r = this.round;
    if (this.closed || !r || r.phase !== 'swap') return;
    this.handle(r.swap(swap));
    this.finish();
  }

  // What happened, and what Hammy makes of it ---------------------------------

  private handle(events: DealEvent[]): void {
    const r = this.round;
    if (!r) return;
    for (const e of events) {
      switch (e.type) {
        case 'picked':
          sfx.coin();
          this.setFace('smug', pick(DEAL_PICKED));
          setText(this.status, `You’re keeping box ${e.box + 1}. Open ${ROUNDS[0]} of the others.`);
          break;
        case 'opened':
          this.opened(e);
          break;
        case 'offer':
          this.startCall(e.offer);
          break;
        case 'declined':
          setText(this.status, r.toOpen > 0 ? `No deal. Open ${r.toOpen} more.` : 'No deal. Two boxes left.');
          this.setFace('smug', pick(['Brave. Or dumb. Same thing.', 'Hang up on her.', 'No deal. I felt that in my butt.', 'Keep going. I believe in you. Mostly.']));
          break;
        default:
          break;
      }
    }
    this.sync();
  }

  private opened(e: Extract<DealEvent, { type: 'opened' }>): void {
    const p = e.prize;
    const n = e.box + 1;
    let face: Face = 'joy';
    let line: string | null = Math.random() < 0.55 ? pick(DEAL_SMALL) : null;
    if (p >= TOP_PRIZE) {
      sfx.lose();
      buzz.bad();
      face = 'shock';
      line = pick(DEAL_TOP);
    } else if (p >= BIG_PRIZE) {
      sfx.bonk();
      buzz.bad();
      face = 'shock';
      line = pick(DEAL_BIG);
    } else if (p >= 1) {
      sfx.boing();
      face = 'meh';
      line = Math.random() < 0.6 ? pick(DEAL_MID) : null;
    } else if (p >= 0.3) {
      sfx.crunch();
      face = 'happy';
      line = Math.random() < 0.4 ? pick(DEAL_MID) : null;
    } else {
      sfx.plop();
      buzz.tap();
    }
    if (line) this.setFace(face, line);
    else this.setFace(face, `Box ${n}: ${mx(p)}.`);
    setText(this.status, e.left > 0 ? `Box ${n} had ${mx(p)}. ${e.left} more to open.` : `Box ${n} had ${mx(p)}. That’s the round.`);
  }

  /** The phone rings; after a moment she talks. */
  private startCall(offer: number): void {
    const r = this.round;
    if (!r) return;
    this.ringing = true;
    this.offerShown = false;
    const ratio = offer / Math.max(1e-9, r.average);
    this.moss = pick(ratio < 0.6 ? MOSS_LOW : ratio < 0.85 ? MOSS_MID : MOSS_HIGH);
    sfx.ring();
    this.setFace('shock', 'Is that… the phone?');
    setText(this.status, 'Dr. Moss is calling…');
    this.timers.push(
      window.setTimeout(() => sfx.ring(), 700),
      window.setTimeout(() => {
        if (this.closed || !this.round || this.round.phase !== 'call') return;
        this.ringing = false;
        this.offerShown = true;
        sfx.ding();
        this.setFace(ratio < 0.6 ? 'meh' : 'smug', pick(ratio < 0.6 ? HAMMY_LOW_OFFER : ratio >= 0.85 ? HAMMY_HIGH_OFFER : ['Hmm. Do I trust her? No. Do I trust the number? Also no.', 'A number. Of some kind.']));
        setText(this.status, `Dr. Moss offers ${fmt(Math.floor(this.bet * offer))} coins for your box.`);
        this.sync();
        this.callEl.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      }, RING_MS),
    );
  }

  /** The round is over. Pay what's owed (now for a deal, at the reveal for a box) and show what was in the boxes. */
  private finish(): void {
    const r = this.round;
    const o = r?.outcome;
    if (!r || !o) return;
    this.pending = o;
    this.ringing = false;
    const dealt = o.how === 'deal' || o.how === 'left-offer';
    if (dealt) {
      this.payPending();
      sfx.kaching();
      buzz.success();
      setText(this.status, `Deal! ${x2(o.mult)}: ${fmt(this.paid)} coins.`);
      this.setFace('eat', 'Deal! …Now let’s see what was in your box.');
    } else {
      setText(this.status, `Opening box ${(o.box ?? 0) + 1}…`);
      this.setFace('shock', o.how === 'swap' ? 'You swapped. Bold. Let’s look.' : 'You kept it. Drumroll. Somebody drum.');
    }
    this.sync();
    this.timers.push(
      window.setTimeout(() => this.revealMine(o), REVEAL_MINE_MS),
      window.setTimeout(() => this.revealAll(), REVEAL_MINE_MS + REVEAL_ALL_MS),
    );
  }

  private revealMine(o: DealOutcome): void {
    if (this.closed || this.round?.outcome !== o) return;
    this.stage = 1;
    this.payPending();
    const prize = o.boxPrize ?? 0;
    if (o.how === 'deal' || o.how === 'left-offer') {
      // Did you fold on a good one?
      const verdict = prize >= BIG_PRIZE || prize > o.mult * 1.25 ? 'ouch' : prize < o.mult * 0.8 ? 'smart' : 'even';
      if (verdict === 'ouch') {
        sfx.lose();
        buzz.bad();
        this.setFace('sad', `${pick(DEAL_OUCH)} (${mx(prize)})`);
      } else if (verdict === 'smart') {
        sfx.ding();
        buzz.success();
        this.setFace('joy', `${pick(DEAL_SMART)} (${mx(prize)})`);
      } else {
        this.setFace('meh', `${pick(DEAL_EVEN)} (${mx(prize)})`);
      }
    } else if (prize >= 1) {
      sfx.kaching();
      buzz.success();
      this.setFace('joy', `${pick(FINAL_WIN)} ${mx(prize)}!`);
      setText(this.status, `Box ${(o.box ?? 0) + 1} had ${mx(prize)}: ${fmt(this.paid)} coins.`);
    } else {
      sfx.sad();
      buzz.bad();
      this.setFace('sad', `${pick(FINAL_LOSE)} ${mx(prize)}.`);
      setText(this.status, `Box ${(o.box ?? 0) + 1} had ${mx(prize)}: ${fmt(this.paid)} coins.`);
    }
    this.sync();
  }

  private revealAll(): void {
    if (this.closed || !this.round?.outcome) return;
    this.stage = 2;
    this.sync();
  }

  private payPending(): void {
    const o = this.pending;
    if (!o) return;
    this.pending = null;
    if (o.how === 'refund') this.ledger.refund(this.bet);
    else this.paid = this.ledger.pay(this.bet, o.mult);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private setFace(face: Face, line: string): void {
    setText(this.says, `“${line}”`);
    paintPortrait(this.face, this.host.state.fit, face, performance.now(), this.host.form);
  }

  // The screen ------------------------------------------------------------------

  /** How box `i` looks right now. */
  private lookOf(i: number): BoxLook {
    const r = this.round;
    const n = i + 1;
    if (!r) return { n, prize: null };
    const mine = r.mine === i;
    const done = r.phase === 'done';
    const open = r.isOpen(i);
    const prize = r.prizeAt(i);
    const up = open || (done && (mine ? this.stage >= 1 : this.stage >= 2));
    if (!up || prize === null) return { n, prize: null, mine };
    return { n, prize: mx(prize), hot: prize >= 1, mine, dim: done && !open && !mine };
  }

  private drawBoxes(force = false): void {
    this.boxes.forEach((b, i) => {
      const look = this.lookOf(i);
      const sig = `${look.n}|${look.prize}|${look.hot ? 1 : 0}|${look.mine ? 1 : 0}|${look.dim ? 1 : 0}|${b.cv.clientWidth}`;
      if (!force && this.looks[i] === sig) return;
      const fit = fitCanvas(b.cv);
      if (!fit) return;
      this.looks[i] = sig;
      drawBox(fit.c, fit.W, fit.H, look);
      if (look.prize !== null && !b.btn.classList.contains('up')) {
        b.btn.classList.add('up');
        b.btn.classList.remove('pop');
        void b.btn.offsetWidth;
        b.btn.classList.add('pop');
      }
      if (look.prize === null) b.btn.classList.remove('up', 'pop');
    });
  }

  private sync(): void {
    const s = this.host.state;
    const r = this.round;
    const phase = r?.phase ?? null;
    const playing = r !== null && phase !== 'done';
    this.syncCoins(s.coins);
    this.picker.lock(playing);

    // What can be tapped.
    this.boxes.forEach((b, i) => {
      const can = r !== null && (phase === 'pick' || phase === 'open') && r.mine !== i && !r.isOpen(i);
      const look = this.lookOf(i);
      const label = look.prize !== null ? `open, ${look.prize}` : look.mine ? 'yours, shut' : 'shut';
      b.btn.setAttribute('aria-label', `Box ${i + 1}, ${label}`);
      b.btn.setAttribute('aria-disabled', String(!can));
      b.btn.classList.toggle('can', can);
    });
    this.drawBoxes();

    // The prize boards cross off what's been seen.
    const seen = this.boxes.map((_, i) => this.lookOf(i)).flatMap((l, i) => (l.prize !== null && r ? [r.layout.prizes[i]] : []));
    const left = new Map<number, number>();
    for (const p of seen) left.set(p, (left.get(p) ?? 0) + 1);
    for (const c of this.boardCells) {
      const k = left.get(c.prize) ?? 0;
      const gone = k > 0;
      if (gone) left.set(c.prize, k - 1);
      c.el.classList.toggle('gone', gone);
    }

    // The controls for this part of the round.
    const call = phase === 'call';
    this.callEl.hidden = !call;
    this.callEl.classList.toggle('ringing', call && this.ringing);
    this.dealBtn.hidden = this.keepBtn.hidden = this.callOffer.hidden = this.callLine.hidden = !(call && this.offerShown);
    if (call) {
      const offer = r?.offer ?? 0;
      setText(this.callTitle, this.ringing ? 'is calling…' : 'is on the line');
      setText(this.callLine, `“${this.moss}”`);
      setText(this.callOffer, `Offer: ${fmt(Math.floor(this.bet * offer))} coins (${x2(offer)} your bet)`);
      setText(this.dealBtn, `Deal · ${fmt(Math.floor(this.bet * offer))}`);
      setText(this.keepBtn, r && r.round === ROUNDS.length - 1 ? 'No deal · swap?' : 'Keep going');
    }
    const swap = phase === 'swap' && r !== null;
    this.finalEl.hidden = !swap;
    if (swap && r) {
      const last = r.lastBox;
      setText(this.finalTitle, `Two boxes left. Yours is ${(r.mine ?? 0) + 1}. The other is ${(last ?? 0) + 1}.`);
      setText(this.keepBox, `Keep box ${(r.mine ?? 0) + 1}`);
      setText(this.swapBox, `Swap for box ${(last ?? 0) + 1}`);
    }
    this.go.hidden = playing;
    setText(this.go, phase === 'done' ? `Bet ${fmt(this.picker.amount)} again` : `Bet ${fmt(this.picker.amount)}`);
    setDisabled(this.go, !isAlive(s) || !this.picker.affordable);
    this.take.hidden = phase !== 'pick';
    setText(this.take, `Take back ${fmt(this.bet)}`);
    this.random.hidden = phase !== 'open';

    const o = r?.outcome;
    this.result.hidden = !(phase === 'done' && o);
    if (phase === 'done' && o) setText(this.result, this.resultText(o));

    setText(
      this.hint,
      !r
        ? 'Twenty boxes, one yours. Open the rest a few at a time; Dr. Moss calls after each round.'
        : phase === 'pick'
          ? 'Pick the box you’re keeping.'
          : phase === 'open'
            ? `Round ${r.round + 1} of ${ROUNDS.length}: open ${r.toOpen} more ${r.toOpen === 1 ? 'box' : 'boxes'}.`
            : phase === 'call'
              ? this.ringing
                ? 'The phone’s ringing…'
                : 'Take her offer, or keep going.'
              : phase === 'swap'
                ? 'Last choice: swap or keep.'
                : '',
    );
  }

  private resultText(o: DealOutcome): string {
    const mine = (o.box ?? 0) + 1;
    const reveal = this.stage >= 1;
    const pay = this.pending ? '' : ` ${fmt(this.paid)} coins back for ${fmt(this.bet)}.`;
    switch (o.how) {
      case 'deal':
      case 'left-offer':
        return `Deal at ${x2(o.mult)}.${pay}${reveal ? ` Your box ${mine} had ${mx(o.boxPrize ?? 0)}.` : ''}`;
      case 'swap':
        return reveal ? `Swapped to box ${mine}: ${mx(o.mult)}.${pay} The one you gave up had ${mx(o.otherPrize ?? 0)}.` : `Swapped to box ${mine}…`;
      case 'keep':
      case 'left-box':
        return reveal ? `Kept box ${mine}: ${mx(o.mult)}.${pay}${o.otherPrize === null ? '' : ` The other had ${mx(o.otherPrize)}.`}` : `Kept box ${mine}…`;
      default:
        return '';
    }
  }
}
