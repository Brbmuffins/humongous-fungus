// One run: a muffin, the bakery floor at night, and everything that wants to
// eat it. Pure simulation with its own seeded random numbers and no DOM, so
// the same seed and inputs always play out the same (tests and the balance
// sim rely on that). The view reads this state and the events `step` returns.
import { mulberry32 } from '@shared/rng';
import {
  BOMB_BOSS_DAMAGE,
  BOMB_CHANCE,
  CHEF,
  CHEST_CRUMBS,
  COMBO_SECONDS,
  ELITE,
  ENEMY_BY_ID,
  EVENTS,
  HOP,
  HP_PER_MINUTE,
  MAGNET_CHANCE,
  MAX_LEVEL,
  MAX_SPRINKLES,
  MILK_CHANCE,
  MILK_HEAL,
  MUFFIN_BY_ID,
  OVERTIME_HP_PER_MINUTE,
  PANTRY_BY_ID,
  PASSIVE_BY_ID,
  PASSIVES,
  PLAYER,
  PULSE_SECONDS,
  RUN_SECONDS,
  RUSH,
  SLOTS,
  WAVES,
  WEAPON_BY_ID,
  WEAPON_TEMPO,
  WEAPONS,
  xpToNext,
  type EnemyDef,
  type EnemyId,
  type MuffinId,
  type PantryId,
  type PassiveId,
  type PickupKind,
  type WeaponId,
  type WeaponStats,
} from './defs';

export interface RunSetup {
  muffin: MuffinId;
  pantry: Partial<Record<PantryId, number>>;
  seed: number;
  /** Use Auto-Hop if the Pantry has it (a setting; on unless turned off). */
  autoHop?: boolean;
}

/** The muffin's numbers for this run: muffin perks, Pantry and passives. */
export interface Stats {
  maxHp: number;
  armor: number;
  speed: number;
  /** Multipliers. */
  area: number;
  cooldown: number;
  magnet: number;
  might: number;
  growth: number;
  greed: number;
  regen: number;
  bonk: number;
  /** Seconds between Fridge Magnet pulls (0: none). */
  pulse: number;
  autoHop: boolean;
}

/** A Sous Chef helper, flying out for pickups. */
export interface Chef {
  x: number;
  y: number;
  target: Pickup | null;
  /** For hovering around you when there's nothing to fetch. */
  phase: number;
}

export interface Enemy {
  uid: number;
  def: EnemyDef;
  x: number;
  y: number;
  /** Its size and speed: the kind's own, or bigger and faster for a golden one. */
  r: number;
  speed: number;
  /** Golden: much tougher, and it's carrying something. */
  elite: boolean;
  hp: number;
  maxHp: number;
  /** Knockback velocity, which fades. */
  kx: number;
  ky: number;
  slowUntil: number;
  slowBy: number;
  flashUntil: number;
  /** Last time each weapon slot hit it (for weapons that hit over and over). */
  hitAt: number[];
  contactAt: number;
  /** Flying straight across in a flock instead of chasing. */
  flock: { vx: number; vy: number; until: number } | null;
  /** For wobbling and animation. */
  phase: number;
  /** Bosses: when they next do their thing, and a charge in progress. */
  nextMove: number;
  charge: { vx: number; vy: number; until: number } | null;
  dead: boolean;
}

export type ShotKind = 'berry' | 'crumb' | 'pin' | 'toast';

export interface Shot {
  kind: ShotKind;
  /** Weapon slot it came from (-1 for a boss's toast). */
  slot: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  pierce: number;
  knockback: number;
  speed: number;
  age: number;
  life: number;
  /** Pests it already hit (so piercing shots hit each once). */
  hit: number[];
  /** Boomerangs: the way it was thrown, and whether it's on the way back. */
  dx: number;
  dy: number;
  back: boolean;
  bonk: boolean;
}

export interface Puddle {
  slot: number;
  x: number;
  y: number;
  r: number;
  /** In the air until then. */
  landAt: number;
  until: number;
  damage: number;
  nextTick: number;
  /** Where it was thrown from, for drawing the lob. */
  fromX: number;
  fromY: number;
}

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  value: number;
  pulled: boolean;
}

export interface WeaponSlot {
  id: WeaponId;
  level: number;
  evolved: boolean;
  readyAt: number;
  /** Orbiting things' angle. */
  angle: number;
  damage: number;
  kills: number;
}

export interface PassiveSlot {
  id: PassiveId;
  level: number;
}

export type Offer =
  | { type: 'weapon'; id: WeaponId; level: number }
  | { type: 'passive'; id: PassiveId; level: number }
  | { type: 'snack' }
  | { type: 'milk' };

export interface ChestResult {
  evolved: WeaponId | null;
  upgrades: Offer[];
  crumbs: number;
}

export type RunEvent =
  | { type: 'hit'; x: number; y: number; damage: number; bonk: boolean }
  | { type: 'kill'; x: number; y: number; enemy: EnemyId }
  | { type: 'fire'; weapon: WeaponId }
  | { type: 'strike'; x: number; y: number; r: number }
  | { type: 'swipe'; x: number; y: number; angle: number; w: number; h: number; evolved: boolean }
  | { type: 'pickup'; kind: PickupKind; value: number }
  | { type: 'levelup'; level: number }
  | { type: 'hurt'; damage: number }
  | { type: 'hop' }
  | { type: 'boss'; enemy: EnemyId }
  | { type: 'bossDown'; enemy: EnemyId }
  | { type: 'warning'; text: string }
  | { type: 'chest' }
  | { type: 'pulse' }
  | { type: 'revive' }
  /** A golden pest turned up. */
  | { type: 'elite'; enemy: EnemyId }
  /** SUGAR RUSH: started, and over. */
  | { type: 'rush' }
  | { type: 'rushEnd' }
  /** A Cherry Bomb went off where you are. */
  | { type: 'bomb'; x: number; y: number; kills: number }
  | { type: 'win' }
  | { type: 'dead' };

export type RunState = 'playing' | 'levelup' | 'chest' | 'won' | 'dead';

export interface Input {
  /** Wanted direction, length 0..1. */
  x: number;
  y: number;
  hop: boolean;
}

export interface RunSummary {
  muffin: MuffinId;
  seconds: number;
  level: number;
  kills: number;
  crumbs: number;
  won: boolean;
  bosses: number;
  /** The longest run of kills, each within COMBO_SECONDS of the last. */
  combo: number;
  rushes: number;
  weapons: { id: WeaponId; level: number; evolved: boolean; damage: number; kills: number }[];
}

