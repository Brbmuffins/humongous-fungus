// The Pizza Boxes screen: twenty of Hammy's greasy boxes between two prize
// boards, Dr. Moss on the phone, and Hammy's running commentary. The rules
// are in deal.ts (they produce the events this screen reacts to); your coins
// go through arcadeview.ts.
import './deal.css';
import { h, setDisabled, setText } from '@shared/dom';
import { fmt } from '@shared/format';
import { BetPicker, Ledger, arcadeCard, fairRoll, fitCanvas, pick, x2, type ArcadeHost, type ArcadeScreen, type ArcadeSession } from './arcadeview';
import { MIN_BET } from './arcade';
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
  type DealPhase,
} from './deal';
import type { DealSource, LiveDealTable } from './roundsource';
import { drawBox, type BoxLook } from './dealart';

/** A prize for showing: 0.01×, 1.1×, 8×. */
export const mx = (m: number): string => `${Number(m.toFixed(2))}×`;

/** How long the phone rings before Dr. Moss says anything, and the pauses in the reveal at the end. */
const RING_MS = 1500;
const REVEAL_MINE_MS = 1100;
const REVEAL_ALL_MS = 1000;

const TOP_PRIZE = PRIZES[PRIZES.length - 1];
/** A watcher can send a phrase this often (the server says so too). */
const REACT_GAP_MS = 3000;
const FEED_LINES = 4;

/** What the screen needs to know about a round, whether it is rolled here (DealRound) or laid out on a server (RemoteBoard). */
interface Board {
  readonly phase: DealPhase;
  readonly mine: number | null;
  readonly round: number;
  readonly toOpen: number;
  readonly offer: number | null;
  readonly outcome: DealOutcome | null;
  readonly average: number;
  readonly lastBox: number | null;
  readonly openable: number[];
  isOpen(i: number): boolean;
  prizeAt(i: number): number | null;
}

/** A round on a server as everyone sees it: the boxes that are open, and the rest is blank until it ends. */
class RemoteBoard implements Board {
  private opened = new Map<number, number>();

  constructor(public t: LiveDealTable) {
    this.set(t);
  }

  set(t: LiveDealTable): void {
    this.t = t;
    this.opened = new Map(t.opened.map((o) => [o.box, o.prize]));
  }

  get phase(): DealPhase {
    return this.t.phase;
  }
  get mine(): number | null {
    return this.t.mine;
  }
  get round(): number {
    return this.t.round;
  }
  get toOpen(): number {
    return this.t.toOpen;
  }
  get offer(): number | null {
    return this.t.offer;
  }
  get outcome(): DealOutcome | null {
    return this.t.outcome ?? null;
  }
  get lastBox(): number | null {
    return this.t.lastBox;
  }
  /** The prizes are a fixed set, so what's in play is the set less what's been opened. */
  get average(): number {
    let rest = PRIZES.reduce((a, b) => a + b, 0);
    for (const p of this.opened.values()) rest -= p;
    const n = BOXES - this.opened.size;
    return n > 0 ? rest / n : 0;
  }
  get openable(): number[] {
    if (this.phase !== 'open') return [];
    return Array.from({ length: BOXES }, (_, i) => i).filter((i) => i !== this.mine && !this.opened.has(i));
  }
  isOpen(i: number): boolean {
    return this.opened.has(i);
  }
  prizeAt(i: number): number | null {
    return this.opened.get(i) ?? (this.phase === 'done' ? (this.t.all?.[i] ?? null) : null);
  }
}

