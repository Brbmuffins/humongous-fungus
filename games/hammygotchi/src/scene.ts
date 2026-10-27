// The containment unit, live: Hammy, his poop, his food and his stuff, on two
// floors. Hammy has physics (badly): grab him and throw him, drop him in the
// shower or on the toilet, put him to bed or at his PC. He's lazy, so he
// won't go to the toilet or shower by himself, and he won't fetch food from
// the other floor. The fridge hands out raw steak; drag it onto the oven to
// cook it. The toy bar works here too. Every few minutes gravity stops working
// properly. When he dies he rots right here, sprouts mushrooms, and leaves a
// skeleton.
import { mulberry32 } from '@shared/rng';
import {
  BURN_SECONDS,
  COOK_SECONDS,
  FOOD_BY_ID,
  FORM_BY_ID,
  LEAVE_BELOW,
  PINCH_BELOW,
  ROAD_TRIP,
  ROT_SECONDS,
  SAYS,
  SCIENTIST_INTRO,
  SCIENTIST_LINES,
  SCIENTIST_NEAR,
  SCIENTIST_TAP,
  type FitId,
  type FoodId,
  type FormId,
  type SpotId,
  type ToyId,
} from './defs';
import { EXTENTS, HEADS, drawHammy, drawSkeleton, defaultLook, type Face, type Look } from './hammy';
import {
  DUVET,
  LOFT_SLAB,
  drawFridge,
  drawGlass,
  drawMonitor,
  drawOven,
  drawPan,
  drawPlant,
  drawScientist,
  drawSteak,
  drawVacuum,
  drawWallLife,
  layoutRoom,
  nightLevel,
  paintRoom,
  panSpot,
  toiletSeat,
  type Box,
  type Room,
} from './room';
import { sfx } from './sound';
import type { Poop } from './state';
import { drawToy } from './toys';
import { speak } from './voice';

export type HomeFood = 'rawsteak' | 'steak' | 'burnt';
type RestSpot = 'bed' | 'chair' | 'pc';

export interface SceneView {
  now: number;
  form: FormId;
  fit: FitId;
  toy: ToyId;
  belly: number;
  fresh: number;
  mood: number;
  health: number;
  poops: readonly Poop[];
  orders: readonly { food: FoodId; arriveAt: number; self: boolean }[];
  /** He needs to go. */
  urge: boolean;
  /** Robot vacuums he owns: one downstairs, then one on the loft. */
  vacuums: number;
  /** Seconds since he died, or null. */
  deadFor: number | null;
}

export interface SceneHandlers {
  pet(): void;
  fling(speed: number): void;
  scoop(index: number): void;
  /** A toy got him. The rules decide whether it counts. */
  play(toy: ToyId): void;
  /** He's in the shower or on the toilet. Returns whether anything came of it. */
  spot(id: 'shower' | 'toilet'): boolean;
  /** He's lying on the bed, sitting in his chair or gaming (every frame). */
  rest(id: RestSpot): void;
  /** The fridge was tapped. Returns whether a steak came out. */
  fridge(): boolean;
  eat(kind: HomeFood): void;
  vacuum(index: number): void;
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

/** Anything that falls and lands: bags, steaks, balls, firecrackers. */
interface Thing {
  x: number;
  y: number;
  vx: number;
  vy: number;
  landed: boolean;
}

interface Bag extends Thing {
  food: FoodId;
}

interface Food extends Thing {
  kind: HomeFood;
  held: boolean;
  /** On the stove since this time, or null. */
  panAt: number | null;
}

interface Ball extends Thing {
  spin: number;
  held: boolean;
}

interface Punch {
  /** Which wall it comes out of, and so which way it travels: 1 from the left. */
  dir: number;
  y: number;
  tx: number;
  born: number;
  landed: boolean;
}

interface Cracker extends Thing {
  litAt: number;
}

interface Vacuum {
  x: number;
  up: boolean;
  dir: number;
  /** Backing away from him. */
  shy?: boolean;
}

/** His habits: he does one every so often, wherever he is. */
type Habit = 'burp' | 'pick' | 'sniff' | 'scratch';
const HABITS: readonly Habit[] = ['burp', 'pick', 'sniff', 'scratch'];
const HABIT_MS: Record<Habit, number> = { burp: 1100, pick: 1900, sniff: 1700, scratch: 1500 };
const MET_MOSS = 'hammygotchi.metMoss';

type Glitch = { kind: 'float' | 'moon' | 'sideways' | 'bouncy'; until: number; dir: number };
type Mode = 'idle' | 'walk' | 'eat' | 'mope' | 'climb';

const PUNCH_OUT = 160;
const PUNCH_BACK = 260;
const FUSE_MS = 1800;
const PIE_MS = 380;
const REST_SPOTS: readonly RestSpot[] = ['bed', 'chair', 'pc'];

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
  /** How dark it is in the lab (0 day, 1 night), stepped so the room repaints rarely. */
  private night = 0;
  private lightsAt = 0;
  private readonly calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private view: SceneView | null = null;
  private room: Room = layoutRoom(400, 400);

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
  /** On the loft rather than the ground floor. */
  private up = false;
  private held = false;
  /** Thrown or dropped by hand and not landed yet. */
  private tossed = false;
  private grab = { dx: 0, dy: 0, px: 0, py: 0, downAt: 0, moved: 0, samples: [] as { x: number; y: number; t: number }[] };
  private mode: Mode = 'idle';
  private modeUntil = 0;
  private targetX = 0;
  /** Where he's headed once he's up the ladder. */
  private climbTo: RestSpot | null = null;
  /** The furniture he's walking over to, if any. */
  private walkTo: RestSpot | null = null;
  /** Furniture he's using right now. */
  private at: { id: SpotId; until: number; since: number } | null = null;
  private blinkAt = 0;
  private fartAt = -1e9;
  private eatUntil = 0;
  private eating: Thing | null = null;
  private bubble: Bubble | null = null;
  private nextLineAt = 0;
  private nextComplainAt = 0;
  private nextUrgeLine = 0;
  private nextWhine = 0;
  private glitch: Glitch | null = null;
  private nextGlitchAt = 0;
  private habit: { kind: Habit; start: number; until: number } | null = null;
  private nextHabitAt = 0;
  /** How close he is to Dr. Moss's glass (eased), and when she last told him off. */
  private sciNear = 0;
  private nextNearLine = 0;
  private metMoss = false;
  private plantLean = 0;
  private youLose = false;
  private roll = 0;

  // Toys.
  private balls: Ball[] = [];
  private heldBall: Ball | null = null;
  private punches: Punch[] = [];
  private balloons: { x: number; y: number; vy: number }[] = [];
  private pies: { x: number; y: number; born: number }[] = [];
  private cushion: { x: number; up: boolean; readyAt: number; squashAt: number } | null = null;
  private crackers: Cracker[] = [];
  private magnet: { x: number; y: number } | null = null;
  private feather: { x: number; y: number; moved: number } | null = null;
  private tickleUntil = 0;
  private nextGiggle = 0;
  private kickAt = 0;
  private wetUntil = 0;
  private creamUntil = 0;
  private sootUntil = 0;
  private dizzyUntil = 0;
  private flash = 0;

  // The unit.
  private foods: Food[] = [];
  private heldFood: Food | null = null;
  private fridgeOpenUntil = 0;
  private nextAlarm = 0;
  private vacs: Vacuum[] = [];
  private showerUntil = 0;
  private flushAt = -1e9;
  private nextZ = 0;
  private scientistGone = false;
  private scientistBubble: Bubble | null = null;

  private puffs: Puff[] = [];
  private popups: Popup[] = [];
  private bags: Bag[] = [];
  private flying: { x: number; y: number; vx: number; vy: number; born: number }[] = [];
  private poopBorn = new Map<number, number>();
  private lastPoops = 0;
  private shrooms: { dx: number; dy: number; s: number; hue: number; delay: number; tilt: number }[];

  constructor(private canvas: HTMLCanvasElement, private on: SceneHandlers, seed = 3) {
    this.ctx = canvas.getContext('2d')!;
    const rnd = mulberry32(seed);
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
    this.x = (this.room.chair.x0 + this.room.chair.x1) / 2 - this.room.r * 2.5;
    this.y = this.room.ground - this.room.r;
    this.targetX = this.x;
    this.nextLineAt = performance.now() + 4000;
    this.nextGlitchAt = performance.now() + 90_000 + Math.random() * 90_000;
    this.nextHabitAt = performance.now() + 7000 + Math.random() * 6000;
    try {
      this.metMoss = localStorage.getItem(MET_MOSS) === '1';
    } catch {
      this.metMoss = false;
    }
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const old = this.room;
    // Keep him in the same spot of the unit when it changes size.
    const fx = (this.x - old.L) / Math.max(1, old.R - old.L);
    this.W = Math.max(240, rect.width);
    this.H = Math.max(240, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [this.canvas, this.base]) {
      c.width = Math.round(this.W * this.dpr);
      c.height = Math.round(this.H * this.dpr);
    }
    this.room = layoutRoom(this.W, this.H);
    const m = this.room;
    this.x = m.L + fx * (m.R - m.L);
    this.y = this.floorY() - this.size().hh;
    for (const list of [this.foods, this.bags, this.balls, this.crackers]) for (const th of list) th.landed = false;
    // Whatever's cooking stays in the pan.
    const pan = panSpot(m.oven);
    for (const f of this.foods) {
      if (f.panAt === null) continue;
      f.x = pan.x;
      f.y = pan.y;
      f.landed = true;
    }
    this.paintBase();
  }

  private paintBase(): void {
    const c = this.base.getContext('2d')!;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    paintRoom(c, this.room, this.night);
  }

  get r(): number {
    return this.room.r;
  }

  setView(v: SceneView): void {
    const prev = this.view;
    this.view = v;
    if (v.deadFor === null) this.youLose = false;
    // Coming back to a ruined unit: the scientist has already left.
    if (!prev) this.scientistGone = v.deadFor !== null || v.fresh < LEAVE_BELOW;
    // A new poop: it drops out of him, so put it where he is.
    if (v.poops.length > this.lastPoops && prev) {
      for (let i = this.lastPoops; i < v.poops.length; i++) this.poopBorn.set(i, this.t);
    }
    if (v.poops.length < this.lastPoops) this.poopBorn.clear();
    this.lastPoops = v.poops.length;
    // Robot vacuums: one downstairs, the second on the loft.
    while (this.vacs.length < Math.min(2, v.vacuums)) {
      const up = this.vacs.length === 1;
      this.vacs.push({ x: up ? this.room.L + 40 : (this.room.fridge.x0 + this.room.chair.x1) / 2, up, dir: 1 });
    }
    if (this.vacs.length > v.vacuums) this.vacs.length = v.vacuums;
  }

