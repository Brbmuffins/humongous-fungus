// The Fart Rocket screen: the sky, Hammy riding his own fart up through it,
// everyone else's bets, and the button. Rounds run back to back while it's
// open. The rules are in rocket.ts; your coins move through the controller.
import { h, setDisabled, setText } from '@shared/dom';
import { fmt } from '@shared/format';
import type { FormId } from './defs';
import { isAlive } from './game';
import { EXTENTS, defaultLook, drawHammy, type Face } from './hammy';
import { buzz } from './native';
import {
  FLIGHT_LINES,
  MILESTONES,
  ROCKET_BET_SECONDS,
  ROCKET_MIN_BET,
  ROCKET_PAUSE_SECONDS,
  cashCrowd,
  crashCause,
  crashPoint,
  crowd,
  multiplierAt,
  type CrashDef,
  type Punter,
} from './rocket';
import { engine, sfx, type Engine } from './sound';
import type { HammyState } from './state';

export interface RocketHost {
  readonly state: HammyState;
  readonly form: FormId;
  /** Put coins on him: false if you can't. */
  rocketBet(amount: number): boolean;
  /** Bailed out at `mult`: returns what came back. */
  rocketCashOut(bet: number, mult: number): number;
  rocketRefund(bet: number): void;
}

/** How a sitting went, for Hammy to react to back in the unit. */
export interface RocketSession {
  rounds: number;
  net: number;
}

type Phase = 'bet' | 'fly' | 'crash';

/** Kept between sittings while the page is open (not saved). */
const prefs = { amount: 10, auto: false, autoAt: 2 };
const history: number[] = [];

/** Positions: x as a fraction of the width, l as altitude (log10 of the multiplier). */
interface Puff {
  x: number;
  l: number;
  vx: number;
  born: number;
  size: number;
  hue: number | null;
}
interface Jumper {
  x: number;
  l: number;
  born: number;
  emoji: string;
  name: string;
}
interface Cloud {
  x: number;
  l: number;
  s: number;
  v: number;
}

const INK = '#2b1400';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const DISPLAY = '"Bagel Fat One", "Cooper Black", system-ui, sans-serif';
const UI = 'Rubik, system-ui, sans-serif';

/** Sky colours (top, bottom) by altitude: day, high, dusk, space. */
const SKY: readonly (readonly [number, string, string])[] = [
  [0, '#69b7ff', '#d3edff'],
  [0.45, '#3c86f0', '#a2d2ff'],
  [0.8, '#1d2f7a', '#4a68c0'],
  [1.05, '#0b0a24', '#1c1748'],
  [9, '#06051a', '#120d33'],
];

const rand = (): number => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const x2 = (m: number): string => `${(Math.floor(m * 100) / 100).toFixed(2)}×`;
const wrap = (v: number, n: number): number => ((v % n) + n) % n;

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  const k = clamp(t, 0, 1);
  return `rgb(${Math.round(ar + (br - ar) * k)}, ${Math.round(ag + (bg - ag) * k)}, ${Math.round(ab + (bb - ab) * k)})`;
}

function skyAt(l: number): [string, string] {
  for (let i = 1; i < SKY.length; i++) {
    const [l1, t1, b1] = SKY[i];
    if (l <= l1) {
      const [l0, t0, b0] = SKY[i - 1];
      const k = (l - l0) / (l1 - l0);
      return [mix(t0, t1, k), mix(b0, b1, k)];
    }
  }
  return [SKY[SKY.length - 1][1], SKY[SKY.length - 1][2]];
}

/** Text with a dark outline, so it reads on any sky. */
function loud(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, font = DISPLAY): void {
  c.font = font === DISPLAY ? `${size}px ${DISPLAY}` : `800 ${size}px ${font}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = Math.max(3, size * 0.14);
  c.strokeStyle = 'rgba(20, 8, 30, 0.85)';
  c.strokeText(text, x, y);
  c.fillStyle = fill;
  c.fillText(text, x, y);
}

function emoji(c: CanvasRenderingContext2D, e: string, x: number, y: number, size: number): void {
  c.font = `${size}px ${EMOJI}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(e, x, y);
}

export class RocketApp {
  readonly card: HTMLElement;
  private phase: Phase = 'bet';
  private phaseAt = 0;
  private last = 0;
  private mult = 1;
  private crash = 1;
  private cause: CrashDef = crashCause(1);
  private punters: Punter[] = [];
  /** Your coins on this round, and where you got out. */
  private bet = 0;
  private cashedAt: number | null = null;
  private won = 0;
  /** Bet as soon as the next round opens. */
  private queued = false;
  private session: RocketSession = { rounds: 0, net: 0 };
  private milestone = 0;
  private nextLine = 0;
  private bubble: { text: string; until: number } | null = null;
  private lineDue: { text: string; at: number } | null = null;
  private puffs: Puff[] = [];
  private jumpers: Jumper[] = [];
  private clouds: Cloud[] = [];
  private gulls: { x: number; l: number; v: number }[] = [];
  private stars: { x: number; y: number; s: number }[] = [];
  private engine: Engine | null = null;
  private raf = 0;
  private closed = false;
  private crowdKey = '';
  private dpr = 1;

