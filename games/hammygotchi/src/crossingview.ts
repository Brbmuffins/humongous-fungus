// The Hammy Crossing screen: the road, the traffic, and Hammy stepping out
// into it one lane at a time. The rules are in crossing.ts; your coins go
// through arcadeview.ts.
import { h, setDisabled, setText } from '@shared/dom';
import { fmt } from '@shared/format';
import { BetPicker, Choice, Ledger, UI_FONT, arcadeCard, bubble, emoji, fairRoll, fitCanvas, loud, pick, x2, type ArcadeHost, type ArcadeScreen, type ArcadeSession } from './arcadeview';
import { asphalt, carLength, drawCar } from './cars';
import { CROSS_DONE, CROSS_SAFE, CROSS_START, DIFFICULTIES, DIFFICULTY_BY_ID, VEHICLES, crossLane, laneMultiplier, type Difficulty, type VehicleDef } from './crossing';
import { isAlive } from './game';
import { EXTENTS, defaultLook, drawHammy } from './hammy';
import { buzz } from './native';
import { sfx } from './sound';

/** Kept between sittings while the page is open (not saved). */
const prefs: { difficulty: Difficulty } = { difficulty: 'medium' };

/** How long a step takes: the hop, then whatever's coming. */
const HOP_MS = 320;
const ARRIVE_MS = 480;

interface Car {
  lane: number;
  /** Where its front bumper is, as a fraction of the height, top to bottom. */
  y: number;
  v: VehicleDef;
  /** The one coming for him: it brakes, or it doesn't. */
  hero?: boolean;
}

interface Step {
  from: number;
  at: number;
  safe: boolean;
  v: VehicleDef;
}

export class CrossingApp implements ArcadeScreen {
  readonly card: HTMLElement;
  private ledger: Ledger;
  private picker: BetPicker;
  private syncCoins: (coins: number) => void;
  private choice: Choice<Difficulty>;
  private bet = 0;
  /** Lanes he's made it across. */
  private lane = 0;
  private step: Step | null = null;
  private over: { won: boolean; at: number; lane: number } | null = null;
  private won = 0;
  private cars: Car[] = [];
  /** Cars that braked for him, parked behind the barrier, by lane. */
  private parked = new Map<number, VehicleDef>();
  private spawnAt = new Map<number, number>();
  private cam = 0;
  private bubbleLine: { text: string; until: number } | null = null;
  private popups: { text: string; lane: number; y: number; born: number; color: string }[] = [];
  private raf = 0;
  private last = 0;
  private closed = false;
  /** From the last frame drawn: a car's width over the height, and where a braking car stops. */
  private carW = 0.18;
  private stopAt = 0.38;
  private road: CanvasPattern | null = null;

  private canvas = h('canvas', { class: 'crossing-road', role: 'img', 'aria-label': 'Hammy at the side of a busy road' });
  private status = h('p', { class: 'arcade-status', 'aria-live': 'polite' });
  private go = h('button', { class: 'btn btn-cheese arcade-go', type: 'button' });
  private cash = h('button', { class: 'btn btn-quiet arcade-go2', type: 'button' });

  constructor(
    private host: ArcadeHost,
    close: () => void,
  ) {
    this.ledger = new Ledger(host, 'crossing');
    this.picker = new BetPicker(() => host.state.coins);
    this.choice = new Choice<Difficulty>(
      'Road',
      DIFFICULTIES.map((d) => ({ value: d.id, label: d.name })),
      () => prefs.difficulty,
      (d) => {
        prefs.difficulty = d;
        this.reset();
      },
    );
    this.go.addEventListener('click', () => this.action());
    this.cash.addEventListener('click', () => this.bail());
    const { card, syncCoins } = arcadeCard('crossing', close, this.canvas, this.status, h('div', { class: 'arcade-buttons' }, this.go, this.cash), this.choice.el, this.picker.el);
    this.card = card;
    this.syncCoins = syncCoins;
    this.card.addEventListener('keydown', (e) => {
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        this.action();
      }
    });
    this.reset();
    setText(this.status, 'Pick a road, bet, and walk him across. Cash out on any lane.');
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  get focus(): HTMLElement {
    return this.go;
  }

  close(): ArcadeSession {
    if (this.closed) return this.ledger.session;
    // A step already under way finishes the way it was going to.
    if (this.step) this.land(performance.now(), true);
    if (this.bet && !this.over) {
      if (this.lane) this.cashOut(performance.now());
      else this.ledger.refund(this.bet);
    }
    this.closed = true;
    cancelAnimationFrame(this.raf);
    return this.ledger.session;
  }

  private get d(): Difficulty {
    return prefs.difficulty;
  }