export class DealApp implements ArcadeScreen {
  readonly card: HTMLElement;
  private ledger: Ledger;
  private picker: BetPicker;
  private syncCoins: (coins: number) => void;
  /** What's on the table: rolled here (`local`) or laid out by the server. */
  private round: Board | null = null;
  private local: DealRound | null = null;
  private bet = 0;
  // Online only (see roundsource.ts): the round's number on the server, whether this screen is only watching someone else's, and the plumbing.
  private tableId = 0;
  private watching = false;
  private watchName = '';
  private busy = false;
  private finished = false;
  private offs: (() => void)[] = [];
  private feed: { name: string; text: string }[] = [];
  private lastReact = 0;
  private listSig = '';
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
  // Online: who else is playing, and the little watcher's corner.
  private fairEl = h('p', { class: 'deal-fair' });
  private watchList = h('ul', { class: 'deal-watch-list' });
  private watchNone = h('p', { class: 'deal-hint deal-watch-none' }, 'Nobody is at a table right now.');
  private watchEl = h('div', { class: 'deal-watch' }, h('h3', { class: 'arcade-sub' }, 'Watching now'), this.watchList, this.watchNone);
  private watchWho = h('span', { class: 'deal-watching' });
  private stopBtn = h('button', { class: 'btn btn-quiet', type: 'button' }, 'Stop watching');
  private watchBar = h('div', { class: 'deal-watchbar' }, this.watchWho, this.stopBtn);
  private reactEl = h('div', { class: 'deal-reacts', role: 'group', 'aria-label': 'Say something to the table' });
  private reactBtns: HTMLButtonElement[] = [];
  private feedEl = h('ul', { class: 'deal-feed', 'aria-live': 'polite' });
  private finalTitle = h('p', { class: 'deal-final-title' });
  private keepBox = h('button', { class: 'btn btn-quiet arcade-go2', type: 'button' });
  private swapBox = h('button', { class: 'btn btn-cheese arcade-go', type: 'button' });
  private finalEl = h('div', { class: 'deal-final', role: 'group', 'aria-label': 'Swap your box or keep it' }, this.finalTitle, h('div', { class: 'deal-call-buttons' }, this.keepBox, this.swapBox));

