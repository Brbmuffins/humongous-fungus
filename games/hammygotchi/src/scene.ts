// The tank: a glass terrarium on a desk in a gamer's room, with Hammy, his
// poop, his neighbors and whatever DoorDosh drops through the lid. Hammy has
// physics (badly): grab him and throw him, watch him bounce, and every few
// minutes gravity stops working properly. When he dies he rots right here,
// sprouts mushrooms, and leaves a skeleton.
import { mulberry32 } from '@shared/rng';
import { FOOD_BY_ID, LEAVE_BELOW, NEIGHBORS, PINCH_BELOW, ROAD_TRIP, ROT_SECONDS, SAYS, type FitId, type FoodId, type NeighborDef } from './defs';
import { drawHammy, drawSkeleton, defaultLook, type Face, type Look } from './hammy';
import { sfx } from './sound';

export interface SceneView {
  now: number;
  fit: FitId;
  belly: number;
  fresh: number;
  mood: number;
  health: number;
  poops: readonly number[];
  orders: readonly { food: FoodId; arriveAt: number; self: boolean }[];
  /** Seconds since he died, or null. */
  deadFor: number | null;
}

export interface SceneHandlers {
  pet(): void;
  fling(speed: number): void;
  scoop(index: number): void;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  born: number;
  life: number;
  color: string;
}

interface Popup {
  x: number;
  y: number;
  born: number;
  text: string;
  color: string;
}

interface Bubble {
  text: string;
  born: number;
  ms: number;
}

interface Bag {
  x: number;
  y: number;
  vx: number;
  vy: number;
  food: FoodId;
  landed: boolean;
}

interface Neighbor {
  def: NeighborDef;
  /** 0 in the tank, 1 gone. */
  out: number;
  leaving: boolean;
  x: number;
  dir: number;
  rolled: number;
  bubble: Bubble | null;
}

type Glitch = { kind: 'float' | 'moon' | 'sideways' | 'bouncy'; until: number; dir: number };

const TAU = Math.PI * 2;
const ease = (k: number): number => {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
};
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

export class TankScene {
  private ctx: CanvasRenderingContext2D;
  private base = document.createElement('canvas');
  private W = 0;
  private H = 0;
  private dpr = 1;
  private t = 0;
  private last = 0;
  private readonly calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private view: SceneView | null = null;

  // Tank geometry, in CSS pixels.
  private L = 0;
  private R = 0;
  private T = 0;
  private B = 0;
  private floor = 0;
  private r = 30;

  // Hammy's body.
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private spin = 0;
  private spinV = 0;
  private sq = 0;
  private sqV = 0;
  private facing = 1;
  private grounded = false;
  private held = false;
  private grab = { dx: 0, dy: 0, px: 0, py: 0, downAt: 0, moved: 0, samples: [] as { x: number; y: number; t: number }[] };
  private mode: 'idle' | 'walk' | 'eat' | 'mope' = 'idle';
  private modeUntil = 0;
  private targetX = 0;
  private blinkAt = 0;
  private fartAt = -1e9;
  private hoseUntil = 0;
  private eatUntil = 0;
  private bubble: Bubble | null = null;
  private nextLineAt = 0;
  private nextComplainAt = 0;
  private glitch: Glitch | null = null;
  private nextGlitchAt = 0;
  private youLose = false;

  private puffs: Puff[] = [];
  private popups: Popup[] = [];
  private bags: Bag[] = [];
  private flying: { x: number; y: number; vx: number; vy: number; born: number }[] = [];
  private poopBorn = new Map<number, number>();
  private lastPoops = 0;
  private neighbors: Neighbor[];
  private shrooms: { dx: number; dy: number; s: number; hue: number; delay: number; tilt: number }[];

  constructor(private canvas: HTMLCanvasElement, private on: SceneHandlers, seed = 3) {
    this.ctx = canvas.getContext('2d')!;
    const rnd = mulberry32(seed);
    this.neighbors = NEIGHBORS.map((def, i) => ({ def, out: 0, leaving: false, x: [0.86, 0.06, 0.45][i], dir: 1, rolled: 0, bubble: null }));
    this.shrooms = Array.from({ length: 9 }, (_, i) => ({
      // Mostly from the body, leaving the skull to look at you.
      dx: -1.45 + (i / 8) * 1.9 + (rnd() - 0.5) * 0.3,
      dy: rnd() * 0.25,
      s: 0.5 + rnd() * 0.7,
      hue: Math.floor(rnd() * 3),
      delay: rnd() * 6,
      tilt: (rnd() - 0.5) * 0.5,
    }));
    this.bind();
    this.resize();
    this.x = (this.L + this.R) / 2;
    this.y = this.floor - this.r;
    this.targetX = this.x;
    this.nextLineAt = performance.now() + 4000;
    this.nextGlitchAt = performance.now() + 90_000 + Math.random() * 90_000;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.W = Math.max(200, rect.width);
    this.H = Math.max(160, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [this.canvas, this.base]) {
      c.width = Math.round(this.W * this.dpr);
      c.height = Math.round(this.H * this.dpr);
    }
    const side = Math.max(10, this.W * 0.035);
    this.L = side;
    this.R = this.W - side;
    this.T = Math.max(24, this.H * 0.09);
    this.B = this.H - Math.max(16, this.H * 0.07);
    this.floor = this.B - Math.max(14, this.H * 0.085);
    this.r = Math.min(54, Math.max(18, Math.min(this.W * 0.095, this.H * 0.12)));
    this.x = Math.min(this.R - this.r, Math.max(this.L + this.r, this.x));
    this.y = Math.min(this.y, this.floor - this.r);
    this.paintBase();
  }

  setView(v: SceneView): void {
    const prev = this.view;
    this.view = v;
    if (v.deadFor === null) this.youLose = false;
    // Coming back to a ruined tank: the neighbors are already gone.
    if (!prev) {
      const gone = v.deadFor !== null || v.fresh < LEAVE_BELOW;
      for (const nb of this.neighbors) {
        nb.leaving = gone;
        nb.out = gone ? 1 : 0;
      }
    }
    // A new poop: it drops out of him, so put it where he is.
    if (v.poops.length > this.lastPoops && prev) {
      for (let i = this.lastPoops; i < v.poops.length; i++) this.poopBorn.set(i, this.t);
    }
    if (v.poops.length < this.lastPoops) this.poopBorn.clear();
    this.lastPoops = v.poops.length;
  }