  /** Where he'd drop a poop right now: behind him, on whichever floor he's on. */
  buttPos(): Poop {
    const m = this.room;
    const bx = this.x - this.facing * this.size().hw * 0.7;
    const end = this.up ? m.loftEnd : m.R;
    return { x: Math.min(0.98, Math.max(0.02, (bx - m.L) / (end - m.L))), up: this.up };
  }

  private poopPos(p: Poop): { x: number; y: number } {
    const m = this.room;
    const end = p.up ? m.loftEnd : m.R;
    const pad = this.r * 0.4;
    return { x: m.L + pad + p.x * (end - m.L - pad * 2), y: p.up ? m.loft : m.ground };
  }

  // -------------------------------------------------------------------------
  // Geometry

  /** Half width and half height of whatever he is today. */
  private size(): { hw: number; hh: number } {
    const e = EXTENTS[this.view?.form ?? 'cube'];
    return { hw: this.r * e.w, hh: this.r * e.h };
  }

  /** The floor he's standing on (or would land on). */
  private floorY(): number {
    return this.up ? this.room.loft : this.room.ground;
  }

  /**
   * Which floor something at x lands on, given where its bottom was last
   * frame. The loft only catches things coming down onto it.
   */
  private surface(x: number, prevBottom: number): { y: number; up: boolean } {
    const m = this.room;
    if (x < m.loftEnd && prevBottom <= m.loft + 2) return { y: m.loft, up: true };
    return { y: m.ground, up: false };
  }

  /** Left and right limits for walking on the floor he's on. */
  private span(up: boolean): [number, number] {
    const m = this.room;
    const { hw } = this.size();
    return up ? [m.L + hw, m.loftEnd - hw * 0.6] : [m.L + hw, m.R - hw];
  }

  /** Is (x, y) on him? `pad` grows the target for fingers. */
  private onHim(x: number, y: number, pad = 1.2): boolean {
    const { hw, hh } = this.size();
    return ((x - this.x) / (hw * pad)) ** 2 + ((y - this.y) / (hh * pad + this.r * 0.1)) ** 2 < 1;
  }

  /** Where his face is right now, for pies and soot. */
  private facePos(): { x: number; y: number; s: number } {
    const head = HEADS[this.view?.form ?? 'cube'];
    return { x: this.x + this.facing * head.x * this.r, y: this.y + head.y * this.r - head.s * this.r * 0.25, s: head.s * this.r };
  }

  private clampX(x: number, margin: number): number {
    return Math.min(this.room.R - margin, Math.max(this.room.L + margin, x));
  }

  private inBox(b: Box, x: number, y: number, pad = 0): boolean {
    return x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad;
  }

  private spotBox(id: SpotId): Box {
    return this.room[id];
  }

  private spotUp(id: SpotId): boolean {
    return id === 'bed' || id === 'pc';
  }

  /** The furniture under (x, y), if he were dropped there. */
  private spotAt(x: number, y: number): SpotId | null {
    const m = this.room;
    // Only what's on the floor he's over: the loft is in the way of everything under it.
    const up = x < m.loftEnd && y < m.loft + LOFT_SLAB;
    const top = up ? m.T : x < m.loftEnd ? m.loft + LOFT_SLAB : m.T;
    for (const id of ['shower', 'toilet', 'chair', 'bed', 'pc'] as const) {
      if (this.spotUp(id) !== up) continue;
      const b = this.spotBox(id);
      if (x >= b.x0 - 4 && x <= b.x1 + 4 && y >= top && y <= b.y1) return id;
    }
    return null;
  }

  /** Where he sits, lies or stands on each piece of furniture. */
  private anchor(id: SpotId): { x: number; y: number } {
    const b = this.spotBox(id);
    const { hh } = this.size();
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    switch (id) {
      case 'shower':
        return { x: b.x0 + w * 0.5, y: b.y1 - hh - 4 };
      case 'toilet':
        return { x: toiletSeat(b).x, y: b.y0 - hh * 0.5 };
      case 'chair':
        return { x: b.x0 + w * 0.5, y: b.y0 + h * 0.35 - hh * 0.9 };
      case 'bed':
        return { x: b.x0 + w * 0.6, y: b.y0 - hh * 0.75 };
      case 'pc':
        return { x: b.x0 + w * 0.15, y: b.y1 - h * 0.34 - hh * 0.9 };
    }
  }

  // -------------------------------------------------------------------------
  // Saying things (and playing his recordings, if there are any)

  say(text: string, ms = 2600, voice?: string): void {
    this.bubble = { text, born: this.t, ms };
    if (voice) speak(voice);
  }

  private sayKind(kind: keyof typeof SAYS, ms = 2600): void {
    this.say(pick(SAYS[kind]), ms, kind.toLowerCase());
  }

  private scientistSays(): void {
    if (this.scientistGone || this.scientistBubble) return;
    this.scientistBubble = { text: pick(SCIENTIST_LINES), born: this.t, ms: 2600 };
  }

  // -------------------------------------------------------------------------
  // Reactions to the rules

  fart(size: number): void {
    this.fartAt = this.t;
    const { hw, hh } = this.size();
    const form = this.view?.form ?? 'cube';
    const bx = this.x - this.facing * hw * 0.85;
    const by = this.y + hh * 0.55;
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
    const words = FORM_BY_ID[form].fart;
    this.popups.push({ x: bx - this.facing * this.r * 0.4, y: by - this.r * 0.2, born: this.t, text: words[size > 1.1 ? 2 : size > 0.7 ? 1 : 0], color: '#c9f06a' });
    // Fart propulsion, in a cell with no rules. Not while he's on the furniture.
    if (!this.held && !this.at && this.view?.deadFor === null) {
      this.vx += this.facing * (60 + size * 160);
      this.vy -= 80 + size * 200;
      this.grounded = false;
      this.kick(0.12 * size);
    }
    if (form === 'train') sfx.toot(size);
    else sfx.fart(size);
    if (size > 0.9 && Math.random() < 0.5) this.sayKind('fart');
    else if (Math.random() < 0.35) this.scientistSays();
  }

  poop(): void {
    sfx.plop();
    this.sayKind(Math.random() < 0.6 ? 'floorPoop' : 'poop');
  }

  /** He needs to go. He won't walk there himself. */
  urge(): void {
    this.nextUrgeLine = this.t + 9000;
    this.sayKind('urge', 2400);
  }

  deliver(food: FoodId): void {
    const m = this.room;
    const G = this.H * 3.2;
    // Through the hatch: onto the loft if he's up there, down the stairwell if not.
    let vx = (Math.random() - 0.5) * 30;
    if (this.up) {
      const target = Math.min(m.loftEnd - 20, Math.max(m.L + 20, this.x));
      vx = (target - m.hatchX) / Math.sqrt((2 * (m.loft - m.T)) / G);
    }
    this.bags.push({ x: m.hatchX, y: m.T + 6, vx, vy: 0, food, landed: false });
    if (food === 'salad') this.sayKind('salad');
    else if (food === 'sushi') this.sayKind('sushi');
    else this.sayKind('food');
  }

