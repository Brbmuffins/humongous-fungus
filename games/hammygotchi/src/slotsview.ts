// The Hammy Slots screen: five reels spinning, the winning lines drawing
// themselves across them as glowing zig-zags, and the multiplier orb
// pinballing round the grid. The rules (and everything the orb will do) are
// decided in slots.ts the moment you spin; this only plays them back, as a
// timeline that can be skipped. Your coins go through arcadeview.ts.
import './slots.css';
import { h, setDisabled, setText } from '@shared/dom';
import { fmt } from '@shared/format';
import { BetPicker, Choice, DISPLAY_FONT, Ledger, UI_FONT, arcadeCard, fairRoll, fitCanvas, loud, pick, x2, type ArcadeHost, type ArcadeScreen, type ArcadeSession } from './arcadeview';
import { isAlive } from './alive';
import { defaultLook, drawHammy, type Face } from './hammy';
import { buzz } from './haptics';
import {
  LINES,
  LINE_COUNT,
  MAX_WIN,
  REELS,
  ROWS,
  SLOTS_BIG,
  tierOf,
  SLOTS_BROKE,
  SLOTS_DRY,
  SLOTS_NEAR,
  SLOTS_ORB,
  SLOTS_SNEEZE,
  SLOTS_START,
  SLOTS_WIN,
  STRIPS,
  SYMBOLS,
  isNearMiss,
  payMultiplier,
  spin as rollSpin,
  type LineWin,
  type Roll,
  type SlotSpin,
  type SlotSymbol,
} from './slots';
import { Sprites, TILE, drawSymbol } from './slotsart';
import { sfx } from './sound';

// Test hook ------------------------------------------------------------------
// Only in a build made with VITE_SLOTS_TEST=1 (the browser smoke test): the
// address ?slots-seeds=3,17,2 makes spin 1, 2, 3… come from those seeds (then
// round again), so a screenshot can be taken of a particular spin. A normal
// build never contains this; `TEST` is a constant false there.
const TEST = import.meta.env.VITE_SLOTS_TEST === '1';

function mulberry32(seed: number): Roll {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** The roll for the nth spin: the browser's crypto numbers, or in a test build a seeded stream. */
function rollFor(n: number): Roll {
  if (TEST) {
    const seeds = (new URLSearchParams(location.search).get('slots-seeds') ?? '').split(',').map(Number).filter(Number.isFinite);
    if (seeds.length) return mulberry32(seeds[n % seeds.length]);
  }
  return fairRoll;
}

// What survives between sittings while the page is open (not saved) -----------
const prefs = { turbo: false };
const history: number[] = [];
let spinsThisPage = 0;

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A win at least this big stops an auto-spin. */
const AUTO_STOP_AT = 20;
/**
 * Hammy's speech bubble, wrapped to fit the space between him and the readout
 * (`left` to `right`, centred on `midY`, no taller than `maxH`). It shrinks the
 * writing before it would ever run into either neighbour.
 */
function wrappedBubble(c: CanvasRenderingContext2D, text: string, left: number, right: number, midY: number, maxH: number): void {
  const room = Math.max(40, right - left);
  for (let size = 14; size >= 8; size -= 1) {
    c.font = `700 ${size}px ${UI_FONT}`;
    const pad = size * 0.6;
    const lines: string[] = [];
    let cur = '';
    for (const word of text.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && c.measureText(next).width > room - pad * 2) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    lines.push(cur);
    const lh = size * 1.2;
    const bh = lines.length * lh + pad * 1.1;
    const bw = Math.max(...lines.map((l) => c.measureText(l).width)) + pad * 2;
    if (size > 8 && (bh > maxH || bw > room)) continue;
    const bx = left;
    const by = midY - bh / 2;
    c.fillStyle = '#fffaf0';
    c.strokeStyle = '#2b1400';
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(bx, by, Math.min(bw, room), bh, Math.min(bh / 2, size * 1.1));
    c.fill();
    c.stroke();
    c.fillStyle = '#2b1400';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    lines.forEach((l, i) => c.fillText(l, bx + pad, by + pad * 0.55 + lh * (i + 0.5) + 1));
    return;
  }
}
const AUTO_OPTIONS = [0, 10, 25, 50] as const;
const TAU = Math.PI * 2;

const STRIP_IDS: SlotSymbol[][] = STRIPS.map((s) => Array.from(s, (ch) => SYMBOLS.find((d) => d.ch === ch)!.id));
const mod = (n: number, m: number): number => ((n % m) + m) % m;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const lineColor = (i: number, l = 62): string => `hsl(${(i * 47 + 20) % 360} 92% ${l}%)`;
const easeOut = (x: number): number => 1 - (1 - x) ** 3;

// The playback timeline -------------------------------------------------------

interface BallRun {
  /** Seconds in the spin when the ball shows up, and when it lands on each cell. */
  t0: number;
  hitAt: number[];
  flight: number;
}

interface Timeline {
  /** When each reel lands. */
  reelStop: number[];
  reelsEnd: number;
  /** Each winning line's window, in the order they play. */
  lines: { win: LineWin; t0: number; t1: number }[];
  linesEnd: number;
  orb: { t0: number; balls: BallRun[]; t1: number } | null;
  end: number;
}

function buildTimeline(sp: SlotSpin, k: number): Timeline {
  // Reels land left to right; after an orb has landed the next reels hang back a moment.
  const reelStop: number[] = [];
  let t = 0.75 * k;
  let seenOrb = false;
  for (let r = 0; r < REELS; r++) {
    if (seenOrb && r <= 3) t += 0.4 * k;
    reelStop.push(t);
    t += 0.27 * k;
    if (sp.grid[r].includes('orb')) seenOrb = true;
  }
  const reelsEnd = reelStop[REELS - 1] + 0.3;
  const order = [...sp.wins].sort((a, b) => a.units - b.units);
  const dur = (order.length <= 3 ? 1.05 : order.length <= 8 ? 0.7 : 0.45) * k;
  const lines: Timeline['lines'] = [];
  let cur = reelsEnd + 0.2 * k;
  for (const win of order) {
    lines.push({ win, t0: cur, t1: cur + dur });
    cur += dur + 0.1 * k;
  }
  const linesEnd = cur;
  let orb: Timeline['orb'] = null;
  if (sp.feature) {
    const t0 = cur + 0.35 * k;
    let at = t0 + 0.9 * k;
    const flight = 0.38 * k;
    const balls: BallRun[] = [];
    for (const ball of sp.feature.balls) {
      const hitAt = ball.hits.map((_, i) => at + 0.25 * k + (i + 1) * flight);
      balls.push({ t0: at, hitAt, flight });
      at = hitAt[hitAt.length - 1] + 0.3 * k;
    }
    orb = { t0, balls, t1: at };
    cur = at;
  }
  return { reelStop, reelsEnd, lines, linesEnd, orb, end: cur + 0.7 * k };
}

interface Run {
  bet: number;
  sp: SlotSpin;
  tl: Timeline;
  start: number;
  /** Seconds skipped ahead. */
  skip: number;
  paid: boolean;
  done: boolean;
  /** Each reel's starting distance from where it will stop, in cells. */
  y0: number[];
  cues: { t: number; f: () => void; always?: boolean }[];
  cue: number;
}

interface Floater {
  text: string;
  x: number;
  y: number;
  born: number;
  color: string;
  size: number;
}
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  life: number;
  color: string;
}

