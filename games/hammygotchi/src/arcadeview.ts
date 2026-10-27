// What every screen in Hammy's Arcade shares: the coins going in and out
// (and how the sitting went), the bet picker, option buttons, and the card
// it all sits in. The games themselves are rocketview.ts, minesview.ts,
// crossingview.ts and plinkoview.ts.
import { h, setDisabled, setText } from '@shared/dom';
import { fmt } from '@shared/format';
import { ARCADE_BY_ID, MIN_BET, type ArcadeGame, type ArcadeSeat } from './arcade';
import type { FormId } from './defs';

export interface ArcadeHost {
  readonly state: ArcadeSeat;
  /** What he is today. */
  readonly form: FormId;
  /** Put coins on him: false if you can't. */
  bet(game: ArcadeGame, amount: number): boolean;
  /** A bet comes back times `mult`: returns what came back. */
  payOut(game: ArcadeGame, bet: number, mult: number): number;
  refund(game: ArcadeGame, bet: number): void;
}

/** How a sitting went, for Hammy to react to back in the unit. */
export interface ArcadeSession {
  rounds: number;
  net: number;
}

/** One game, on screen. */
export interface ArcadeScreen {
  readonly card: HTMLElement;
  /** What to focus when it opens. */
  readonly focus: HTMLElement;
  /** Stop, square up anything still out, and say how it went. */
  close(): ArcadeSession;
}

/** Coins in and out for one game, keeping count for the sitting. */
export class Ledger {
  readonly session: ArcadeSession = { rounds: 0, net: 0 };

  constructor(
    private host: ArcadeHost,
    private game: ArcadeGame,
  ) {}

  get coins(): number {
    return this.host.state.coins;
  }

  /** Bet `amount` (or what's left, if that's less). Returns what went in: 0 if nothing could. */
  bet(amount: number): number {
    const a = Math.min(Math.floor(amount), Math.floor(this.coins));
    if (a < MIN_BET || !this.host.bet(this.game, a)) return 0;
    this.session.rounds += 1;
    this.session.net -= a;
    return a;
  }

  pay(bet: number, mult: number): number {
    const won = this.host.payOut(this.game, bet, mult);
    this.session.net += won;
    return won;
  }

  refund(bet: number): void {
    this.host.refund(this.game, bet);
    this.session.rounds -= 1;
    this.session.net += bet;
  }
}

/** The bet, shared by every game while the page is open (not saved). */
const prefs = { amount: 10 };

/** Bet amount: the number, halve it, double it, everything. */
export class BetPicker {
  readonly el: HTMLElement;
  private input = h('input', { class: 'arcade-amount', type: 'number', min: MIN_BET, step: 1, inputmode: 'numeric', 'aria-label': 'Bet, in coins' });
  private chips: HTMLButtonElement[];

  constructor(private coins: () => number) {
    const chip = (label: string, title: string, f: () => void) => h('button', { class: 'arcade-chip', type: 'button', 'aria-label': title, onclick: f }, label);
    this.chips = [
      chip('½', 'Half the bet', () => this.set(prefs.amount / 2)),
      chip('2×', 'Double the bet', () => this.set(prefs.amount * 2)),
      chip('Max', 'Bet everything', () => this.set(this.coins())),
    ];
    this.input.value = String(prefs.amount);
    this.input.addEventListener('input', () => {
      const v = Math.floor(Number(this.input.value));
      if (Number.isFinite(v) && v >= MIN_BET) prefs.amount = v;
    });
    this.input.addEventListener('change', () => this.set(Number(this.input.value)));
    this.el = h('div', { class: 'arcade-row' }, this.chips[0], this.input, this.chips[1], this.chips[2]);
  }

  get amount(): number {
    return prefs.amount;
  }

  /** Whether you have enough for it. */
  get affordable(): boolean {
    return prefs.amount >= MIN_BET && prefs.amount <= this.coins();
  }

  set(v: number): void {
    prefs.amount = Math.max(MIN_BET, Math.floor(Number.isFinite(v) ? v : MIN_BET));
    if (this.input.value !== String(prefs.amount)) this.input.value = String(prefs.amount);
  }

  /** No changing the bet while a round is on. */
  lock(on: boolean): void {
    if (this.input.disabled !== on) this.input.disabled = on;
    for (const c of this.chips) setDisabled(c, on);
  }
}

