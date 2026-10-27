// The Poop Plinko screen: Hammy squatting over the pegs, what he drops
// bouncing down them, and the toilets at the bottom. Drop as many as you
// like at once. The rules are in plinko.ts; your coins go through
// arcadeview.ts.
import { h, setDisabled, setText } from '@shared/dom';
import { fmt } from '@shared/format';
import { BetPicker, Choice, Ledger, UI_FONT, arcadeCard, bubble, fairRoll, fitCanvas, loud, pick, x2, type ArcadeHost, type ArcadeScreen, type ArcadeSession } from './arcadeview';
import { isAlive } from './alive';
import { defaultLook, drawHammy } from './hammy';
import { buzz } from './haptics';
import { PLINKO_BIG, PLINKO_GRUNT, PLINKO_MEH, PLINKO_RISKS, PLINKO_ROWS, binOf, dropPath, plinkoTable, type PlinkoRisk, type PlinkoRows } from './plinko';
import type { LiveDrop, PlinkoSource } from './roundsource';
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
  /** Online: what the server paid for this drop (it holds the coins back from your wallet until it lands). */
  won?: number;
  /** Online: somebody else's drop, shown on your board. */
  other?: { emoji: string; name: string };
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
  // Only when the rounds come from a server (see roundsource.ts).
  private inflight = 0;
  private stop: (() => void) | null = null;
  private recentKey = '';
  private wasOnline = true;

  private canvas = h('canvas', { class: 'plinko-board', role: 'img', 'aria-label': 'Hammy over a board of pegs, with toilets at the bottom' });
  private historyEl = h('ol', { class: 'arcade-history', 'aria-label': 'Where the last drops landed' });
  private status = h('p', { class: 'arcade-status', 'aria-live': 'polite' });
  private go = h('button', { class: 'btn btn-cheese arcade-go', type: 'button' });
  private recentEl = h('ul', { class: 'rocket-crowd plinko-crowd', 'aria-label': 'Everybody’s latest drops' });
  private fairEl = h('p', { class: 'fair-line' });

  /** `src`: one board for everyone, with the drops rolled on a server, instead of rolled here. */
  constructor(
    private host: ArcadeHost,
    close: () => void,
    private src?: PlinkoSource,
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
    const { card, syncCoins } = arcadeCard(
      'plinko',
      close,
      this.historyEl,
      this.canvas,
      this.status,
      this.go,
      this.rowsChoice.el,
      this.riskChoice.el,
      this.picker.el,
      src ? h('h3', { class: 'arcade-sub' }, 'On the board') : null,
      src ? this.recentEl : null,
      src ? this.fairEl : null,
    );
    this.card = card;
    this.syncCoins = syncCoins;
    this.card.addEventListener('keydown', (e) => {
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        this.drop();
      }
    });
    setText(this.status, src ? 'One board for everybody. Each drop costs your bet and pays whatever toilet it lands in.' : 'Each drop costs your bet and pays whatever toilet it lands in. Drop as many as you like.');
    if (src) this.stop = src.onDrop((d) => this.others(d));
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
    this.stop?.();
    // Anything still bouncing lands where it was always going to.
    for (const b of this.balls) {
      if (b.paid || b.other) continue;
      if (this.src) this.src.release(b.won ?? 0);
      else this.ledger.pay(b.bet, b.mult);
    }
    return this.ledger.session;
  }

  private drop(): void {
    if (this.closed) return;
    if (this.src) return this.dropRemote(this.src);
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

  /** Drop one on the shared board: the server rolls it and tells us where it goes. */
  private dropRemote(src: PlinkoSource): void {
    const amount = this.picker.amount;
    if (!this.picker.affordable) return void setText(this.status, 'Not enough coins for that bet.');
    if (this.inflight >= 4) return;
    this.inflight += 1;
    const rows = prefs.rows;
    const risk = prefs.risk;
    void src.drop(amount, rows, risk).then((r) => {
      this.inflight -= 1;
      if (!r.ok) return void setText(this.status, r.message);
      if (this.closed) return src.release(r.won);
      const now = performance.now();
      const d = r.drop;
      this.balls.push({ path: [...d.path].map((c) => c === '1'), bin: d.bin, bet: d.bet, mult: d.mult, born: now, paid: false, won: r.won });
      this.ledger.session.rounds += 1;
      this.ledger.session.net -= d.bet;
      this.squat = now;
      sfx.fart(0.5);
      if (!this.bubbleLine || now > this.bubbleLine.until) this.bubbleLine = { text: pick(PLINKO_GRUNT), until: now + 900 };
    });
  }

  /** Somebody else's drop: a fainter poop on your board, squeezed to your board's rows. */
  private others(d: LiveDrop): void {
    if (this.closed || this.balls.length > 30) return;
    const rows = prefs.rows;
    const t = Math.round((d.bin / d.rows) * rows);
    const path = Array.from({ length: rows }, (_, j) => Math.floor(((j + 1) * t) / rows) > Math.floor((j * t) / rows));
    this.balls.push({ path, bin: t, bet: d.bet, mult: d.mult, born: performance.now(), paid: false, other: { emoji: d.emoji, name: d.name } });
  }

  private land(b: Ball, now: number): void {
    b.paid = true;
    if (b.other) {
      // Not yours: just a bounce in the toilet and what it paid them.
      this.hits.set(b.bin, now);
      this.popups.push({ text: `${b.other.emoji} ${x2(b.mult)}`, bin: b.bin, born: now, color: b.mult >= 1 ? '#bfeedd' : '#f3c0b8' });
      return;
    }
    if (this.src) this.src.release(b.won ?? 0);
    const won = this.src ? (b.won ?? 0) : this.ledger.pay(b.bet, b.mult);
    if (this.src) this.ledger.session.net += won;
    this.hits.set(b.bin, now);
    if (!this.src) {
      history.unshift(b.mult);
      if (history.length > 14) history.pop();
    }
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
    const list = this.src ? this.src.recent().map((d) => d.mult) : history;
    this.historyEl.replaceChildren(...list.map((m) => h('li', { class: m >= 10 ? 'hi' : m >= 1 ? 'mid' : 'lo' }, x2(m))));
    if (!list.length) this.historyEl.append(h('li', { class: 'none' }, 'Nothing dropped yet'));
  }

  // Each frame ----------------------------------------------------------------

  private frame = (now: number): void => {
    if (this.closed) return;
    for (const b of this.balls) if (!b.paid && (now - b.born) / 1000 >= (b.path.length + 1) * ROW_SECONDS) this.land(b, now);
    this.balls = this.balls.filter((b) => !b.paid || now - b.born < (b.path.length + 1) * ROW_SECONDS * 1000 + 250);
    this.popups = this.popups.filter((p) => now - p.born < 1200);
    if (this.src) this.followRemote(this.src);
    this.draw(now);
    this.sync();
    this.raf = requestAnimationFrame(this.frame);
  };

  /** The shared board's news: the list of latest drops (everybody's), the fair line, and the connection. */
  private followRemote(src: PlinkoSource): void {
    const online = src.online();
    if (online !== this.wasOnline) {
      this.wasOnline = online;
      setText(this.status, online ? 'Back on the board.' : 'Lost the board. Reconnecting…');
    }
    const recent = src.recent();
    const key = recent.map((d) => `${d.who}:${d.n}`).join('|');
    if (key !== this.recentKey) {
      this.recentKey = key;
      this.recentEl.replaceChildren(
        ...recent.slice(0, 6).map((d) =>
          h(
            'li',
            { class: `${d.real ? 'real ' : ''}${d.mult >= 1 ? 'won' : 'lost'}`.trim() },
            h('span', { class: 'rocket-who' }, `${d.emoji} ${d.who === src.me ? 'You' : d.name}`),
            h('span', { class: 'rocket-bet' }, `${fmt(d.bet)} · ${d.rows} rows, ${d.risk} · ${x2(d.mult)}`),
          ),
        ),
      );
      if (!recent.length) this.recentEl.append(h('li', { class: 'none' }, 'Nothing dropped yet'));
      this.renderHistory();
    }
    setText(this.fairEl, src.fair());
  }

  private sync(): void {
    const s = this.host.state;
    this.syncCoins(s.coins);
    // The board can only change while nothing's on it.
    const busy = this.balls.some((b) => !b.paid && !b.other);
    this.rowsChoice.lock(busy);
    this.riskChoice.lock(busy);
    setText(this.go, `Drop one · ${fmt(this.picker.amount)} ${this.picker.amount === 1 ? 'coin' : 'coins'}`);
    setDisabled(this.go, !isAlive(s) || !this.picker.affordable || (!!this.src && !this.src.online()));
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
      if (b.other) {
        c.globalAlpha = 0.55;
        this.drawPoop(c, x, y, br * 0.85);
        c.globalAlpha = 1;
        c.font = `700 ${Math.max(8, br * 1.1)}px ${UI_FONT}`;
        c.fillStyle = 'rgba(255, 250, 240, 0.8)';
        c.textAlign = 'center';
        c.textBaseline = 'bottom';
        c.fillText(b.other.name, Math.min(W - 24, Math.max(24, x)), y - br * 0.9);
      } else this.drawPoop(c, x, y, br);
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