  /** The Care tab's buttons: carry him straight to the shower or toilet. */
  carryTo(id: 'shower' | 'toilet'): void {
    if (this.view?.deadFor !== null) return;
    this.held = false;
    this.up = false;
    this.enter(id);
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

  /** The toilet worked: swirl, flush, coins. */
  flushed(coins: number): void {
    this.flushAt = this.t;
    sfx.flush();
    const b = this.room.toilet;
    this.popup(`+${coins}`, '#ffd34d', (b.x0 + b.x1) / 2, b.y0 - this.r * 1.6);
  }

  died(): void {
    this.bubble = null;
    this.held = false;
    this.glitch = null;
    this.at = null;
    this.bags = [];
    // The toys and food go away with him.
    this.setToy();
    this.balls = [];
    this.punches = [];
    this.balloons = [];
    this.pies = [];
    this.cushion = null;
    this.crackers = [];
    this.foods = [];
    this.heldFood = null;
    sfx.sad();
  }

  /** A new Hammy drops in through the hatch. */
  spawn(): void {
    const m = this.room;
    this.x = m.hatchX;
    this.y = m.T + this.r + 8;
    this.vx = this.vy = this.spin = this.spinV = 0;
    this.up = false;
    this.grounded = false;
    this.held = false;
    this.at = null;
    this.mode = 'idle';
    this.bags = [];
    this.puffs = [];
    this.youLose = false;
    this.scientistGone = false;
    this.say('Hi. I live here now.', 2600, 'hello');
  }

  /** Space bar on the unit: a pat on the head. */
  patFromKeyboard(): void {
    if (this.view?.deadFor !== null) return;
    this.hearts();
    this.on.pet();
  }

  private hearts(): void {
    for (let i = 0; i < 3; i++) this.popups.push({ x: this.x + (i - 1) * this.r * 0.5, y: this.y - this.r * (1.1 + i * 0.1), born: this.t + i * 90, text: '♥', color: '#ff6fa8' });
    if (Math.random() < 0.4) this.sayKind('pet', 1600);
  }

  private kick(amount: number): void {
    if (this.calm) return;
    this.sqV += amount * 30;
  }

  /** He finds out what today's form is. */
  morph(form: FormId): void {
    for (let i = 0; i < (this.calm ? 4 : 16); i++) {
      const a = (i / 16) * TAU;
      this.puffs.push({ x: this.x, y: this.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 70 - 20, r: this.r * 0.35, born: this.t, life: 900, color: i % 2 ? '#e8dcff' : '#ffffff' });
    }
    this.popups.push({ x: this.x, y: this.y - this.r, born: this.t, text: 'POOF', color: '#e8dcff' });
    this.say(pick(FORM_BY_ID[form].lines), 3000, 'form');
    sfx.poof();
  }

  // -------------------------------------------------------------------------
  // Furniture

  private enter(id: SpotId): void {
    const a = this.anchor(id);
    this.x = a.x;
    this.y = a.y;
    this.vx = this.vy = this.spinV = 0;
    this.spin = 0;
    this.up = this.spotUp(id);
    this.grounded = true;
    this.tossed = false;
    this.mode = 'idle';
    this.climbTo = null;
    const now = this.t;
    if (id === 'shower') {
      if (this.on.spot('shower')) {
        this.at = { id, since: now, until: now + 3200 };
        this.showerUntil = now + 3000;
        sfx.splash();
        this.sayKind('shower');
      } else {
        this.at = { id, since: now, until: now + 1300 };
        this.say('Still wet. Get me out.', 1600);
      }
    } else if (id === 'toilet') {
      const went = this.on.spot('toilet');
      this.at = { id, since: now, until: now + (went ? 3000 : 1600) };
      this.sayKind(went ? 'toilet' : 'noToilet', 1800);
    } else {
      this.at = { id, since: now, until: now + 20_000 + Math.random() * 30_000 };
      this.facing = id === 'pc' ? 1 : this.facing;
      this.sayKind(id, 1800);
    }
  }

  /** Off the furniture with a little hop. */
  private leave(): void {
    if (!this.at) return;
    const id = this.at.id;
    this.at = null;
    this.grounded = false;
    this.vy = -this.H * 0.7;
    this.vx = (id === 'shower' || id === 'bed' ? 1 : -1) * this.H * 0.35;
    this.mode = 'idle';
    this.modeUntil = this.t + 1500;
  }

  // -------------------------------------------------------------------------
  // Input

  private bind(): void {
    const pt = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const startDrag = (p: { x: number; y: number }, dx: number, dy: number) => {
      this.grab = { dx, dy, px: p.x, py: p.y, downAt: this.t, moved: 0, samples: [{ ...p, t: this.t }] };
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      const v = this.view;
      if (!v || v.deadFor !== null) return;
      const p = pt(e);
      const capture = () => this.canvas.setPointerCapture(e.pointerId);
      switch (v.toy) {
        case 'feather':
          this.feather = { ...p, moved: 0 };
          capture();
          return;
        case 'ball': {
          const br = this.ballR();
          let b = this.balls.find((x) => Math.hypot(x.x - p.x, x.y - p.y) < br * 1.6);
          if (!b) {
            b = { x: this.clampX(p.x, br), y: Math.min(p.y, this.room.ground - br), vx: 0, vy: 0, spin: 0, held: true, landed: false };
            this.balls.push(b);
            if (this.balls.length > 3) this.balls.shift();
          }
          b.held = true;
          this.heldBall = b;
          startDrag(p, b.x - p.x, b.y - p.y);
          capture();
          return;
        }
        case 'glove':
          this.punches.push({ dir: p.x < (this.room.L + this.room.R) / 2 ? 1 : -1, y: p.y, tx: p.x, born: this.t, landed: false });
          sfx.boing();
          return;
        case 'balloon':
          this.balloons.push({ x: this.clampX(p.x, 12), y: Math.max(this.room.T + 12, Math.min(p.y, (p.y > this.room.loft ? this.room.loft + LOFT_SLAB + 12 : this.room.T + 12))), vy: 0 });
          return;
        case 'pie':
          this.pies.push({ x: p.x, y: p.y, born: this.t });
          return;
        case 'cushion': {
          const up = p.y < this.room.loft + LOFT_SLAB && p.x < this.room.loftEnd;
          this.cushion = { x: Math.min(up ? this.room.loftEnd - this.r : this.room.R, Math.max(this.room.L, this.clampX(p.x, this.r * 0.6))), up, readyAt: this.t + 700, squashAt: -1e9 };
          return;
        }
        case 'magnet':
          this.magnet = p;
          this.leave();
          this.grounded = false;
          capture();
          return;
        case 'firecracker':
          this.crackers.push({ x: this.clampX(p.x, 12), y: p.y, vx: 0, vy: 0, landed: false, litAt: this.t });
          if (this.crackers.length > 3) this.crackers.shift();
          sfx.fuse();
          return;
        default:
          break;
      }
      // The hand: food first (it's small and on top), then Hammy, poop, the fridge.
      const food = [...this.foods].reverse().find((f) => Math.hypot(f.x - p.x, f.y - p.y) < this.r * 0.9);
      if (food) {
        food.held = true;
        food.panAt = null;
        food.landed = false;
        this.heldFood = food;
        startDrag(p, food.x - p.x, food.y - p.y);
        capture();
        return;
      }
      if (this.onHim(p.x, p.y)) {
        this.leave();
        this.held = true;
        this.climbTo = null;
        startDrag(p, this.x - p.x, this.y - p.y);
        capture();
        this.grounded = false;
        return;
      }
      for (let i = v.poops.length - 1; i >= 0; i--) {
        const pp = this.poopPos(v.poops[i]);
        if (Math.hypot(p.x - pp.x, p.y - (pp.y - this.r * 0.2)) < this.r * 0.6) {
          this.on.scoop(i);
          return;
        }
      }
      if (this.inBox(this.room.fridge, p.x, p.y, 4)) {
        this.openFridge();
        return;
      }
      if (this.inBox(this.room.window, p.x, p.y, 6)) {
        if (this.scientistGone) this.say(pick(['She left. Can’t imagine why.', 'Dr. Moss went home.', 'More room for me.']), 1800);
        else this.scientistBubble = { text: pick(SCIENTIST_TAP), born: this.t, ms: 2800 };
        return;
      }
      // Knocking on the glass: he looks over.
      this.facing = p.x > this.x ? 1 : -1;
      if (Math.random() < 0.3) this.say(pick(['?', 'Hello?', 'Who’s there?', 'Don’t tap the glass.']), 1400);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const p = pt(e);
      if (this.feather) {
        this.feather.moved += Math.hypot(p.x - this.feather.x, p.y - this.feather.y);
        this.feather.x = p.x;
        this.feather.y = p.y;
      }
      if (this.magnet) this.magnet = p;
      if (!this.held && !this.heldBall && !this.heldFood) return;
      this.grab.moved += Math.hypot(p.x - this.grab.px, p.y - this.grab.py);
      this.grab.px = p.x;
      this.grab.py = p.y;
      this.grab.samples.push({ ...p, t: this.t });
      if (this.grab.samples.length > 6) this.grab.samples.shift();
    });
    const throwSpeed = () => {
      const g = this.grab;
      const a = g.samples[0];
      const b = g.samples[g.samples.length - 1];
      // The finger stopped before letting go: that's setting him down, not a throw.
      if (this.t - b.t > 90) return { vx: 0, vy: 0 };
      const dt = Math.max(16, b.t - a.t) / 1000;
      const max = this.H * 7;
      return { vx: Math.max(-max, Math.min(max, (b.x - a.x) / dt)), vy: Math.max(-max, Math.min(max, (b.y - a.y) / dt)) };
    };
    const release = () => {
      this.feather = null;
      this.magnet = null;
      if (this.heldBall) {
        const b = this.heldBall;
        Object.assign(b, throwSpeed());
        b.held = false;
        this.heldBall = null;
        return;
      }
      if (this.heldFood) {
        const f = this.heldFood;
        f.held = false;
        this.heldFood = null;
        const o = this.room.oven;
        const pan = panSpot(o);
        // Dropped on the stove: into the pan, if it's free.
        if (f.x >= o.x0 - 8 && f.x <= o.x1 + 8 && f.y >= o.y0 - (o.y1 - o.y0) * 1.2 && f.y <= o.y1 && !this.foods.some((x) => x !== f && x.panAt !== null)) {
          f.x = pan.x;
          f.y = pan.y;
          f.vx = f.vy = 0;
          f.panAt = this.t;
          f.landed = true;
          sfx.sizzle();
          return;
        }
        Object.assign(f, throwSpeed());
        return;
      }
      if (!this.held) return;
      this.held = false;
      const g = this.grab;
      if (g.moved < 10 && this.t - g.downAt < 350) {
        this.hearts();
        this.on.pet();
        return;
      }
      const v = throwSpeed();
      const speed = Math.hypot(v.vx, v.vy);
      // Set down gently over furniture: he goes on it.
      if (speed < this.H * 1.4) {
        const id = this.spotAt(this.x, this.y);
        if (id) {
          this.enter(id);
          return;
        }
      }
      this.vx = v.vx;
      this.vy = v.vy;
      this.tossed = true;
      this.spinV = this.vx * 0.012;
      if (speed > this.H * 1.5) {
        this.sayKind('fling', 1500);
        sfx.boing();
      }
      this.on.fling(speed);
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
  }

  private openFridge(): void {
    if (!this.on.fridge()) {
      this.popup('No coins', '#ff8a7a', (this.room.fridge.x0 + this.room.fridge.x1) / 2, this.room.fridge.y0 - 8);
      return;
    }
    const f = this.room.fridge;
    this.fridgeOpenUntil = this.t + 700;
    this.foods.push({ kind: 'rawsteak', x: f.x0 + 6, y: f.y0 + (f.y1 - f.y0) * 0.4, vx: -this.H * (0.5 + Math.random() * 0.3), vy: -this.H * 0.6, landed: false, held: false, panAt: null });
    if (this.foods.length > 4) this.foods.shift();
    sfx.fridge();
  }

  /** Changing toys drops whatever you were holding. */
  setToy(): void {
    this.feather = null;
    this.magnet = null;
    if (this.heldBall) this.heldBall.held = false;
    this.heldBall = null;
    if (this.heldFood) this.heldFood.held = false;
    this.heldFood = null;
    this.held = false;
  }

  private vacR(): number {
    return Math.max(12, this.r * 0.75);
  }

  private ballR(): number {
    return Math.max(7, this.r * 0.32);
  }

  /** Knock him: a push, a spin, a squash and maybe some stars. */
  private knock(vx: number, vy: number, dizzy: number): void {
    this.leave();
    this.held = false;
    this.vx += vx;
    this.vy += vy;
    this.spinV += vx * 0.01;
    this.grounded = false;
    this.kick(0.3);
    if (dizzy) this.dizzyUntil = Math.max(this.dizzyUntil, this.t + dizzy);
  }

  // -------------------------------------------------------------------------
  // Simulation

  /** Fall, land on a floor, bounce a bit. For bags, steaks, balls, firecrackers. */
  private fall(th: Thing, dt: number, G: number, rad: number, bounce = 0.35): void {
    if (th.landed) return;
    const prevBottom = th.y + rad;
    th.vy += G * dt;
    th.x += th.vx * dt;
    th.y += th.vy * dt;
    if (th.x < this.room.L + rad || th.x > this.room.R - rad) {
      th.x = this.clampX(th.x, rad);
      th.vx = -th.vx * 0.6;
    }
    if (th.y < this.room.T + rad) {
      th.y = this.room.T + rad;
      th.vy = Math.abs(th.vy) * 0.5;
    }
    const s = this.surface(th.x, prevBottom);
    if (th.y + rad >= s.y) {
      th.y = s.y - rad;
      if (th.vy > 140) {
        th.vy = -th.vy * bounce;
        th.vx *= 0.7;
      } else {
        th.vy = 0;
        th.vx *= 0.85;
        if (Math.abs(th.vx) < 20) {
          th.vx = 0;
          th.landed = true;
        } else {
          th.x += th.vx * dt;
        }
      }
    }
  }

  private thingUp(th: Thing, rad: number): boolean {
    return th.y + rad <= this.room.loft + 2 && th.x < this.room.loftEnd;
  }

  private update(dt: number): void {
    const v = this.view;
    if (!v) return;
    const now = this.t;
    const dead = v.deadFor !== null;
    const m = this.room;
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
    } else if (!dead && !this.held && !this.at && now > this.nextGlitchAt) {
      this.startGlitch();
    }

    const r = this.r;
    const { hw, hh } = this.size();
    const prevBottom = this.y + hh;
    if (dead) {
      this.at = null;
      const floor = this.floorY();
      this.x += (this.clampX(this.x, Math.max(hw, r * 1.3)) - this.x) * Math.min(1, dt * 4);
      this.y += (floor - (v.form === 'hamster' ? r * 0.55 : hh) - this.y) * Math.min(1, dt * 6);
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
      // Where he'd land if let go: the loft only if he's above it.
      this.up = this.x < m.loftEnd && this.y + hh <= m.loft + 2;
    } else if (this.at) {
      const a = this.anchor(this.at.id);
      this.x += (a.x - this.x) * Math.min(1, dt * 12);
      this.y += (a.y - this.y) * Math.min(1, dt * 12);
      this.vx = this.vy = 0;
      this.updateSpot(now);
    } else if (this.mode === 'climb' && this.climbing()) {
      this.y -= this.H * 0.9 * dt;
      this.x += (this.ladderX() - this.x) * Math.min(1, dt * 10);
      this.vx = this.vy = 0;
      if (this.y + hh <= m.loft - 2) {
        // Off the ladder and onto the loft.
        this.x = m.loftEnd - hw - 4;
        this.y = m.loft - hh;
        this.up = true;
        this.grounded = true;
        const to = this.climbTo;
        this.climbTo = null;
        this.mode = 'walk';
        this.targetX = to ? this.anchor(to).x : this.x - hw * 2;
        this.walkTo = to;
        this.modeUntil = now + 6000;
      }
    } else {
      this.vx += gx * dt;
      this.vy += gy * dt;
      if (this.magnet) {
        // Pulled toward the magnet, with gravity mostly cancelled.
        this.vx += (this.magnet.x - this.x) * 14 * dt;
        this.vy += ((this.magnet.y - this.y) * 14 - gy * 0.95) * dt;
        this.vx *= Math.exp(-dt * 3);
        this.vy *= Math.exp(-dt * 3);
        this.grounded = false;
        if (Math.hypot(this.magnet.x - this.x, this.magnet.y - this.y) < r * 4) {
          this.on.play('magnet');
          if (!this.bubble && Math.random() < dt * 0.5) this.sayKind('magnet', 1400);
        }
      }
      this.think(dt, v);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.spin += this.spinV * dt;
      if (!this.grounded) this.spinV *= Math.exp(-dt * 0.8);
    }

    // Glass walls, ceiling and the two floors.
    if (!this.at && !(this.mode === 'climb' && this.climbing())) {
      const left = m.L + hw;
      const right = m.R - hw;
      const top = m.T + hh + 4;
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
      if (!dead && !this.held) {
        const s = this.surface(this.x, prevBottom);
        const ground = s.y - hh - r * 0.04;
        if (this.y >= ground) {
          this.y = ground;
          this.up = s.up;
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
        } else {
          this.grounded = false;
        }
      }
      if (hit > this.H * 0.6 && !this.held) {
        this.kick(Math.min(0.5, hit / (this.H * 10)));
        sfx.bonk();
        if (hit > this.H * 2.4 && Math.random() < 0.6) this.sayKind('bonk', 1500);
      }
      if (!wasGrounded && this.grounded) {
        this.kick(0.08);
        // Thrown onto the furniture: he stays there.
        if (this.tossed) {
          this.tossed = false;
          const id = this.spotAt(this.x, this.y + hh);
          if (id && this.spotUp(id) === this.up && id !== 'shower' && id !== 'toilet') this.enter(id);
        }
      }
    }

    // Squash spring.
    this.sqV += (-220 * this.sq - 12 * this.sqV) * dt;
    this.sq += this.sqV * dt;
    this.sq = Math.max(-0.4, Math.min(0.4, this.sq));
    if (this.grounded) this.roll += (this.vx * this.facing * dt) / Math.max(4, r * 0.26);
    if (v.urge && !dead && !this.at) {
      // The pee dance.
      this.sqV += Math.sin(now * 0.03) * 0.6;
      if (now > this.nextUrgeLine) this.urge();
    }

    // Deliveries fall in and wait to be eaten; steaks too, or they cook.
    const bagR = Math.max(9, r * 0.4);
    for (const b of this.bags) this.fall(b, dt, G, bagR);
    for (const f of this.foods) {
      if (f.held) {
        f.x = this.grab.px + this.grab.dx;
        f.y = this.grab.py + this.grab.dy;
      } else if (f.panAt !== null) {
        this.cook(f, now);
      } else {
        this.fall(f, dt, G, Math.max(7, r * 0.3));
      }
    }

    // The scientist evacuates when it gets bad enough, and comes back when it doesn't.
    if (dead || v.fresh < LEAVE_BELOW) this.scientistGone = true;
    else if (v.fresh > LEAVE_BELOW + 15) this.scientistGone = false;
    if (this.scientistBubble && now - this.scientistBubble.born > this.scientistBubble.ms) this.scientistBubble = null;
    if (!dead && v.fresh < 60 && now > this.nextComplainAt) {
      this.nextComplainAt = now + 18_000 + Math.random() * 22_000;
      this.scientistSays();
    }

    if (!dead) {
      this.updateVacuums(dt, v);
      this.updateToys(dt, G);
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
      if (!this.bubble) this.idleLine(v);
    }
    this.updateHabit(now, dead);
    this.updateMoss(now, dt, dead);
  }