/** A row of options, one of them picked: rows, risk, difficulty, mines. */
export class Choice<T extends string | number> {
  readonly el: HTMLElement;
  private buttons: { value: T; el: HTMLButtonElement }[];

  constructor(
    label: string,
    options: readonly { value: T; label: string }[],
    private get: () => T,
    set: (v: T) => void,
  ) {
    this.buttons = options.map((o) => ({
      value: o.value,
      el: h('button', { class: 'arcade-opt', type: 'button', onclick: () => (set(o.value), this.sync()) }, o.label),
    }));
    this.el = h('div', { class: 'arcade-choice', role: 'group', 'aria-label': label }, h('span', { class: 'arcade-choice-label' }, label), ...this.buttons.map((b) => b.el));
    this.sync();
  }

  sync(): void {
    const v = this.get();
    for (const b of this.buttons) b.el.setAttribute('aria-pressed', String(b.value === v));
  }

  lock(on: boolean): void {
    for (const b of this.buttons) setDisabled(b.el, on);
  }
}

/** The card a game sits in: its name, your coins and a way out on top, the small print below. */
export function arcadeCard(game: ArcadeGame, close: () => void, ...children: (Node | null)[]): { card: HTMLElement; syncCoins: (coins: number) => void } {
  const def = ARCADE_BY_ID[game];
  const coins = h('span', { class: 'arcade-coins' });
  const card = h(
    'div',
    { class: `modal-card arcade-card arcade-${game}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
    h(
      'div',
      { class: 'arcade-top' },
      h('h2', { id: 'modal-title' }, `${def.emoji} ${def.name}`),
      coins,
      h('button', { class: 'arcade-close', type: 'button', 'aria-label': `Close ${def.name}`, onclick: close }, '✕'),
    ),
    ...children,
    h('p', { class: 'note' }, 'Bets are Hammy coins, never real money. Over many rounds you get back about 99 of every 100 coins you bet.'),
  );
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  return { card, syncCoins: (n: number) => setText(coins, `🪙 ${fmt(n)}`) };
}

/** Canvas helpers the games share. */
export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
export const DISPLAY_FONT = '"Bagel Fat One", "Cooper Black", system-ui, sans-serif';
export const UI_FONT = 'Rubik, system-ui, sans-serif';

/** Fit a canvas to its box at the screen's pixel density. Returns its size in CSS pixels, or null if it isn't showing. */
export function fitCanvas(cv: HTMLCanvasElement): { c: CanvasRenderingContext2D; W: number; H: number } | null {
  const W = cv.clientWidth;
  const H = cv.clientHeight;
  const c = cv.getContext('2d');
  if (!W || !H || !c) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, W, H };
}

/** Text with a dark outline, so it reads on anything. */
export function loud(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, font = DISPLAY_FONT): void {
  c.font = font === DISPLAY_FONT ? `${size}px ${DISPLAY_FONT}` : `800 ${size}px ${font}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = Math.max(3, size * 0.14);
  c.strokeStyle = 'rgba(20, 8, 30, 0.85)';
  c.strokeText(text, x, y);
  c.fillStyle = fill;
  c.fillText(text, x, y);
}

export function emoji(c: CanvasRenderingContext2D, e: string, x: number, y: number, size: number): void {
  c.font = `${size}px ${EMOJI_FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(e, x, y);
}

/** A speech bubble with its left edge near `x`, its bottom at `y`. */
export function bubble(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, W: number): void {
  c.font = `700 ${size}px ${UI_FONT}`;
  const bw = c.measureText(text).width + size * 1.2;
  const bh = size * 1.9;
  const bx = Math.min(Math.max(6, x), W - bw - 6);
  const by = Math.max(6, y - bh);
  c.fillStyle = '#fffaf0';
  c.strokeStyle = '#2b1400';
  c.lineWidth = 2;
  c.beginPath();
  c.roundRect(bx, by, bw, bh, bh / 2);
  c.fill();
  c.stroke();
  c.fillStyle = '#2b1400';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText(text, bx + size * 0.6, by + bh / 2 + 1);
}

export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
/** A uniform roll in [0, 1) from the browser's crypto, for the rounds themselves. */
export const fairRoll = (): number => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
export const x2 = (m: number): string => `${(Math.floor(m * 100 + 1e-9) / 100).toFixed(2)}×`;