  private reset(): void {
    this.bet = 0;
    this.lane = 0;
    this.step = null;
    this.over = null;
    this.cars = [];
    this.parked.clear();
    this.spawnAt.clear();
    this.popups = [];
    this.bubbleLine = null;
  }

  private action(): void {
    if (this.closed || this.step) return;
    const now = performance.now();
    if (!this.bet || this.over) {
      if (this.over) this.reset();
      const amount = this.ledger.bet(this.picker.amount);
      if (!amount) {
        setText(this.status, isAlive(this.host.state) ? 'Not enough coins for that bet.' : 'Hammy is dead. He’s not crossing anything.');
        return;
      }
      this.bet = amount;
      sfx.coin();
      this.say(pick(CROSS_START), now);
      setText(this.status, `You’re in for ${fmt(amount)}. Tap Go to step into the first lane.`);
      return;
    }
    // Into the next lane. Whether he makes it is decided now.
    const safe = crossLane(this.d, fairRoll);
    this.step = { from: this.lane, at: now, safe, v: pick(VEHICLES) };
    this.cars = this.cars.filter((c) => c.lane !== this.lane + 1);
    this.cars.push({ lane: this.lane + 1, y: -0.02, v: this.step.v, hero: true });
    sfx.boing();
  }

  private bail(): void {
    if (this.closed || this.step || !this.bet || this.over) return;
    if (!this.lane) {
      this.ledger.refund(this.bet);
      this.bet = 0;
      setText(this.status, 'Bet taken back.');
      return;
    }
    this.cashOut(performance.now());
  }

  private cashOut(now: number): void {
    const mult = laneMultiplier(this.d, this.lane);
    this.won = this.ledger.pay(this.bet, mult);
    this.over = { won: true, at: now, lane: this.lane };
    sfx.kaching();
    buzz.success();
    setText(this.status, `Cashed out after ${this.lane} ${this.lane === 1 ? 'lane' : 'lanes'} at ${x2(mult)}: ${fmt(this.won)} coins.`);
  }

  /** The step's over: he made it, or he's a pancake. */
  private land(now: number, quiet = false): void {
    const st = this.step;
    if (!st) return;
    this.step = null;
    const lane = st.from + 1;
    if (st.safe) {
      this.lane = lane;
      this.parked.set(lane, st.v);
      this.cars = this.cars.filter((c) => !c.hero);
      if (quiet) return;
      sfx.bonk();
      this.popups.push({ text: 'SCREECH', lane, y: 0.3, born: now, color: '#fffaf0' }, { text: 'HONK', lane, y: 0.4, born: now + 200, color: '#ffd34d' });
      const total = DIFFICULTY_BY_ID[this.d].lanes;
      if (lane >= total) {
        this.cashOut(now);
        this.say(CROSS_DONE, now);
        return;
      }
      this.say(pick(CROSS_SAFE), now);
      setText(this.status, `${lane} ${lane === 1 ? 'lane' : 'lanes'}: ${x2(laneMultiplier(this.d, lane))}. Go again or cash out.`);
    } else {
      this.over = { won: false, at: now, lane };
      if (quiet) return;
      sfx.splat();
      sfx.lose();
      buzz.bad();
      this.popups.push({ text: 'SPLAT', lane, y: 0.5, born: now, color: '#ff5c5c' });
      this.say(pick(['I’m flat.', 'Ow.', 'Who taught that thing to drive?', 'I saw my life flash. Mostly Dorkitos.']), now + 300);
      setText(this.status, `Flattened by ${st.v.name} in lane ${lane}. You lost ${fmt(this.bet)}.`);
    }
  }

  private say(text: string, now: number): void {
    this.bubbleLine = { text, until: now + 2200 };
  }

  // Each frame ----------------------------------------------------------------