const EASE_T = 0.32;
const EASE_D = 2.4;

/** How far a reel still has to go, in cells, `e` seconds into the spin. */
function reelY(y0: number, stopAt: number, e: number): number {
  if (e >= stopAt) {
    const d = e - stopAt;
    return d < 0.24 ? -0.1 * Math.sin((d / 0.24) * Math.PI) : 0;
  }
  const tau = stopAt - e;
  if (tau <= EASE_T) return EASE_D * (tau / EASE_T) ** 2;
  return EASE_D + ((y0 - EASE_D) / (stopAt - EASE_T)) * (tau - EASE_T);
}

export class SlotsApp implements ArcadeScreen {
  readonly card: HTMLElement;
  private ledger: Ledger;
  private picker: BetPicker;
  private syncCoins: (coins: number) => void;
  private autoChoice: Choice<number>;
  private sprites = new Sprites(() => Math.min(2, window.devicePixelRatio || 1));
  private run: Run | null = null;
  /** Where each reel rests. */
  private rest: number[] = STRIPS.map((s) => Math.floor(Math.random() * s.length));
  private autoLeft = 0;
  private autoPick = 0;
  private autoTimer = 0;
  private dry = 0;
  private bubbleLine: { text: string; until: number } | null = null;
  private floaters: Floater[] = [];
  private bits: Bit[] = [];
  private shake = { amp: 0, at: 0 };
  private lastFrame = 0;
  private face: { face: Face; until: number } | null = null;
  private raf = 0;
  private closed = false;
  private lastSp: SlotSpin | null = null;
  /** What the banner shows when nothing's happening: the last result. */
  private resting = 0;
  private linesOpen = false;

  private canvas = h('canvas', { class: 'slots-machine', role: 'img', 'aria-label': 'Hammy Slots: five reels, three rows' });
  private historyEl = h('ol', { class: 'arcade-history', 'aria-label': 'The last spins' });
  private status = h('p', { class: 'arcade-status', 'aria-live': 'polite' });
  private go = h('button', { class: 'btn btn-cheese arcade-go slots-go', type: 'button' });
  private turboBtn = h('button', { class: 'arcade-opt slots-turbo', type: 'button', 'aria-pressed': String(prefs.turbo), title: 'Shorter animations' }, '⚡ Turbo');
  private linesBtn = h('button', { class: 'arcade-opt slots-lines-btn', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'slots-lines' }, 'Lines');
  private linesCanvas = h('canvas', { class: 'slots-lines-canvas', role: 'img', 'aria-label': 'The twenty paylines' });
  private paytable = h('ul', { class: 'slots-pays' });
  private linesPanel = h('div', { class: 'slots-lines', id: 'slots-lines', hidden: true }, this.linesCanvas, this.paytable);

