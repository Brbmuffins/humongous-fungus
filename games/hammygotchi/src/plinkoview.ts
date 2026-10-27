// The Poop Plinko screen: Hammy squatting over the pegs, what he drops
// bouncing down them, and the toilets at the bottom. Drop as many as you
// like at once. The rules are in plinko.ts; your coins go through
// arcadeview.ts.
import { h, setDisabled, setText } from '@shared/dom';
import { fmt } from '@shared/format';
import { BetPicker, Choice, Ledger, UI_FONT, arcadeCard, bubble, fairRoll, fitCanvas, loud, pick, x2, type ArcadeHost, type ArcadeScreen, type ArcadeSession } from './arcadeview';
import { isAlive } from './game';
import { defaultLook, drawHammy } from './hammy';
import { buzz } from './native';
import { PLINKO_BIG, PLINKO_GRUNT, PLINKO_MEH, PLINKO_RISKS, PLINKO_ROWS, binOf, dropPath, plinkoTable, type PlinkoRisk, type PlinkoRows } from './plinko';
import { sfx } from './sound';

/** Kept between sittings while the page is open (not saved). */
const prefs: { rows: PlinkoRows; risk: PlinkoRisk } = { rows: 12, risk: 'medium' };
const history: number[] = [];

/** Seconds per row of pegs. */
const ROW_SECONDS = 0.13;

interface Ball {
  path: boolean[];
  bin: number;
  bet: number;
  mult: number;
  born: number;
  paid: boolean;
}

export class PlinkoApp implements ArcadeScreen {
  readonly card: HTMLElement;
  private ledger: Ledger;
  private picker: BetPicker;
  private syncCoins: (coins: number) => void;
  private rowsChoice: Choice<PlinkoRows>;
  private riskChoice: Choice<PlinkoRisk>;
  private balls: Ball[] = [];
  /** When each toilet last got one, for its bounce. */
  private hits = new Map<number, number>();
  private popups: { text: string; bin: number; born: number; color: string }[] = [];
  private squat = 0;
  private bubbleLine: { text: string; until: number } | null = null;
  private raf = 0;
  private closed = false;

  private canvas = h('canvas', { class: 'plinko-board', role: 'img', 'aria-label': 'Hammy over a board of pegs, with toilets at the bottom' });
  private historyEl = h('ol', { class: 'arcade-history', 'aria-label': 'Where the last drops landed' });
  private status = h('p', { class: 'arcade-status', 'aria-live': 'polite' });
  private go = h('button', { class: 'btn btn-cheese arcade-go', type: 'button' });