  private frame = (now: number): void => {
    if (this.closed) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.tick(now, dt);
    this.draw(now);
    this.sync();
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Where he is, in lanes from the curb. */
  private pos(now: number): number {
    if (this.over) return this.over.lane;
    if (!this.step) return this.lane;
    return this.step.from + Math.min(1, (now - this.step.at) / HOP_MS);
  }

  private tick(now: number, dt: number): void {
    if (this.step && now - this.step.at >= HOP_MS + ARRIVE_MS) this.land(now);
    const p = this.pos(now);
    this.cam += (p - this.cam) * Math.min(1, dt * 6);
    // Traffic in the lanes he hasn't crossed yet.
    const total = DIFFICULTY_BY_ID[this.d].lanes;
    const stepping = this.step ? this.step.from + 1 : -1;
    for (let lane = this.lane + 1; lane <= Math.min(total, this.lane + 6); lane++) {
      if (lane === stepping) continue;
      const due = this.spawnAt.get(lane) ?? now + Math.random() * 1500;
      if (now >= due) {
        this.cars.push({ lane, y: -0.02, v: pick(VEHICLES) });
        this.spawnAt.set(lane, now + 900 + Math.random() * 2600);
      } else this.spawnAt.set(lane, due);
    }
    for (const c of this.cars) {
      if (c.hero && this.step) {
        // Timed to reach him the moment the step resolves.
        const k = Math.max(0, (now - this.step.at - HOP_MS * 0.4) / (HOP_MS * 0.6 + ARRIVE_MS));
        // A hit lands its bumper on him the moment the step resolves.
        c.y = Math.min(this.step.safe ? this.stopAt : 9, -0.02 + k * 0.72);
      } else c.y += c.v.speed * 0.32 * dt;
    }
    this.cars = this.cars.filter((c) => c.y - carLength(c.v.id, this.carW) < 1.05 && (c.lane > this.lane || c.hero || (this.over && !this.over.won && c.lane === this.lane + 1)));
    this.popups = this.popups.filter((pp) => now - pp.born < 1100);
  }

  private sync(): void {
    const s = this.host.state;
    this.syncCoins(s.coins);
    const playing = this.bet > 0 && !this.over;
    this.picker.lock(playing);
    this.choice.lock(playing);
    this.choice.sync();
    const next = laneMultiplier(this.d, this.lane + 1);
    setText(this.go, playing ? `Go → ${x2(next)}` : this.over ? `Bet ${fmt(this.picker.amount)} and cross again` : `Bet ${fmt(this.picker.amount)} and cross`);
    setDisabled(this.go, !!this.step || !isAlive(s) || (!playing && !this.picker.affordable));
    this.cash.hidden = !playing;
    setText(this.cash, this.lane ? `Cash out ${fmt(Math.floor(this.bet * laneMultiplier(this.d, this.lane)))}` : `Take back ${fmt(this.bet)}`);
    setDisabled(this.cash, !!this.step);
    this.cash.classList.toggle('bail', this.lane > 0);
  }

  // Drawing ------------------------------------------------------------------

  private draw(now: number): void {
    const fit = fitCanvas(this.canvas);
    if (!fit) return;
    const { c, W, H } = fit;
    const t = now / 1000;
    const total = DIFFICULTY_BY_ID[this.d].lanes;
    const LW = Math.max(56, W / 4.6);
    const HY = H * 0.7;
    const X = (lane: number) => (lane - this.cam) * LW + W * 0.28;
    const r = Math.min(LW * 0.3, H * 0.11);
    const cw = LW * 0.62;
    this.carW = cw / H;
    this.stopAt = 0.46 - (LW * 0.26) / H;

    c.fillStyle = '#9d98ad';
    c.fillRect(0, 0, W, H);
    // The road.
    const x0 = X(0.5);
    const x1 = X(total + 0.5);
    this.road ??= asphalt(c);
    c.fillStyle = this.road ?? '#34323d';
    c.save();
    c.translate(-this.cam * LW, 0);
    c.fillRect(x0 + this.cam * LW, 0, x1 - x0, H);
    c.restore();
    // Curbs.
    c.fillStyle = '#d8d3e2';
    c.fillRect(x0 - 5, 0, 5, H);
    c.fillRect(x1, 0, 5, H);
    // The start: the containment unit's back door.
    const sx = X(0) - LW * 0.5;
    if (sx + LW > 0) {
      c.fillStyle = '#7c7891';
      c.fillRect(sx - LW, 0, LW * 1.25, H);
      c.fillStyle = '#231a33';
      c.fillRect(sx - LW * 0.05, H * 0.42, LW * 0.28, H * 0.38);
      c.fillStyle = '#ffd34d';
      c.font = `700 ${Math.max(9, LW * 0.12)}px ${UI_FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('UNIT 7', sx + LW * 0.09, H * 0.36);
    }
    // The other side: grass, and a Dorkito vending machine.
    const fx = X(total + 1);
    if (fx - LW < W) {
      c.fillStyle = '#4f8a35';
      c.fillRect(x1 + 5, 0, W, H);
      c.fillStyle = '#ff9a2e';
      c.fillRect(fx - LW * 0.2, H * 0.22, LW * 0.5, H * 0.5);
      c.fillStyle = '#2b1400';
      c.fillRect(fx - LW * 0.12, H * 0.3, LW * 0.34, H * 0.22);
      emoji(c, '🔺', fx + LW * 0.05, H * 0.41, LW * 0.18);
      c.fillStyle = '#fffaf0';
      c.font = `800 ${Math.max(9, LW * 0.12)}px ${UI_FONT}`;
      c.fillText('THE OTHER SIDE', fx + LW * 0.05, H * 0.14);
    }
    for (let lane = 1; lane <= total; lane++) {
      const lx = X(lane);
      if (lx < -LW || lx > W + LW) continue;
      // Lane lines.
      if (lane < total) {
        c.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        c.lineWidth = 3;
        c.setLineDash([H * 0.07, H * 0.06]);
        c.beginPath();
        c.moveTo(lx + LW / 2, 0);
        c.lineTo(lx + LW / 2, H);
        c.stroke();
        c.setLineDash([]);
      }
      // The manhole with what this lane pays.
      const done = lane <= this.lane;
      c.fillStyle = done ? '#5b5866' : '#4a4756';
      c.beginPath();
      c.arc(lx, HY + r * 0.9, LW * 0.36, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = done ? '#8d8a99' : '#ffd34d';
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = done ? '#b9b4c6' : '#ffd34d';
      c.font = `800 ${Math.max(10, LW * 0.17)}px ${UI_FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(x2(laneMultiplier(this.d, lane)), lx, HY + r * 0.9);
      // Lanes he's crossed get a barrier, with whoever braked for him stuck behind it.
      const dropping = this.step?.safe && lane === this.step.from + 1 && now - this.step.at > HOP_MS;
      if (dropping) emoji(c, '🚧', lx, H * 0.46, LW * 0.42);
      if (done) {
        emoji(c, '🚧', lx, H * 0.46, LW * 0.42);
        const v = this.parked.get(lane);
        if (v) drawCar(c, v.id, lx, this.stopAt * H, cw, t);
      }
    }
    for (const car of this.cars) drawCar(c, car.v.id, X(car.lane), car.y * H, cw, t);

    // Hammy.
    const s = this.host.state;
    const look = defaultLook(s.fit, this.host.form);
    look.green = Math.min(0.5, Math.max(0, (40 - s.fresh) / 80));
    const p = this.pos(now);
    let hy = HY - r * EXTENTS[this.host.form].h * 0.2;
    if (this.step) {
      const k = Math.min(1, (now - this.step.at) / HOP_MS);
      hy -= Math.sin(k * Math.PI) * r * 1.2;
      look.armsUp = k < 1;
    }
    const flat = this.over && !this.over.won;
    if (flat) {
      look.face = 'dead';
      look.sy = 0.18;
      look.sx = 1.7;
      hy += r * EXTENTS[this.host.form].h * 0.8;
    } else if (this.over?.won) look.face = 'joy';
    else if (this.step && !this.step.safe && now - this.step.at > HOP_MS) look.face = 'shock';
    else look.face = this.bet ? 'smug' : 'happy';
    look.lean = this.step ? 0 : Math.sin(t * 2) * 0.05;
    look.blink = Math.sin(t * 1.3) > 0.985;
    const hx = X(p);
    c.fillStyle = 'rgba(0, 0, 0, 0.3)';
    c.beginPath();
    c.ellipse(hx, HY + r * 0.85, r * (flat ? 1.5 : 0.9), r * 0.22, 0, 0, Math.PI * 2);
    c.fill();
    drawHammy(c, hx, hy, r, look, t);
    if (flat) {
      c.fillStyle = 'rgba(20, 15, 25, 0.55)';
      c.fillRect(hx - r * 0.5, hy - r * 0.4, r * 0.28, r * 0.8);
      c.fillRect(hx + r * 0.2, hy - r * 0.4, r * 0.28, r * 0.8);
      emoji(c, '😵', hx, hy - r * 1.1, r * 0.8);
    }

    for (const pp of this.popups) {
      const k = (now - pp.born) / 1100;
      if (k < 0) continue;
      c.globalAlpha = Math.max(0, 1 - k);
      loud(c, pp.text, X(pp.lane), pp.y * H - k * H * 0.08, Math.max(14, LW * 0.24), pp.color);
      c.globalAlpha = 1;
    }
    if (this.bubbleLine && now < this.bubbleLine.until) bubble(c, this.bubbleLine.text, hx + r * 0.6, hy - r * 1.3, Math.max(11, H * 0.055), W);

    // What it's worth right now, on a dark strip so the traffic doesn't hide it.
    const big = Math.min(W * 0.11, H * 0.14);
    if (this.bet) {
      c.fillStyle = 'rgba(10, 5, 18, 0.6)';
      c.fillRect(0, 0, W, H * 0.17);
    }
    if (this.over && !this.over.won) loud(c, `FLATTENED · −${fmt(this.bet)}`, W / 2, H * 0.09, big * 0.5, '#ff5c5c', UI_FONT);
    else if (this.over?.won) loud(c, `+${fmt(this.won)}`, W / 2, H * 0.1, big, '#5ee0b0');
    else if (this.bet) loud(c, `${x2(laneMultiplier(this.d, this.lane))} · lane ${this.lane}/${total}`, W / 2, H * 0.09, big * 0.55, '#fffaf0', UI_FONT);
  }
}