  constructor(
    private host: ArcadeHost,
    close: () => void,
  ) {
    this.ledger = new Ledger(host, 'slots');
    this.picker = new BetPicker(() => host.state.coins);
    this.autoChoice = new Choice<number>(
      'Auto',
      AUTO_OPTIONS.map((n) => ({ value: n, label: n ? String(n) : 'Off' })),
      () => this.autoPick,
      (n) => this.setAuto(n),
    );
    this.go.addEventListener('click', () => this.press());
    this.canvas.addEventListener('click', () => this.skip());
    this.turboBtn.addEventListener('click', () => {
      prefs.turbo = !prefs.turbo;
      this.turboBtn.setAttribute('aria-pressed', String(prefs.turbo));
    });
    this.linesBtn.addEventListener('click', () => this.toggleLines());
    const row = h('div', { class: 'arcade-row slots-opts' }, this.autoChoice.el, this.turboBtn, this.linesBtn);
    const { card, syncCoins } = arcadeCard('slots', close, this.historyEl, this.canvas, this.status, this.go, row, this.linesPanel, this.picker.el);
    this.card = card;
    this.syncCoins = syncCoins;
    this.card.addEventListener('keydown', (e) => {
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        this.press();
      }
    });
    this.buildPaytable();
    setText(this.status, SLOTS_START);
    this.renderHistory();
    this.raf = requestAnimationFrame(this.frame);
  }

  get focus(): HTMLElement {
    return this.go;
  }

  close(): ArcadeSession {
    if (this.closed) return this.ledger.session;
    this.closed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.autoTimer);
    // A spin was decided when you pressed the button: leaving pays what it came to.
    const r = this.run;
    if (r && !r.paid) {
      r.paid = true;
      this.ledger.pay(r.bet, payMultiplier(r.bet, r.sp.units));
    }
    return this.ledger.session;
  }

  // Buttons ---------------------------------------------------------------------

  private get busy(): boolean {
    return !!this.run && !this.run.done;
  }

  /** The big button: spin, or hurry the spin along, or stop the auto-spins. */
  private press(): void {
    if (this.closed) return;
    if (this.autoLeft > 0 || this.autoPick > 0) {
      this.setAuto(0);
      return;
    }
    if (this.busy) this.skip();
    else this.spin();
  }

  private setAuto(n: number): void {
    this.autoPick = n;
    this.autoLeft = n;
    clearTimeout(this.autoTimer);
    this.autoChoice.sync();
    if (n && !this.busy) this.spin();
  }

  /** Jump the playback ahead: to the reels landing, then to the end. */
  private skip(): void {
    const r = this.run;
    if (!r || r.done) return;
    const e = this.elapsed(performance.now());
    const to = e < r.tl.reelsEnd - 0.01 ? r.tl.reelsEnd : r.tl.end;
    r.skip += to - e;
  }

  private toggleLines(): void {
    this.linesOpen = !this.linesOpen;
    this.linesPanel.hidden = !this.linesOpen;
    this.linesBtn.setAttribute('aria-expanded', String(this.linesOpen));
    this.linesBtn.setAttribute('aria-pressed', String(this.linesOpen));
    if (this.linesOpen) requestAnimationFrame(() => this.drawLinesPanel());
  }

  // A spin ------------------------------------------------------------------------

  private spin(): void {
    if (this.closed || this.busy) return;
    const amount = this.ledger.bet(this.picker.amount);
    if (!amount) {
      this.setAuto(0);
      setText(this.status, isAlive(this.host.state) ? 'Not enough coins for that bet.' : 'Hammy is dead. The machine is unplugged.');
      return;
    }
    const sp = rollSpin(rollFor(spinsThisPage++));
    const k = prefs.turbo ? 0.45 : 1;
    const tl = buildTimeline(sp, k);
    const prev = this.rest;
    const y0 = sp.stops.map((stop, r) => {
      const len = STRIPS[r].length;
      // Start from where the reel was resting, at roughly 16 cells a second whichever way round it has to go.
      const base = mod(prev[r] - stop, len);
      const want = 16 * tl.reelStop[r] + EASE_D;
      return base < want ? base + Math.ceil((want - base) / len) * len : base;
    });
    const run: Run = { bet: amount, sp, tl, start: performance.now(), skip: 0, paid: false, done: false, y0, cues: [], cue: 0 };
    run.cues = this.cuesFor(run);
    this.run = run;
    this.lastSp = sp;
    this.rest = sp.stops;
    this.floaters = [];
    this.bits = [];
    this.picker.lock(true);
    setText(this.status, '');
    this.face = null;
    sfx.send();
  }

  private elapsed(now: number): number {
    const r = this.run;
    return r ? (now - r.start) / 1000 + r.skip : 0;
  }

  /** Everything that makes a noise or a remark during a spin, and when. */
  private cuesFor(run: Run): Run['cues'] {
    const { sp, tl } = run;
    const cues: Run['cues'] = [];
    const at = (t: number, f: () => void, always = false) => cues.push({ t, f, always });
    tl.reelStop.forEach((t, r) => {
      at(t, () => {
        sfx.bonk();
        if (sp.grid[r].includes('orb')) {
          sfx.ding();
          this.shakeBy(3);
        }
      });
    });
    const nearMiss = isNearMiss(sp);
    if (nearMiss) at(tl.reelsEnd, () => Math.random() < 0.6 && this.say(pick(SLOTS_NEAR), 1800));
    tl.lines.forEach((l, i) => {
      at(l.t0, () => setText(this.status, `${l.win.count} × ${symbolName(l.win.symbol)} on the ${LINES[l.win.line].name} line`), true);
      if (sp.mult >= 1) at(l.t0 + 0.25, () => (l.win.mult >= 1 ? sfx.ding() : sfx.coin()));
      if (i === tl.lines.length - 1 && l.win.mult >= 5) at(l.t1 - 0.2, () => this.shakeBy(Math.min(10, 3 + l.win.mult / 5)));
    });
    if (tl.orb && sp.feature) {
      const o = tl.orb;
      at(o.t0, () => {
        this.shakeBy(9);
        sfx.alarm();
        this.setFace('shock', 1.2);
        this.say(sp.sneeze && !sp.orbs ? pick(SLOTS_SNEEZE) : pick(SLOTS_ORB), 1900);
        if (sp.sneeze && !sp.orbs) sfx.poof();
      });
      sp.feature.balls.forEach((ball, b) => {
        at(o.balls[b].t0 + 0.2, () => sfx.whoosh());
        ball.hits.forEach((hit, i) => {
          at(o.balls[b].hitAt[i], () => {
            if (hit.op === 'mul') {
              sfx.pow();
              this.shakeBy(6 + hit.value);
              buzz.fart(0.6);
            } else {
              sfx.boing();
              this.shakeBy(3);
              buzz.tap();
            }
            const c = this.cell(hit.reel, hit.row);
            this.floaters.push({
              text: hit.op === 'mul' ? `×${hit.value}` : `+${hit.value}×`,
              x: c.x,
              y: c.y,
              born: performance.now(),
              color: hit.op === 'mul' ? '#ff7bd5' : '#7be8ff',
              size: Math.max(14, c.cs * (hit.op === 'mul' ? 0.52 : 0.42)),
            });
            this.burst(c.x, c.y, hit.op === 'mul' ? 14 : 6, hit.op === 'mul' ? '#ff7bd5' : '#7be8ff');
          });
        });
      });
    }
    at(
      tl.end - 0.4,
      () => {
        const m = sp.mult;
        const tier = tierOf(m);
        const W = this.lay();
        if (tier && tier.min >= 10) {
          // BIG 10x, HUGE 50x, HAMMY 250x: each a notch louder.
          const notch = tier.min >= 250 ? 2 : tier.min >= 50 ? 1 : 0;
          sfx.kaching();
          sfx.fart(1.1 + notch * 0.2);
          buzz.success();
          this.shakeBy(10 + notch * 4);
          this.burst(W.W / 2, W.y0 + W.winH / 2, 30 + notch * 35, tier.color, true);
          if (notch >= 1) window.setTimeout(() => this.burst(W.W / 2, W.y0 + W.winH * 0.3, 40, '#ffffff', true), 350);
          this.setFace('joy', 2 + notch);
          this.say(notch >= 1 ? pick(SLOTS_BIG) : pick(SLOTS_WIN), 2400);
        } else if (tier) {
          sfx.kaching();
          this.setFace('joy', 1.2);
          if (Math.random() < 0.6) this.say(pick(SLOTS_WIN), 1800);
        } else if (m > 0) {
          // Under the bet: a little of it back, said quietly. No jingle, no shake, no cheering.
          this.dry = 0;
          return;
        } else {
          this.dry++;
          if (this.dry >= 3 && Math.random() < 0.7) {
            this.say(pick(SLOTS_DRY), 2000);
            this.setFace('sad', 1.4);
            sfx.plop();
          }
        }
        if (m > 0) this.dry = 0;
      },
      true,
    );
    return cues;
  }

  /** The end of a spin: pay it, note it, carry on with the auto-spins. */
  private finish(r: Run): void {
    r.done = true;
    const mult = r.sp.mult;
    const won = r.paid ? 0 : this.ledger.pay(r.bet, payMultiplier(r.bet, r.sp.units));
    r.paid = true;
    history.unshift(mult);
    if (history.length > 14) history.pop();
    this.renderHistory();
    this.resting = mult;
    const up = won - r.bet;
    if (r.sp.feature) {
      const f = r.sp.feature;
      setText(this.status, `The orb took ${x2(f.base)} to ${x2(mult)}: ${fmt(won)} back for ${fmt(r.bet)}${r.sp.capped ? ' (the top win, which is as high as it goes)' : ''}.`);
    } else if (won > 0 && mult < 1) {
      setText(this.status, `${fmt(won)} back for ${fmt(r.bet)}.`);
    } else if (won > 0) {
      setText(this.status, `${r.sp.wins.length} ${r.sp.wins.length === 1 ? 'line' : 'lines'} paid ${x2(mult)}: ${fmt(won)} back for ${fmt(r.bet)}.`);
    } else {
      setText(this.status, `Nothing this time. ${fmt(r.bet)} gone.`);
    }
    this.picker.lock(false);
    if (this.host.state.coins < this.picker.amount && this.host.state.coins < 1) {
      this.say(pick(SLOTS_BROKE), 3000);
      sfx.sad();
    }
    if (up >= 0 && mult >= AUTO_STOP_AT && (this.autoLeft > 0 || this.autoPick > 0)) {
      this.setAuto(0);
      setText(this.status, `Big one: ${x2(mult)}, ${fmt(won)} back. Auto-spin stopped so you can enjoy it.`);
      return;
    }
    if (this.autoLeft > 0) {
      this.autoLeft -= 1;
      if (this.autoLeft <= 0 || !isAlive(this.host.state) || this.host.state.coins < this.picker.amount) {
        this.setAuto(0);
        if (this.host.state.coins < this.picker.amount) setText(this.status, `${this.status.textContent} Out of coins for that bet, so the auto-spins stopped.`);
      } else {
        this.autoTimer = window.setTimeout(() => this.spin(), prefs.turbo ? 250 : 700);
      }
    }
  }

  private say(text: string, ms: number): void {
    this.bubbleLine = { text, until: performance.now() + ms };
  }

  private setFace(face: Face, seconds: number): void {
    this.face = { face, until: performance.now() + seconds * 1000 };
  }

  private shakeBy(amp: number): void {
    if (reduceMotion) return;
    this.shake = { amp: Math.max(this.shake.amp * 0.6, amp), at: performance.now() };
    if (amp >= 8) {
      this.card.classList.remove('slots-shake');
      void this.card.offsetWidth;
      this.card.classList.add('slots-shake');
    }
  }

  private burst(x: number, y: number, n: number, color: string, coins = false): void {
    if (reduceMotion) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = (coins ? 160 : 90) + Math.random() * (coins ? 260 : 120);
      this.bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (coins ? 220 : 40), rot: Math.random() * TAU, life: 0.8 + Math.random() * 0.8, color });
    }
    if (this.bits.length > 140) this.bits.splice(0, this.bits.length - 140);
  }

  private renderHistory(): void {
    this.historyEl.replaceChildren(...history.map((m) => h('li', { class: m >= 10 ? 'hi' : m >= 1 ? 'mid' : 'lo' }, m ? x2(m) : '0×')));
    if (!history.length) this.historyEl.append(h('li', { class: 'none' }, 'Nothing spun yet'));
  }

  // Each frame ------------------------------------------------------------------

  private frame = (now: number): void => {
    if (this.closed) return;
    const dt = Math.min(0.05, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    const r = this.run;
    if (r && !r.done) {
      const e = this.elapsed(now);
      while (r.cue < r.cues.length && r.cues[r.cue].t <= e) {
        const cue = r.cues[r.cue++];
        // Skipped sounds stay skipped, but the ending always plays.
        if (e - cue.t < 0.25 || cue.always) cue.f();
      }
      if (e >= r.tl.end) this.finish(r);
    }
    this.step(dt, now);
    this.draw(now);
    this.sync();
    this.raf = requestAnimationFrame(this.frame);
  };

  private step(dt: number, now: number): void {
    for (const b of this.bits) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += 620 * dt;
      b.life -= dt;
    }
    this.bits = this.bits.filter((b) => b.life > 0);
    this.floaters = this.floaters.filter((f) => now - f.born < 1100);
  }

  private sync(): void {
    const s = this.host.state;
    this.syncCoins(s.coins);
    const auto = this.autoPick > 0;
    setText(this.go, auto ? `Stop auto · ${this.autoLeft} left` : this.busy ? 'Skip' : `Spin · ${fmt(this.picker.amount)} ${this.picker.amount === 1 ? 'coin' : 'coins'}`);
    this.go.classList.toggle('bail', auto);
    setDisabled(this.go, !auto && !this.busy && (!isAlive(s) || !this.picker.affordable));
  }

  /** The grid's geometry for a canvas of this size. */
  private lay(): { W: number; H: number; cs: number; gap: number; x0: number; y0: number; winH: number; top: number } {
    const W = this.canvas.clientWidth || 360;
    const H = this.canvas.clientHeight || 320;
    const gap = Math.max(3, W * 0.011);
    const m = W * 0.045;
    const topMin = Math.max(H * 0.22, 64);
    const cs = Math.min((W - 2 * m - 4 * gap) / REELS, (H - topMin - m * 0.6 - 2 * gap) / ROWS);
    const winH = ROWS * cs + (ROWS - 1) * gap;
    const x0 = (W - (REELS * cs + (REELS - 1) * gap)) / 2;
    const y0 = H - winH - m * 0.6;
    return { W, H, cs, gap, x0, y0, winH, top: y0 };
  }

  /** The middle of a cell. */
  private cell(reel: number, row: number): { x: number; y: number; cs: number } {
    const L = this.lay();
    return { x: L.x0 + reel * (L.cs + L.gap) + L.cs / 2, y: L.y0 + row * (L.cs + L.gap) + L.cs / 2, cs: L.cs };
  }

  /** What the banner counts at `e` seconds in: lines drawn so far, then the orb's running total. */
  private valueAt(r: Run, e: number): number {
    const { tl, sp } = r;
    if (e >= tl.end - 0.7) return sp.mult;
    let v = 0;
    for (const l of tl.lines) {
      if (e >= l.t1) v += l.win.mult;
      else if (e > l.t0) {
        v += l.win.mult * easeOut(clamp01((e - l.t0) / ((l.t1 - l.t0) * 0.7)));
        return v;
      }
    }
    if (tl.orb && sp.feature) {
      let prev = sp.lines;
      v = prev;
      sp.feature.balls.forEach((ball, b) => {
        ball.hits.forEach((hit, i) => {
          const at = tl.orb!.balls[b].hitAt[i];
          if (e >= at) {
            const f = easeOut(clamp01((e - at) / 0.3));
            v = prev + (hit.after - prev) * f;
            if (f >= 1) prev = hit.after;
          }
        });
      });
    }
    return v;
  }

  private draw(now: number): void {
    const fit = fitCanvas(this.canvas);
    if (!fit) return;
    const { c, W, H } = fit;
    const L = this.lay();
    const t = now / 1000;
    const r = this.run;
    const e = r && !r.done ? this.elapsed(now) : r ? r.tl.end + 1 : 0;
    const live = !!r && !r.done;
    const { tl } = r ?? { tl: null };
    const orbOn = live && !!tl?.orb && e >= tl.orb.t0 - 0.05 && e < tl.orb.t1 + 0.4;

    // Background.
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, orbOn ? '#1a0d3a' : '#2a1d40');
    g.addColorStop(1, '#0e0818');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // Screen shake.
    const since = (now - this.shake.at) / 1000;
    const amp = this.shake.amp * Math.max(0, 1 - since / 0.5);
    c.save();
    if (amp > 0.2) c.translate(Math.sin(t * 91) * amp, Math.cos(t * 83) * amp);

    this.drawTop(c, L, now, r, e, live, orbOn);

    // The frame round the reels.
    const pad = L.gap + 2;
    const fw = REELS * L.cs + (REELS - 1) * L.gap;
    const fg = c.createLinearGradient(0, L.y0, 0, L.y0 + L.winH);
    fg.addColorStop(0, '#ffd34d');
    fg.addColorStop(1, '#c4761a');
    c.fillStyle = fg;
    c.beginPath();
    c.roundRect(L.x0 - pad - 2, L.y0 - pad - 2, fw + (pad + 2) * 2, L.winH + (pad + 2) * 2, 14);
    c.fill();
    c.fillStyle = '#120a22';
    c.beginPath();
    c.roundRect(L.x0 - pad, L.y0 - pad, fw + pad * 2, L.winH + pad * 2, 12);
    c.fill();

    // Lines currently drawing, for dimming everything else.
    const cur = live && tl ? tl.lines.find((l) => e >= l.t0 && e < l.t1 + 0.2) : undefined;
    const lit = new Set<string>();
    if (cur) for (const [a, b] of cur.win.cells) lit.add(`${a},${b}`);
    const finalGlow = !live && this.lastSp && this.lastSp.wins.length > 0;
    if (finalGlow) for (const w of this.lastSp!.wins) for (const [a, b] of w.cells) lit.add(`${a},${b}`);

    // Reels.
    const pitch = L.cs + L.gap;
    const hitPop = (reel: number, row: number): number => {
      let best = 0;
      if (live && r?.sp.feature && tl?.orb) {
        r.sp.feature.balls.forEach((ball, b) =>
          ball.hits.forEach((hit, i) => {
            if (hit.reel === reel && hit.row === row) {
              const d = e - tl.orb!.balls[b].hitAt[i];
              if (d >= 0 && d < 0.35) best = Math.max(best, Math.sin((d / 0.35) * Math.PI));
            }
          }),
        );
      }
      return best;
    };
    for (let reel = 0; reel < REELS; reel++) {
      const len = STRIPS[reel].length;
      let y = 0;
      if (live && r && tl) y = reelY(r.y0[reel], tl.reelStop[reel], e);
      const spinning = live && !!tl && e < tl.reelStop[reel] - 0.02;
      const p = this.rest[reel] + y;
      const rx = L.x0 + reel * pitch;
      c.save();
      c.beginPath();
      c.roundRect(rx, L.y0, L.cs, L.winH, 8);
      c.clip();
      for (let j = Math.floor(p) - 1; j <= Math.floor(p) + ROWS; j++) {
        const rowPos = j - p;
        const cy = L.y0 + rowPos * pitch + L.cs / 2;
        const id = STRIP_IDS[reel][mod(j, len)];
        const row = Math.round(rowPos);
        const settled = !spinning && row >= 0 && row < ROWS;
        const on = settled && lit.has(`${reel},${row}`);
        const dim = !!cur && settled && !on;
        const pop = settled ? hitPop(reel, row) : 0;
        c.save();
        c.translate(rx + L.cs / 2, cy);
        const sc = 1 + pop * 0.18 + (on ? 0.05 + Math.sin(t * 9) * 0.02 : 0);
        c.scale(sc, sc);
        c.globalAlpha = dim ? 0.38 : 1;
        this.tile(c, id, L.cs, on || pop > 0.1);
        if (id === 'orb') drawSymbol(c, id, 0, 0, L.cs, t);
        else c.drawImage(this.sprites.get(id, L.cs), -L.cs / 2, -L.cs / 2, L.cs, L.cs);
        c.restore();
      }
      if (spinning) {
        const sg = c.createLinearGradient(0, L.y0, 0, L.y0 + L.winH);
        sg.addColorStop(0, 'rgba(18,10,34,0.7)');
        sg.addColorStop(0.5, 'rgba(255,255,255,0.06)');
        sg.addColorStop(1, 'rgba(18,10,34,0.7)');
        c.fillStyle = sg;
        c.fillRect(rx, L.y0, L.cs, L.winH);
      }
      c.restore();
    }

    // The winning line drawing itself.
    if (cur && live) this.drawLine(c, L, cur, e, t, r.sp.mult < 1);

    // The orb.
    if (live && r && tl?.orb && r.sp.feature) this.drawOrb(c, L, r, e, t);

    // Pops of text and bits.
    for (const f of this.floaters) {
      const k = (now - f.born) / 1100;
      c.globalAlpha = Math.max(0, 1 - k * k);
      loud(c, f.text, f.x, f.y - k * L.cs * 0.7, f.size * (1 + Math.sin(Math.min(1, k * 4) * Math.PI) * 0.25), f.color);
      c.globalAlpha = 1;
    }
    for (const b of this.bits) {
      c.globalAlpha = clamp01(b.life * 1.5);
      c.fillStyle = b.color;
      c.save();
      c.translate(b.x, b.y);
      c.rotate(b.rot + b.life * 6);
      c.beginPath();
      c.ellipse(0, 0, Math.max(2, L.cs * 0.07), Math.max(2, L.cs * 0.07) * Math.abs(Math.cos(b.life * 9)), 0, 0, TAU);
      c.fill();
      c.restore();
    }
    c.globalAlpha = 1;
    c.restore();
  }

  /** The tile a symbol sits on. */
  private tile(c: CanvasRenderingContext2D, id: SlotSymbol, cs: number, lit: boolean): void {
    const [a, b] = TILE[id];
    const g = c.createLinearGradient(0, -cs / 2, 0, cs / 2);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    c.fillStyle = g;
    c.beginPath();
    c.roundRect(-cs / 2, -cs / 2, cs, cs, cs * 0.14);
    c.fill();
    c.strokeStyle = lit ? 'rgba(255, 244, 170, 0.95)' : 'rgba(255,255,255,0.14)';
    c.lineWidth = lit ? 2.5 : 1;
    c.stroke();
  }

  /** The strip above the reels, where Hammy and the readout are: its height, and where Hammy stands. */
  private topGeom(L: ReturnType<SlotsApp['lay']>): { Ta: number; hr: number; hx: number; hy: number } {
    const Ta = L.top - (L.gap + 6);
    const hr = Math.min(Ta * 0.34, L.W * 0.08);
    return { Ta, hr, hx: L.x0 + hr * 1.25, hy: Ta * 0.5 + hr * 0.1 };
  }

  /** Hammy, the speech bubble and the win readout above the reels. */
  private drawTop(c: CanvasRenderingContext2D, L: ReturnType<SlotsApp['lay']>, now: number, r: Run | null, e: number, live: boolean, orbOn: boolean): void {
    const s = this.host.state;
    const t = now / 1000;
    const { Ta, hr, hx, hy: hy0 } = this.topGeom(L);
    const look = defaultLook(s.fit, this.host.form);
    const f = this.face && now < this.face.until ? this.face.face : live && orbOn ? 'shock' : 'smug';
    look.face = f;
    look.blink = Math.sin(t * 1.3) > 0.985;
    look.green = Math.min(0.5, Math.max(0, (40 - s.fresh) / 80));
    look.armsUp = orbOn || f === 'joy';
    const hy = hy0 + Math.sin(t * 2.1) * (orbOn ? 3 : 1.2);
    // A sneeze: he squashes, then pops.
    if (live && r?.sp.sneeze && r.tl.orb && e > r.tl.orb.t0 - 0.5 && e < r.tl.orb.t0 + 0.4) {
      const before = e < r.tl.orb.t0;
      const k = clamp01((e - (r.tl.orb.t0 - 0.5)) / 0.5);
      look.sy = 1 - (before ? 0.18 * k : 0);
      look.sx = 1 + (before ? 0.1 * k : 0);
      look.face = before ? 'shock' : 'joy';
    }
    drawHammy(c, hx, hy, hr, look, t);

    // Three columns that never overlap: Hammy, his speech bubble, and the readout on the right.
    const gridW = REELS * L.cs + (REELS - 1) * L.gap;
    const right = L.x0 + gridW;
    const v = r ? (live ? this.valueAt(r, e) : this.resting) : 0;
    const showReadout = !!r && (v > 0 || live);
    const rw = gridW * 0.4;
    const rcx = right - rw / 2;
    const bubbleLeft = hx + hr * 1.2;
    const bubbleRight = showReadout ? right - rw - 6 : right;
    const speaking = !!this.bubbleLine && now < this.bubbleLine.until;
    if (speaking) wrappedBubble(c, this.bubbleLine!.text, bubbleLeft, bubbleRight, Ta * 0.5, Ta - 4);

    if (showReadout && r) {
      const quiet = r.sp.mult < 1 && !orbOn;
      const fit = (text: string, size: number) => Math.min(size, (rw - 4) / (text.length * 0.6));
      if (quiet && v <= 0) {
        // Nothing counted yet: leave the readout empty.
      } else if (quiet) {
        // Under the bet: a few coins back, shown small and neutral. Not a win.
        const coins = `${fmt(Math.floor(r.bet * v * 1.0000001))} back`;
        const size = fit(coins, Math.max(14, Math.min(22, Ta * 0.26)));
        loud(c, coins, rcx, Ta * 0.5 - size * 0.2, size, '#cbc5dc', UI_FONT);
        c.globalAlpha = 0.75;
        loud(c, x2(v), rcx, Ta * 0.5 + size * 0.85, Math.max(10, size * 0.62), '#9d97b3', UI_FONT);
        c.globalAlpha = 1;
      } else {
        const tier = tierOf(v);
        const hammy = !orbOn && !!tier && tier.min >= 250;
        const color = orbOn ? '#c8f4ff' : hammy ? `hsl(${(now / 6) % 360} 100% 70%)` : tier ? tier.color : '#fff7e0';
        const label = orbOn ? 'ORB' : tier ? (live || tier.min >= 10 ? tier.label : 'WON') : '';
        const base = Math.max(16, Math.min(38, Ta * 0.42, L.W * 0.1));
        const size = fit(x2(v), base * (tier && tier.min >= 50 && !orbOn ? 1.12 : 1));
        const vy = Ta * 0.5 + size * 0.1;
        const pulse = 1 + (orbOn ? Math.sin(now / 90) * 0.04 : tier && tier.min >= 10 ? Math.sin(now / 110) * 0.05 : 0);
        if (label) {
          const ls = fit(label, Math.max(10, base * 0.38));
          loud(c, label, rcx, Math.max(ls * 0.6, vy - size * 0.78), ls, orbOn ? '#7be8ff' : tier ? tier.color : '#ffd34d', UI_FONT);
        }
        if (v > 0) {
          loud(c, x2(v), rcx, vy, size * pulse, color, DISPLAY_FONT);
          const coins = `${fmt(Math.floor(r.bet * v * 1.0000001))} coins`;
          c.globalAlpha = 0.85;
          loud(c, coins, rcx, vy + size * 0.72, fit(coins, Math.max(10, size * 0.32)), '#ffe9a8', UI_FONT);
          c.globalAlpha = 1;
        }
      }
    } else if (!speaking) {
      const mid = (bubbleLeft + right) / 2;
      const title = 'HAMMY SLOTS';
      loud(c, title, mid, Ta * 0.5, Math.min(Math.max(14, Math.min(30, L.W * 0.075)), (right - bubbleLeft - 4) / (title.length * 0.62)), '#ffd34d', DISPLAY_FONT);
    }
  }

  /** A payline glowing across the reels, symbol by symbol, its multiplier climbing as it goes. */
  private drawLine(c: CanvasRenderingContext2D, L: ReturnType<SlotsApp['lay']>, cur: { win: LineWin; t0: number; t1: number }, e: number, t: number, quiet: boolean): void {
    const pts = cur.win.cells.map(([a, b]) => this.cell(a, b));
    const travel = (cur.t1 - cur.t0) * 0.65;
    const p = clamp01((e - cur.t0) / travel);
    const fade = e > cur.t1 ? clamp01(1 - (e - cur.t1) / 0.2) : 1;
    // Where along the polyline the head is.
    const seg = (pts.length - 1) * p;
    const i = Math.min(pts.length - 2, Math.floor(seg));
    const f = seg - i;
    const head = pts.length > 1 ? { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f } : pts[0];
    const col = quiet ? '#b9b3cf' : lineColor(cur.win.line);
    c.save();
    c.globalAlpha = fade;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const path = () => {
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k <= i; k++) c.lineTo(pts[k].x, pts[k].y);
      c.lineTo(head.x, head.y);
    };
    c.shadowColor = col;
    c.shadowBlur = L.cs * 0.35;
    c.strokeStyle = col;
    c.lineWidth = L.cs * 0.16;
    path();
    c.stroke();
    c.shadowBlur = 0;
    c.strokeStyle = '#ffffff';
    c.lineWidth = L.cs * 0.05;
    path();
    c.stroke();
    // The head, and dots on the symbols it has passed.
    const hg = c.createRadialGradient(head.x, head.y, 0, head.x, head.y, L.cs * 0.3);
    hg.addColorStop(0, 'rgba(255,255,255,0.95)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hg;
    c.beginPath();
    c.arc(head.x, head.y, L.cs * 0.3, 0, TAU);
    c.fill();
    pts.forEach((q, k) => {
      if (k <= seg + 0.01) {
        c.fillStyle = col;
        c.beginPath();
        c.arc(q.x, q.y, L.cs * (0.08 + 0.02 * Math.sin(t * 12 + k)), 0, TAU);
        c.fill();
      }
    });
    c.restore();
    // Its multiplier, counting up as it travels.
    const shown = cur.win.mult * easeOut(p);
    loud(c, `${x2(shown)}`, Math.min(L.W - L.cs * 0.6, Math.max(L.cs * 0.6, head.x)), head.y - L.cs * 0.62 < L.y0 ? head.y + L.cs * 0.62 : head.y - L.cs * 0.62, Math.max(13, L.cs * 0.34), col, UI_FONT);
  }

  /** The balls, pinballing from cell to cell. */
  private drawOrb(c: CanvasRenderingContext2D, L: ReturnType<SlotsApp['lay']>, r: Run, e: number, t: number): void {
    const o = r.tl.orb!;
    const feature = r.sp.feature!;
    feature.balls.forEach((ball, b) => {
      const run = o.balls[b];
      const last = run.hitAt[run.hitAt.length - 1];
      if (e < run.t0 || e > last + 0.25) return;
      const tg = this.topGeom(L);
      const from = ball.from ? this.cell(ball.from.reel, ball.from.row) : { x: tg.hx + tg.hr * 0.9, y: tg.hy - tg.hr * 0.1, cs: L.cs };
      const stops = [from, ...ball.hits.map((hh) => this.cell(hh.reel, hh.row))];
      // Which leg it's on (before the first hit it hovers at the start).
      let i = 0;
      while (i < run.hitAt.length - 1 && e > run.hitAt[i]) i++;
      const legStart = i === 0 ? run.hitAt[0] - run.flight : run.hitAt[i - 1];
      const f = clamp01((e - legStart) / run.flight);
      const a = stops[i];
      const bb = stops[i + 1];
      const pos = (u: number) => {
        const uu = clamp01(u);
        const x = a.x + (bb.x - a.x) * uu;
        const arc = Math.sin(uu * Math.PI) * L.cs * 0.55;
        return { x, y: a.y + (bb.y - a.y) * uu - arc };
      };
      const q = e < legStart ? { x: a.x, y: a.y - Math.abs(Math.sin(t * 10)) * L.cs * 0.12 } : pos(f);
      // Trail.
      for (let k = 5; k >= 1; k--) {
        const tp = e < legStart ? q : pos(f - k * 0.09);
        c.globalAlpha = 0.5 - k * 0.08;
        this.orbDot(c, tp.x, tp.y, L.cs * (0.2 - k * 0.02), t);
      }
      c.globalAlpha = 1;
      this.orbDot(c, q.x, q.y, L.cs * 0.26, t);
      if (e >= last) c.globalAlpha = 1 - clamp01((e - last) / 0.25);
    });
    c.globalAlpha = 1;
  }

  private orbDot(c: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
    const halo = c.createRadialGradient(x, y, r * 0.2, x, y, r * 2.4);
    halo.addColorStop(0, 'rgba(140, 230, 255, 0.8)');
    halo.addColorStop(1, 'rgba(140, 230, 255, 0)');
    c.fillStyle = halo;
    c.beginPath();
    c.arc(x, y, r * 2.4, 0, TAU);
    c.fill();
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#8ee8ff');
    g.addColorStop(1, '#7a3df0');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r * (1 + Math.sin(t * 30) * 0.04), 0, TAU);
    c.fill();
  }

  // Lines and pays ----------------------------------------------------------------

  private buildPaytable(): void {
    const per = (units: number) => x2(units / LINE_COUNT);
    const rows = SYMBOLS.map((s) => {
      const icon = h('canvas', { class: 'slots-pay-icon', width: 72, height: 72, 'aria-hidden': 'true' });
      const c = icon.getContext('2d');
      if (c) {
        const [a, b] = TILE[s.id];
        const g = c.createLinearGradient(0, 0, 0, 72);
        g.addColorStop(0, a);
        g.addColorStop(1, b);
        c.fillStyle = g;
        c.beginPath();
        c.roundRect(0, 0, 72, 72, 10);
        c.fill();
        drawSymbol(c, s.id, 36, 36, 72, 0.4);
      }
      const text = s.pays
        ? `${s.name}: 3 pay ${per(s.pays[0])}, 4 pay ${per(s.pays[1])}, 5 pay ${per(s.pays[2])}`
        : s.id === 'wild'
          ? `${s.name}: stands in for anything but the orb`
          : `${s.name}: pays nothing on a line, but two or more send the orb flying`;
      return h('li', null, icon, h('span', null, text));
    });
    this.paytable.replaceChildren(
      ...rows,
      h('li', { class: 'slots-pay-note' }, h('span', null, `Lines pay 3 or more matching from the left, as a multiple of your whole bet. The orb adds to or multiplies the spin's win, whatever it was. Nothing pays more than ${MAX_WIN.toLocaleString('en-US')}× the bet.`)),
    );
  }

  private drawLinesPanel(): void {
    const fit = fitCanvas(this.linesCanvas);
    if (!fit) return;
    const { c, W, H } = fit;
    c.clearRect(0, 0, W, H);
    const cols = W < 340 ? 4 : 5;
    const rows = Math.ceil(LINES.length / cols);
    const cw = W / cols;
    const ch = H / rows;
    LINES.forEach((l, i) => {
      const x = (i % cols) * cw;
      const y = Math.floor(i / cols) * ch;
      const bw = cw - 10;
      const bh = ch - 16;
      const gx = x + 5;
      const gy = y + 3;
      c.fillStyle = 'rgba(255,255,255,0.06)';
      c.beginPath();
      c.roundRect(gx, gy, bw, bh, 6);
      c.fill();
      const px = (reel: number) => gx + bw * (0.12 + (reel / (REELS - 1)) * 0.76);
      const py = (row: number) => gy + bh * (0.2 + (row / (ROWS - 1)) * 0.6);
      c.fillStyle = 'rgba(255,255,255,0.22)';
      for (let a = 0; a < REELS; a++) for (let b = 0; b < ROWS; b++) c.fillRect(px(a) - 2, py(b) - 2, 4, 4);
      c.strokeStyle = lineColor(i);
      c.lineWidth = 2;
      c.lineJoin = 'round';
      c.beginPath();
      l.rows.forEach((row, reel) => (reel ? c.lineTo(px(reel), py(row)) : c.moveTo(px(reel), py(row))));
      c.stroke();
      c.fillStyle = '#cbbfe0';
      c.font = `600 ${Math.min(10, cw * 0.14)}px ${UI_FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(`${i + 1} ${l.name}`, x + cw / 2, y + ch - 7);
    });
  }
}

const symbolName = (id: SlotSymbol): string => SYMBOLS.find((s) => s.id === id)!.name;