const CELL = 48;
const TAU = Math.PI * 2;
/** Pests farther than this get moved back near you. */
const RECYCLE = 1000;
const LOOK = 420;
/** How far past the edge of the screen pests appear. */
const EDGE = 40;
/** Pests already on their way when the night starts. */
const OPENING = 24;
/** Bosses stop summoning past this many pests. */
const MAX_ENEMIES = 420;

export class Run {
  readonly muffin: MuffinId;
  readonly pantry: Partial<Record<PantryId, number>>;
  private rnd: () => number;
  state: RunState = 'playing';
  t = 0;
  overtime = false;

  // The muffin.
  x = 0;
  y = 0;
  hp: number;
  /** Last direction moved, for aiming whisks and rolling pins. */
  fx = 1;
  fy = 0;
  moving = false;
  hopUntil = -1;
  hopReadyAt = 0;
  safeUntil = 0;
  private hopX = 1;
  private hopY = 0;

  level = 1;
  xp = 0;
  kills = 0;
  crumbs = 0;
  bosses = 0;
  rerolls: number;
  revives: number;
  /** Level-ups still to pick. */
  levelUps = 0;
  offers: Offer[] = [];
  chest: ChestResult | null = null;
  /** Kills in a row, each within COMBO_SECONDS of the last, and the best tonight. */
  combo = 0;
  bestCombo = 0;
  private comboAt = -9;
  /** SUGAR RUSH: the meter, what it takes to fill it, and when the one going ends. */
  rush = 0;
  rushNeed = RUSH.need;
  rushUntil = -1;
  rushes = 0;
  private elitesDown = 0;

  weapons: WeaponSlot[] = [];
  passives: PassiveSlot[] = [];
  stats: Stats;

  enemies: Enemy[] = [];
  chefs: Chef[] = [];
  shots: Shot[] = [];
  puddles: Puddle[] = [];
  pickups: Pickup[] = [];

  /** What the screen shows, in world units: spawns happen just outside it. */
  view = { w: 480, h: 860 };

  private uid = 1;
  private nextPulse = 0;
  private wantsAutoHop: boolean;
  private spawnDebt = OPENING;
  private nextEvent = 0;
  private nextElite = ELITE.first;
  private grid = new Map<number, Enemy[]>();
  private events: RunEvent[] = [];

  constructor(setup: RunSetup) {
    this.muffin = setup.muffin;
    this.pantry = setup.pantry;
    this.rnd = mulberry32(setup.seed);
    this.wantsAutoHop = setup.autoHop !== false;
    const m = MUFFIN_BY_ID[setup.muffin];
    this.weapons.push(this.newWeapon(m.weapon));
    if (m.passive) this.passives.push({ id: m.passive, level: 1 });
    this.stats = this.computeStats();
    this.hp = this.stats.maxHp;
    this.nextPulse = this.stats.pulse;
    this.rerolls = this.pantryLevel('reroll');
    this.revives = this.pantryLevel('revive');
  }

  // -------------------------------------------------------------------------
  // Stats

  private pantryLevel(id: PantryId): number {
    return Math.min(PANTRY_BY_ID[id].prices.length, Math.max(0, Math.floor(this.pantry[id] ?? 0)));
  }

  passiveLevel(id: PassiveId): number {
    return this.passives.find((p) => p.id === id)?.level ?? 0;
  }

  private computeStats(): Stats {
    const b = MUFFIN_BY_ID[this.muffin].bonus;
    const p = (id: PassiveId) => this.passiveLevel(id) * PASSIVE_BY_ID[id].per;
    const q = (id: PantryId) => this.pantryLevel(id) * PANTRY_BY_ID[id].per;
    // A SUGAR RUSH on top of everything.
    const r = this.rushing;
    return {
      maxHp: PLAYER.hp + (b.hp ?? 0) + q('health') + p('batter'),
      armor: (b.armor ?? 0) + q('armor') + p('mitts'),
      speed: PLAYER.speed * (1 + (b.speed ?? 0) + q('speed') + p('sugar')) * (r ? RUSH.speed : 1),
      area: 1 + (b.area ?? 0) + p('powder'),
      cooldown: (1 - p('yeast')) * (1 - q('cooldown')) * (r ? RUSH.cooldown : 1),
      magnet: PLAYER.magnet * (1 + (b.magnet ?? 0) + q('magnet') + p('top')) * (r ? RUSH.magnet : 1),
      might: (1 + (b.might ?? 0) + q('might')) * (r ? RUSH.might : 1),
      growth: (1 + (b.growth ?? 0) + q('growth')) * (r ? RUSH.growth : 1),
      greed: 1 + q('greed'),
      regen: p('preserve'),
      bonk: PLAYER.bonk + (b.bonk ?? 0) + p('bonk'),
      pulse: PULSE_SECONDS[this.pantryLevel('pulse')] ?? 0,
      autoHop: this.wantsAutoHop !== false && this.pantryLevel('autohop') > 0,
    };
  }

  private refreshStats(): void {
    const before = this.stats.maxHp;
    this.stats = this.computeStats();
    // More max health comes with the health to go with it.
    if (this.stats.maxHp > before) this.hp += this.stats.maxHp - before;
  }

  /** A weapon's stats right now, with your size and cooldown bonuses. */
  weaponStats(w: WeaponSlot): WeaponStats {
    const def = WEAPON_BY_ID[w.id];
    const base = w.evolved ? def.evolved.stats : def.levels[w.level - 1];
    return { ...base, area: base.area * this.stats.area, cooldown: base.cooldown * this.stats.cooldown * WEAPON_TEMPO };
  }

  private newWeapon(id: WeaponId): WeaponSlot {
    return { id, level: 1, evolved: false, readyAt: this.t + 0.4, angle: 0, damage: 0, kills: 0 };
  }

  /** Switch Auto-Hop on or off mid-run (only does anything if the Pantry has it). */
  setAutoHop(on: boolean): void {
    this.wantsAutoHop = on;
    this.stats = this.computeStats();
  }

  /** In a SUGAR RUSH right now. */
  get rushing(): boolean {
    return this.t < this.rushUntil;
  }

  private startRush(): void {
    this.rush = 0;
    this.rushes += 1;
    this.rushNeed = RUSH.need + RUSH.needMore * this.rushes;
    this.rushUntil = this.t + RUSH.seconds;
    this.refreshStats();
    this.events.push({ type: 'rush' });
  }

  // -------------------------------------------------------------------------
  // Time

  get minute(): number {
    return Math.floor(this.t / 60);
  }

  /** How much tougher pests are right now. */
  hpScale(): number {
    const night = Math.min(this.t, RUN_SECONDS) / 60;
    const over = Math.max(0, this.t - RUN_SECONDS) / 60;
    return 1 + night * HP_PER_MINUTE + over * OVERTIME_HP_PER_MINUTE;
  }