  /** Where he is across the floor, 0..1 (for placing a poop behind him). */
  buttX(): number {
    const bx = this.x - this.facing * this.r * 0.7;
    return Math.min(0.98, Math.max(0.02, (bx - this.L - this.r * 0.4) / (this.R - this.L - this.r * 0.8)));
  }

  private poopPos(p: number): { x: number; y: number } {
    return { x: this.L + this.r * 0.4 + p * (this.R - this.L - this.r * 0.8), y: this.floor };
  }

  // -------------------------------------------------------------------------
  // Reactions to the rules

  fart(size: number): void {
    this.fartAt = this.t;
    const bx = this.x - this.facing * this.r * 0.85;
    const by = this.y + this.r * 0.55;
    const n = this.calm ? 3 : Math.round(5 + size * 6);
    for (let i = 0; i < n; i++) {
      this.puffs.push({
        x: bx,
        y: by,
        vx: -this.facing * (20 + Math.random() * 60) * size + (Math.random() - 0.5) * 30,
        vy: -10 - Math.random() * 40,
        r: this.r * (0.15 + Math.random() * 0.2) * (0.7 + size * 0.5),
        born: this.t,
        life: 1400 + Math.random() * 900 + size * 700,
        color: Math.random() < 0.7 ? '#a6d23a' : '#c9e86a',
      });
    }
    this.popups.push({ x: bx - this.facing * this.r * 0.4, y: by - this.r * 0.2, born: this.t, text: size > 1.1 ? 'PFFFRRRT' : size > 0.7 ? 'pfffrt' : 'pft', color: '#c9f06a' });
    // Fart propulsion, in a tank with no rules.
    if (!this.held && this.view?.deadFor === null) {
      this.vx += this.facing * (60 + size * 160);
      this.vy -= 80 + size * 200;
      this.grounded = false;
      this.kick(0.12 * size);
    }
    sfx.fart(size);
    if (size > 0.9 && Math.random() < 0.5) this.say(pick(SAYS.fart));
    else if (Math.random() < 0.35) this.neighborComplain();
    for (const nb of this.neighbors) if (nb.def.id === 'bug' && Math.abs(this.poopPos(nb.x).x - this.x) < this.r * 4) nb.rolled = this.t + 3500;
  }

  poop(): void {
    sfx.plop();
    if (Math.random() < 0.5) this.say(pick(SAYS.poop));
  }

  deliver(food: FoodId): void {
    const x = this.L + (this.R - this.L) * (0.3 + Math.random() * 0.5);
    this.bags.push({ x, y: this.T + 6, vx: (Math.random() - 0.5) * 60, vy: 0, food, landed: false });
    if (food === 'salad') this.say(pick(SAYS.salad));
    else if (food === 'sushi') this.say(pick(SAYS.sushi));
    else this.say(pick(SAYS.food));
  }

  hose(): void {
    this.hoseUntil = this.t + 1400;
    this.say(pick(SAYS.hose));
    sfx.splash();
    this.vx += 220 * (this.x < (this.L + this.R) / 2 ? 1 : -1);
  }

  scoopFx(index: number): void {
    const v = this.view;
    if (!v || index >= v.poops.length) return;
    const p = this.poopPos(v.poops[index]);
    this.flying.push({ x: p.x, y: p.y - this.r * 0.2, vx: (Math.random() - 0.5) * 200, vy: -420, born: this.t });
  }

  popup(text: string, color = '#ffd34d', x?: number, y?: number): void {
    this.popups.push({ x: x ?? this.x, y: y ?? this.y - this.r * 1.3, born: this.t, text, color });
  }

  say(text: string, ms = 2600): void {
    this.bubble = { text, born: this.t, ms };
  }

  died(): void {
    this.bubble = null;
    this.held = false;
    this.glitch = null;
    this.bags = [];
    sfx.sad();
  }

  /** A new Hammy drops into the tank. */
  spawn(): void {
    this.x = (this.L + this.R) / 2;
    this.y = this.T + this.r + 8;
    this.vx = this.vy = this.spin = this.spinV = 0;
    this.grounded = false;
    this.held = false;
    this.mode = 'idle';
    this.bags = [];
    this.puffs = [];
    this.youLose = false;
    this.say('Hi. I live here now.');
  }

  /** Space bar on the tank: a pat on the head. */
  patFromKeyboard(): void {
    if (this.view?.deadFor !== null) return;
    this.hearts();
    this.on.pet();
  }

  private hearts(): void {
    for (let i = 0; i < 3; i++) this.popups.push({ x: this.x + (i - 1) * this.r * 0.5, y: this.y - this.r * (1.1 + i * 0.1), born: this.t + i * 90, text: '♥', color: '#ff6fa8' });
    if (Math.random() < 0.4) this.say(pick(SAYS.pet), 1600);
  }

  private neighborComplain(): void {
    const here = this.neighbors.filter((n) => n.out < 0.5 && !n.bubble);
    if (!here.length) return;
    const nb = pick(here);
    nb.bubble = { text: pick(nb.def.lines), born: this.t, ms: 2600 };
  }

  private kick(amount: number): void {
    if (this.calm) return;
    this.sqV += amount * 30;
  }

  // -------------------------------------------------------------------------
  // Input