  private canvas = h('canvas', { class: 'rocket-sky', role: 'img', 'aria-label': 'Hammy riding his own fart into the sky' });
  private coinsEl = h('span', { class: 'rocket-coins' });
  private historyEl = h('ol', { class: 'rocket-history', 'aria-label': 'Where the last rounds ended' });
  private status = h('p', { class: 'rocket-status', 'aria-live': 'polite' });
  private amount = h('input', { class: 'rocket-amount', type: 'number', min: ROCKET_MIN_BET, step: 1, inputmode: 'numeric', 'aria-label': 'Bet, in coins' });
  private autoBox = h('input', { type: 'checkbox', 'aria-label': 'Bail out automatically' });
  private autoAt = h('input', { class: 'rocket-auto-at', type: 'number', min: 1.01, step: 0.1, inputmode: 'decimal', 'aria-label': 'Bail out at this multiplier' });
  private go = h('button', { class: 'btn btn-cheese rocket-go', type: 'button' });
  private crowdEl = h('ul', { class: 'rocket-crowd', 'aria-label': 'Who else is betting on him' });

  constructor(
    private host: RocketHost,
    close: () => void,
  ) {
    const closeBtn = h('button', { class: 'rocket-close', type: 'button', 'aria-label': 'Close Fart Rocket', onclick: close }, '✕');
    const chip = (label: string, title: string, f: () => void) => h('button', { class: 'rocket-chip', type: 'button', 'aria-label': title, onclick: f }, label);
    this.amount.value = String(prefs.amount);
    this.amount.addEventListener('input', () => {
      const v = Math.floor(Number(this.amount.value));
      if (Number.isFinite(v) && v >= ROCKET_MIN_BET) prefs.amount = v;
    });
    this.amount.addEventListener('change', () => this.setAmount(Number(this.amount.value)));
    this.autoBox.checked = prefs.auto;
    this.autoBox.addEventListener('change', () => (prefs.auto = this.autoBox.checked));
    this.autoAt.value = prefs.autoAt.toFixed(2);
    this.autoAt.addEventListener('change', () => {
      const v = Number(this.autoAt.value);
      prefs.autoAt = Number.isFinite(v) ? clamp(Math.round(v * 100) / 100, 1.01, 1000) : 2;
      this.autoAt.value = prefs.autoAt.toFixed(2);
    });
    this.go.addEventListener('click', () => this.action());

    this.card = h(
      'div',
      { class: 'modal-card rocket-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
      h('div', { class: 'rocket-top' }, h('h2', { id: 'modal-title' }, '💨 Fart Rocket'), this.coinsEl, closeBtn),
      this.historyEl,
      this.canvas,
      this.status,
      h(
        'div',
        { class: 'rocket-row' },
        chip('½', 'Half the bet', () => this.setAmount(prefs.amount / 2)),
        this.amount,
        chip('2×', 'Double the bet', () => this.setAmount(prefs.amount * 2)),
        chip('Max', 'Bet everything', () => this.setAmount(this.host.state.coins)),
      ),
      h('label', { class: 'rocket-auto' }, this.autoBox, h('span', null, 'Bail out at'), this.autoAt),
      this.go,
      h('h3', { class: 'rocket-sub' }, 'Also riding'),
      this.crowdEl,
      h('p', { class: 'note' }, 'Bets are Hammy coins, never real money. The higher he gets, the more it pays, until something ends it. Over many rounds you get back about 99 of every 100 coins you bet.'),
    );
    this.card.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        this.action();
      }
    });
    // Leaving the page mid-flight would just lose your bet: bail out instead.
    document.addEventListener('visibilitychange', this.onHidden);
    for (let i = 0; i < 90; i++) this.stars.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.5 });
    const now = performance.now();
    this.last = now;
    this.newRound(now);
    this.renderHistory();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** What to focus when it opens. */
  get focus(): HTMLElement {
    return this.go;
  }

  private onHidden = (): void => {
    if (document.visibilityState === 'hidden' && this.bet && this.phase === 'fly' && this.cashedAt === null) this.cashOut(this.mult);
  };

  /** Stop, square up any bet still out, and say how it went. */
  close(): RocketSession {
    if (this.closed) return this.session;
    this.closed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onHidden);
    if (this.phase === 'bet' && this.bet) this.refund();
    else if (this.phase === 'fly' && this.bet && this.cashedAt === null) this.cashOut(this.mult);
    this.engine?.stop();
    this.engine = null;
    return this.session;
  }

  private setAmount(v: number): void {
    prefs.amount = Math.max(ROCKET_MIN_BET, Math.floor(Number.isFinite(v) ? v : ROCKET_MIN_BET));
    this.amount.value = String(prefs.amount);
  }

  // Rounds -------------------------------------------------------------------

  private newRound(now: number): void {
    this.phase = 'bet';
    this.phaseAt = now;
    this.mult = 1;
    this.bet = 0;
    this.cashedAt = null;
    this.won = 0;
    this.crash = crashPoint(rand());
    this.cause = crashCause(this.crash);
    this.punters = crowd();
    this.milestone = 0;
    this.bubble = null;
    this.lineDue = null;
    this.jumpers = [];
    this.clouds = Array.from({ length: 18 }, () => ({ x: Math.random() * 1.2 - 0.1, l: 0.1 + Math.random() * 0.85, s: 0.6 + Math.random() * 0.9, v: (Math.random() - 0.5) * 0.02 }));
    this.gulls = Array.from({ length: 5 }, () => ({ x: Math.random(), l: 0.14 + Math.random() * 0.24, v: 0.05 + Math.random() * 0.08 }));
    if (this.queued) {
      this.queued = false;
      this.placeBet();
    }
    if (!this.bet) setText(this.status, 'Place your bet. He launches in a few seconds.');
  }

  private launch(now: number): void {
    this.phase = 'fly';
    this.phaseAt = now;
    this.nextLine = now + 3500;
    this.engine = engine();
    sfx.whoosh();
    sfx.fart(1.3);
    buzz.fart(1);
    this.say('PFFFFRRRT!', 1400, now);
    setText(this.status, this.bet ? 'He’s up! Bail out before it ends.' : 'He’s up. Bet on the next one.');
  }

  private boom(now: number): void {
    this.phase = 'crash';
    this.phaseAt = now;
    this.mult = this.crash;
    this.engine?.stop();
    this.engine = null;
    history.unshift(this.crash);
    if (history.length > 14) history.pop();
    this.renderHistory();
    const id = this.cause.id;
    if (id === 'sneeze') sfx.pow();
    else if (id === 'shart') sfx.splat();
    else if (id === 'plane') sfx.whoosh();
    else if (id === 'seagull') sfx.squelch();
    else if (id === 'aliens' || id === 'plug') sfx.glitch();
    else sfx.bonk();
    if (id !== 'aliens') sfx.fall();
    this.bubble = null;
    this.lineDue = { text: this.cause.line, at: now + 400 };
    const ended = `It ended at ${x2(this.crash)}: ${this.cause.text.toLowerCase()}.`;
    if (this.bet && this.cashedAt === null) {
      buzz.bad();
      setText(this.status, `Lost ${fmt(this.bet)}. ${ended}`);
    } else if (this.bet) {
      setText(this.status, `You bailed at ${x2(this.cashedAt ?? 1)} for ${fmt(this.won)}. ${ended}`);
    } else setText(this.status, ended);
  }

  private placeBet(): void {
    const s = this.host.state;
    const amount = Math.min(prefs.amount, Math.floor(s.coins));
    if (amount < ROCKET_MIN_BET || !this.host.rocketBet(amount)) {
      setText(this.status, isAlive(s) ? 'Not enough coins for that bet.' : 'No pilot. Hammy is dead.');
      return;
    }
    this.bet = amount;
    this.session.rounds += 1;
    this.session.net -= amount;
    sfx.coin();
    setText(this.status, `You’re in for ${fmt(amount)}. Bail out before it ends.`);
  }

  private refund(): void {
    this.host.rocketRefund(this.bet);
    this.session.rounds -= 1;
    this.session.net += this.bet;
    this.bet = 0;
  }

  private cashOut(mult: number): void {
    const at = Math.floor(mult * 100) / 100;
    this.won = this.host.rocketCashOut(this.bet, at);
    this.cashedAt = at;
    this.session.net += this.won;
    sfx.kaching();
    buzz.success();
    this.jump('🙋', 'You');
    setText(this.status, `You bailed at ${x2(at)} for ${fmt(this.won)} coins.`);
  }

  /** The big button: bet, take it back, bail out, or bet on the next one. */
  private action(): void {
    if (this.closed) return;
    if (this.phase === 'fly' && this.bet && this.cashedAt === null) this.cashOut(this.mult);
    else if (this.phase === 'bet') {
      if (this.bet) {
        this.refund();
        setText(this.status, 'Bet taken back.');
      } else this.placeBet();
    } else this.queued = !this.queued;
  }

  private jump(e: string, name: string): void {
    this.jumpers.push({ x: this.hx() + (Math.random() - 0.5) * 0.08, l: Math.log10(this.mult), born: performance.now(), emoji: e, name });
  }

  private say(text: string, ms: number, now: number): void {
    this.bubble = { text, until: now + ms };
  }

  // Each frame ----------------------------------------------------------------

  private frame = (now: number): void => {
    if (this.closed) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.step(now, dt);
    this.draw(now);
    this.sync();
    this.raf = requestAnimationFrame(this.frame);
  };

  private step(now: number, dt: number): void {
    const secs = (now - this.phaseAt) / 1000;
    if (this.phase === 'bet') {
      if (secs >= ROCKET_BET_SECONDS) this.launch(now);
    } else if (this.phase === 'fly') {
      const m = multiplierAt(secs);
      if (m >= this.crash) this.boom(now);
      else {
        this.mult = m;
        if (this.bet && this.cashedAt === null && prefs.auto && m >= prefs.autoAt) this.cashOut(prefs.autoAt);
        for (const p of cashCrowd(this.punters, m, this.crash)) this.jump(p.emoji, p.name);
        while (this.milestone < MILESTONES.length && m >= MILESTONES[this.milestone][0]) {
          this.say(MILESTONES[this.milestone][1], 1800, now);
          this.milestone += 1;
          this.nextLine = now + 3500;
        }
        if (now > this.nextLine && (!this.bubble || now > this.bubble.until)) {
          this.say(pick(FLIGHT_LINES), 1800, now);
          this.nextLine = now + 3500 + Math.random() * 2500;
        }
        this.engine?.set(Math.log10(m));
      }
    } else if (secs >= ROCKET_PAUSE_SECONDS) this.newRound(now);

    if (this.lineDue && now >= this.lineDue.at) {
      this.say(this.lineDue.text, 2400, now);
      this.lineDue = null;
    }

    // His exhaust: a steady stream while he flies, a sputter while he waits.
    const rate = this.phase === 'fly' ? 34 : this.phase === 'bet' ? 5 + secs * 3 : 0;
    const l = Math.log10(this.mult);
    const n = Math.floor(rate * dt) + (Math.random() < (rate * dt) % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      this.puffs.push({ x: this.hx() + (Math.random() - 0.5) * 0.03, l: l - 0.012, vx: (Math.random() - 0.5) * 0.06, born: now, size: 0.5 + Math.random() * 0.6, hue: l > 1.6 ? (now / 8 + Math.random() * 120) % 360 : null });
    }
    for (const p of this.puffs) {
      p.x += p.vx * dt;
      p.l -= 0.004 * dt;
    }
    this.puffs = this.puffs.filter((p) => now - p.born < 1400);
    for (const j of this.jumpers) j.l -= 0.03 * dt;
    this.jumpers = this.jumpers.filter((j) => now - j.born < 4000);
  }

  /** Where he is across the sky, as a fraction of the width. */
  private hx(): number {
    if (this.phase !== 'fly') return 0.5;
    const secs = (this.last - this.phaseAt) / 1000;
    return 0.5 + 0.13 * Math.sin(secs * 1.1) + 0.04 * Math.sin(secs * 2.9);
  }

  private sync(): void {
    const s = this.host.state;
    const alive = isAlive(s);
    setText(this.coinsEl, `🪙 ${fmt(s.coins)}`);
    const riding = this.phase === 'fly' && this.bet > 0 && this.cashedAt === null;
    const label = riding
      ? `BAIL OUT · +${fmt(Math.floor(this.bet * this.mult))}`
      : this.phase === 'bet'
        ? this.bet
          ? `Take back ${fmt(this.bet)}`
          : `Bet ${fmt(prefs.amount)} on Hammy`
        : this.queued
          ? 'Betting on the next one… (cancel)'
          : `Bet ${fmt(prefs.amount)} on the next one`;
    setText(this.go, label);
    this.go.classList.toggle('bail', riding);
    setDisabled(this.go, !alive || (!riding && !this.bet && !this.queued && (prefs.amount > s.coins || prefs.amount < ROCKET_MIN_BET)));
    this.renderCrowd();
  }

  private renderHistory(): void {
    this.historyEl.replaceChildren(
      ...(history.length ? history : []).map((m) => h('li', { class: m >= 10 ? 'hi' : m >= 2 ? 'mid' : 'lo' }, x2(m))),
    );
    if (!history.length) this.historyEl.append(h('li', { class: 'none' }, 'First flight of the day'));
  }

  private renderCrowd(): void {
    const crashed = this.phase === 'crash';
    const rows: { e: string; name: string; bet: number; how: string; cls: string }[] = [];
    if (this.bet) {
      const how = this.cashedAt !== null ? `bailed ${x2(this.cashedAt)}` : crashed ? 'lost it' : 'riding';
      rows.push({ e: '🙋', name: 'You', bet: this.bet, how, cls: `you ${this.cashedAt !== null ? 'won' : crashed ? 'lost' : ''}` });
    }
    for (const p of this.punters) {
      const how = p.out !== null ? `bailed ${x2(p.out)}` : p.target === null ? (crashed ? 'went down with him' : 'is a plant') : crashed ? 'lost it' : 'riding';
      rows.push({ e: p.emoji, name: p.name, bet: p.bet, how, cls: p.out !== null ? 'won' : crashed ? 'lost' : '' });
    }
    const key = rows.map((r) => `${r.name}:${r.how}`).join('|');
    if (key === this.crowdKey) return;
    this.crowdKey = key;
    this.crowdEl.replaceChildren(
      ...rows.map((r) =>
        h('li', { class: r.cls.trim() || null }, h('span', { class: 'rocket-who' }, `${r.e} ${r.name}`), h('span', { class: 'rocket-bet' }, `${fmt(r.bet)} · ${r.how}`)),
      ),
    );
  }

  // Drawing ------------------------------------------------------------------

  private draw(now: number): void {
    const cv = this.canvas;
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr) || dpr !== this.dpr) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      this.dpr = dpr;
    }
    const c = cv.getContext('2d');
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = now / 1000;
    const cam = Math.log10(this.mult);
    const PX = H * 3;
    const HY = H * 0.6;
    const y = (l: number) => HY - (l - cam) * PX;
    const r = Math.min(H * 0.085, W * 0.09);

    // Sky, then space.
    const [top, bottom] = skyAt(cam);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const starAlpha = clamp((cam - 0.7) / 0.35, 0, 1);
    if (starAlpha > 0) {
      c.fillStyle = `rgba(255, 255, 240, ${starAlpha})`;
      for (const s of this.stars) {
        const sy = ((s.y + cam * 0.25) % 1) * H;
        const tw = 0.6 + 0.4 * Math.sin(t * 3 + s.x * 40);
        c.globalAlpha = starAlpha * tw;
        c.fillRect(s.x * W, sy, s.s, s.s);
      }
      c.globalAlpha = 1;
    }
    // Past 50× it all goes a bit wrong.
    const trip = clamp((cam - 1.6) / 0.2, 0, 1);
    if (trip > 0) {
      const hue = (t * 70) % 360;
      const tg = c.createLinearGradient(0, 0, W, H);
      tg.addColorStop(0, `hsla(${hue}, 90%, 55%, ${trip * 0.35})`);
      tg.addColorStop(0.5, `hsla(${(hue + 120) % 360}, 90%, 55%, ${trip * 0.35})`);
      tg.addColorStop(1, `hsla(${(hue + 240) % 360}, 90%, 55%, ${trip * 0.35})`);
      c.fillStyle = tg;
      c.fillRect(0, 0, W, H);
    }

    const near = (l: number, pad = H) => Math.abs(y(l) - H / 2) < H / 2 + pad;
    if (near(1, H * 0.6)) this.drawMoon(c, W * 0.8, y(1), H * 0.3);
    if (near(1.22)) this.drawSatellite(c, W * 0.2, y(1.22), r, t);
    if (near(1.4)) this.drawUfo(c, W * 0.27 + Math.sin(t) * W * 0.05, y(1.4) + Math.sin(t * 2) * 6, r * 1.3, t);
    if (near(1.7)) {
      for (let i = 0; i < 3; i++) this.drawUfo(c, W * (0.2 + i * 0.3), y(1.7 + (i % 2) * 0.05) + Math.sin(t * 2 + i) * 6, r * 1.1, t + i);
      this.drawSign(c, W * 0.5, y(1.62), r, ['HI HAMMY', '👽👽👽'], '#3b2d55', '#c9f06a');
    }
    if (cam > 1.5) {
      for (let i = 0; i < 12; i++) {
        const l = 1.6 + i * 0.09;
        if (!near(l, H * 0.2)) continue;
        this.drawDorkito(c, W * ((i * 0.37 + 0.1) % 1), y(l), r * 0.45, t * (1 + i * 0.1) + i);
      }
    }
    for (const [l, lines] of [
      [2, ['WELCOME TO OHIO', '🌽']],
      [2.3, ['STILL OHIO', '🌽🌽']],
      [2.6, ['OHIO AGAIN', '🌽🌽🌽']],
      [3, ['HOW IS THIS OHIO', '🌽🌽🌽🌽']],
    ] as const) {
      if (near(l)) this.drawSign(c, W * 0.32, y(l), r, lines, '#1f6b3a', '#ffffff');
    }
    const cloudAlpha = clamp((1 - cam) / 0.25, 0, 1);
    if (cloudAlpha > 0) {
      for (const cl of this.clouds) {
        if (!near(cl.l, H * 0.3)) continue;
        this.drawCloud(c, (wrap(cl.x + cl.v * t + 0.15, 1.4) - 0.15) * W, y(cl.l), r * 1.3 * cl.s, cloudAlpha);
      }
      for (const gu of this.gulls) {
        if (!near(gu.l, H * 0.2)) continue;
        this.drawGull(c, (wrap(gu.x - gu.v * t, 1.4) - 0.2) * W, y(gu.l), r * 0.5, t * 8 + gu.x * 10);
      }
      if (near(0.45, H * 0.4)) this.drawPlane(c, ((t * 0.11) % 1.8 - 0.5) * W, y(0.45), r * 1.4);
    }
    if (y(0) < H + H) this.drawGround(c, W, H, y(0) + r * EXTENTS[this.host.form].h, r, this.phase !== 'bet');

    // People bailing out, on tiny parachutes.
    for (const j of this.jumpers) {
      const k = (now - j.born) / 4000;
      const jx = (j.x + Math.sin(k * 9) * 0.01) * W;
      const jy = y(j.l);
      c.globalAlpha = clamp(1 - (k - 0.75) * 4, 0, 1);
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.lineWidth = 1;
      c.fillStyle = j.name === 'You' ? '#ff9a2e' : '#ff6fa8';
      c.beginPath();
      c.arc(jx, jy - r * 0.75, r * 0.45, Math.PI, 0);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(jx - r * 0.45, jy - r * 0.75);
      c.lineTo(jx, jy - r * 0.15);
      c.lineTo(jx + r * 0.45, jy - r * 0.75);
      c.stroke();
      emoji(c, j.emoji, jx, jy, r * 0.55);
      c.font = `600 ${Math.max(9, r * 0.24)}px ${UI}`;
      c.fillStyle = '#fff';
      c.fillText(j.name, jx, jy + r * 0.45);
      c.globalAlpha = 1;
    }

    // The trail.
    for (const p of this.puffs) {
      const k = (now - p.born) / 1400;
      const pr = r * (0.35 + k * 1.3) * p.size;
      c.globalAlpha = (1 - k) * 0.5;
      c.fillStyle = p.hue === null ? (k < 0.3 ? '#d8e27a' : '#a8c23a') : `hsl(${p.hue}, 90%, 60%)`;
      c.beginPath();
      c.arc(p.x * W, y(p.l), pr, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;

    this.drawHammy(c, W, H, HY, r, now, t);
    this.drawHud(c, W, H, now);
  }

  private drawHammy(c: CanvasRenderingContext2D, W: number, H: number, HY: number, r: number, now: number, t: number): void {
    const s = this.host.state;
    const form = this.host.form;
    const look = defaultLook(s.fit, form);
    look.green = clamp((40 - s.fresh) / 80, 0, 0.5);
    const k = (now - this.phaseAt) / 1000;
    let x = this.hx() * W;
    let yy = HY;
    let face: Face = 'smug';
    let scale = 1;
    const hh = r * EXTENTS[form].h;
    if (this.phase === 'bet') {
      const left = ROCKET_BET_SECONDS - k;
      look.sy = 1 - (left < 1.5 ? 0.08 * Math.abs(Math.sin(t * 18)) : 0);
      face = left < 1.5 ? 'shock' : 'smug';
    } else if (this.phase === 'fly') {
      look.armsUp = true;
      look.lean = Math.sin(t * 1.6) * 0.18;
      face = this.mult > 10 ? 'joy' : this.cashedAt !== null ? 'smug' : 'joy';
      look.roll = t * 6;
      // The engine: a fart jet out the back.
      const by = yy + hh;
      const power = 1 + Math.min(0.6, Math.log10(this.mult) * 0.3);
      for (let i = 8; i >= 0; i--) {
        const fl = 0.8 + 0.2 * Math.sin(t * 40 + i * 2);
        const pr = r * (0.8 - i * 0.06) * fl * power;
        c.globalAlpha = 0.85 - i * 0.07;
        c.fillStyle = Math.log10(this.mult) > 1.6 ? `hsl(${(t * 200 + i * 40) % 360}, 90%, 60%)` : i < 2 ? '#fbf6b8' : i < 4 ? '#d4e85a' : i < 6 ? '#a8c23a' : '#7d9426';
        c.beginPath();
        c.ellipse(x + Math.sin(t * 30 + i) * r * 0.1 * i * 0.3, by + r * 0.1 + i * r * 0.42 * power, pr, pr * 1.2, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
      // Speed lines.
      c.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      c.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const lx = ((i * 0.618) % 1) * W;
        const ly = ((i * 0.37 + t * (1 + Math.log10(this.mult))) % 1.3 - 0.15) * H;
        c.beginPath();
        c.moveTo(lx, ly);
        c.lineTo(lx, ly + H * 0.08);
        c.stroke();
      }
    } else {
      face = 'shock';
      look.armsUp = true;
      if (this.cause.id === 'aliens') {
        // Beamed up.
        const ux = W / 2;
        const bg = c.createLinearGradient(0, H * 0.38, 0, HY + hh);
        bg.addColorStop(0, 'rgba(160, 255, 140, 0.7)');
        bg.addColorStop(1, 'rgba(160, 255, 140, 0.1)');
        c.fillStyle = bg;
        c.beginPath();
        c.moveTo(ux - r * 0.5, H * 0.38);
        c.lineTo(ux + r * 0.5, H * 0.38);
        c.lineTo(ux + r * 1.8, HY + hh);
        c.lineTo(ux - r * 1.8, HY + hh);
        c.closePath();
        c.fill();
        this.drawUfo(c, ux, H * 0.38, r * 1.4, t);
        yy = Math.max(H * 0.4, HY - k * k * H * 0.4);
        x += (ux - x) * Math.min(1, k * 2);
        scale = Math.max(0.15, 1 - k * 0.35);
        look.lean = Math.sin(t * 8) * 0.4;
      } else {
        const fall = Math.max(0, k - 0.25);
        yy = HY + 0.5 * H * 2.6 * fall * fall;
        look.lean = fall * 9;
      }
    }
    look.face = face;
    look.mouth = this.bubble && now < this.bubble.until ? 0.5 + 0.5 * Math.abs(Math.sin(t * 14)) : 0;
    look.blink = Math.sin(t * 1.3) > 0.985;
    if (yy - hh < H + r && yy + hh > -r) drawHammy(c, x, yy, r * scale, look, t);

    // What ended it, right where it happened.
    if (this.phase === 'crash') {
      const id = this.cause.id;
      const pop = Math.min(1, k * 5) * (1 + 0.15 * Math.sin(k * 20) * Math.max(0, 1 - k));
      let ex = x + r * 1.5;
      let ey = HY - r * 0.6;
      if (id === 'plane' || id === 'seagull') {
        ex = W * (-0.2 + k * 1.6);
        ey = HY;
      } else if (id === 'plug') {
        ex = x + r * 0.9;
        ey = HY - k * H * 0.6;
        c.strokeStyle = '#222';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(ex, ey + r * 0.4);
        c.quadraticCurveTo(ex - r, (ey + HY) / 2, x, HY + hh);
        c.stroke();
      } else if (id === 'aliens') {
        ex = W / 2 + r * 2.4;
        ey = H * 0.36;
      }
      emoji(c, this.cause.emoji, ex, ey, r * 1.3 * pop);
      c.save();
      c.translate(W / 2, HY + r * 2);
      c.rotate(Math.sin(k * 12) * 0.06);
      loud(c, this.cause.word, 0, 0, Math.min(W * 0.12, H * 0.13) * pop, '#ffd34d');
      c.restore();
      x = Math.min(Math.max(x, W * 0.25), W * 0.75);
    }

    // His speech bubble.
    if (this.bubble && now < this.bubble.until) {
      const size = Math.max(11, H * 0.05);
      c.font = `700 ${size}px ${UI}`;
      const tw = c.measureText(this.bubble.text).width;
      const bw = tw + size * 1.2;
      const bh = size * 1.9;
      const bx = clamp(x + r * 0.8, 6, W - bw - 6);
      const by = clamp(this.phase === 'crash' ? HY - r * 1.3 - bh : yy - r * 2.2 - bh, 6, H - bh - 6);
      c.fillStyle = '#fffaf0';
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(bx, by, bw, bh, bh / 2);
      c.fill();
      c.stroke();
      c.fillStyle = INK;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(this.bubble.text, bx + size * 0.6, by + bh / 2 + 1);
    }
  }

  private drawHud(c: CanvasRenderingContext2D, W: number, H: number, now: number): void {
    const k = (now - this.phaseAt) / 1000;
    const big = Math.min(W * 0.16, H * 0.17);
    if (this.phase === 'bet') {
      const left = Math.max(0, ROCKET_BET_SECONDS - k);
      loud(c, 'LAUNCH IN', W / 2, H * 0.1, big * 0.3, '#fffaf0', UI);
      loud(c, String(Math.ceil(left)), W / 2, H * 0.24, big * (1 + 0.15 * (1 - (left % 1))), '#ffd34d');
      return;
    }
    if (this.phase === 'fly') {
      const m = this.mult;
      const fill = m >= 10 ? '#ff6fa8' : m >= 2 ? '#ffd34d' : '#fffaf0';
      loud(c, x2(m), W / 2, H * 0.14, big * (1 + Math.min(0.25, Math.log10(m) * 0.1)), fill);
      if (this.cashedAt !== null) loud(c, `You bailed at ${x2(this.cashedAt)} · +${fmt(this.won)}`, W / 2, H * 0.27, big * 0.22, '#5ee0b0', UI);
      return;
    }
    const title = `${this.cause.emoji} ${this.cause.text}`;
    loud(c, title, W / 2, H * 0.085, Math.min(H * 0.075, (W * 0.92) / ((this.cause.text.length + 2) * 0.62)), '#fffaf0', UI);
    loud(c, `@ ${x2(this.crash)}`, W / 2, H * 0.2, big * 0.68, '#ff5c5c');
    if (this.cashedAt !== null) loud(c, `You got out with +${fmt(this.won)}`, W / 2, H * 0.305, big * 0.24, '#5ee0b0', UI);
    else if (this.bet) loud(c, `You lost ${fmt(this.bet)}`, W / 2, H * 0.305, big * 0.24, '#ff8a7a', UI);
  }

  // Scenery --------------------------------------------------------------------

  private drawGround(c: CanvasRenderingContext2D, W: number, H: number, roof: number, r: number, open: boolean): void {
    const ground = roof + H * 0.3;
    // Town in the distance.
    c.fillStyle = '#9db6d6';
    for (let i = 0; i < 9; i++) {
      const bw = W * 0.09;
      const bh = H * (0.1 + ((i * 37) % 10) / 50);
      c.fillRect(i * W * 0.115 - W * 0.02, ground - bh, bw, bh);
    }
    c.fillStyle = '#4f8a35';
    c.fillRect(0, ground, W, H * 2);
    // The containment building.
    const bw = Math.max(r * 5, W * 0.38);
    const bx = W / 2 - bw / 2;
    c.fillStyle = '#7c7891';
    c.fillRect(bx, roof, bw, ground - roof);
    c.fillStyle = '#5f5b73';
    c.fillRect(bx - 4, roof - 6, bw + 8, 8);
    c.fillStyle = '#ffe9a8';
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        c.fillRect(bx + bw * (0.08 + col * 0.18), roof + (ground - roof) * (0.42 + row * 0.18), bw * 0.1, (ground - roof) * 0.09);
      }
    }
    c.fillStyle = '#ffd34d';
    c.font = `700 ${Math.max(9, r * 0.32)}px ${UI}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('CONTAINMENT · UNIT 7', W / 2, roof + (ground - roof) * 0.22);
    if (open) {
      // The hole he left in the roof.
      c.fillStyle = '#231a33';
      c.beginPath();
      c.moveTo(W / 2 - r * 0.9, roof - 2);
      c.lineTo(W / 2 - r * 0.5, roof + r * 0.35);
      c.lineTo(W / 2 - r * 0.1, roof + r * 0.15);
      c.lineTo(W / 2 + r * 0.3, roof + r * 0.4);
      c.lineTo(W / 2 + r * 0.9, roof - 2);
      c.closePath();
      c.fill();
    }
  }

  private drawCloud(c: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number): void {
    c.globalAlpha = alpha * 0.92;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x, y, s * 0.6, 0, Math.PI * 2);
    c.arc(x + s * 0.6, y + s * 0.1, s * 0.5, 0, Math.PI * 2);
    c.arc(x - s * 0.6, y + s * 0.15, s * 0.45, 0, Math.PI * 2);
    c.arc(x + s * 0.15, y + s * 0.3, s * 0.5, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
  }

  private drawGull(c: CanvasRenderingContext2D, x: number, y: number, s: number, flap: number): void {
    const w = Math.sin(flap) * s * 0.5;
    c.strokeStyle = '#fffaf0';
    c.lineWidth = Math.max(2, s * 0.18);
    c.beginPath();
    c.moveTo(x - s, y - w);
    c.quadraticCurveTo(x - s * 0.4, y - s * 0.4, x, y);
    c.quadraticCurveTo(x + s * 0.4, y - s * 0.4, x + s, y - w);
    c.stroke();
  }

  private drawPlane(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    // The banner it's towing.
    c.strokeStyle = '#444';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x - s * 1.1, y);
    c.lineTo(x - s * 1.8, y);
    c.stroke();
    c.font = `700 ${Math.max(9, s * 0.3)}px ${UI}`;
    const text = 'ARE WE THERE YET?';
    const tw = c.measureText(text).width + s * 0.4;
    c.fillStyle = '#fffaf0';
    c.fillRect(x - s * 1.8 - tw, y - s * 0.25, tw, s * 0.5);
    c.fillStyle = '#ff3d2e';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, x - s * 1.8 - tw / 2, y + 1);
    // The plane.
    c.fillStyle = '#f4f4f8';
    c.beginPath();
    c.ellipse(x, y, s * 1.1, s * 0.25, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#3d8bff';
    c.fillRect(x - s * 0.9, y - s * 0.02, s * 1.8, s * 0.07);
    c.fillStyle = '#d6d6e2';
    c.beginPath();
    c.moveTo(x - s * 0.1, y);
    c.lineTo(x - s * 0.5, y + s * 0.65);
    c.lineTo(x - s * 0.25, y + s * 0.65);
    c.lineTo(x + s * 0.35, y);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(x - s * 0.85, y);
    c.lineTo(x - s * 1.1, y - s * 0.55);
    c.lineTo(x - s * 0.9, y - s * 0.55);
    c.lineTo(x - s * 0.6, y);
    c.closePath();
    c.fill();
    c.fillStyle = '#2b3a5a';
    for (let i = 0; i < 5; i++) c.fillRect(x - s * 0.4 + i * s * 0.22, y - s * 0.12, s * 0.1, s * 0.08);
  }

  private drawMoon(c: CanvasRenderingContext2D, x: number, y: number, rr: number): void {
    c.fillStyle = '#ece6cf';
    c.beginPath();
    c.arc(x, y, rr, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#d2caa9';
    for (const [dx, dy, s] of [
      [-0.4, -0.35, 0.16],
      [0.35, -0.1, 0.12],
      [-0.1, 0.45, 0.2],
      [0.5, 0.45, 0.09],
    ] as const) {
      c.beginPath();
      c.arc(x + dx * rr, y + dy * rr, s * rr, 0, Math.PI * 2);
      c.fill();
    }
    // A sleepy face, waking up as he gets close.
    c.strokeStyle = '#7a7058';
    c.lineWidth = Math.max(2, rr * 0.04);
    const open = this.mult > 8;
    for (const ex of [-0.28, 0.12]) {
      c.beginPath();
      if (open) c.arc(x + ex * rr, y - 0.05 * rr, rr * 0.06, 0, Math.PI * 2);
      else c.arc(x + ex * rr, y - 0.05 * rr, rr * 0.08, 0.1 * Math.PI, 0.9 * Math.PI);
      c.stroke();
    }
    c.beginPath();
    c.arc(x - 0.08 * rr, y + 0.15 * rr, rr * (open ? 0.1 : 0.16), open ? 0 : 0.15 * Math.PI, open ? Math.PI * 2 : 0.85 * Math.PI);
    c.stroke();
  }

  private drawSatellite(c: CanvasRenderingContext2D, x: number, y: number, s: number, t: number): void {
    c.save();
    c.translate(x, y);
    c.rotate(Math.sin(t * 0.5) * 0.3);
    c.fillStyle = '#3d8bff';
    c.fillRect(-s * 1.4, -s * 0.2, s * 0.9, s * 0.4);
    c.fillRect(s * 0.5, -s * 0.2, s * 0.9, s * 0.4);
    c.fillStyle = '#c9c9d6';
    c.fillRect(-s * 0.4, -s * 0.3, s * 0.8, s * 0.6);
    c.strokeStyle = '#c9c9d6';
    c.beginPath();
    c.moveTo(0, -s * 0.3);
    c.lineTo(0, -s * 0.7);
    c.stroke();
    c.restore();
  }

  private drawUfo(c: CanvasRenderingContext2D, x: number, y: number, s: number, t: number): void {
    // The alien, waving.
    c.fillStyle = '#7ee05a';
    c.beginPath();
    c.ellipse(x, y - s * 0.45, s * 0.3, s * 0.34, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#111';
    c.beginPath();
    c.ellipse(x - s * 0.12, y - s * 0.48, s * 0.08, s * 0.12, -0.4, 0, Math.PI * 2);
    c.ellipse(x + s * 0.12, y - s * 0.48, s * 0.08, s * 0.12, 0.4, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#7ee05a';
    c.lineWidth = Math.max(2, s * 0.08);
    const a = -0.9 + Math.sin(t * 8) * 0.5;
    c.beginPath();
    c.moveTo(x + s * 0.25, y - s * 0.3);
    c.lineTo(x + s * 0.25 + Math.cos(a) * s * 0.45, y - s * 0.3 + Math.sin(a) * s * 0.45);
    c.stroke();
    c.fillStyle = 'rgba(190, 230, 255, 0.45)';
    c.beginPath();
    c.arc(x, y - s * 0.15, s * 0.5, Math.PI, 0);
    c.fill();
    c.fillStyle = '#a7a3bd';
    c.beginPath();
    c.ellipse(x, y, s * 1.1, s * 0.3, 0, 0, Math.PI * 2);
    c.fill();
    for (let i = 0; i < 5; i++) {
      c.fillStyle = Math.sin(t * 6 + i) > 0 ? '#ffd34d' : '#ff6fa8';
      c.beginPath();
      c.arc(x - s * 0.8 + i * s * 0.4, y + s * 0.05, s * 0.07, 0, Math.PI * 2);
      c.fill();
    }
  }

  private drawDorkito(c: CanvasRenderingContext2D, x: number, y: number, s: number, spin: number): void {
    c.save();
    c.translate(x, y);
    c.rotate(spin);
    c.fillStyle = '#ff9a2e';
    c.strokeStyle = '#b4520a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -s);
    c.lineTo(s * 0.9, s * 0.6);
    c.lineTo(-s * 0.9, s * 0.6);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#d4481a';
    c.fillRect(-s * 0.2, -s * 0.1, s * 0.12, s * 0.12);
    c.fillRect(s * 0.15, s * 0.2, s * 0.12, s * 0.12);
    c.restore();
  }

  private drawSign(c: CanvasRenderingContext2D, x: number, y: number, s: number, lines: readonly string[], bg: string, ink: string): void {
    const size = Math.max(10, s * 0.38);
    c.font = `800 ${size}px ${UI}`;
    const w = Math.max(...lines.map((l) => c.measureText(l).width)) + size * 1.4;
    const hh = size * (lines.length * 1.3 + 0.8);
    c.fillStyle = '#9a9aa8';
    c.fillRect(x - 3, y + hh / 2, 6, s * 1.2);
    c.fillStyle = bg;
    c.strokeStyle = ink;
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(x - w / 2, y - hh / 2, w, hh, size * 0.4);
    c.fill();
    c.stroke();
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    lines.forEach((l, i) => {
      c.font = /\p{Extended_Pictographic}/u.test(l) ? `${size}px ${EMOJI}` : `800 ${size}px ${UI}`;
      c.fillText(l, x, y - hh / 2 + size * (1.05 + i * 1.3));
    });
  }
}