  constructor(
    private host: ArcadeHost,
    close: () => void,
    private src?: DealSource,
  ) {
    this.ledger = new Ledger(host, 'deal');
    this.picker = new BetPicker(() => host.state.coins);
    this.go.addEventListener('click', () => this.start());
    this.take.addEventListener('click', () => this.takeBack());
    this.random.addEventListener('click', () => {
      const shut = this.round?.openable ?? [];
      if (this.busy) return;
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
      src ? this.fairEl : null,
      src ? this.watchBar : null,
      src ? this.reactEl : null,
      src ? this.feedEl : null,
      src ? this.watchEl : null,
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
    if (src) this.goOnline(src);
  }

  // Online: a server's rounds, and watching other people's ------------------------

  private goOnline(src: DealSource): void {
    this.stopBtn.addEventListener('click', () => this.stopWatching());
    src.reacts.forEach((text, r) => {
      const b = h('button', { class: 'arcade-chip deal-react', type: 'button', onclick: () => this.sendReact(r) }, text);
      this.reactBtns.push(b);
      this.reactEl.append(b);
    });
    this.offs.push(
      src.onStep((t, events) => this.onStep(t, events)),
      src.onChange(() => this.onChange()),
      src.onReact((r) => {
        if (r.table !== this.tableId) return;
        this.feed.push({ name: r.name, text: src.reacts[r.r] ?? '' });
        if (this.feed.length > FEED_LINES) this.feed.shift();
        this.sync();
      }),
    );
    setText(this.status, 'Bet, then pick the box you’re keeping. Dr. Moss will call. Other people’s rounds can be watched below.');
    this.onChange();
  }

  /** Something on the server's side changed: the list of rounds, our own round coming back, a round gone. */
  private onChange(): void {
    const src = this.src;
    if (!src || this.closed) return;
    if (!this.tableId && !this.watching) {
      const m = src.mineTable();
      if (m) this.adopt(m, 'resume');
    } else if (this.tableId && !src.table(this.tableId) && this.round?.phase !== 'done') {
      // The round isn't there any more (it ended while the connection was down).
      const was = this.watching;
      this.leaveTable();
      setText(this.status, was ? 'That round is over.' : 'Your round was settled while you were away. Your coins are up to date.');
    }
    this.sync();
  }

  private onStep(t: LiveDealTable, events: DealEvent[]): void {
    const src = this.src;
    if (!src || this.closed) return;
    if (!this.tableId) {
      if (t.who === src.me && t.phase !== 'done' && !this.watching) this.adopt(t, events.length === 0 && t.v === 0 ? 'fresh' : 'resume');
      return;
    }
    if (t.id !== this.tableId || !(this.round instanceof RemoteBoard)) return;
    this.round.set(t);
    this.handle(events);
    if (t.phase === 'done' && !this.finished) this.finish();
  }

  /** Sit down at a round: ours just started, ours picked up again, or someone else's to watch. */
  private adopt(t: LiveDealTable, how: 'fresh' | 'resume' | 'watch'): void {
    this.reset();
    this.tableId = t.id;
    this.watching = how === 'watch';
    this.watchName = t.name;
    this.bet = t.bet;
    this.round = new RemoteBoard(t);
    this.finished = t.phase === 'done';
    this.feed = [];
    if (how === 'fresh') {
      this.ledger.session.rounds += 1;
      this.ledger.session.net -= t.bet;
      sfx.coin();
      this.setFace('smug', 'Pick one. Any one. Not that one. Okay, that one.');
      setText(this.status, `You’re in for ${fmt(t.bet)}. Pick the box you’re keeping.`);
    } else if (how === 'resume') {
      this.ledger.session.rounds += 1;
      this.ledger.session.net -= t.bet;
      this.setFace('smug', 'Back at the boxes. Where were we?');
      setText(this.status, `Your round is still on: ${fmt(t.bet)} on the table.`);
    } else {
      this.setFace('smug', `${t.name} is at the boxes. Let’s see how this goes.`);
      setText(this.status, `Watching ${t.name}: ${fmt(t.bet)} on the table.`);
    }
    if (t.phase === 'call') {
      // The phone is already ringing for them: no need to wait for it.
      this.ringing = false;
      this.offerShown = true;
      this.moss = pick(MOSS_MID);
    }
    if (t.phase === 'done' && t.outcome) {
      this.stage = 2;
      this.paid = t.outcome.how === 'refund' ? t.bet : Math.floor(t.bet * Math.max(0, t.outcome.mult));
      setText(this.status, 'That round is over.');
    }
    this.sync();
  }

  private watch(id: number): void {
    const t = this.src?.table(id);
    if (!t || this.closed || (this.round && this.round.phase !== 'done' && !this.watching)) return;
    this.adopt(t, 'watch');
  }

  /** Let go of the round on screen (a finished one, or one we were only watching). */
  private leaveTable(): void {
    this.reset();
    this.tableId = 0;
    this.watching = false;
    this.feed = [];
    this.listSig = '';
  }

  private stopWatching(): void {
    this.leaveTable();
    setText(this.status, 'Bet, then pick the box you’re keeping. Other people’s rounds can be watched below.');
    this.setFace('smug', 'Twenty boxes. One of them is yours. Pick wisely, or don’t.');
    this.sync();
  }

  private sendReact(r: number): void {
    const src = this.src;
    const now = Date.now();
    if (!src || !this.tableId || now - this.lastReact < REACT_GAP_MS) return;
    this.lastReact = now;
    void src.react(this.tableId, r).then((res) => {
      if (!res.ok) setText(this.status, res.message);
    });
    this.sync();
  }

  /** Send a choice to the server; its answer comes back as steps on the table. */
  private ask(p: Promise<{ ok: boolean; message?: string }>): void {
    this.busy = true;
    void p.then((r) => {
      this.busy = false;
      if (!r.ok && !this.closed) setText(this.status, r.message ?? 'That didn’t go through.');
      this.sync();
    });
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
    if (this.src) {
      // The server keeps our round. If nobody comes back to it, it settles itself.
      for (const off of this.offs) off();
      this.src.release();
      return this.ledger.session;
    }
    const r = this.local;
    if (r && this.bet) {
      if (r.phase !== 'done') this.pending = r.leave();
      this.payPending();
    }
    return this.ledger.session;
  }

  // Bets and rounds -----------------------------------------------------------

  private start(): void {
    if (this.closed) return;
    if (this.src) return this.startOnline(this.src);
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
    this.local = new DealRound(layBoxes(fairRoll));
    this.round = this.local;
    sfx.coin();
    this.setFace('smug', 'Pick one. Any one. Not that one. Okay, that one.');
    setText(this.status, `You’re in for ${fmt(amount)}. Pick the box you’re keeping.`);
    this.sync();
  }

  private startOnline(src: DealSource): void {
    if (this.busy || (this.round && this.round.phase !== 'done') || this.watching) return;
    const amount = Math.min(Math.floor(this.picker.amount), Math.floor(this.host.state.coins));
    if (amount < MIN_BET) {
      setText(this.status, 'Not enough coins for that bet.');
      return;
    }
    this.leaveTable();
    this.busy = true;
    void src.bet(amount).then((r) => {
      this.busy = false;
      if (this.closed) return;
      if (!r.ok) setText(this.status, r.message);
      else if (!this.tableId) this.adopt(r.table, 'fresh');
      this.sync();
    });
    this.sync();
  }

  /** Back to a clean floor (anything owed has been paid). */
  private reset(): void {
    this.clearTimers();
    this.payPending();
    this.round = null;
    this.local = null;
    this.finished = false;
    this.bet = 0;
    this.stage = 0;
    this.ringing = false;
    this.offerShown = false;
    this.paid = 0;
  }

  private takeBack(): void {
    const r = this.local;
    if (this.src && this.round?.phase === 'pick' && !this.watching && !this.busy) return this.ask(this.src.leave());
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
    if (this.watching) return;
    if (r.phase === 'pick') this.pickBox(i);
    else if (r.phase === 'open') this.openBox(i);
  }

  private pickBox(i: number): void {
    if (this.src) return void (!this.busy && this.ask(this.src.pick(i)));
    const r = this.local;
    if (!r) return;
    this.handle(r.pick(i));
  }

  private openBox(i: number): void {
    if (this.src) return void (!this.busy && this.ask(this.src.open(i)));
    const r = this.local;
    if (!r) return;
    this.handle(r.open(i));
  }

  private answer(deal: boolean): void {
    const r = this.round;
    if (this.closed || !r || r.phase !== 'call' || this.ringing || this.watching) return;
    if (this.src) return void (!this.busy && this.ask(this.src.answer(deal)));
    const l = this.local;
    if (!l) return;
    this.handle(l.answer(deal));
    if (l.outcome) this.finish();
  }

  private final(swap: boolean): void {
    const r = this.round;
    if (this.closed || !r || r.phase !== 'swap' || this.watching) return;
    if (this.src) return void (!this.busy && this.ask(this.src.swap(swap)));
    const l = this.local;
    if (!l) return;
    this.handle(l.swap(swap));
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
          setText(this.status, this.watching ? `${this.watchName} is keeping box ${e.box + 1}.` : `You’re keeping box ${e.box + 1}. Open ${ROUNDS[0]} of the others.`);
          break;
        case 'opened':
          this.opened(e);
          break;
        case 'offer':
          this.startCall(e.offer);
          break;
        case 'declined':
          setText(this.status, this.watching ? 'No deal.' : r.toOpen > 0 ? `No deal. Open ${r.toOpen} more.` : 'No deal. Two boxes left.');
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
    if (this.watching) setText(this.status, `Box ${n} had ${mx(p)}.`);
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
    this.finished = true;
    this.ringing = false;
    const dealt = o.how === 'deal' || o.how === 'left-offer';
    const who = this.watching ? this.watchName : 'You';
    if (o.how === 'refund') {
      // Walked away before picking a box: the bet comes back and there is nothing to open.
      this.payPending();
      this.stage = 2;
      setText(this.status, this.watching ? `${who} took the bet back.` : 'Bet taken back.');
      this.setFace('meh', 'Chicken.');
      this.sync();
      return;
    }
    if (dealt) {
      this.payPending();
      sfx.kaching();
      buzz.success();
      setText(this.status, this.watching ? `Deal! ${who} took ${x2(o.mult)}.` : `Deal! ${x2(o.mult)}: ${fmt(this.paid)} coins.`);
      this.setFace('eat', this.watching ? 'Deal! …Now let’s see what was in their box.' : 'Deal! …Now let’s see what was in your box.');
    } else {
      setText(this.status, `Opening box ${(o.box ?? 0) + 1}…`);
      this.setFace('shock', o.how === 'swap' ? `${who === 'You' ? 'You' : who} swapped. Bold. Let’s look.` : `${who === 'You' ? 'You' : who} kept it. Drumroll. Somebody drum.`);
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
    if (this.src) {
      // The server paid it already. Ours to do: let the coins show (they were held back so the box wasn't given away), and keep count.
      this.paid = o.how === 'refund' ? this.bet : Math.floor(this.bet * Math.max(0, o.mult));
      if (!this.watching) {
        this.src.release();
        if (o.how === 'refund') {
          this.ledger.session.rounds -= 1;
          this.ledger.session.net += this.bet;
        } else this.ledger.session.net += this.paid;
      }
      return;
    }
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
    const watching = this.watching;
    const playing = r !== null && phase !== 'done' && !watching;
    this.syncCoins(s.coins);
    this.picker.lock(playing);
    this.picker.el.hidden = watching;

    // What can be tapped.
    this.boxes.forEach((b, i) => {
      const can = r !== null && !watching && (phase === 'pick' || phase === 'open') && r.mine !== i && !r.isOpen(i);
      const look = this.lookOf(i);
      const label = look.prize !== null ? `open, ${look.prize}` : look.mine ? 'yours, shut' : 'shut';
      b.btn.setAttribute('aria-label', `Box ${i + 1}, ${label}`);
      b.btn.setAttribute('aria-disabled', String(!can));
      b.btn.classList.toggle('can', can);
    });
    this.drawBoxes();

    // The prize boards cross off what's been seen.
    const seen = this.boxes.flatMap((_, i) => {
      const p = r?.prizeAt(i) ?? null;
      return this.lookOf(i).prize !== null && p !== null ? [p] : [];
    });
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
    this.callOffer.hidden = this.callLine.hidden = !(call && this.offerShown);
    // Someone watching sees the call, but the buttons are the player's.
    this.dealBtn.hidden = this.keepBtn.hidden = !(call && this.offerShown) || watching;
    if (call) {
      const offer = r?.offer ?? 0;
      setText(this.callTitle, this.ringing ? 'is calling…' : 'is on the line');
      setText(this.callLine, `“${this.moss}”`);
      setText(this.callOffer, `Offer: ${fmt(Math.floor(this.bet * offer))} coins (${x2(offer)} ${watching ? 'the bet' : 'your bet'})`);
      setText(this.dealBtn, `Deal · ${fmt(Math.floor(this.bet * offer))}`);
      setText(this.keepBtn, r && r.round === ROUNDS.length - 1 ? 'No deal · swap?' : 'Keep going');
    }
    const swap = phase === 'swap' && r !== null;
    this.finalEl.hidden = !swap;
    if (swap && r) {
      const last = r.lastBox;
      this.keepBox.hidden = this.swapBox.hidden = watching;
      setText(this.finalTitle, `Two boxes left. ${watching ? 'Theirs' : 'Yours'} is ${(r.mine ?? 0) + 1}. The other is ${(last ?? 0) + 1}.`);
      setText(this.keepBox, `Keep box ${(r.mine ?? 0) + 1}`);
      setText(this.swapBox, `Swap for box ${(last ?? 0) + 1}`);
    }
    this.go.hidden = playing || watching;
    setText(this.go, phase === 'done' ? `Bet ${fmt(this.picker.amount)} again` : `Bet ${fmt(this.picker.amount)}`);
    setDisabled(this.go, !isAlive(s) || !this.picker.affordable || (this.src !== undefined && (this.busy || !this.src.online())));
    this.take.hidden = phase !== 'pick' || watching;
    setText(this.take, `Take back ${fmt(this.bet)}`);
    this.random.hidden = phase !== 'open' || watching;
    if (this.src) this.syncOnline(this.src, r);

    const o = r?.outcome;
    this.result.hidden = !(phase === 'done' && o);
    if (phase === 'done' && o) setText(this.result, this.resultText(o));

    setText(
      this.hint,
      watching && r
        ? phase === 'done'
          ? `${this.watchName}’s round is over.`
          : `Watching ${this.watchName}: round ${r.round + 1} of ${ROUNDS.length}.`
        : !r
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

  /** The parts only an online screen has: the fairness line, the watcher's bar and reactions, and the list of other rounds. */
  private syncOnline(src: DealSource, r: Board | null): void {
    const live = this.watching;
    this.fairEl.hidden = !this.tableId;
    if (this.tableId) setText(this.fairEl, src.fairOf(this.tableId));
    this.watchBar.hidden = !live;
    if (live) setText(this.watchWho, `Watching ${this.watchName}`);
    // Reactions: for someone watching a round that is still on. Nothing to type, a few words only.
    const cooling = Date.now() - this.lastReact < REACT_GAP_MS;
    this.reactEl.hidden = !live || r?.phase === 'done';
    for (const b of this.reactBtns) setDisabled(b, cooling || !src.online());
    this.feedEl.hidden = this.feed.length === 0;
    const feedSig = this.feed.map((f) => `${f.name}:${f.text}`).join('|');
    if (this.feedEl.dataset.sig !== feedSig) {
      this.feedEl.dataset.sig = feedSig;
      this.feedEl.replaceChildren(...this.feed.map((f) => h('li', null, h('b', null, f.name), ` ${f.text}`)));
    }
    // Other people's rounds, when you aren't in one yourself.
    const show = !live && (r === null || r.phase === 'done');
    this.watchEl.hidden = !show;
    if (!show) return;
    const others = src.live().filter((t) => t.who !== src.me);
    const sig = others.map((t) => `${t.id}:${t.phase}:${t.opened.length}`).join('|');
    if (sig === this.listSig) return;
    this.listSig = sig;
    this.watchNone.hidden = others.length > 0;
    this.watchList.replaceChildren(
      ...others.map((t) =>
        h(
          'li',
          null,
          h(
            'button',
            { class: 'deal-watch-row', type: 'button', onclick: () => this.watch(t.id) },
            h('span', { class: 'deal-watch-who' }, `${t.emoji} ${t.name}`),
            h('span', { class: 'deal-watch-bet' }, `${fmt(t.bet)} on it`),
            h('span', { class: 'deal-watch-state' }, t.phase === 'pick' ? 'choosing a box' : t.phase === 'call' ? 'Dr. Moss is calling' : t.phase === 'swap' ? 'last choice' : t.opened.length === 0 ? 'keeping a box' : `${t.opened.length} ${t.opened.length === 1 ? 'box' : 'boxes'} open`),
          ),
        ),
      ),
    );
  }

  private resultText(o: DealOutcome): string {
    const mine = (o.box ?? 0) + 1;
    const own = this.watching ? 'Their' : 'Your';
    const reveal = this.stage >= 1;
    const pay = this.pending ? '' : ` ${fmt(this.paid)} coins back for ${fmt(this.bet)}.`;
    switch (o.how) {
      case 'deal':
      case 'left-offer':
        return `Deal at ${x2(o.mult)}.${pay}${reveal ? ` ${own} box ${mine} had ${mx(o.boxPrize ?? 0)}.` : ''}`;
      case 'swap':
        return reveal ? `Swapped to box ${mine}: ${mx(o.mult)}.${pay} The one ${this.watching ? 'they' : 'you'} gave up had ${mx(o.otherPrize ?? 0)}.` : `Swapped to box ${mine}…`;
      case 'keep':
      case 'left-box':
        return reveal ? `Kept box ${mine}: ${mx(o.mult)}.${pay}${o.otherPrize === null ? '' : ` The other had ${mx(o.otherPrize)}.`}` : `Kept box ${mine}…`;
      case 'refund':
        return 'The bet came back.';
      default:
        return '';
    }
  }
}