  private bind(): void {
    const pt = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      const v = this.view;
      if (!v || v.deadFor !== null) return;
      const p = pt(e);
      if (Math.hypot(p.x - this.x, p.y - this.y) < this.r * 1.25) {
        this.held = true;
        this.grab = { dx: this.x - p.x, dy: this.y - p.y, px: p.x, py: p.y, downAt: this.t, moved: 0, samples: [{ ...p, t: this.t }] };
        this.canvas.setPointerCapture(e.pointerId);
        this.grounded = false;
        return;
      }
      for (let i = v.poops.length - 1; i >= 0; i--) {
        const pp = this.poopPos(v.poops[i]);
        if (Math.hypot(p.x - pp.x, p.y - (pp.y - this.r * 0.2)) < this.r * 0.55) {
          this.on.scoop(i);
          return;
        }
      }
      // Knocking on the glass: he looks over.
      this.facing = p.x > this.x ? 1 : -1;
      if (Math.random() < 0.3) this.say(pick(['?', 'Hello?', 'Who’s there?', 'Don’t tap the glass.']), 1400);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.held) return;
      const p = pt(e);
      this.grab.moved += Math.hypot(p.x - this.grab.px, p.y - this.grab.py);
      this.grab.px = p.x;
      this.grab.py = p.y;
      this.grab.samples.push({ ...p, t: this.t });
      if (this.grab.samples.length > 6) this.grab.samples.shift();
    });
    const release = () => {
      if (!this.held) return;
      this.held = false;
      const g = this.grab;
      if (g.moved < 10 && this.t - g.downAt < 350) {
        this.hearts();
        this.on.pet();
        return;
      }
      const a = g.samples[0];
      const b = g.samples[g.samples.length - 1];
      const dt = Math.max(16, b.t - a.t) / 1000;
      const max = this.H * 7;
      this.vx = Math.max(-max, Math.min(max, (b.x - a.x) / dt));
      this.vy = Math.max(-max, Math.min(max, (b.y - a.y) / dt));
      const speed = Math.hypot(this.vx, this.vy);
      this.spinV = this.vx * 0.012;
      if (speed > this.H * 1.5) {
        this.say(pick(SAYS.fling), 1500);
        sfx.boing();
      }
      this.on.fling(speed);
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
  }

  // -------------------------------------------------------------------------
  // Simulation

  private update(dt: number): void {
    const v = this.view;
    if (!v) return;
    const now = this.t;
    const dead = v.deadFor !== null;
    const G = this.H * 3.2;
    let gx = 0;
    let gy = G;
    let bounce = 0.55;
    const gl = this.glitch;
    if (gl && now > gl.until) this.glitch = null;
    if (this.glitch) {
      const g = this.glitch;
      if (g.kind === 'float') {
        gy = -G * 0.3;
      } else if (g.kind === 'moon') {
        gy = G * 0.15;
        bounce = 0.92;
      } else if (g.kind === 'sideways') {
        gx = G * g.dir;
        gy = G * 0.15;
      } else {
        bounce = 1.02;
      }
    } else if (!dead && !this.held && now > this.nextGlitchAt) {
      this.startGlitch();
    }

    const r = this.r;
    const ground = this.floor - r * 0.98;
    if (dead) {
      this.x += (Math.min(this.R - r * 1.3, Math.max(this.L + r * 1.3, this.x)) - this.x) * Math.min(1, dt * 4);
      this.y += (this.floor - r * 0.55 - this.y) * Math.min(1, dt * 6);
      this.vx = this.vy = 0;
    } else if (this.held) {
      const tx = this.grab.px + this.grab.dx;
      const ty = this.grab.py + this.grab.dy;
      const nx = this.x + (tx - this.x) * Math.min(1, dt * 18);
      const ny = this.y + (ty - this.y) * Math.min(1, dt * 18);
      this.vx = (nx - this.x) / Math.max(dt, 0.001);
      this.vy = (ny - this.y) / Math.max(dt, 0.001);
      this.x = nx;
      this.y = ny;
      this.spin *= Math.exp(-dt * 6);
    } else {
      this.vx += gx * dt;
      this.vy += gy * dt;
      this.think(dt, v);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.spin += this.spinV * dt;
      if (!this.grounded) this.spinV *= Math.exp(-dt * 0.8);
    }

    // Glass walls, lid and floor.
    const left = this.L + r;
    const right = this.R - r;
    const top = this.T + r * 0.95 + 6;
    let hit = 0;
    if (this.x < left || this.x > right) {
      this.x = Math.min(right, Math.max(left, this.x));
      if ((this.x === left && this.vx < 0) || (this.x === right && this.vx > 0)) {
        hit = Math.abs(this.vx);
        this.vx = -this.vx * bounce;
      }
    }
    if (this.y < top) {
      this.y = top;
      if (this.vy < 0) {
        hit = Math.max(hit, -this.vy);
        this.vy = -this.vy * bounce;
      }
    }
    const wasGrounded = this.grounded;
    if (this.y >= ground && !dead) {
      this.y = ground;
      if (this.vy > 0) {
        if (this.vy > this.H * 0.4) hit = Math.max(hit, this.vy);
        this.vy = this.vy > this.H * 0.5 ? -this.vy * bounce : 0;
      }
      this.grounded = this.vy === 0;
      if (this.grounded) {
        if (this.mode !== 'walk') this.vx *= Math.exp(-dt * 9);
        this.spinV = 0;
        this.spin *= Math.exp(-dt * 14);
        if (Math.abs(this.spin) > Math.PI) this.spin -= Math.sign(this.spin) * TAU;
      }
    } else if (!dead) {
      this.grounded = false;
    }
    if (hit > this.H * 0.6 && !this.held) {
      this.kick(Math.min(0.5, hit / (this.H * 10)));
      sfx.bonk();
      if (hit > this.H * 2.4 && Math.random() < 0.6) this.say(pick(SAYS.bonk), 1500);
    }
    if (!wasGrounded && this.grounded) this.kick(0.08);

    // Squash spring.
    const k = 220;
    const damp = 12;
    this.sqV += (-k * this.sq - damp * this.sqV) * dt;
    this.sq += this.sqV * dt;
    this.sq = Math.max(-0.4, Math.min(0.4, this.sq));

    // Bags fall in, bounce, and wait to be eaten.
    for (const b of this.bags) {
      if (b.landed) continue;
      b.vy += G * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < this.L + 14 || b.x > this.R - 14) b.vx = -b.vx;
      if (b.y > this.floor - 12) {
        b.y = this.floor - 12;
        if (b.vy > 120) {
          b.vy = -b.vy * 0.35;
        } else {
          b.vy = 0;
          b.vx = 0;
          b.landed = true;
        }
      }
    }

    // Neighbors leave when it gets bad enough, and come back when it doesn't.
    for (const nb of this.neighbors) {
      if (dead || v.fresh < LEAVE_BELOW) nb.leaving = true;
      else if (v.fresh > LEAVE_BELOW + 15) nb.leaving = false;
      nb.out = Math.min(1, Math.max(0, nb.out + (nb.leaving ? dt / 2.5 : -dt / 2.5)));
      if (nb.def.id === 'bug' && nb.out < 0.5 && now > nb.rolled) {
        nb.x += nb.dir * dt * 0.02;
        if (nb.x > 0.62 || nb.x < 0.3) nb.dir = -nb.dir;
      }
      if (nb.bubble && now - nb.bubble.born > nb.bubble.ms) nb.bubble = null;
    }
    if (!dead && v.fresh < 60 && now > this.nextComplainAt) {
      this.nextComplainAt = now + 18_000 + Math.random() * 22_000;
      this.neighborComplain();
    }

    // Particles.
    this.puffs = this.puffs.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 1.5);
      p.vy = p.vy * Math.exp(-dt * 1.2) - 6 * dt;
      return now - p.born < p.life;
    });
    this.flying = this.flying.filter((f) => {
      f.vy += G * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      return now - f.born < 900;
    });
    this.popups = this.popups.filter((p) => now - p.born < 1200);
    if (this.bubble && now - this.bubble.born > this.bubble.ms) this.bubble = null;
    if (!dead && now > this.nextLineAt) {
      this.nextLineAt = now + 14_000 + Math.random() * 18_000;
      if (!this.bubble) this.say(this.line(v));
    }
  }

  /** What he does when nobody's holding him. */
  private think(dt: number, v: SceneView): void {
    const now = this.t;
    if (!this.grounded) return;
    // Food first.
    const bag = this.bags.find((b) => b.landed);
    if (bag && this.mode !== 'eat') {
      const d = bag.x - this.x;
      if (Math.abs(d) < this.r * 1.1) {
        this.mode = 'eat';
        this.eatUntil = now + 1700;
        this.facing = d >= 0 ? 1 : -1;
        this.vx = 0;
        sfx.crunch();
      } else {
        this.mode = 'walk';
        this.targetX = bag.x;
        this.modeUntil = now + 4000;
      }
    }
    if (this.mode === 'eat') {
      this.vx = 0;
      if (now > this.eatUntil) {
        const i = this.bags.indexOf(bag!);
        if (i >= 0) {
          const b = this.bags[i];
          this.bags.splice(i, 1);
          for (let k = 0; k < 6; k++)
            this.puffs.push({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, r: 2 + Math.random() * 2, born: now, life: 700, color: FOOD_BY_ID[b.food].color });
        }
        this.mode = 'idle';
        this.modeUntil = now + 1500;
      }
      return;
    }
    if (now > this.modeUntil) {
      const sad = v.mood < 25 || v.health < 40;
      const roll = Math.random();
      if (sad && roll < 0.6) {
        this.mode = 'mope';
        this.modeUntil = now + 5000 + Math.random() * 4000;
      } else if (roll < 0.55) {
        this.mode = 'walk';
        this.targetX = this.L + this.r * 1.5 + Math.random() * (this.R - this.L - this.r * 3);
        this.modeUntil = now + 3500;
      } else {
        this.mode = 'idle';
        this.modeUntil = now + 1500 + Math.random() * 3000;
        // Happy hops.
        if (v.mood > 70 && Math.random() < 0.4) {
          this.vy = -this.H * (0.9 + Math.random() * 0.5);
          this.grounded = false;
          this.kick(0.1);
        }
      }
    }
    if (this.mode === 'walk') {
      const d = this.targetX - this.x;
      if (Math.abs(d) < 6) {
        this.mode = 'idle';
        this.modeUntil = now + 1200 + Math.random() * 2000;
      } else {
        this.facing = d > 0 ? 1 : -1;
        const speed = this.r * (v.belly < 20 || v.health < 40 ? 1.1 : 2.4);
        this.vx += (this.facing * speed - this.vx) * Math.min(1, dt * 8);
      }
    }
  }

  private line(v: SceneView): string {
    const moods: (readonly string[])[] = [];
    if (v.belly < 30) moods.push(SAYS.hungry);
    if (v.mood < 30) moods.push(SAYS.sad);
    if (v.fresh < 35) moods.push(SAYS.stinky);
    if (moods.length && Math.random() < 0.55) return pick(pick(moods));
    return pick(ROAD_TRIP);
  }

  private startGlitch(): void {
    const kinds: Glitch['kind'][] = ['float', 'moon', 'sideways', 'bouncy'];
    const kind = pick(kinds);
    const ms = { float: 3500, moon: 6000, sideways: 2600, bouncy: 5000 }[kind];
    this.glitch = { kind, until: this.t + ms, dir: Math.random() < 0.5 ? -1 : 1 };
    this.nextGlitchAt = this.t + 150_000 + Math.random() * 150_000;
    this.grounded = false;
    if (kind === 'bouncy') this.vy = -this.H * 2;
    if (kind === 'moon') this.vy = -this.H * 0.8;
    this.say(pick(SAYS.glitch), 2000);
    sfx.glitch();
  }

  // -------------------------------------------------------------------------
  // Drawing

  private paintBase(): void {
    const c = this.base.getContext('2d')!;
    const { W, H, L, R, T, B } = this;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // The room: a dark wall lit by an LED strip.
    const wall = c.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, '#2a1840');
    wall.addColorStop(1, '#160d24');
    c.fillStyle = wall;
    c.fillRect(0, 0, W, H);
    const led = c.createLinearGradient(0, 0, W, 0);
    led.addColorStop(0, 'rgba(255,90,200,0.35)');
    led.addColorStop(0.5, 'rgba(120,90,255,0.3)');
    led.addColorStop(1, 'rgba(60,200,255,0.35)');
    c.fillStyle = led;
    c.fillRect(0, 0, W, 3);
    const glow = c.createLinearGradient(0, 0, 0, H * 0.5);
    glow.addColorStop(0, 'rgba(160,100,255,0.16)');
    glow.addColorStop(1, 'rgba(160,100,255,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, W, H * 0.5);

    // Desk.
    c.fillStyle = '#5a3b26';
    c.fillRect(0, B, W, H - B);
    c.fillStyle = '#7a5236';
    c.fillRect(0, B, W, 3);

    // Inside the tank: back glass, bedding, a hut and a water bottle.
    const air = c.createLinearGradient(0, T, 0, B);
    air.addColorStop(0, '#2b3b3a');
    air.addColorStop(1, '#22302a');
    c.fillStyle = air;
    c.fillRect(L, T, R - L, B - T);
    const fl = this.floor;
    const bed = c.createLinearGradient(0, fl, 0, B);
    bed.addColorStop(0, '#e9d3a1');
    bed.addColorStop(1, '#c8a86c');
    c.fillStyle = bed;
    c.fillRect(L, fl, R - L, B - fl);
    // Wood shavings.
    const rnd = mulberry32(11);
    for (let i = 0; i < (R - L) / 3; i++) {
      const x = L + rnd() * (R - L);
      const y = fl - 2 + rnd() * (B - fl);
      c.strokeStyle = rnd() < 0.5 ? 'rgba(160,120,60,0.55)' : 'rgba(255,240,200,0.6)';
      c.lineWidth = 1 + rnd();
      c.beginPath();
      c.arc(x, y, 2 + rnd() * 3, rnd() * TAU, rnd() * TAU + 1.5);
      c.stroke();
    }
    // Hut on the left.
    const hw = Math.max(46, this.r * 2.1);
    const hh = hw * 0.75;
    const hx = L + this.r * 0.6;
    const hy = fl - hh + 4;
    c.fillStyle = '#9b6b3f';
    c.strokeStyle = '#3a2414';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(hx, hy + hh);
    c.lineTo(hx, hy + hh * 0.35);
    c.lineTo(hx + hw / 2, hy - hh * 0.1);
    c.lineTo(hx + hw, hy + hh * 0.35);
    c.lineTo(hx + hw, hy + hh);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#1d120a';
    c.beginPath();
    c.arc(hx + hw / 2, hy + hh, hw * 0.22, Math.PI, TAU);
    c.fill();
    c.strokeStyle = 'rgba(58,36,20,0.5)';
    for (let i = 1; i < 4; i++) {
      c.beginPath();
      c.moveTo(hx + 3, hy + hh * 0.35 + i * hh * 0.15);
      c.lineTo(hx + hw - 3, hy + hh * 0.35 + i * hh * 0.15);
      c.stroke();
    }
    // Water bottle on the right glass.
    const bx = R - Math.max(16, this.r * 0.55);
    const by = T + (B - T) * 0.18;
    c.fillStyle = 'rgba(140,200,255,0.35)';
    c.strokeStyle = 'rgba(220,240,255,0.7)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.roundRect(bx - 8, by, 16, (fl - by) * 0.45, 6);
    c.fill();
    c.stroke();
    c.fillStyle = '#c7ccd6';
    c.fillRect(bx - 2, by + (fl - by) * 0.45, 4, 12);
    // Rock for the frog.
    const rx = L + (R - L) * 0.86;
    c.fillStyle = '#5b6066';
    c.beginPath();
    c.ellipse(rx, fl + 2, Math.max(22, this.r * 0.8), Math.max(10, this.r * 0.35), 0, Math.PI, TAU);
    c.fill();
    // Bowl.
    const ox = L + (R - L) * 0.62;
    c.fillStyle = '#e8443a';
    c.beginPath();
    c.ellipse(ox, fl + 1, Math.max(14, this.r * 0.45), Math.max(5, this.r * 0.16), 0, 0, Math.PI);
    c.fill();
    c.fillStyle = '#ff9a2e';
    c.beginPath();
    c.ellipse(ox, fl + 1, Math.max(12, this.r * 0.4), Math.max(3, this.r * 0.08), 0, 0, TAU);
    c.fill();
  }

  private drawPoop(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    c.fillStyle = '#6b4423';
    c.strokeStyle = '#3a2412';
    c.lineWidth = 1.5;
    for (const [dy, w] of [
      [0, 1],
      [-0.42, 0.72],
      [-0.78, 0.45],
    ]) {
      c.beginPath();
      c.ellipse(x, y + dy * s, s * w, s * 0.32, 0, 0, TAU);
      c.fill();
      c.stroke();
    }
    c.beginPath();
    c.moveTo(x - s * 0.1, y - s * 0.95);
    c.quadraticCurveTo(x + s * 0.05, y - s * 1.25, x + s * 0.2, y - s * 1.1);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.beginPath();
    c.ellipse(x - s * 0.3, y - s * 0.1, s * 0.15, s * 0.07, -0.3, 0, TAU);
    c.fill();
  }

  private stinkLines(c: CanvasRenderingContext2D, x: number, y: number, w: number, n: number, alpha: number): void {
    if (n <= 0 || alpha <= 0) return;
    c.strokeStyle = `rgba(170,220,70,${alpha})`;
    c.lineWidth = 2;
    for (let i = 0; i < n; i++) {
      const ox = x + (n > 1 ? (i / (n - 1) - 0.5) * w * 0.9 : 0);
      const ph = this.t * 0.003 + i * 1.7;
      const rise = ((this.t * 0.0006 + i * 0.37) % 1) * 12;
      c.beginPath();
      for (let k = 0; k <= 10; k++) {
        const yy = y - rise - k * 2.4;
        const xx = ox + Math.sin(ph + k * 0.7) * 3;
        if (k === 0) c.moveTo(xx, yy);
        else c.lineTo(xx, yy);
      }
      c.stroke();
    }
  }

  private fly(c: CanvasRenderingContext2D, cx: number, cy: number, i: number, spread: number): void {
    const a = this.t * (0.004 + i * 0.0007) + i * 2.3;
    const x = cx + Math.cos(a) * spread + Math.sin(this.t * 0.02 + i) * 3;
    const y = cy + Math.sin(a * 1.3) * spread * 0.5 + Math.cos(this.t * 0.025 + i) * 3;
    c.fillStyle = 'rgba(220,230,255,0.5)';
    const flap = Math.sin(this.t * 0.08 + i) > 0 ? 3 : 2;
    c.beginPath();
    c.ellipse(x - 2, y - 2, flap, 1.6, -0.5, 0, TAU);
    c.ellipse(x + 2, y - 2, flap, 1.6, 0.5, 0, TAU);
    c.fill();
    c.fillStyle = '#111';
    c.beginPath();
    c.arc(x, y, 1.8, 0, TAU);
    c.fill();
  }

  private drawNeighbor(c: CanvasRenderingContext2D, nb: Neighbor, v: SceneView): void {
    if (nb.out >= 1) return;
    const s = Math.max(10, this.r * 0.42);
    const pinched = v.fresh < PINCH_BELOW;
    const out = ease(nb.out);
    c.save();
    c.strokeStyle = '#1b2a12';
    c.lineWidth = 1.5;
    let hx = 0;
    let hy = 0;
    if (nb.def.id === 'frog') {
      const x = this.L + (this.R - this.L) * 0.86;
      // Leaves with a big hop up and out of the tank.
      const y = this.floor - s * 0.9 - out * (this.floor - this.T + s * 3);
      c.translate(x, y);
      c.fillStyle = '#4caf50';
      c.beginPath();
      c.ellipse(0, 0, s * 1.1, s * 0.8, 0, 0, TAU);
      c.fill();
      c.stroke();
      for (const ex of [-0.5, 0.5]) {
        c.fillStyle = '#4caf50';
        c.beginPath();
        c.arc(ex * s, -s * 0.7, s * 0.36, 0, TAU);
        c.fill();
        c.stroke();
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(ex * s, -s * 0.72, s * 0.24, 0, TAU);
        c.fill();
        c.fillStyle = '#111';
        c.beginPath();
        // Side-eye at Hammy.
        c.arc(ex * s + (this.x < x ? -1 : 1) * s * 0.1, -s * 0.72, s * 0.11, 0, TAU);
        c.fill();
      }
      c.beginPath();
      c.moveTo(-s * 0.5, s * 0.05);
      c.quadraticCurveTo(0, pinched ? -s * 0.1 : s * 0.25, s * 0.5, s * 0.05);
      c.stroke();
      if (pinched) this.clothespin(c, 0, -s * 0.25, s);
      hx = x;
      hy = y - s * 1.3;
    } else if (nb.def.id === 'snail') {
      // On the left glass, sliding up and away when it's had enough.
      const x = this.L + 4 + s * 0.6;
      const span = this.floor - this.T - s * 4;
      const home = this.T + s * 2 + span * (0.55 + Math.sin(this.t * 0.00012) * 0.35);
      const y = home - out * (home - this.T + s * 3);
      c.translate(x, y);
      c.fillStyle = '#d7c3a0';
      c.beginPath();
      c.ellipse(0, s * 0.1, s * 0.35, s * 1.1, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#b5651d';
      c.beginPath();
      c.arc(s * 0.3, s * 0.3, s * 0.7, 0, TAU);
      c.fill();
      c.stroke();
      c.strokeStyle = '#6d3b10';
      c.beginPath();
      c.arc(s * 0.3, s * 0.3, s * 0.38, 0, TAU * 0.8);
      c.stroke();
      c.strokeStyle = '#1b2a12';
      c.beginPath();
      c.moveTo(0, -s * 0.9);
      c.lineTo(-s * 0.15, -s * 1.4);
      c.moveTo(s * 0.12, -s * 0.9);
      c.lineTo(s * 0.25, -s * 1.35);
      c.stroke();
      if (pinched) this.clothespin(c, 0, -s * 0.75, s * 0.8);
      hx = x + s;
      hy = y - s * 1.6;
    } else {
      const p = this.poopPos(nb.x);
      const x = p.x;
      const y = this.floor - s * 0.4 - out * s * 0.4;
      c.globalAlpha = 1 - out;
      c.translate(x, y);
      c.fillStyle = '#7d8590';
      if (this.t < nb.rolled) {
        c.beginPath();
        c.arc(0, -s * 0.1, s * 0.5, 0, TAU);
        c.fill();
        c.stroke();
        c.beginPath();
        c.arc(0, -s * 0.1, s * 0.3, 0.3, 2.4);
        c.stroke();
      } else {
        c.beginPath();
        c.ellipse(0, 0, s * 0.8, s * 0.4, 0, Math.PI, TAU);
        c.closePath();
        c.fill();
        c.stroke();
        for (let i = 1; i < 5; i++) {
          c.beginPath();
          c.moveTo(-s * 0.8 + i * s * 0.32, 0);
          c.lineTo(-s * 0.8 + i * s * 0.32, -s * 0.34);
          c.stroke();
        }
        if (pinched) this.clothespin(c, nb.dir * s * 0.8, -s * 0.2, s * 0.6);
      }
      hx = x;
      hy = y - s;
    }
    c.restore();
    if (nb.bubble) this.drawBubble(nb.bubble, hx, hy, '#e3f5d0', '#1d2a10');
  }

  private clothespin(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    c.save();
    c.fillStyle = '#e0b170';
    c.strokeStyle = '#6b4a22';
    c.lineWidth = 1;
    c.fillRect(x - s * 0.12, y - s * 0.45, s * 0.24, s * 0.45);
    c.strokeRect(x - s * 0.12, y - s * 0.45, s * 0.24, s * 0.45);
    c.fillStyle = '#9aa1ab';
    c.fillRect(x - s * 0.14, y - s * 0.26, s * 0.28, s * 0.06);
    c.restore();
  }

  private drawBubble(b: Bubble, x: number, y: number, bg = '#fffaf0', ink = '#24131f'): void {
    const c = this.ctx;
    const age = this.t - b.born;
    const a = Math.min(1, age / 120, (b.ms - age) / 250);
    if (a <= 0) return;
    c.save();
    c.globalAlpha = a;
    c.font = '600 13px Rubik, system-ui, sans-serif';
    const maxW = Math.min(200, this.W * 0.5);
    const words = b.text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (c.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    lines.push(line);
    const w = Math.max(...lines.map((l) => c.measureText(l).width)) + 18;
    const h = lines.length * 16 + 10;
    const bx = Math.min(this.W - w - 6, Math.max(6, x - w / 2));
    const by = Math.max(4, y - h - 10);
    c.fillStyle = bg;
    c.strokeStyle = ink;
    c.lineWidth = 1.5;
    c.beginPath();
    c.roundRect(bx, by, w, h, 10);
    c.fill();
    c.stroke();
    const tx = Math.min(bx + w - 14, Math.max(bx + 14, x));
    c.beginPath();
    c.moveTo(tx - 6, by + h - 0.5);
    c.lineTo(tx, by + h + 8);
    c.lineTo(tx + 6, by + h - 0.5);
    c.fill();
    c.stroke();
    c.fillStyle = bg;
    c.fillRect(tx - 5, by + h - 2, 10, 3);
    c.fillStyle = ink;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    lines.forEach((l, i) => c.fillText(l, bx + 9, by + 6 + i * 16));
    c.restore();
  }

  private drawBag(c: CanvasRenderingContext2D, b: Bag): void {
    const s = Math.max(10, this.r * 0.38);
    c.save();
    c.translate(b.x, b.y);
    c.fillStyle = '#c99a5b';
    c.strokeStyle = '#4a3016';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-s * 0.7, s * 0.6);
    c.lineTo(-s * 0.6, -s * 0.6);
    c.lineTo(s * 0.6, -s * 0.6);
    c.lineTo(s * 0.7, s * 0.6);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#ff3d2e';
    c.fillRect(-s * 0.62, -s * 0.15, s * 1.25, s * 0.3);
    c.fillStyle = FOOD_BY_ID[b.food].color;
    c.beginPath();
    c.arc(0, -s * 0.6, s * 0.28, Math.PI, TAU);
    c.fill();
    c.stroke();
    c.restore();
  }

  private drawShroom(c: CanvasRenderingContext2D, x: number, y: number, s: number, hue: number, tilt: number): void {
    if (s <= 0.02) return;
    const caps = [
      ['#c98a4b', '#7a4f26', '#f0d9b5'],
      ['#e8443a', '#8f1f18', '#fff6e8'],
      ['#7cefd2', '#2a8c78', '#e8fff8'],
    ][hue];
    c.save();
    c.translate(x, y);
    c.rotate(tilt);
    c.scale(s, s);
    if (hue === 2) {
      const g = c.createRadialGradient(0, -14, 1, 0, -14, 22);
      g.addColorStop(0, 'rgba(124,239,210,0.45)');
      g.addColorStop(1, 'rgba(124,239,210,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, -14, 22, 0, TAU);
      c.fill();
    }
    c.fillStyle = '#f2ead8';
    c.strokeStyle = '#3a2a1a';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-3, 0);
    c.quadraticCurveTo(-2.5, -8, -2, -14);
    c.lineTo(2, -14);
    c.quadraticCurveTo(2.5, -8, 3, 0);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = caps[0];
    c.beginPath();
    c.ellipse(0, -14, 11, 8, 0, Math.PI, TAU);
    c.quadraticCurveTo(0, -11, -11, -14);
    c.fill();
    c.stroke();
    c.fillStyle = caps[2];
    for (const [dx, dy] of [
      [-5, -17],
      [3, -19],
      [6, -15],
    ]) {
      c.beginPath();
      c.arc(dx, dy, 1.4, 0, TAU);
      c.fill();
    }
    c.restore();
  }

  private look(v: SceneView): Look {
    const now = this.t;
    const look = defaultLook(v.fit);
    const fast = Math.hypot(this.vx, this.vy) > this.H * 1.2 && !this.grounded;
    let face: Face = v.mood >= 75 ? 'joy' : v.mood >= 45 ? 'happy' : 'meh';
    if (v.health < 40) face = 'sick';
    else if (v.mood < 25 || v.belly < 15) face = 'sad';
    if (now - this.fartAt < 1300) face = 'smug';
    if (this.mode === 'eat') face = 'eat';
    if (this.held || fast || now < this.hoseUntil) face = v.mood > 50 && now >= this.hoseUntil ? 'joy' : 'shock';
    if (this.glitch && !this.grounded) face = 'shock';
    if (this.mode === 'mope' && face !== 'shock') face = 'sad';
    look.face = face;
    look.green = Math.max(0, Math.min(1, Math.max(((50 - v.fresh) / 50) * 0.45, ((60 - v.health) / 60) * 0.85)));
    look.fog = Math.max(0, 1 - v.fresh / 70);
    look.flip = this.facing < 0;
    if (now > this.blinkAt + 140) {
      if (Math.random() < 0.004) this.blinkAt = now;
    }
    look.blink = now - this.blinkAt < 140;
    look.armsUp = this.held || fast || (this.glitch !== null && !this.grounded);
    // Talking and chewing.
    if (this.mode === 'eat') look.mouth = (Math.sin(now * 0.03) + 1) / 2;
    else if (this.bubble && now - this.bubble.born < 700) look.mouth = (Math.sin(now * 0.04) + 1) / 2.4;
    // Squash, stretch, and a waddle.
    const walk = this.mode === 'walk' && this.grounded ? Math.sin(now * 0.02) * 0.05 : 0;
    const breathe = Math.sin(now * 0.004) * 0.015;
    look.sx = 1 + this.sq * 0.9 - walk * 0.5 - breathe;
    look.sy = 1 - this.sq + walk + breathe;
    if (this.held) {
      look.sx = 0.92;
      look.sy = 1.1;
    }
    look.lean = this.spin + (this.grounded ? walk * 2 : Math.max(-0.3, Math.min(0.3, this.vx * 0.0008)));
    return look;
  }

  draw(t: number): void {
    const dt = Math.min(0.05, Math.max(0, (t - (this.last || t)) / 1000));
    this.last = t;
    this.t = t;
    this.update(dt);
    const v = this.view;
    const c = this.ctx;
    const { W, H, L, R, T, B, r } = this;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.drawImage(this.base, 0, 0, W, H);
    if (!v) return;
    const dead = v.deadFor !== null;
    const d = v.deadFor ?? 0;

    c.save();
    c.beginPath();
    c.rect(L, T, R - L, B - T);
    c.clip();

    // Poop on the floor.
    v.poops.forEach((p, i) => {
      const pos = this.poopPos(p);
      const born = this.poopBorn.get(i);
      const age = born === undefined ? 1 : Math.min(1, (t - born) / 400);
      const s = Math.max(6, r * 0.28) * (0.4 + 0.6 * ease(age));
      this.drawPoop(c, pos.x, pos.y - s * 0.25 - (1 - age) * r * 0.6, s);
      this.stinkLines(c, pos.x, pos.y - s * 1.3, s * 1.2, 2, 0.45);
    });
    for (const f of this.flying) {
      c.save();
      c.globalAlpha = 1 - (t - f.born) / 900;
      this.drawPoop(c, f.x, f.y, Math.max(6, r * 0.28));
      c.restore();
    }
    for (const b of this.bags) this.drawBag(c, b);
    for (const nb of this.neighbors) this.drawNeighbor(c, nb, v);

    // Hammy, or what's left of him.
    const look = this.look(v);
    if (dead) {
      const fall = ease(d / 1.2);
      look.face = 'dead';
      look.flip = true;
      look.lean = 0;
      look.green = Math.max(look.green, Math.min(1, d / 14));
      look.armsUp = false;
      look.mouth = 0;
      const fade = 1 - ease((d - 24) / 10);
      const skeleton = ease((d - 22) / 8);
      drawSkeleton(c, this.x, this.floor - r * 0.45, r * 1.15, skeleton);
      if (fade > 0) {
        c.save();
        c.globalAlpha = fade;
        c.translate(this.x, this.floor - r * 0.55);
        c.rotate((Math.PI / 2) * fall);
        // Deflating as he goes.
        drawHammy(c, 0, -r * 0.4 * (1 - fall), r, { ...look, sx: 1 - (1 - fade) * 0.2, sy: 1 - (1 - fade) * 0.35 }, t);
        c.restore();
      }
      for (const m of this.shrooms) {
        const grow = ease((d - 10 - m.delay) / 6);
        this.drawShroom(c, this.x + m.dx * r, this.floor - m.dy * r * 0.6, grow * m.s * (r / 30), m.hue, m.tilt);
      }
      this.stinkLines(c, this.x, this.floor - r * 1.2, r * 1.6, 4, 0.7 * fade);
      for (let i = 0; i < 4; i++) this.fly(c, this.x, this.floor - r * 1.1, i, r * 1.1);
    } else {
      drawHammy(c, this.x, this.y, r, look, t);
      const stink = 1 - v.fresh / 100;
      this.stinkLines(c, this.x, this.y - r * 1.05, r * 1.4, Math.round(stink * 5), Math.min(0.85, stink));
      const flies = (v.fresh < 30 ? 2 : v.fresh < 50 ? 1 : 0) + (v.poops.length >= 4 ? 1 : 0);
      for (let i = 0; i < flies; i++) this.fly(c, this.x, this.y - r * 0.4, i, r * 1.2);
    }

    // Hose water.
    if (t < this.hoseUntil) {
      c.strokeStyle = 'rgba(120,200,255,0.7)';
      c.lineWidth = 3;
      for (let i = 0; i < 7; i++) {
        const k = ((t * 0.004 + i / 7) % 1);
        c.beginPath();
        c.moveTo(L + 4, T + 8 + i * 2);
        c.quadraticCurveTo((L + this.x) / 2, T - 10, this.x + (k - 0.5) * r, this.y - r * 0.3 + k * r * 0.6);
        c.stroke();
      }
    }

    // Fart clouds over everything in the tank.
    for (const p of this.puffs) {
      const age = (t - p.born) / p.life;
      c.globalAlpha = Math.max(0, 0.55 * (1 - age));
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.r * (1 + age * 2.2), 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;

    // The air itself goes green.
    const haze = dead ? 0.3 : Math.max(0, (60 - v.fresh) / 60) ** 1.5 * 0.32;
    if (haze > 0.01) {
      c.fillStyle = `rgba(150,200,60,${haze})`;
      c.fillRect(L, T, R - L, B - T);
    }
    c.restore();

    // Glass and lid.
    c.strokeStyle = 'rgba(210,235,255,0.55)';
    c.lineWidth = 2;
    c.strokeRect(L, T, R - L, B - T);
    c.fillStyle = 'rgba(255,255,255,0.06)';
    c.beginPath();
    c.moveTo(L + (R - L) * 0.08, T);
    c.lineTo(L + (R - L) * 0.16, T);
    c.lineTo(L + (R - L) * 0.04, B);
    c.lineTo(L, B);
    c.lineTo(L, T + (B - T) * 0.6);
    c.closePath();
    c.fill();
    c.fillStyle = '#3a3f4a';
    c.fillRect(L - 4, T - 7, R - L + 8, 8);
    // The DoorDosh hatch, with whatever is on the way.
    const hx = L + (R - L) * 0.55;
    c.fillStyle = '#ff3d2e';
    c.fillRect(hx - 14, T - 7, 28, 8);
    const next = [...v.orders].sort((a, b) => a.arriveAt - b.arriveAt)[0];
    if (next && !dead) {
      const secs = Math.max(0, Math.ceil((next.arriveAt - v.now) / 1000));
      const label = `${next.self ? "Hammy's order" : 'DoorDosh'} · ${secs >= 60 ? `${Math.ceil(secs / 60)}m` : `0:${String(secs).padStart(2, '0')}`}`;
      c.font = '600 11px Rubik, system-ui, sans-serif';
      const w = c.measureText(label).width + 16;
      const lx = Math.min(R - w, Math.max(L, hx - w / 2));
      c.fillStyle = '#ff3d2e';
      c.beginPath();
      c.roundRect(lx, T - 24, w, 17, 9);
      c.fill();
      c.fillStyle = '#fff';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(label, lx + 8, T - 15.5);
    }

    if (this.glitch && !dead) {
      c.font = '700 11px Rubik, system-ui, sans-serif';
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.fillStyle = Math.sin(t * 0.03) > 0 ? '#ffd34d' : '#ff6fa8';
      c.fillText('⚠ WEIRD PHYSICS', L + 8, T + 8);
    }

    // Popups: coins, hearts, fart noises.
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const p of this.popups) {
      const age = (t - p.born) / 1200;
      if (age < 0) continue;
      c.globalAlpha = 1 - age;
      c.font = p.text.length > 3 ? '700 15px Rubik, system-ui, sans-serif' : '700 18px Rubik, system-ui, sans-serif';
      c.fillStyle = 'rgba(20,10,30,0.6)';
      c.fillText(p.text, p.x + 1, p.y - age * 40 + 1);
      c.fillStyle = p.color;
      c.fillText(p.text, p.x, p.y - age * 40);
    }
    c.globalAlpha = 1;

    if (!dead && this.bubble) this.drawBubble(this.bubble, this.x, this.y - r * 1.15);

    // YOU LOSE.
    if (dead && d >= ROT_SECONDS - 6) {
      const k = ease((d - (ROT_SECONDS - 6)) / 1.2);
      if (!this.youLose && d < ROT_SECONDS + 5) sfx.lose();
      this.youLose = true;
      const pulse = 1 + Math.sin(t * 0.004) * 0.03;
      const size = Math.min(W * 0.16, H * 0.22);
      c.save();
      c.translate(W / 2, T + (this.floor - T) * 0.42);
      c.scale(k * pulse, k * pulse);
      c.rotate(-0.05);
      c.font = `400 ${Math.round(size)}px 'Bagel Fat One', Rubik, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.lineWidth = size * 0.14;
      c.strokeStyle = '#1a0b12';
      c.strokeText('YOU LOSE', 0, 0);
      c.fillStyle = '#ff4d4d';
      c.fillText('YOU LOSE', 0, 0);
      c.restore();
    }
  }
}