  private damageScale(): number {
    return 1 + (Math.max(0, this.t - RUN_SECONDS) / 60) * 0.15;
  }

  step(dt: number, input: Input): RunEvent[] {
    this.events = [];
    if (this.state !== 'playing') return this.events;
    dt = Math.min(0.05, Math.max(0, dt));
    this.t += dt;
    if (this.rushUntil > 0 && this.t >= this.rushUntil) {
      this.rushUntil = -1;
      this.refreshStats();
      this.events.push({ type: 'rushEnd' });
    }
    if (this.combo && this.t - this.comboAt > COMBO_SECONDS) this.combo = 0;
    this.movePlayer(dt, input);
    if (this.stats.regen) this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.regen * dt);
    this.spawn(dt);
    this.buildGrid();
    this.moveEnemies(dt);
    this.buildGrid();
    this.contact();
    if (this.state !== 'playing') return this.events;
    this.useWeapons(dt);
    this.moveShots(dt);
    this.tickPuddles();
    this.pulse();
    this.sendChefs(dt);
    this.collect(dt);
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (!this.overtime && this.t >= RUN_SECONDS && this.state === 'playing') {
      this.state = 'won';
      this.events.push({ type: 'win' });
    }
    if (this.state === 'playing' && this.levelUps > 0) this.openLevelUp();
    return this.events;
  }

  private movePlayer(dt: number, input: Input): void {
    let ix = input.x;
    let iy = input.y;
    const len = Math.hypot(ix, iy);
    if (len > 1) {
      ix /= len;
      iy /= len;
    }
    this.moving = len > 0.08;
    if (this.moving) {
      const l = Math.hypot(ix, iy);
      this.fx = ix / l;
      this.fy = iy / l;
    }
    const auto = !input.hop && this.t >= this.hopReadyAt ? this.dodge() : null;
    if ((input.hop || auto) && this.t >= this.hopReadyAt) {
      this.hopUntil = this.t + HOP.seconds;
      this.hopReadyAt = this.t + HOP.cooldown;
      this.safeUntil = Math.max(this.safeUntil, this.t + HOP.safe);
      this.hopX = auto ? auto[0] : this.fx;
      this.hopY = auto ? auto[1] : this.fy;
      this.events.push({ type: 'hop' });
    }
    if (this.t < this.hopUntil) {
      const v = HOP.distance / HOP.seconds;
      this.x += this.hopX * v * dt;
      this.y += this.hopY * v * dt;
    } else {
      this.x += ix * this.stats.speed * dt;
      this.y += iy * this.stats.speed * dt;
    }
  }

  /**
   * Auto-Hop: when a pest (or a slice of toast) is about to touch you, the
   * clearest way out: of twelve directions, the one whose landing spot has
   * the fewest pests near it (ties go the way you're heading). Null when
   * nothing's that close.
   */
  private dodge(): [number, number] | null {
    if (!this.stats.autoHop) return null;
    const close = (x: number, y: number, r: number) => Math.hypot(this.x - x, this.y - y) - r - PLAYER.radius < 8;
    let threat = false;
    for (const e of this.enemies) if (!e.dead && this.t >= e.contactAt && close(e.x, e.y, e.r)) threat = true;
    for (const sh of this.shots) if (sh.kind === 'toast' && close(sh.x, sh.y, sh.r)) threat = true;
    if (!threat) return null;
    let best: [number, number] = [this.fx, this.fy];
    let bestScore = Infinity;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const lx = this.x + dx * HOP.distance;
      const ly = this.y + dy * HOP.distance;
      let danger = 0;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d2 = (e.x - lx) ** 2 + (e.y - ly) ** 2;
        if (d2 < 160 * 160) danger += (e.r + 20) ** 2 / Math.max(100, d2);
      }
      const score = danger - (dx * this.fx + dy * this.fy) * 0.05;
      if (score < bestScore) {
        bestScore = score;
        best = [dx, dy];
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Pests

  private ringRadius(): number {
    return Math.hypot(this.view.w, this.view.h) / 2 + 30;
  }

  private addEnemy(id: EnemyId, x: number, y: number, elite = false): Enemy {
    const def = ENEMY_BY_ID[id];
    const hp = Math.round(def.hp * this.hpScale() * (elite ? ELITE.hp : 1));
    const e: Enemy = {
      uid: this.uid++,
      def,
      x,
      y,
      r: def.radius * (elite ? ELITE.size : 1),
      speed: def.speed * (elite ? ELITE.speed : 1),
      elite,
      hp,
      maxHp: hp,
      kx: 0,
      ky: 0,
      slowUntil: 0,
      slowBy: 0,
      flashUntil: 0,
      hitAt: [-9, -9, -9, -9, -9, -9],
      contactAt: 0,
      flock: null,
      phase: this.rnd() * TAU,
      nextMove: this.t + 3,
      charge: null,
      dead: false,
    };
    this.enemies.push(e);
    return e;
  }

  /**
   * Just past the edge of the screen (not a circle around it, so on a tall
   * phone they don't start far off to the sides); usually ahead of you if
   * you're running, so you can't just outrun them.
   */
  private offScreen(): [number, number] {
    const ahead = this.moving && this.rnd() < 0.6;
    const a = ahead ? Math.atan2(this.fy, this.fx) + (this.rnd() - 0.5) * 2 : this.rnd() * TAU;
    const c = Math.abs(Math.cos(a)) || 1e-6;
    const sn = Math.abs(Math.sin(a)) || 1e-6;
    const r = Math.min(this.view.w / 2 / c, this.view.h / 2 / sn) + EDGE;
    return [this.x + Math.cos(a) * r, this.y + Math.sin(a) * r];
  }

  private pickFrom(mix: Partial<Record<EnemyId, number>>): EnemyId {
    const entries = Object.entries(mix) as [EnemyId, number][];
    let roll = this.rnd() * entries.reduce((s, [, w]) => s + w, 0);
    for (const [id, w] of entries) {
      roll -= w;
      if (roll <= 0) return id;
    }
    return entries[entries.length - 1][0];
  }

  private spawn(dt: number): void {
    const wave = WAVES[Math.min(WAVES.length - 1, this.minute)];
    const over = this.t > RUN_SECONDS ? 1 + (this.t - RUN_SECONDS) / 120 : 1;
    const max = Math.round(wave.max * Math.min(1.25, over));
    const alive = this.enemies.length;
    if (alive < max) {
      this.spawnDebt += wave.rate * over * dt;
      while (this.spawnDebt >= 1) {
        this.spawnDebt -= 1;
        const [x, y] = this.offScreen();
        this.addEnemy(this.pickFrom(wave.mix), x, y);
      }
    } else {
      this.spawnDebt = 0;
    }
    // Every so often, a golden one.
    if (this.t >= this.nextElite) {
      this.nextElite += ELITE.every;
      const [x, y] = this.offScreen();
      const id = this.pickFrom(wave.mix);
      this.addEnemy(id, x, y, true);
      this.events.push({ type: 'elite', enemy: id });
    }
    while (this.nextEvent < EVENTS.length && EVENTS[this.nextEvent].at <= this.t) {
      const ev = EVENTS[this.nextEvent++];
      if (this.overtime) continue;
      if (ev.type === 'boss') {
        const [x, y] = this.offScreen();
        this.addEnemy(ev.enemy, x, y);
        this.events.push({ type: 'boss', enemy: ev.enemy });
      } else if (ev.type === 'ring') {
        const r = this.ringRadius() * 0.85;
        for (let i = 0; i < ev.n; i++) {
          const a = (i / ev.n) * TAU;
          this.addEnemy(ev.enemy, this.x + Math.cos(a) * r, this.y + Math.sin(a) * r);
        }
        this.events.push({ type: 'warning', text: `${ENEMY_BY_ID[ev.enemy].plural}! All around you!` });
      } else {
        // In from one side, straight across, in a loose line.
        const a = this.rnd() * TAU;
        const r = this.ringRadius();
        const def = ENEMY_BY_ID[ev.enemy];
        const vx = -Math.cos(a) * def.speed;
        const vy = -Math.sin(a) * def.speed;
        const until = this.t + (r * 2.4) / def.speed;
        for (let i = 0; i < ev.n; i++) {
          const off = (i - ev.n / 2) * 26;
          const back = this.rnd() * 60;
          const e = this.addEnemy(
            ev.enemy,
            this.x + Math.cos(a) * (r + back) - Math.sin(a) * off,
            this.y + Math.sin(a) * (r + back) + Math.cos(a) * off,
          );
          e.flock = { vx, vy, until };
        }
        this.events.push({ type: 'warning', text: ev.text ?? `A flock of ${def.plural.toLowerCase()}!` });
      }
    }
  }

  private key(cx: number, cy: number): number {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  private buildGrid(): void {
    this.grid.clear();
    for (const e of this.enemies) {
      if (e.dead) continue;
      const k = this.key(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
      const cell = this.grid.get(k);
      if (cell) cell.push(e);
      else this.grid.set(k, [e]);
    }
  }

  /** Every live pest that might be within `r` of (x, y). */
  private near(x: number, y: number, r: number, fn: (e: Enemy) => void): void {
    const pad = r + 44;
    const x0 = Math.floor((x - pad) / CELL);
    const x1 = Math.floor((x + pad) / CELL);
    const y0 = Math.floor((y - pad) / CELL);
    const y1 = Math.floor((y + pad) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.grid.get(this.key(cx, cy));
        if (!cell) continue;
        for (const e of cell) if (!e.dead) fn(e);
      }
    }
  }

  private moveEnemies(dt: number): void {
    const fade = Math.exp(-dt * 8);
    const ring = this.ringRadius();
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = this.x - e.x;
      const dy = this.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const slow = this.t < e.slowUntil ? 1 - e.slowBy : 1;
      let vx: number;
      let vy: number;
      if (e.flock) {
        vx = e.flock.vx;
        vy = e.flock.vy;
        if (this.t > e.flock.until) {
          e.dead = true;
          continue;
        }
      } else if (e.charge && this.t < e.charge.until) {
        vx = e.charge.vx;
        vy = e.charge.vy;
      } else {
        const sp = e.speed;
        vx = (dx / d) * sp;
        vy = (dy / d) * sp;
        if (e.def.wobble) {
          e.phase += dt * 6;
          vx += Math.cos(e.phase) * sp * 0.7;
          vy += Math.sin(e.phase * 1.3) * sp * 0.7;
        }
        if (e.def.boss) this.bossMove(e, dx / d, dy / d);
      }
      e.x += (vx * slow + e.kx) * dt;
      e.y += (vy * slow + e.ky) * dt;
      e.kx *= fade;
      e.ky *= fade;
      // Left far behind: back to the edge of the screen, ahead of you.
      if (!e.flock && !e.def.boss && d > RECYCLE) {
        const a = Math.atan2(this.fy, this.fx) + (this.rnd() - 0.5) * 1.6;
        e.x = this.x + Math.cos(a) * ring;
        e.y = this.y + Math.sin(a) * ring;
      }
    }
    // Pests push each other apart so they crowd rather than stack.
    for (const cell of this.grid.values()) {
      const n = Math.min(cell.length, 24);
      for (let i = 0; i < n; i++) {
        const a = cell[i];
        for (let j = i + 1; j < n; j++) {
          const b = cell[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const min = (a.r + b.r) * 0.85;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const push = (min - d) / d / 2;
          const wa = a.def.boss ? 0.1 : 1;
          const wb = b.def.boss ? 0.1 : 1;
          a.x -= dx * push * wa;
          a.y -= dy * push * wa;
          b.x += dx * push * wb;
          b.y += dy * push * wb;
        }
      }
    }
  }

  private bossMove(e: Enemy, ux: number, uy: number): void {
    if (this.t < e.nextMove) return;
    const id = e.def.id;
    if (id === 'queen') {
      e.nextMove = this.t + 4;
      if (this.enemies.length > MAX_ENEMIES) return;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        this.addEnemy('ant', e.x + Math.cos(a) * 46, e.y + Math.sin(a) * 46);
      }
    } else if (id === 'ratking') {
      e.nextMove = this.t + 5;
      e.charge = { vx: ux * e.speed * 4, vy: uy * e.speed * 4, until: this.t + 0.9 };
      this.events.push({ type: 'warning', text: 'The Rat King charges!' });
    } else if (id === 'toaster') {
      e.nextMove = this.t + 2.6;
      const a = Math.atan2(uy, ux);
      for (const off of [-0.25, 0, 0.25]) {
        this.shots.push({
          kind: 'toast',
          slot: -1,
          x: e.x,
          y: e.y,
          vx: Math.cos(a + off) * 170,
          vy: Math.sin(a + off) * 170,
          r: 9,
          damage: 14,
          pierce: 1,
          knockback: 0,
          speed: 170,
          age: 0,
          life: 5,
          hit: [],
          dx: 0,
          dy: 0,
          back: false,
          bonk: false,
        });
      }
    }
  }

  private contact(): void {
    if (this.t < this.safeUntil) return;
    this.near(this.x, this.y, 50, (e) => {
      if (this.state !== 'playing' || this.t < e.contactAt) return;
      const reach = e.r + PLAYER.radius;
      if ((e.x - this.x) ** 2 + (e.y - this.y) ** 2 > reach * reach) return;
      e.contactAt = this.t + PLAYER.contactCooldown;
      this.hurt(e.def.damage * this.damageScale());
    });
  }

  private hurt(raw: number): void {
    if (this.t < this.safeUntil) return;
    const damage = Math.max(1, raw - this.stats.armor);
    this.hp -= damage;
    // Getting touched breaks the combo.
    this.combo = 0;
    this.events.push({ type: 'hurt', damage });
    if (this.hp > 0) return;
    if (this.revives > 0) {
      this.revives -= 1;
      this.hp = this.stats.maxHp / 2;
      this.safeUntil = this.t + 2.5;
      // Everything close gets knocked away.
      for (const e of this.enemies) {
        const dx = e.x - this.x;
        const dy = e.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 220 && !e.def.boss) {
          e.kx += (dx / d) * 900;
          e.ky += (dy / d) * 900;
        }
      }
      this.events.push({ type: 'revive' });
      return;
    }
    this.hp = 0;
    this.state = 'dead';
    this.events.push({ type: 'dead' });
  }

  /** Hurt a pest. `slot` is the weapon that did it. */
  private hit(e: Enemy, damage: number, slot: number, knock: number, dirX: number, dirY: number, alwaysBonk = false): void {
    if (e.dead) return;
    const bonk = alwaysBonk || this.rnd() < this.stats.bonk;
    const d = damage * this.stats.might * (bonk ? PLAYER.bonkDamage : 1);
    e.hp -= d;
    e.flashUntil = this.t + 0.1;
    const push = knock * (1 - e.def.heft) * (bonk ? 2.5 : 1);
    if (push) {
      const l = Math.hypot(dirX, dirY) || 1;
      e.kx += (dirX / l) * push;
      e.ky += (dirY / l) * push;
    }
    const w = this.weapons[slot];
    // Only what it actually took off counts (not the overkill).
    if (w) w.damage += d + Math.min(0, e.hp);
    this.events.push({ type: 'hit', x: e.x, y: e.y - e.r, damage: d, bonk });
    if (e.hp <= 0) this.kill(e, slot);
  }

  private kill(e: Enemy, slot: number): void {
    e.dead = true;
    this.kills += 1;
    this.combo = this.t - this.comboAt <= COMBO_SECONDS ? this.combo + 1 : 1;
    this.comboAt = this.t;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    if (!this.rushing) {
      this.rush += e.elite ? this.rushNeed / 3 : 1;
      if (this.rush >= this.rushNeed) this.startRush();
    }
    const w = this.weapons[slot];
    if (w) {
      w.kills += 1;
      // The evolved coffee heals you a little for every pest it finishes.
      if (w.id === 'coffee' && w.evolved) this.hp = Math.min(this.stats.maxHp, this.hp + 1);
    }
    this.events.push({ type: 'kill', x: e.x, y: e.y, enemy: e.def.id });
    if (e.def.boss) {
      this.bosses += 1;
      this.pickups.push({ kind: 'chest', x: e.x, y: e.y, value: 1, pulled: false });
      this.events.push({ type: 'bossDown', enemy: e.def.id });
    } else if (e.elite) {
      // What the golden ones carry: a Cherry Bomb or a Sugar Cube, turn about, and a pile of sprinkles and crumbs.
      this.dropXp(e.x, e.y, e.def.xp * ELITE.xp);
      this.pickups.push({ kind: this.elitesDown++ % 2 ? 'bomb' : 'sugar', x: e.x, y: e.y, value: 1, pulled: false });
      this.pickups.push({ kind: 'crumb', x: e.x + 8, y: e.y, value: ELITE.crumbs, pulled: false });
    } else {
      this.dropXp(e.x, e.y, e.def.xp);
      if (this.rnd() < e.def.crumbs) this.pickups.push({ kind: 'crumb', x: e.x + 6, y: e.y, value: 1 + Math.floor(this.minute / 3), pulled: false });
      const roll = this.rnd();
      if (roll < MAGNET_CHANCE) this.pickups.push({ kind: 'magnet', x: e.x, y: e.y, value: 1, pulled: false });
      else if (roll < MAGNET_CHANCE + MILK_CHANCE) this.pickups.push({ kind: 'milk', x: e.x, y: e.y, value: MILK_HEAL, pulled: false });
      else if (roll < MAGNET_CHANCE + MILK_CHANCE + BOMB_CHANCE) this.pickups.push({ kind: 'bomb', x: e.x, y: e.y, value: 1, pulled: false });
    }
    if (e.def.splits) {
      for (let i = 0; i < e.def.splits.n; i++) {
        const a = (i / e.def.splits.n) * TAU + this.rnd();
        const m = this.addEnemy(e.def.splits.into, e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10);
        m.kx = Math.cos(a) * 160;
        m.ky = Math.sin(a) * 160;
      }
    }
  }

  private dropXp(x: number, y: number, value: number): void {
    let n = 0;
    for (const p of this.pickups) if (p.kind === 'xp') n++;
    if (n >= MAX_SPRINKLES) {
      // Too many on the floor: it goes into one that's already there.
      const far = this.pickups.find((p) => p.kind === 'xp' && !p.pulled);
      if (far) {
        far.value += value;
        return;
      }
    }
    this.pickups.push({ kind: 'xp', x, y, value, pulled: false });
  }

  // -------------------------------------------------------------------------
  // Weapons

  /** The `n` nearest pests within reach, nearest first. */
  private nearest(n: number, reach = LOOK): Enemy[] {
    const found: { e: Enemy; d: number }[] = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = (e.x - this.x) ** 2 + (e.y - this.y) ** 2;
      if (d > reach * reach) continue;
      found.push({ e, d });
    }
    found.sort((a, b) => a.d - b.d);
    return found.slice(0, n).map((f) => f.e);
  }

  private shoot(kind: ShotKind, slot: number, s: WeaponStats, angle: number, r: number, bonk = false): void {
    this.shots.push({
      kind,
      slot,
      x: this.x,
      y: this.y,
      vx: Math.cos(angle) * s.speed,
      vy: Math.sin(angle) * s.speed,
      r,
      damage: s.damage,
      pierce: s.pierce,
      knockback: s.knockback,
      speed: s.speed,
      age: 0,
      life: s.duration,
      hit: [],
      dx: Math.cos(angle),
      dy: Math.sin(angle),
      back: false,
      bonk,
    });
  }

  private useWeapons(dt: number): void {
    this.weapons.forEach((w, slot) => {
      const s = this.weaponStats(w);
      const def = WEAPON_BY_ID[w.id];
      if (def.kind === 'orbit') {
        this.orbit(w, slot, s, dt);
        return;
      }
      if (this.t < w.readyAt) return;
      w.readyAt = this.t + s.cooldown;
      switch (def.kind) {
        case 'shoot': {
          const targets = this.nearest(s.count);
          if (!targets.length) {
            w.readyAt = this.t + 0.2;
            return;
          }
          for (let i = 0; i < s.count; i++) {
            const e = targets[i % targets.length];
            const spread = i >= targets.length ? (i - targets.length + 1) * 0.18 : 0;
            this.shoot('berry', slot, s, Math.atan2(e.y - this.y, e.x - this.x) + spread, 6 * s.area);
          }
          break;
        }
        case 'nova': {
          const off = this.rnd() * TAU;
          for (let i = 0; i < s.count; i++) this.shoot('crumb', slot, s, off + (i / s.count) * TAU, 5 * s.area);
          break;
        }
        case 'aura': {
          const r = 62 * s.area;
          this.near(this.x, this.y, r, (e) => {
            const dx = e.x - this.x;
            const dy = e.y - this.y;
            const reach = r + e.r * 0.5;
            if (dx * dx + dy * dy > reach * reach) return;
            e.slowUntil = this.t + 0.6;
            e.slowBy = 0.35;
            this.hit(e, s.damage, slot, s.knockback, dx, dy);
          });
          break;
        }
        case 'boomerang': {
          const target = this.nearest(1)[0];
          const base = target ? Math.atan2(target.y - this.y, target.x - this.x) : Math.atan2(this.fy, this.fx);
          for (let i = 0; i < s.count; i++) {
            const a = base + (i - (s.count - 1) / 2) * 0.55;
            this.shoot('pin', slot, s, a, 13 * s.area, w.evolved);
          }
          break;
        }
        case 'strike': {
          const pool = this.nearest(60, 360);
          if (!pool.length) {
            w.readyAt = this.t + 0.3;
            return;
          }
          const r = 34 * s.area;
          for (let i = 0; i < s.count; i++) {
            const target = pool[Math.floor(this.rnd() * pool.length)];
            const x = target.x;
            const y = target.y;
            this.events.push({ type: 'strike', x, y, r });
            this.near(x, y, r, (e) => {
              const dx = e.x - x;
              const dy = e.y - y;
              const reach = r + e.r;
              if (dx * dx + dy * dy <= reach * reach) this.hit(e, s.damage, slot, s.knockback, dx || 1, dy);
            });
          }
          break;
        }
        case 'swipe': {
          const w2 = 110 * s.area;
          const h2 = 46 * s.area;
          const base = Math.atan2(this.fy, this.fx);
          const dirs = [0, Math.PI, -Math.PI / 2, Math.PI / 2].slice(0, s.count);
          for (const off of dirs) {
            const a = base + off;
            const cx = this.x + Math.cos(a) * w2 * 0.45;
            const cy = this.y + Math.sin(a) * w2 * 0.45;
            this.events.push({ type: 'swipe', x: cx, y: cy, angle: a, w: w2, h: h2, evolved: w.evolved });
            const ca = Math.cos(-a);
            const sa = Math.sin(-a);
            this.near(cx, cy, w2 / 2, (e) => {
              const dx = e.x - cx;
              const dy = e.y - cy;
              const lx = dx * ca - dy * sa;
              const ly = dx * sa + dy * ca;
              const ax = w2 / 2 + e.r;
              const ay = h2 / 2 + e.r;
              if ((lx / ax) ** 2 + (ly / ay) ** 2 <= 1) this.hit(e, s.damage, slot, s.knockback, Math.cos(a), Math.sin(a));
            });
          }
          break;
        }
        case 'puddle': {
          const pool = this.nearest(20, 220);
          for (let i = 0; i < s.count; i++) {
            let x: number;
            let y: number;
            if (pool.length) {
              const e = pool[Math.floor(this.rnd() * pool.length)];
              x = e.x;
              y = e.y;
            } else {
              const a = this.rnd() * TAU;
              const d = 60 + this.rnd() * s.speed;
              x = this.x + Math.cos(a) * d;
              y = this.y + Math.sin(a) * d;
            }
            this.puddles.push({ slot, x, y, r: 38 * s.area, landAt: this.t + 0.35, until: this.t + 0.35 + s.duration, damage: s.damage, nextTick: this.t + 0.35, fromX: this.x, fromY: this.y });
          }
          break;
        }
        default:
          break;
      }
      this.events.push({ type: 'fire', weapon: w.id });
    });
  }

  /** Where each orbiting knife is right now. */
  orbitPositions(w: WeaponSlot): { x: number; y: number; a: number }[] {
    const s = this.weaponStats(w);
    const r = 58 * s.area;
    return Array.from({ length: s.count }, (_, i) => {
      const a = w.angle + (i / s.count) * TAU;
      return { x: this.x + Math.cos(a) * r, y: this.y + Math.sin(a) * r, a };
    });
  }

  private orbit(w: WeaponSlot, slot: number, s: WeaponStats, dt: number): void {
    w.angle = (w.angle + s.speed * dt) % TAU;
    const kr = 13 * s.area;
    for (const k of this.orbitPositions(w)) {
      this.near(k.x, k.y, kr, (e) => {
        if (this.t - e.hitAt[slot] < s.cooldown) return;
        const reach = kr + e.r;
        if ((e.x - k.x) ** 2 + (e.y - k.y) ** 2 > reach * reach) return;
        e.hitAt[slot] = this.t;
        this.hit(e, s.damage, slot, s.knockback, e.x - this.x, e.y - this.y);
      });
    }
  }

  private moveShots(dt: number): void {
    for (const sh of this.shots) {
      sh.age += dt;
      if (sh.kind === 'pin') {
        // Out, slowing down, then back to wherever you are now.
        const half = sh.life / 2;
        if (!sh.back && sh.age >= half) {
          sh.back = true;
          sh.hit = [];
        }
        const speed = sh.speed;
        if (!sh.back) {
          const k = 1 - sh.age / half;
          sh.vx = sh.dx * speed * (0.25 + k);
          sh.vy = sh.dy * speed * (0.25 + k);
        } else {
          const dx = this.x - sh.x;
          const dy = this.y - sh.y;
          const d = Math.hypot(dx, dy) || 1;
          const v = speed * (0.5 + (sh.age - half) / half);
          sh.vx = (dx / d) * v;
          sh.vy = (dy / d) * v;
          if (d < 18) sh.age = 1e9;
        }
      }
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      if (sh.kind === 'toast') {
        const reach = sh.r + PLAYER.radius;
        if ((sh.x - this.x) ** 2 + (sh.y - this.y) ** 2 < reach * reach && this.t >= this.safeUntil) {
          sh.age = 1e9;
          this.hurt(sh.damage * this.damageScale());
        }
        continue;
      }
      const s = this.weapons[sh.slot] ? this.weaponStats(this.weapons[sh.slot]) : null;
      if (!s) continue;
      this.near(sh.x, sh.y, sh.r, (e) => {
        if (sh.pierce <= 0 || sh.hit.includes(e.uid)) return;
        const reach = sh.r + e.r;
        if ((e.x - sh.x) ** 2 + (e.y - sh.y) ** 2 > reach * reach) return;
        sh.hit.push(e.uid);
        sh.pierce -= 1;
        this.hit(e, sh.damage, sh.slot, sh.knockback, sh.vx, sh.vy, sh.bonk);
      });
    }
    this.shots = this.shots.filter((sh) => {
      if (sh.kind === 'pin') return sh.age < sh.life * 3;
      if (sh.pierce <= 0) return false;
      return sh.age < sh.life && Math.abs(sh.x - this.x) < 1200 && Math.abs(sh.y - this.y) < 1200;
    });
  }

  private tickPuddles(): void {
    for (const p of this.puddles) {
      if (this.t < p.landAt || this.t < p.nextTick) continue;
      p.nextTick = this.t + 0.5;
      this.near(p.x, p.y, p.r, (e) => {
        const reach = p.r + e.r * 0.5;
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > reach * reach) return;
        e.slowUntil = this.t + 0.6;
        e.slowBy = 0.55;
        this.hit(e, p.damage, p.slot, 0, 0, 0);
      });
    }
    this.puddles = this.puddles.filter((p) => this.t < p.until);
  }

  // -------------------------------------------------------------------------
  // Pickups and levels

  /** Fridge Magnet: every so often, every sprinkle on the floor comes to you. */
  private pulse(): void {
    if (!this.stats.pulse || this.t < this.nextPulse) return;
    this.nextPulse = this.t + this.stats.pulse;
    let n = 0;
    for (const p of this.pickups) {
      if (p.kind === 'xp' && !p.pulled) {
        p.pulled = true;
        n++;
      }
    }
    if (n) this.events.push({ type: 'pulse' });
  }

  /** Sous Chef: helpers fly out, grab the nearest sprinkle or crumb, and it's yours. */
  private sendChefs(dt: number): void {
    const level = this.passiveLevel('chef');
    const want = level ? CHEF.helpers[level - 1] : 0;
    while (this.chefs.length < want) this.chefs.push({ x: this.x, y: this.y, target: null, phase: this.rnd() * TAU });
    if (!want) return;
    const speed = CHEF.speed[level - 1];
    const reach = CHEF.reach[level - 1];
    for (const c of this.chefs) {
      if (c.target && (Number.isNaN(c.target.x) || !this.pickups.includes(c.target))) c.target = null;
      if (!c.target) {
        let best: Pickup | null = null;
        let bd = Infinity;
        for (const p of this.pickups) {
          if (p.kind === 'chest' || p.pulled || this.chefs.some((o) => o.target === p)) continue;
          if ((p.x - this.x) ** 2 + (p.y - this.y) ** 2 > reach * reach) continue;
          const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
        c.target = best;
      }
      // Off to the pickup, or back to hover beside you.
      c.phase += dt * 2;
      const tx = c.target ? c.target.x : this.x + Math.cos(c.phase) * 34;
      const ty = c.target ? c.target.y : this.y - 26 + Math.sin(c.phase * 1.3) * 8;
      const dx = tx - c.x;
      const dy = ty - c.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = Math.min(d, speed * dt);
      c.x += (dx / d) * step;
      c.y += (dy / d) * step;
      if (c.target && d < 10) {
        this.take(c.target);
        c.target.x = NaN;
        c.target = null;
      }
    }
  }

  private collect(dt: number): void {
    const magnet = this.stats.magnet;
    const grab = PLAYER.radius + 10;
    // Pickups fly to you faster the farther you can reach.
    const pull = Math.max(420, this.stats.speed * 3) * Math.sqrt(magnet / PLAYER.magnet);
    for (const p of this.pickups) {
      if (Number.isNaN(p.x)) continue;
      const dx = this.x - p.x;
      const dy = this.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (!p.pulled && (d < magnet || (p.kind === 'chest' && d < 60))) p.pulled = true;
      if (p.pulled) {
        const v = pull * dt;
        const step = Math.min(d, v);
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
      if (d < grab) {
        this.take(p);
        p.x = NaN;
      }
    }
    this.pickups = this.pickups.filter((p) => !Number.isNaN(p.x));
  }

  private take(p: Pickup): void {
    this.events.push({ type: 'pickup', kind: p.kind, value: p.value });
    switch (p.kind) {
      case 'xp':
        this.addXp(p.value * this.stats.growth);
        break;
      case 'crumb':
        this.crumbs += p.value * this.stats.greed;
        break;
      case 'milk':
        this.hp = Math.min(this.stats.maxHp, this.hp + p.value);
        break;
      case 'magnet':
        for (const q of this.pickups) if (q.kind === 'xp') q.pulled = true;
        break;
      case 'bomb':
        this.bomb();
        break;
      case 'sugar':
        if (!this.rushing) this.startRush();
        else this.rushUntil += RUSH.seconds / 2;
        break;
      case 'chest':
        this.chest = this.openChest();
        this.state = 'chest';
        this.events.push({ type: 'chest' });
        break;
    }
  }

  /** Cherry Bomb: every pest on screen is squashed; bosses take a chunk. */
  private bomb(): void {
    const hw = this.view.w / 2 + 30;
    const hh = this.view.h / 2 + 30;
    let n = 0;
    for (const e of this.enemies) {
      if (e.dead || Math.abs(e.x - this.x) > hw || Math.abs(e.y - this.y) > hh) continue;
      if (e.def.boss) {
        this.hit(e, (e.maxHp * BOMB_BOSS_DAMAGE) / this.stats.might, -1, 0, e.x - this.x, e.y - this.y);
        continue;
      }
      e.hp = 0;
      this.kill(e, -1);
      n++;
    }
    this.events.push({ type: 'bomb', x: this.x, y: this.y, kills: n });
  }

  addXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level += 1;
      this.levelUps += 1;
      this.events.push({ type: 'levelup', level: this.level });
    }
  }

  private openLevelUp(): void {
    const offers = this.makeOffers();
    // Everything maxed: nothing to choose, so no stopping the night for it.
    if (offers.every((o) => o.type === 'snack' || o.type === 'milk')) {
      while (this.levelUps > 0) {
        const milk = this.hp < this.stats.maxHp / 2;
        this.apply({ type: milk ? 'milk' : 'snack' });
        this.events.push({ type: 'pickup', kind: milk ? 'milk' : 'crumb', value: milk ? MILK_HEAL : 25 });
        this.levelUps -= 1;
      }
      return;
    }
    this.state = 'levelup';
    this.offers = offers;
  }

  /** Up to three things to pick from. */
  makeOffers(n = 3): Offer[] {
    const pool: { offer: Offer; weight: number }[] = [];
    for (const w of this.weapons) {
      if (!w.evolved && w.level < MAX_LEVEL) pool.push({ offer: { type: 'weapon', id: w.id, level: w.level + 1 }, weight: 3 });
    }
    if (this.weapons.length < SLOTS) {
      for (const def of WEAPONS) if (!this.weapons.some((w) => w.id === def.id)) pool.push({ offer: { type: 'weapon', id: def.id, level: 1 }, weight: 1.6 });
    }
    for (const p of this.passives) if (p.level < MAX_LEVEL) pool.push({ offer: { type: 'passive', id: p.id, level: p.level + 1 }, weight: 2 });
    if (this.passives.length < SLOTS) {
      for (const def of PASSIVES) if (!this.passives.some((p) => p.id === def.id)) pool.push({ offer: { type: 'passive', id: def.id, level: 1 }, weight: 1.2 });
    }
    const out: Offer[] = [];
    while (out.length < n && pool.length) {
      let roll = this.rnd() * pool.reduce((s, p) => s + p.weight, 0);
      let i = 0;
      for (; i < pool.length - 1; i++) {
        roll -= pool[i].weight;
        if (roll <= 0) break;
      }
      out.push(pool[i].offer);
      pool.splice(i, 1);
    }
    return out.length ? out : [{ type: 'snack' }, { type: 'milk' }];
  }

  private apply(o: Offer): void {
    switch (o.type) {
      case 'weapon': {
        const w = this.weapons.find((x) => x.id === o.id);
        if (w) w.level = Math.min(MAX_LEVEL, w.level + 1);
        else if (this.weapons.length < SLOTS) this.weapons.push(this.newWeapon(o.id));
        break;
      }
      case 'passive': {
        const p = this.passives.find((x) => x.id === o.id);
        if (p) p.level = Math.min(MAX_LEVEL, p.level + 1);
        else if (this.passives.length < SLOTS) this.passives.push({ id: o.id, level: 1 });
        this.refreshStats();
        break;
      }
      case 'snack':
        this.crumbs += 25 * this.stats.greed;
        break;
      case 'milk':
        this.hp = Math.min(this.stats.maxHp, this.hp + MILK_HEAL);
        break;
    }
  }

  /**
   * Which offer the Recipe Book would pick: whatever finishes an evolution,
   * then levels for weapons you have, then new weapons, then passives.
   */
  autoChoice(): number {
    const owns = (id: WeaponId) => this.weapons.find((w) => w.id === id);
    const score = (o: Offer): number => {
      if (o.type === 'weapon') {
        const w = owns(o.id);
        if (!w) return this.weapons.length < 4 ? 70 : 30;
        const ready = o.level === MAX_LEVEL && this.passiveLevel(WEAPON_BY_ID[o.id].evolvesWith) > 0;
        return 100 + o.level * 2 + (ready ? 50 : 0);
      }
      if (o.type === 'passive') {
        const feeds = this.weapons.filter((w) => !w.evolved && WEAPON_BY_ID[w.id].evolvesWith === o.id);
        if (o.level === 1 && feeds.some((w) => w.level >= 4)) return 120;
        const base = o.level === 1 ? 35 : 50;
        return base + (feeds.length ? 10 : 0) + (o.id === 'chef' || o.id === 'top' ? 4 : 0);
      }
      if (o.type === 'milk') return this.hp < this.stats.maxHp / 2 ? 10 : 1;
      return 2;
    };
    let best = 0;
    this.offers.forEach((o, i) => {
      if (score(o) > score(this.offers[best])) best = i;
    });
    return best;
  }

  /** Pick one of the offers. */
  choose(i: number): void {
    if (this.state !== 'levelup' || !this.offers[i]) return;
    this.apply(this.offers[i]);
    this.afterPick();
  }

  reroll(): boolean {
    if (this.state !== 'levelup' || this.rerolls <= 0) return false;
    this.rerolls -= 1;
    this.offers = this.makeOffers();
    return true;
  }

  /** Take nothing (and a little health instead). */
  skip(): void {
    if (this.state !== 'levelup') return;
    this.hp = Math.min(this.stats.maxHp, this.hp + 10);
    this.afterPick();
  }

  private afterPick(): void {
    this.levelUps -= 1;
    this.offers = [];
    this.state = 'playing';
    if (this.levelUps > 0) this.openLevelUp();
  }

  /** A weapon that's ready to evolve: maxed, with its passive, not evolved yet. */
  evolvable(): WeaponSlot | null {
    return this.weapons.find((w) => !w.evolved && w.level >= MAX_LEVEL && this.passiveLevel(WEAPON_BY_ID[w.id].evolvesWith) > 0) ?? null;
  }

  private openChest(): ChestResult {
    const crumbs = CHEST_CRUMBS * this.stats.greed;
    this.crumbs += crumbs;
    const evo = this.evolvable();
    if (evo) {
      evo.evolved = true;
      return { evolved: evo.id, upgrades: [], crumbs };
    }
    // Otherwise up to three level-ups of things you already have.
    const upgrades: Offer[] = [];
    const n = 1 + Math.floor(this.rnd() * 3);
    for (let i = 0; i < n; i++) {
      const own = this.makeOffers(6).filter((o) => (o.type === 'weapon' && this.weapons.some((w) => w.id === o.id)) || (o.type === 'passive' && this.passives.some((p) => p.id === o.id)));
      if (!own.length) break;
      this.apply(own[0]);
      upgrades.push(own[0]);
    }
    return { evolved: null, upgrades, crumbs };
  }

  closeChest(): void {
    if (this.state !== 'chest') return;
    this.chest = null;
    this.state = 'playing';
    if (this.levelUps > 0) this.openLevelUp();
  }

  /** After sunrise: keep going, for as long as you last. */
  keepGoing(): void {
    if (this.state !== 'won') return;
    this.overtime = true;
    this.state = 'playing';
  }

  /** Crumbs you'd take home now (sunrise bonus included). */
  banked(winBonus: number): number {
    return Math.floor(this.crumbs) + (this.overtime || this.state === 'won' ? winBonus : 0);
  }

  summary(winBonus: number): RunSummary {
    return {
      muffin: this.muffin,
      seconds: this.t,
      level: this.level,
      kills: this.kills,
      crumbs: this.banked(winBonus),
      won: this.overtime || this.state === 'won',
      bosses: this.bosses,
      combo: this.bestCombo,
      rushes: this.rushes,
      weapons: this.weapons.map((w) => ({ id: w.id, level: w.level, evolved: w.evolved, damage: Math.round(w.damage), kills: w.kills })),
    };
  }
}