  // -------------------------------------------------------------------------
  // Gross by nature

  private updateHabit(now: number, dead: boolean): void {
    const h = this.habit;
    if (h && (this.held || !this.grounded || dead)) this.habit = null;
    else if (h && now > h.until) {
      this.habit = null;
      if (h.kind === 'pick') {
        // Flicked. Somewhere.
        const f = this.facePos();
        this.puffs.push({ x: f.x + this.facing * f.s * 0.2, y: f.y + f.s * 0.1, vx: this.facing * (90 + Math.random() * 80), vy: -80 - Math.random() * 40, r: Math.max(1.5, this.r * 0.06), born: now, life: 900, color: '#9bc23a' });
        sfx.squelch();
      }
    }
    if (this.habit || dead || this.held || !this.grounded || now < this.nextHabitAt) return;
    if (this.mode === 'eat' || this.mode === 'climb' || (this.at && this.at.id !== 'chair' && this.at.id !== 'pc')) return;
    this.nextHabitAt = now + 9000 + Math.random() * 12_000;
    const kind = pick(HABITS);
    this.habit = { kind, start: now, until: now + HABIT_MS[kind] };
    if (!this.at) {
      this.mode = 'idle';
      this.vx = 0;
      this.modeUntil = now + HABIT_MS[kind];
    }
    const f = this.facePos();
    if (kind === 'burp') {
      for (let i = 0; i < (this.calm ? 2 : 6); i++) {
        this.puffs.push({ x: f.x + this.facing * f.s * 0.3, y: f.y + f.s * 0.25, vx: this.facing * (30 + Math.random() * 50), vy: -20 - Math.random() * 30, r: this.r * (0.1 + Math.random() * 0.12), born: now, life: 1200 + Math.random() * 600, color: Math.random() < 0.5 ? '#d8e27a' : '#b9d65a' });
      }
      this.popups.push({ x: f.x + this.facing * f.s, y: f.y - f.s * 0.2, born: now, text: pick(['BUUURP', 'BRAAAP', '*burp*']), color: '#d8e27a' });
      sfx.burp();
      if (!this.bubble && Math.random() < 0.5) window.setTimeout(() => this.view?.deadFor === null && !this.bubble && this.sayKind('burp', 1800), 900);
    } else if (kind === 'sniff') {
      if (!this.bubble && Math.random() < 0.7) window.setTimeout(() => this.view?.deadFor === null && !this.bubble && this.sayKind('sniff', 1700), 900);
    } else if (kind === 'pick') {
      if (!this.bubble && Math.random() < 0.4) window.setTimeout(() => this.view?.deadFor === null && !this.bubble && this.sayKind('pick', 1600), 1300);
    } else {
      this.popups.push({ x: this.x - this.facing * this.size().hw, y: this.y + this.size().hh * 0.2, born: now, text: '*scritch*', color: '#ffe3b0' });
      if (!this.bubble && Math.random() < 0.3) window.setTimeout(() => this.view?.deadFor === null && !this.bubble && this.sayKind('scratch', 1600), 800);
    }
  }

  /** Dr. Moss: says hello once, and wants him away from her glass. */
  private updateMoss(now: number, dt: number, dead: boolean): void {
    const w = this.room.window;
    const ww = w.x1 - w.x0;
    const dist = Math.abs(this.x - (w.x0 + w.x1) / 2);
    const near = !dead && !this.up ? Math.max(0, Math.min(1, 1 - (dist - ww * 0.3) / (ww * 1.4))) : 0;
    this.sciNear += (near - this.sciNear) * Math.min(1, dt * 4);
    if (this.scientistGone || this.scientistBubble) return;
    if (!this.metMoss && now > 5000) {
      this.metMoss = true;
      try {
        localStorage.setItem(MET_MOSS, '1');
      } catch {
        // Fine: she'll say hello again next time.
      }
      this.scientistBubble = { text: SCIENTIST_INTRO, born: now, ms: 4600 };
    } else if (this.sciNear > 0.6 && now > this.nextNearLine) {
      this.nextNearLine = now + 12_000 + Math.random() * 8000;
      this.scientistBubble = { text: pick(SCIENTIST_NEAR), born: now, ms: 2200 };
    }
  }