  constructor(
    private host: ArcadeHost,
    close: () => void,
  ) {
    this.ledger = new Ledger(host, 'plinko');
    this.picker = new BetPicker(() => host.state.coins);
    this.rowsChoice = new Choice<PlinkoRows>(
      'Rows',
      PLINKO_ROWS.map((r) => ({ value: r, label: String(r) })),
      () => prefs.rows,
      (r) => (prefs.rows = r),
    );
    this.riskChoice = new Choice<PlinkoRisk>(
      'Risk',
      PLINKO_RISKS.map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) })),
      () => prefs.risk,
      (r) => (prefs.risk = r),
    );
    this.go.addEventListener('click', () => this.drop());
    const { card, syncCoins } = arcadeCard('plinko', close, this.historyEl, this.canvas, this.status, this.go, this.rowsChoice.el, this.riskChoice.el, this.picker.el);
    this.card = card;
    this.syncCoins = syncCoins;
    this.card.addEventListener('keydown', (e) => {
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        this.drop();
      }
    });
    setText(this.status, 'Each drop costs your bet and pays whatever toilet it lands in. Drop as many as you like.');
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
    // Anything still bouncing lands where it was always going to.
    for (const b of this.balls) if (!b.paid) this.ledger.pay(b.bet, b.mult);
    return this.ledger.session;
  }

  private drop(): void {
    if (this.closed) return;
    const amount = this.ledger.bet(this.picker.amount);
    if (!amount) {
      setText(this.status, isAlive(this.host.state) ? 'Not enough coins for that bet.' : 'Hammy is dead. Nothing left to drop.');
      return;
    }
    const path = dropPath(prefs.rows, fairRoll);
    const bin = binOf(path);
    const now = performance.now();
    this.balls.push({ path, bin, bet: amount, mult: plinkoTable(prefs.rows, prefs.risk)[bin], born: now, paid: false });
    this.squat = now;
    sfx.fart(0.5);
    if (!this.bubbleLine || now > this.bubbleLine.until) this.bubbleLine = { text: pick(PLINKO_GRUNT), until: now + 900 };
  }

  private land(b: Ball, now: number): void {
    b.paid = true;
    const won = this.ledger.pay(b.bet, b.mult);
    this.hits.set(b.bin, now);
    history.unshift(b.mult);
    if (history.length > 14) history.pop();
    this.renderHistory();
    const up = won - b.bet;
    this.popups.push({ text: up >= 0 ? `+${fmt(won)}` : x2(b.mult), bin: b.bin, born: now, color: b.mult >= 1 ? '#5ee0b0' : '#ff8a7a' });
    if (b.mult >= 10) {
      sfx.kaching();
      buzz.success();
      this.bubbleLine = { text: pick(PLINKO_BIG), until: now + 1800 };
    } else if (b.mult >= 1) sfx.coin();
    else {
      sfx.plop();
      if (Math.random() < 0.3) this.bubbleLine = { text: pick(PLINKO_MEH), until: now + 1400 };
    }
    setText(this.status, `Landed in the ${x2(b.mult)} toilet: ${fmt(won)} back for ${fmt(b.bet)}.`);
  }

  private renderHistory(): void {
    this.historyEl.replaceChildren(...history.map((m) => h('li', { class: m >= 10 ? 'hi' : m >= 1 ? 'mid' : 'lo' }, x2(m))));
    if (!history.length) this.historyEl.append(h('li', { class: 'none' }, 'Nothing dropped yet'));
  }

  // Each frame ----------------------------------------------------------------

  private frame = (now: number): void => {
    if (this.closed) return;
    for (const b of this.balls) if (!b.paid && (now - b.born) / 1000 >= (b.path.length + 1) * ROW_SECONDS) this.land(b, now);
    this.balls = this.balls.filter((b) => !b.paid || now - b.born < (b.path.length + 1) * ROW_SECONDS * 1000 + 250);
    this.popups = this.popups.filter((p) => now - p.born < 1200);
    this.draw(now);
    this.sync();
    this.raf = requestAnimationFrame(this.frame);
  };

  private sync(): void {
    const s = this.host.state;
    this.syncCoins(s.coins);
    // The board can only change while nothing's on it.
    const busy = this.balls.some((b) => !b.paid);
    this.rowsChoice.lock(busy);
    this.riskChoice.lock(busy);
    setText(this.go, `Drop one · ${fmt(this.picker.amount)} ${this.picker.amount === 1 ? 'coin' : 'coins'}`);
    setDisabled(this.go, !isAlive(s) || !this.picker.affordable);
  }

  private draw(now: number): void {
    const fit = fitCanvas(this.canvas);
    if (!fit) return;
    const { c, W, H } = fit;
    const t = now / 1000;
    const rows = prefs.rows;
    const table = plinkoTable(rows, prefs.risk);
    const top = H * 0.2;
    const binH = Math.max(18, H * 0.075);
    const bottom = H - binH - 8;
    const dx = Math.min((W * 0.94) / (rows + 2), ((bottom - top) / rows) * 1.25);
    const dy = (bottom - top) / rows;
    const pegX = (r: number, j: number) => W / 2 + (j - (r + 2) / 2) * dx;
    const pegY = (r: number) => top + r * dy + dy * 0.3;

    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a1d40');
    g.addColorStop(1, '#140c20');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // Hammy, squatting over the board.
    const s = this.host.state;
    const look = defaultLook(s.fit, this.host.form);
    const strain = Math.max(0, 1 - (now - this.squat) / 400);
    look.face = strain > 0 ? 'shock' : this.popups.some((p) => p.color === '#5ee0b0') ? 'joy' : 'smug';
    look.sy = 1 - strain * 0.15;
    look.sx = 1 + strain * 0.08;
    look.blink = Math.sin(t * 1.3) > 0.985;
    look.green = Math.min(0.5, Math.max(0, (40 - s.fresh) / 80));
    const hr = Math.min(H * 0.07, W * 0.07);
    drawHammy(c, W / 2, top - hr * 1.6, hr, look, t);
    if (this.bubbleLine && now < this.bubbleLine.until) bubble(c, this.bubbleLine.text, W / 2 + hr * 1.2, top - hr * 1.2, Math.max(10, H * 0.04), W);

    // The pegs.
    c.fillStyle = '#f4e9c8';
    const pr = Math.max(2, dx * 0.1);
    for (let r = 0; r < rows; r++) {
      for (let j = 0; j < r + 3; j++) {
        c.beginPath();
        c.arc(pegX(r, j), pegY(r), pr, 0, Math.PI * 2);
        c.fill();
      }
    }

    // The toilets.
    const bw = dx * 0.92;
    for (let i = 0; i <= rows; i++) {
      const m = table[i];
      const bx = W / 2 + (i - rows / 2) * dx;
      const hit = this.hits.get(i);
      const bounce = hit !== undefined && now - hit < 300 ? Math.sin(((now - hit) / 300) * Math.PI) * binH * 0.3 : 0;
      c.fillStyle = m >= 10 ? '#ff5c5c' : m >= 3 ? '#ff9a2e' : m >= 1 ? '#ffd34d' : '#6f6688';
      c.beginPath();
      c.roundRect(bx - bw / 2, bottom + 4 + bounce, bw, binH, Math.min(6, bw * 0.25));
      c.fill();
      c.fillStyle = m >= 1 ? '#2b1400' : '#fbf3e6';
      const label = m >= 1000 ? `${m / 1000}K` : String(m);
      c.font = `800 ${Math.max(7, Math.min(binH * 0.5, (bw * 1.6) / Math.max(2, label.length + 1)))}px ${UI_FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label, bx, bottom + 4 + bounce + binH / 2 + 1);
    }

    // What he dropped, bouncing down.
    const br = Math.max(5, dx * 0.34);
    for (const b of this.balls) {
      const k = (now - b.born) / 1000 / ROW_SECONDS;
      if (b.paid && k > b.path.length + 1) continue;
      let x = W / 2;
      let y = top - hr * 0.6;
      if (k < 1) {
        // Out of Hammy and onto the first peg.
        y = top - hr * 0.6 + (pegY(0) - pr - br - (top - hr * 0.6)) * k * k;
      } else {
        const row = Math.min(b.path.length, Math.floor(k - 1));
        const f = Math.min(1, k - 1 - row);
        const rights = b.path.slice(0, row).filter(Boolean).length;
        const x0 = W / 2 + (rights - row / 2) * dx;
        const going = row < b.path.length ? (b.path[row] ? 1 : -1) : 0;
        x = x0 + going * f * dx * 0.5;
        const y0 = pegY(Math.min(row, rows - 1)) - pr - br;
        const y1 = row + 1 < rows ? pegY(row + 1) - pr - br : bottom + 4;
        y = row < b.path.length ? y0 + (y1 - y0) * f * f - Math.sin(f * Math.PI) * dy * 0.35 : bottom + 4;
      }
      this.drawPoop(c, x, y, br);
    }

    for (const p of this.popups) {
      const k = (now - p.born) / 1200;
      c.globalAlpha = Math.max(0, 1 - k);
      loud(c, p.text, W / 2 + (p.bin - rows / 2) * dx, bottom - k * H * 0.08, Math.max(11, H * 0.045), p.color, UI_FONT);
      c.globalAlpha = 1;
    }
  }

  /** A little brown swirl. */
  private drawPoop(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    c.fillStyle = '#7a4a1e';
    c.beginPath();
    c.ellipse(x, y + r * 0.35, r, r * 0.55, 0, 0, Math.PI * 2);
    c.ellipse(x, y - r * 0.1, r * 0.75, r * 0.45, 0, 0, Math.PI * 2);
    c.ellipse(x + r * 0.1, y - r * 0.55, r * 0.45, r * 0.35, 0.3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.35)';
    c.beginPath();
    c.ellipse(x - r * 0.35, y + r * 0.2, r * 0.22, r * 0.12, -0.4, 0, Math.PI * 2);
    c.fill();
  }
}