  /** What his hands are doing, drawn over him. */
  private drawHabit(c: CanvasRenderingContext2D, now: number): void {
    const h = this.habit;
    if (!h) return;
    const { hw, hh } = this.size();
    const k = (now - h.start) / (h.until - h.start);
    const skin = '#e8b08a';
    const arm = (x0: number, y0: number, x1: number, y1: number) => {
      c.lineCap = 'round';
      c.strokeStyle = '#1f1a24';
      c.lineWidth = Math.max(4, this.r * 0.2);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
      c.strokeStyle = skin;
      c.lineWidth = Math.max(2.5, this.r * 0.14);
      c.stroke();
      c.lineCap = 'butt';
    };
    if (h.kind === 'pick') {
      // A hand comes up from under his chin, one finger in.
      const f = this.facePos();
      const jig = Math.sin(now * 0.05) * f.s * 0.03;
      const tipX = f.x + this.facing * f.s * 0.05 + jig;
      const tipY = f.y + f.s * 0.14;
      arm(tipX + this.facing * f.s * 0.3, tipY + f.s * 0.75, tipX, tipY);
      c.fillStyle = '#e8b08a';
      c.strokeStyle = '#1f1a24';
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(tipX + this.facing * f.s * 0.24, tipY + f.s * 0.62, Math.max(3, this.r * 0.14), 0, Math.PI * 2);
      c.fill();
      c.stroke();
    } else if (h.kind === 'scratch') {
      const bx = this.x - this.facing * hw * 0.85;
      const by = this.y + hh * (0.45 + Math.sin(now * 0.04) * 0.08);
      arm(this.x - this.facing * hw * 0.3, this.y + hh * 0.1, bx, by);
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(bx - this.facing * (6 + i * 3), by - 4 + i * 4);
        c.lineTo(bx - this.facing * (11 + i * 3), by - 4 + i * 4);
        c.stroke();
      }
    } else if (h.kind === 'sniff') {
      // Nose in the armpit, then the wave of regret.
      const ax = this.x + this.facing * hw * 0.8;
      const ay = this.y - hh * 0.1;
      if (k > 0.35) this.stinkLines(c, ax, ay - hh * 0.2, this.r * 0.8, 3, 0.85 * (1 - k));
    }
  }

  private ladderX(): number {
    return (this.room.ladder.x0 + this.room.ladder.x1) / 2;
  }

  private climbing(): boolean {
    return Math.abs(this.x - this.ladderX()) < 6 && !this.up;
  }

  private cook(f: Food, now: number): void {
    const secs = (now - (f.panAt ?? now)) / 1000;
    if (f.kind === 'rawsteak' && secs >= COOK_SECONDS) {
      f.kind = 'steak';
      sfx.ding();
      this.popup('DING', '#ffd34d', f.x, f.y - this.r);
    }
    if (f.kind !== 'burnt' && secs >= BURN_SECONDS) {
      f.kind = 'burnt';
      this.scientistSays();
    }
    if (Math.random() < 0.15) {
      const burnt = f.kind === 'burnt';
      this.puffs.push({ x: f.x + (Math.random() - 0.5) * 10, y: f.y - 4, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 20, r: burnt ? 5 : 3, born: now, life: burnt ? 1500 : 700, color: burnt ? '#3d3b40' : '#f4f1ea' });
    }
    if (f.kind === 'burnt' && now > this.nextAlarm) {
      this.nextAlarm = now + 900;
      sfx.alarm();
    }
  }

  private updateSpot(now: number): void {
    const at = this.at!;
    if (REST_SPOTS.includes(at.id as RestSpot)) {
      this.on.rest(at.id as RestSpot);
      if (at.id === 'bed' && now > this.nextZ) {
        this.nextZ = now + 1400;
        this.popups.push({ x: this.x + this.r * 0.5, y: this.y - this.r, born: now, text: 'z', color: '#cfe4ff' });
      }
      // Food on his floor gets him up.
      if (this.nearestFood() && now - at.since > 2000) this.leave();
    }
    if (this.at && now > this.at.until) this.leave();
  }

  private nearestFood(): Thing | null {
    const r = this.r;
    const options: Thing[] = [
      ...this.bags.filter((b) => b.landed && this.thingUp(b, Math.max(9, r * 0.4)) === this.up),
      ...this.foods.filter((f) => !f.held && f.panAt === null && f.landed && this.thingUp(f, Math.max(7, r * 0.3)) === this.up),
    ];
    let best: Thing | null = null;
    for (const o of options) if (!best || Math.abs(o.x - this.x) < Math.abs(best.x - this.x)) best = o;
    return best;
  }

  private updateVacuums(dt: number, v: SceneView): void {
    const m = this.room;
    const s = this.vacR();
    for (const vac of this.vacs) {
      const [lo, hi] = vac.up ? [m.L + s, m.loftEnd - s] : [m.L + s, m.R - s];
      let target = -1;
      let best = Infinity;
      v.poops.forEach((p, i) => {
        if (p.up !== vac.up) return;
        const d = Math.abs(this.poopPos(p).x - vac.x);
        if (d < best) {
          best = d;
          target = i;
        }
      });
      // It wants nothing to do with him.
      const reach = this.size().hw + s * 1.5;
      if (this.up === vac.up && !this.held && Math.abs(this.x - vac.x) < reach) {
        const away = vac.x < this.x ? -1 : 1;
        if (!vac.shy) {
          vac.shy = true;
          sfx.beep();
          this.popup('!', '#5ee0b0', vac.x, (vac.up ? m.loft : m.ground) - s * 1.3);
          if (!this.bubble && Math.random() < 0.25) this.sayKind('avoided', 1500);
        }
        vac.dir = away;
        vac.x = Math.min(hi, Math.max(lo, vac.x + away * this.r * 2.6 * dt));
        continue;
      }
      vac.shy = false;
      if (target >= 0) {
        const px = this.poopPos(v.poops[target]).x;
        vac.dir = px > vac.x ? 1 : -1;
        if (Math.abs(px - vac.x) < s * 0.6) {
          for (let i = 0; i < 5; i++) this.puffs.push({ x: px, y: (vac.up ? m.loft : m.ground) - 4, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, r: 2, born: this.t, life: 400, color: '#6b4423' });
          sfx.slurp();
          this.on.vacuum(target);
          continue;
        }
      }
      vac.x += vac.dir * this.r * 1.8 * dt;
      if (vac.x < lo || vac.x > hi) {
        vac.x = Math.min(hi, Math.max(lo, vac.x));
        vac.dir = -vac.dir;
      }
    }
  }

  private updateToys(dt: number, G: number): void {
    const now = this.t;
    const r = this.r;
    const { hw, hh } = this.size();

    // Feather: rubbing it on him.
    const f = this.feather;
    if (f && this.onHim(f.x, f.y, 1.15) && f.moved > 2) {
      f.moved = 0;
      this.tickleUntil = now + 350;
      this.sqV += (Math.random() - 0.5) * 6;
      if (now > this.nextGiggle) {
        this.nextGiggle = now + 320;
        this.popups.push({ x: this.x + (Math.random() - 0.5) * hw, y: this.y - hh, born: now, text: 'he', color: '#ff8fc8' });
        sfx.giggle();
        if (!this.bubble && Math.random() < 0.25) this.sayKind('tickle', 1400);
      }
      this.on.play('feather');
    }

    // Balls.
    const br = this.ballR();
    for (const b of this.balls) {
      if (b.held) {
        const tx = this.grab.px + this.grab.dx;
        const ty = this.grab.py + this.grab.dy;
        b.vx = (tx - b.x) / Math.max(dt, 0.001);
        b.vy = (ty - b.y) / Math.max(dt, 0.001);
        b.x = tx;
        b.y = ty;
        b.landed = false;
      } else {
        b.landed = false;
        this.fall(b, dt, G, br, 0.72);
        b.vx *= Math.exp(-dt * 0.6);
      }
      b.spin += (b.vx * dt) / br;
      // Bouncing off him, which he takes as playing.
      const nx = (b.x - this.x) / (hw + br);
      const ny = (b.y - this.y) / (hh + br);
      const d = Math.hypot(nx, ny);
      if (d < 1 && d > 0) {
        const ux = nx / d;
        const uy = ny / d;
        b.x = this.x + ux * (hw + br) * 1.01;
        b.y = this.y + uy * (hh + br) * 1.01;
        const rel = (b.vx - this.vx) * ux + (b.vy - this.vy) * uy;
        if (rel < 0) {
          b.vx -= 1.8 * rel * ux;
          b.vy -= 1.8 * rel * uy;
          if (!this.held && -rel > this.H * 0.9) {
            this.knock(rel * ux * 0.3, rel * uy * 0.3 - this.H * 0.3, 0);
            sfx.bonk();
            if (!this.bubble) this.sayKind(Math.random() < 0.5 ? 'ow' : 'ball', 1300);
            this.on.play('ball');
          }
        }
      }
      // A ball rolling past while he's standing around: he kicks it.
      const floor = this.surface(b.x, b.y + br - 1).y;
      if (!b.held && this.grounded && !this.held && !this.at && this.mode !== 'eat' && Math.abs(b.y + br - floor) < 3 && this.thingUp(b, br) === this.up && Math.abs(b.x - this.x) < hw + br * 1.6 && now > this.kickAt) {
        this.kickAt = now + 1200;
        this.facing = b.x > this.x ? 1 : -1;
        b.vx = this.facing * this.H * (1.2 + Math.random());
        b.vy = -this.H * (1 + Math.random() * 0.8);
        this.kick(0.15);
        sfx.boing();
        if (!this.bubble && Math.random() < 0.4) this.sayKind('ball', 1200);
        this.on.play('ball');
      }
    }

    // Boxing gloves on springs, out of the side walls.
    this.punches = this.punches.filter((pu) => {
      const age = now - pu.born;
      if (!pu.landed && age >= PUNCH_OUT) {
        pu.landed = true;
        if (this.onHim(pu.tx, pu.y, 1.35) || (Math.abs(pu.tx - this.x) < hw * 0.8 && Math.abs(pu.y - this.y) < hh * 1.6)) {
          this.knock(pu.dir * this.H * 2.6, -this.H * 1.4, 2600);
          this.popups.push({ x: this.x, y: this.y - hh, born: now, text: 'POW!', color: '#ffd34d' });
          sfx.pow();
          this.sayKind('ow', 1500);
          if (Math.random() < 0.4) this.scientistSays();
          this.on.play('glove');
        }
      }
      return age < PUNCH_OUT + PUNCH_BACK + 60;
    });

    // Water balloons fall until they hit him or a floor.
    this.balloons = this.balloons.filter((w) => {
      const prev = w.y + 10;
      w.vy += G * dt;
      w.y += w.vy * dt;
      const hit = this.onHim(w.x, w.y, 1.1);
      const floor = this.surface(w.x, prev).y;
      if (!hit && w.y < floor - 6) return true;
      for (let i = 0; i < (this.calm ? 4 : 14); i++) {
        const a = -Math.PI * (0.1 + Math.random() * 0.8);
        const sp = 80 + Math.random() * 160;
        this.puffs.push({ x: w.x, y: w.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2 + Math.random() * 3, born: now, life: 600, color: '#7cc8ff' });
      }
      this.popups.push({ x: w.x, y: w.y - 10, born: now, text: 'SPLOOSH', color: '#9fd6ff' });
      sfx.splash();
      if (hit) {
        this.wetUntil = now + 4500;
        this.knock(0, this.H * 0.4, 0);
        this.sayKind('splash', 1600);
        this.on.play('balloon');
      }
      return false;
    });

    // Pies always find his face.
    this.pies = this.pies.filter((pie) => {
      if (now - pie.born < PIE_MS) return true;
      const face = this.facePos();
      for (let i = 0; i < (this.calm ? 3 : 10); i++) {
        const a = Math.random() * TAU;
        this.puffs.push({ x: face.x, y: face.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 70, r: 2 + Math.random() * 3, born: now, life: 500, color: '#fffaf0' });
      }
      this.popups.push({ x: face.x, y: face.y - face.s, born: now, text: 'SPLAT', color: '#fffaf0' });
      this.creamUntil = now + 5500;
      this.knock(Math.sign(this.x - pie.x || 1) * this.H * 0.5, -this.H * 0.3, 0);
      sfx.splat();
      this.sayKind('pie', 1800);
      this.on.play('pie');
      return false;
    });

    // The whoopee cushion, waiting for him to sit on it.
    const cu = this.cushion;
    if (cu && now > cu.readyAt && this.grounded && !this.at && this.up === cu.up && Math.abs(this.x - cu.x) < hw * 0.8) {
      cu.readyAt = now + 3000;
      cu.squashAt = now;
      const fy = cu.up ? this.room.loft : this.room.ground;
      for (let i = 0; i < 6; i++) this.puffs.push({ x: cu.x + r * 0.5, y: fy - 6, vx: 40 + Math.random() * 60, vy: -20 - Math.random() * 30, r: r * 0.15, born: now, life: 900, color: '#ffb0d0' });
      this.popups.push({ x: cu.x, y: fy - r, born: now, text: 'PBBBBBT', color: '#ffb0d0' });
      sfx.fart(1.3);
      this.vy = -this.H * 1.1;
      this.grounded = false;
      this.sayKind('cushion', 1800);
      this.scientistSays();
      this.on.play('cushion');
    }

    // Firecrackers: a fuse, then a bang that blows him across the room.
    this.crackers = this.crackers.filter((k) => {
      this.fall(k, dt, G, r * 0.3, 0.2);
      if (now - k.litAt < FUSE_MS) return true;
      this.flash = now;
      for (let i = 0; i < (this.calm ? 5 : 18); i++) {
        const a = Math.random() * TAU;
        const sp = 40 + Math.random() * 140;
        this.puffs.push({ x: k.x, y: k.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, r: r * (0.2 + Math.random() * 0.25), born: now, life: 1200, color: i % 3 ? '#8a8494' : '#5c5866' });
      }
      this.popups.push({ x: k.x, y: k.y - r * 0.6, born: now, text: 'BANG!', color: '#ffd34d' });
      sfx.bang();
      const d = Math.hypot(this.x - k.x, this.y - k.y);
      const reach = r * 4.5;
      if (d < reach && !this.held) {
        const push = 1 - d / reach;
        const dir = Math.sign(this.x - k.x) || (Math.random() < 0.5 ? -1 : 1);
        this.knock(dir * this.H * 3.2 * push, -this.H * (1.2 + 2 * push), d < r * 2.6 ? 3000 : 0);
        if (d < r * 2.6) {
          this.sootUntil = now + 6500;
          this.sayKind('bang', 2000);
          this.on.play('firecracker');
        }
      }
      for (const b of this.balls) {
        const bd = Math.hypot(b.x - k.x, b.y - k.y);
        if (bd < reach) {
          b.vx += Math.sign(b.x - k.x || 1) * this.H * 3 * (1 - bd / reach);
          b.vy -= this.H * 2.5 * (1 - bd / reach);
        }
      }
      if (Math.random() < 0.6) this.scientistSays();
      return false;
    });
  }

  /** What he does when nobody's holding him. */
  private think(dt: number, v: SceneView): void {
    const now = this.t;
    if (!this.grounded) return;
    if (now < this.tickleUntil) {
      this.vx *= 0.8;
      return;
    }
    const r = this.r;
    const [lo, hi] = this.span(this.up);

    // Food first, if it's on his floor. He won't go get it from the other one.
    const food = this.mode === 'eat' ? this.eating : this.nearestFood();
    if (food && this.mode !== 'eat') {
      const d = food.x - this.x;
      if (Math.abs(d) < this.size().hw * 1.1) {
        this.mode = 'eat';
        this.eating = food;
        this.eatUntil = now + 1700;
        this.facing = d >= 0 ? 1 : -1;
        this.vx = 0;
        sfx.crunch();
      } else {
        this.mode = 'walk';
        this.walkTo = null;
        this.targetX = Math.min(hi, Math.max(lo, food.x));
        this.modeUntil = now + 4000;
      }
    } else if (!food && now > this.nextWhine && (this.bags.some((b) => b.landed) || this.foods.some((f) => f.landed && f.panAt === null))) {
      this.nextWhine = now + 12_000;
      this.say(pick(['Bring it here.', 'I’m not going down there.', 'Can you bring me that?', 'Room service?']), 2000);
    }
    if (this.mode === 'eat') {
      this.vx = 0;
      if (now > this.eatUntil) {
        const th = this.eating;
        this.eating = null;
        this.mode = 'idle';
        this.modeUntil = now + 1500;
        if (th) {
          const bi = this.bags.indexOf(th as Bag);
          if (bi >= 0) {
            const b = this.bags[bi];
            this.bags.splice(bi, 1);
            this.crumbs(b.x, b.y, FOOD_BY_ID[b.food].color);
          }
          const fi = this.foods.indexOf(th as Food);
          if (fi >= 0) {
            const f = this.foods[fi];
            this.foods.splice(fi, 1);
            this.crumbs(f.x, f.y, FOOD_BY_ID[f.kind].color);
            this.on.eat(f.kind);
            this.sayKind(f.kind === 'rawsteak' ? 'raw' : f.kind === 'steak' ? 'cooked' : 'burnt', 2000);
          }
        }
      }
      return;
    }

    if (now > this.modeUntil && this.mode !== 'climb') {
      const sad = v.mood < 25 || v.health < 40;
      const roll = Math.random();
      const ball = this.balls.find((b) => !b.held && Math.abs(b.vx) < 30 && b.landed && this.thingUp(b, this.ballR()) === this.up);
      const here = REST_SPOTS.filter((s) => this.spotUp(s) === this.up);
      const there = REST_SPOTS.filter((s) => this.spotUp(s) !== this.up);
      if (!sad && this.cushion && this.cushion.up === this.up && now > this.cushion.readyAt && roll < 0.3) {
        // He can't stay away from it.
        this.mode = 'walk';
        this.walkTo = null;
        this.targetX = this.cushion.x;
        this.modeUntil = now + 4000;
      } else if (!sad && ball && roll < 0.42) {
        this.mode = 'walk';
        this.walkTo = null;
        this.targetX = ball.x;
        this.modeUntil = now + 3000;
      } else if (roll < 0.62 && here.length) {
        // Lazy: off to lie down, sit down or game.
        const to = pick(here);
        this.mode = 'walk';
        this.walkTo = to;
        this.targetX = this.anchor(to).x;
        this.modeUntil = now + 6000;
      } else if (roll < 0.7 && there.length && !v.urge) {
        if (this.up) {
          // Down: walk off the edge of the loft.
          this.mode = 'walk';
          this.walkTo = null;
          this.targetX = this.room.loftEnd + this.size().hw + 6;
          this.modeUntil = now + 5000;
        } else {
          this.mode = 'climb';
          this.climbTo = pick(there);
          this.targetX = this.ladderX();
          this.modeUntil = now + 9000;
        }
      } else if (sad && roll < 0.85) {
        this.mode = 'mope';
        this.modeUntil = now + 5000 + Math.random() * 4000;
      } else if (roll < 0.9) {
        this.mode = 'walk';
        this.walkTo = null;
        this.targetX = lo + Math.random() * (hi - lo);
        this.modeUntil = now + 3500;
      } else {
        this.mode = 'idle';
        this.modeUntil = now + 1500 + Math.random() * 3000;
        // Happy hops.
        if (v.mood > 70 && Math.random() < 0.4) {
          this.vy = -this.H * (0.8 + Math.random() * 0.4);
          this.grounded = false;
          this.kick(0.1);
        }
      }
    }
    if (this.mode === 'climb' && now > this.modeUntil) this.mode = 'idle';
    if (this.mode === 'walk' || this.mode === 'climb') {
      const goal = this.mode === 'climb' ? this.ladderX() : this.targetX;
      const d = goal - this.x;
      if (Math.abs(d) < 5) {
        if (this.mode === 'climb') {
          this.x = goal;
          return;
        }
        const to = this.walkTo;
        this.walkTo = null;
        this.mode = 'idle';
        this.modeUntil = now + 1200 + Math.random() * 2000;
        if (to && this.spotUp(to) === this.up) this.enter(to);
      } else {
        this.facing = d > 0 ? 1 : -1;
        const speed = r * (v.belly < 20 || v.health < 40 ? 1.1 : 2.4);
        this.vx += (this.facing * speed - this.vx) * Math.min(1, dt * 8);
      }
    }
  }

  private crumbs(x: number, y: number, color: string): void {
    for (let k = 0; k < 6; k++) this.puffs.push({ x, y, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, r: 2 + Math.random() * 2, born: this.t, life: 700, color });
  }

  private idleLine(v: SceneView): void {
    const moods: (keyof typeof SAYS)[] = [];
    if (v.belly < 30) moods.push('hungry');
    if (v.mood < 30) moods.push('sad');
    if (v.fresh < 35) moods.push('stinky');
    if (moods.length && Math.random() < 0.55) return this.sayKind(pick(moods));
    if (v.form !== 'cube' && Math.random() < 0.3) return this.say(pick(FORM_BY_ID[v.form].lines), 2600, 'form');
    this.say(pick(ROAD_TRIP), 2600, 'roadtrip');
  }

  private startGlitch(): void {
    const kinds: Glitch['kind'][] = ['float', 'moon', 'sideways', 'bouncy'];
    const kind = pick(kinds);
    const ms = { float: 3500, moon: 6000, sideways: 2600, bouncy: 5000 }[kind];
    this.glitch = { kind, until: this.t + ms, dir: Math.random() < 0.5 ? -1 : 1 };
    this.nextGlitchAt = this.t + 150_000 + Math.random() * 150_000;
    this.grounded = false;
    this.mode = 'idle';
    if (kind === 'bouncy') this.vy = -this.H * 2;
    if (kind === 'moon') this.vy = -this.H * 0.8;
    this.sayKind('glitch', 2000);
    sfx.glitch();
  }

  // -------------------------------------------------------------------------
  // Drawing

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
    c.strokeStyle = `rgba(150,200,50,${alpha})`;
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
    c.fillStyle = 'rgba(220,230,255,0.7)';
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
    const s = Math.max(9, this.r * 0.4);
    c.save();
    c.translate(b.x, b.y);
    c.fillStyle = '#c99a5b';
    c.strokeStyle = '#4a3016';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-s * 0.7, s);
    c.lineTo(-s * 0.6, -s * 0.2);
    c.lineTo(s * 0.6, -s * 0.2);
    c.lineTo(s * 0.7, s);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#ff3d2e';
    c.fillRect(-s * 0.62, s * 0.25, s * 1.25, s * 0.3);
    c.fillStyle = FOOD_BY_ID[b.food].color;
    c.beginPath();
    c.arc(0, -s * 0.2, s * 0.28, Math.PI, TAU);
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

  /** Cream, soot, water and stars, on top of him. */
  private drawAfterEffects(c: CanvasRenderingContext2D, t: number): void {
    const face = this.facePos();
    const { hw, hh } = this.size();
    if (t < this.wetUntil || t < this.showerUntil) {
      const k = Math.min(1, Math.max(this.wetUntil, this.showerUntil) - t) / 800;
      c.fillStyle = `rgba(90,170,255,${0.22 * Math.min(1, k)})`;
      c.beginPath();
      c.ellipse(this.x, this.y, hw, hh, 0, 0, TAU);
      c.fill();
      c.fillStyle = `rgba(124,200,255,${0.9 * Math.min(1, k)})`;
      for (let i = 0; i < 4; i++) {
        const fall = ((t * 0.0015 + i * 0.27) % 1) * hh * 1.4;
        c.beginPath();
        c.ellipse(this.x + (i - 1.5) * hw * 0.5, this.y + hh * 0.2 + fall, 2, 3.5, 0, 0, TAU);
        c.fill();
      }
    }
    if (t < this.sootUntil) {
      const k = Math.min(1, (this.sootUntil - t) / 1000);
      c.fillStyle = `rgba(30,26,34,${0.55 * k})`;
      for (const [dx, dy, rr] of [
        [0, 0, 0.9],
        [-0.5, 0.3, 0.5],
        [0.45, -0.2, 0.55],
      ]) {
        c.beginPath();
        c.ellipse(face.x + dx * face.s, face.y + dy * face.s, rr * face.s, rr * face.s * 0.8, 0, 0, TAU);
        c.fill();
      }
      c.strokeStyle = `rgba(160,155,170,${0.7 * k})`;
      c.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const x = this.x + (i - 1) * hw * 0.4;
        c.beginPath();
        for (let j = 0; j <= 6; j++) c.lineTo(x + Math.sin(t * 0.006 + i + j) * 3, this.y - hh - j * 4);
        c.stroke();
      }
    }
    if (t < this.creamUntil) {
      const k = Math.min(1, (this.creamUntil - t) / 800);
      c.fillStyle = `rgba(255,250,240,${k})`;
      for (const [dx, dy, rr] of [
        [0, 0.05, 0.62],
        [-0.42, -0.1, 0.38],
        [0.4, -0.18, 0.34],
        [0.1, 0.45, 0.3],
      ]) {
        c.beginPath();
        c.ellipse(face.x + dx * face.s, face.y + dy * face.s, rr * face.s, rr * face.s * 0.85, 0, 0, TAU);
        c.fill();
      }
      c.fillStyle = `rgba(232,49,42,${k})`;
      c.beginPath();
      c.arc(face.x + face.s * 0.15, face.y - face.s * 0.4, face.s * 0.12, 0, TAU);
      c.fill();
    }
    if (t < this.dizzyUntil) {
      c.fillStyle = '#ffd34d';
      for (let i = 0; i < 3; i++) {
        const a = t * 0.006 + (i * TAU) / 3;
        const sx = face.x + Math.cos(a) * face.s * 0.9;
        const sy = face.y - face.s * 1.1 + Math.sin(a) * face.s * 0.25;
        c.beginPath();
        for (let j = 0; j < 10; j++) {
          const aa = (j / 10) * TAU - Math.PI / 2;
          const rr = j % 2 ? 2.5 : 6;
          c.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
        }
        c.closePath();
        c.fill();
      }
    }
  }

  private drawToys(c: CanvasRenderingContext2D, t: number): void {
    const r = this.r;
    const br = this.ballR();
    for (const b of this.balls) drawToy(c, 'ball', b.x, b.y, br, t, { k: b.spin });
    for (const w of this.balloons) drawToy(c, 'balloon', w.x, w.y, Math.max(12, r * 0.5), t, { k: Math.sin(t * 0.03) });
    for (const pie of this.pies) {
      const k = Math.min(1, (t - pie.born) / PIE_MS);
      const face = this.facePos();
      const x = pie.x + (face.x - pie.x) * k;
      const y = pie.y + (face.y - pie.y) * k - Math.sin(k * Math.PI) * r * 1.2;
      c.save();
      c.translate(x, y);
      c.rotate(k * TAU);
      drawToy(c, 'pie', 0, 0, Math.max(12, r * 0.5), t);
      c.restore();
    }
    for (const pu of this.punches) {
      const age = t - pu.born;
      const out = age < PUNCH_OUT ? ease(age / PUNCH_OUT) : 1 - ease((age - PUNCH_OUT - 60) / PUNCH_BACK);
      const wall = pu.dir > 0 ? this.room.L : this.room.R;
      const tip = wall + (pu.tx - wall) * Math.max(0, out);
      c.strokeStyle = '#c9ccd6';
      c.lineWidth = 2;
      c.beginPath();
      const coils = 9;
      for (let i = 0; i <= coils * 4; i++) {
        const f = i / (coils * 4);
        c.lineTo(wall + (tip - wall) * f, pu.y + Math.sin(f * coils * TAU) * 6);
      }
      c.stroke();
      c.save();
      c.translate(tip, pu.y);
      c.scale(pu.dir, 1);
      drawToy(c, 'glove', 0, 0, Math.max(13, r * 0.55), t);
      c.restore();
    }
    if (this.magnet) {
      const m = this.magnet;
      c.strokeStyle = 'rgba(120,170,255,0.65)';
      c.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.004 + i / 3) % 1;
        c.beginPath();
        c.moveTo(m.x, m.y);
        c.quadraticCurveTo((m.x + this.x) / 2 + (i - 1) * 14, (m.y + this.y) / 2 - 10, m.x + (this.x - m.x) * k, m.y + (this.y - m.y) * k);
        c.stroke();
      }
      drawToy(c, 'magnet', m.x, m.y, Math.max(12, r * 0.45), t);
    }
    if (this.feather) drawToy(c, 'feather', this.feather.x, this.feather.y, Math.max(12, r * 0.5), t);
  }

  private look(v: SceneView): Look {
    const now = this.t;
    const look = defaultLook(v.fit, v.form);
    look.roll = this.roll;
    const fast = Math.hypot(this.vx, this.vy) > this.H * 1.2 && !this.grounded;
    let face: Face = v.mood >= 75 ? 'joy' : v.mood >= 45 ? 'happy' : 'meh';
    if (v.health < 40) face = 'sick';
    else if (v.mood < 25 || v.belly < 15) face = 'sad';
    if (now - this.fartAt < 1300) face = 'smug';
    if (this.mode === 'eat') face = 'eat';
    if (this.held || fast) face = v.mood > 50 ? 'joy' : 'shock';
    if (this.glitch && !this.grounded) face = 'shock';
    if (this.mode === 'mope' && face !== 'shock') face = 'sad';
    if (v.urge && !this.at) face = Math.sin(now * 0.004) > 0 ? 'shock' : 'sad';
    if (this.at?.id === 'bed') face = 'sleep';
    if (this.at?.id === 'pc') face = Math.sin(now * 0.002) > 0.6 ? 'joy' : 'smug';
    if (this.at?.id === 'shower') face = now - this.at.since < 900 ? 'shock' : 'happy';
    if (this.at?.id === 'toilet') face = now - this.at.since < 1200 ? 'smug' : 'joy';
    if (now < this.dizzyUntil) face = 'sick';
    if (now < this.sootUntil && now > this.sootUntil - 1500) face = 'shock';
    if (now < this.tickleUntil) face = 'joy';
    const hb = this.habit;
    if (hb) {
      const k = (now - hb.start) / (hb.until - hb.start);
      face = hb.kind === 'burp' ? 'smug' : hb.kind === 'pick' ? 'meh' : hb.kind === 'sniff' ? (k < 0.35 ? 'happy' : 'sick') : 'joy';
    }
    look.face = face;
    look.green = Math.max(0, Math.min(1, Math.max(((50 - v.fresh) / 50) * 0.45, ((60 - v.health) / 60) * 0.85)));
    look.fog = Math.max(0, 1 - v.fresh / 70);
    look.flip = this.facing < 0;
    if (now > this.blinkAt + 140 && Math.random() < 0.004) this.blinkAt = now;
    look.blink = now - this.blinkAt < 140;
    look.armsUp = this.held || fast || this.magnet !== null || (this.mode === 'climb' && this.climbing()) || (this.glitch !== null && !this.grounded) || hb?.kind === 'sniff';
    if (hb?.kind === 'burp' && now - hb.start < 700) look.mouth = 0.9;
    else if (this.mode === 'eat') look.mouth = (Math.sin(now * 0.03) + 1) / 2;
    else if (now < this.tickleUntil) look.mouth = 0.5 + Math.sin(now * 0.05) * 0.3;
    else if (this.bubble && now - this.bubble.born < 700) look.mouth = (Math.sin(now * 0.04) + 1) / 2.4;
    const walk = this.mode === 'walk' && this.grounded ? Math.sin(now * 0.02) * 0.05 : 0;
    const breathe = Math.sin(now * 0.004) * 0.015;
    look.sx = 1 + this.sq * 0.9 - walk * 0.5 - breathe;
    look.sy = 1 - this.sq + walk + breathe;
    if (this.at?.id === 'chair' || this.at?.id === 'toilet' || this.at?.id === 'pc') {
      look.sy *= 0.92;
      look.sx *= 1.04;
    }
    if (this.held) {
      look.sx = 0.92;
      look.sy = 1.1;
    }
    look.lean = this.spin + (this.grounded ? walk * 2 : Math.max(-0.3, Math.min(0.3, this.vx * 0.0008)));
    if (this.mode === 'climb' && this.climbing()) look.lean = Math.sin(now * 0.02) * 0.1;
    if (hb?.kind === 'sniff') look.lean += this.facing * 0.18;
    return look;
  }

  draw(t: number): void {
    const dt = Math.min(0.05, Math.max(0, (t - (this.last || t)) / 1000));
    this.last = t;
    this.t = t;
    this.update(dt);
    const v = this.view;
    const c = this.ctx;
    const m = this.room;
    const { W, H, r } = this;
    const { L, R, T, B } = m;
    if (t >= this.lightsAt) {
      this.lightsAt = t + 30_000;
      const night = Math.round(nightLevel(new Date()) * 8) / 8;
      if (night !== this.night) {
        this.night = night;
        this.paintBase();
      }
    }
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.drawImage(this.base, 0, 0, W, H);
    if (!v) return;
    const dead = v.deadFor !== null;
    const d = v.deadFor ?? 0;

    c.save();
    c.beginPath();
    c.rect(L, T, R - L, B - T);
    c.clip();

    // The furniture that changes.
    drawWallLife(c, m, t, new Date(), this.calm);
    const sci = drawScientist(c, m.window, v.fresh < PINCH_BELOW, this.scientistGone, t, { x: this.x, near: this.sciNear });
    // The plant leans away when he's next to it.
    const pcx = (m.plant.x0 + m.plant.x1) / 2;
    const pd = this.x - pcx;
    const lean = this.up && !dead && Math.abs(pd) < r * 2.4 ? -Math.sign(pd) * (1 - Math.abs(pd) / (r * 2.4)) : 0;
    this.plantLean += (lean - this.plantLean) * Math.min(1, dt * 3);
    drawPlant(c, m.plant, dead ? 1 : Math.min(1, Math.max(0, (65 - v.fresh) / 55)), t, this.plantLean);
    drawMonitor(c, m.pc, t, this.at?.id === 'pc');
    drawFridge(c, m.fridge, t < this.fridgeOpenUntil ? 1 : 0);
    const cooking = this.foods.some((f) => f.panAt !== null);
    drawOven(c, m.oven, cooking ? 0.7 + Math.sin(t * 0.01) * 0.3 : 0);
    drawPan(c, m.oven);

    // Poop on the floors.
    v.poops.forEach((p, i) => {
      const pos = this.poopPos(p);
      const born = this.poopBorn.get(i);
      const age = born === undefined ? 1 : Math.min(1, (t - born) / 400);
      const s = Math.max(6, r * 0.3) * (0.4 + 0.6 * ease(age));
      this.drawPoop(c, pos.x, pos.y - s * 0.3 - (1 - age) * r * 0.6, s);
      this.stinkLines(c, pos.x, pos.y - s * 1.3, s * 1.2, 2, 0.5);
    });
    for (const f of this.flying) {
      c.save();
      c.globalAlpha = 1 - (t - f.born) / 900;
      this.drawPoop(c, f.x, f.y, Math.max(6, r * 0.3));
      c.restore();
    }
    for (const vac of this.vacs) drawVacuum(c, vac.x, vac.up ? m.loft : m.ground, this.vacR(), t, vac.dir);
    for (const b of this.bags) this.drawBag(c, b);
    for (const f of this.foods) drawSteak(c, f.x, f.y, Math.max(7, r * 0.3), f.kind);
    if (this.cushion && !dead) {
      const sq = Math.max(0, 1 - (t - this.cushion.squashAt) / 500);
      drawToy(c, 'cushion', this.cushion.x, (this.cushion.up ? m.loft : m.ground) - Math.max(5, r * 0.18), Math.max(9, r * 0.38), t, { k: sq });
    }
    for (const k of this.crackers) drawToy(c, 'firecracker', k.x, k.y, Math.max(9, r * 0.42), t, { lit: true });

    // Hammy, or what's left of him.
    const look = this.look(v);
    if (dead) {
      const floor = this.floorY();
      const fall = ease(d / 1.2);
      look.face = 'dead';
      look.flip = true;
      look.lean = 0;
      look.green = Math.max(look.green, Math.min(1, d / 14));
      look.armsUp = false;
      look.mouth = 0;
      const fade = 1 - ease((d - 24) / 10);
      const skeleton = ease((d - 22) / 8);
      drawSkeleton(c, this.x, floor - r * 0.45, r * 1.15, skeleton);
      if (fade > 0) {
        // A hamster keels over; everything else goes belly-up.
        const hamster = v.form === 'hamster';
        const hh = this.size().hh;
        c.save();
        c.globalAlpha = fade;
        c.translate(this.x, floor - (hamster ? r * 0.55 : hh));
        c.rotate((hamster ? Math.PI / 2 : Math.PI) * fall);
        drawHammy(c, 0, hamster ? -r * 0.4 * (1 - fall) : 0, r, { ...look, flip: hamster, sx: 1 - (1 - fade) * 0.2, sy: 1 - (1 - fade) * 0.35 }, t);
        c.restore();
      }
      for (const s of this.shrooms) {
        const grow = ease((d - 10 - s.delay) / 6);
        this.drawShroom(c, this.x + s.dx * r, floor - s.dy * r * 0.6, grow * s.s * (r / 30), s.hue, s.tilt);
      }
      this.stinkLines(c, this.x, floor - r * 1.2, r * 1.6, 4, 0.7 * fade);
      for (let i = 0; i < 4; i++) this.fly(c, this.x, floor - r * 1.1, i, r * 1.1);
    } else {
      if (!this.at) {
        // His shadow on the floor below, smaller the higher he is.
        const { hw, hh } = this.size();
        const bottom = this.y + hh;
        const floor = this.surface(this.x, bottom - 1).y;
        const k = Math.max(0.25, 1 - Math.max(0, floor - bottom) / (r * 8));
        c.save();
        c.translate(this.x, floor);
        c.scale(1, 0.14);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, hw * 1.1 * k);
        g.addColorStop(0, `rgba(22,28,44,${0.38 * k})`);
        g.addColorStop(1, 'rgba(22,28,44,0)');
        c.fillStyle = g;
        c.fillRect(-hw * 1.2, -hw * 1.2, hw * 2.4, hw * 2.4);
        c.restore();
      }
      drawHammy(c, this.x, this.y, r, look, t);
      this.drawHabit(c, t);
      this.drawAfterEffects(c, t);
      if (this.at?.id === 'bed') {
        // Tucked in.
        const b = m.bed;
        const top = this.y + this.size().hh * 0.1;
        const g = c.createLinearGradient(0, top, 0, b.y1);
        g.addColorStop(0, DUVET[0]);
        g.addColorStop(1, DUVET[1]);
        c.fillStyle = g;
        c.strokeStyle = '#1f1a24';
        c.lineWidth = 1.5;
        c.beginPath();
        c.roundRect(this.x - this.size().hw * 1.3, this.y + this.size().hh * 0.1, this.size().hw * 2.6, b.y1 - (this.y + this.size().hh * 0.1) - (b.y1 - b.y0) * 0.55, 6);
        c.fill();
        c.stroke();
      }
      // He always smells a bit, and there's always at least one fly.
      const stink = 1 - v.fresh / 100;
      this.stinkLines(c, this.x, this.y - this.size().hh * 1.1, r * 1.4, Math.max(1, Math.round(stink * 5)), Math.max(0.3, Math.min(0.85, stink)));
      const flies = 1 + (v.fresh < 30 ? 2 : v.fresh < 50 ? 1 : 0) + (v.poops.length >= 4 ? 1 : 0);
      for (let i = 0; i < flies; i++) this.fly(c, this.x, this.y - r * 0.4, i, r * 1.2);
    }

    // Shower water and the toilet swirl.
    if (t < this.showerUntil) {
      const b = m.shower;
      const hx = (b.x0 + b.x1) / 2;
      c.strokeStyle = 'rgba(120,190,255,0.75)';
      c.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const k = (t * 0.003 + i / 7) % 1;
        const x = hx + (i - 3) * 3 + (i - 3) * k * 6;
        c.beginPath();
        c.moveTo(x, b.y0 + 20 + k * 10);
        c.lineTo(x + (i - 3) * 2, b.y0 + 30 + k * (b.y1 - b.y0 - 40));
        c.stroke();
      }
      if (Math.random() < 0.3) this.puffs.push({ x: hx + (Math.random() - 0.5) * 30, y: b.y0 + 30, vx: 0, vy: -10, r: 8, born: t, life: 1200, color: 'rgba(255,255,255,0.6)' });
    }
    if (t - this.flushAt < 1500) {
      const b = m.toilet;
      const k = (t - this.flushAt) / 1500;
      c.strokeStyle = `rgba(90,170,255,${1 - k})`;
      c.lineWidth = 2;
      c.beginPath();
      const seat = toiletSeat(b);
      c.arc(seat.x, seat.y, 6 + k * 8, t * 0.02, t * 0.02 + 4);
      c.stroke();
    }

    if (!dead) this.drawToys(c, t);

    // Fart clouds over everything in the unit.
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
    if (this.night > 0) {
      c.fillStyle = `rgba(16,20,48,${0.12 * this.night})`;
      c.fillRect(L, T, R - L, B - T);
    }
    const flash = 1 - (t - this.flash) / 250;
    if (flash > 0) {
      c.fillStyle = `rgba(255,240,200,${flash * 0.6})`;
      c.fillRect(L, T, R - L, B - T);
    }
    c.restore();

    // The glass and frame, then the hatch and what's coming through it.
    drawGlass(c, m);
    // The hatch: a slot in the ceiling with a red flap.
    c.fillStyle = '#15191f';
    c.beginPath();
    c.roundRect(m.hatchX - 17, T - 7, 34, 7, [3, 3, 0, 0]);
    c.fill();
    c.fillStyle = '#ff3d2e';
    c.fillRect(m.hatchX - 14, T - 5, 28, 5);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(m.hatchX - 14, T - 5, 28, 1);
    const next = [...v.orders].sort((a, b) => a.arriveAt - b.arriveAt)[0];
    if (next && !dead) {
      const secs = Math.max(0, Math.ceil((next.arriveAt - v.now) / 1000));
      const label = `${next.self ? "Hammy's order" : 'DoorDosh'} · ${secs >= 60 ? `${Math.ceil(secs / 60)}m` : `0:${String(secs).padStart(2, '0')}`}`;
      c.font = '600 11px Rubik, system-ui, sans-serif';
      const w = c.measureText(label).width + 16;
      const lx = Math.min(R - w, Math.max(L, m.hatchX - w / 2 - 20));
      c.fillStyle = '#ff3d2e';
      c.beginPath();
      c.roundRect(lx, T + 4, w, 17, 9);
      c.fill();
      c.fillStyle = '#fff';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(label, lx + 8, T + 12.5);
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

    if (this.scientistBubble) this.drawBubble(this.scientistBubble, sci.x, sci.y, '#e8f0f8', '#1c2836');
    if (!dead && this.bubble) this.drawBubble(this.bubble, this.x, this.y - this.size().hh * 1.25);

    // YOU LOSE.
    if (dead && d >= ROT_SECONDS - 6) {
      const k = ease((d - (ROT_SECONDS - 6)) / 1.2);
      if (!this.youLose && d < ROT_SECONDS + 5) sfx.lose();
      this.youLose = true;
      const pulse = 1 + Math.sin(t * 0.004) * 0.03;
      const size = Math.min(W * 0.16, H * 0.14);
      c.save();
      c.translate(W / 2, T + (B - T) * 0.32);
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
