// Draws a run: the bakery floor scrolling under you, every pest, pickup and
// weapon, and the bits that are only for show (crumbs flying, damage numbers,
// BONK!). Sprites are drawn once per size into little canvases and reused.
import { ENEMY_BY_ID, MUFFIN_BY_ID, PLAYER, WEAPON_BY_ID, type EnemyId, type MuffinId } from './defs';
import { INK, drawBerry, drawChef, drawChest, drawCrumb, drawEnemy, drawKnife, drawMagnet, drawMilk, drawMuffin, drawPin, drawSprinkle, drawToast, type MuffinFace } from './draw';
import type { Controls } from './input';
import type { Run, RunEvent } from './run';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
/** World units across the screen's short side. */
const SHORT_SIDE = 420;
/** Sprites are drawn a bit bigger than what can hit them, so they read on a phone. */
const LOOK = 1.35;
const TILE = 40;
const SPRINKLE_COLORS = ['#ff6fa8', '#7cc8ff', '#ffd34d'];
/** How far each pest's drawing reaches past its center, in sizes (tails and antennae reach farthest). */
const REACH: Partial<Record<EnemyId, number>> = { roach: 2.1, mouse: 1.75, ratking: 1.75, fly: 1.3, ant: 1.45, queen: 1.45 };
const ENEMY_COLOR: Record<EnemyId, string> = {
  ant: '#2b211d',
  fly: '#c9a36a',
  mouse: '#9a96a0',
  roach: '#6b3a1c',
  pigeon: '#8d97ad',
  mold: '#7aa83a',
  moldling: '#7aa83a',
  raccoon: '#8f8a92',
  seagull: '#f4f4f0',
  queen: '#a33a2a',
  ratking: '#7a5a42',
  toaster: '#c9ccd6',
};

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  color: string;
  r: number;
}

interface Num {
  x: number;
  y: number;
  born: number;
  text: string;
  bonk: boolean;
}

interface Flash {
  kind: 'strike' | 'swipe' | 'ring';
  x: number;
  y: number;
  r: number;
  angle: number;
  w: number;
  h: number;
  born: number;
  evolved: boolean;
}

export class View {
  private ctx: Ctx;
  W = 0;
  H = 0;
  private dpr = 1;
  zoom = 1;
  private sprites = new Map<string, HTMLCanvasElement>();
  private floor: HTMLCanvasElement | null = null;
  private bits: Bit[] = [];
  private nums: Num[] = [];
  private flashes: Flash[] = [];
  private hurtAt = -1e9;
  private shake = 0;
  private levelAt = -1e9;
  private camX = 0;
  private camY = 0;
  private readonly calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Damage numbers on or off (a setting). */
  numbers = true;
  /** Called when the muffin gets hurt (the red flash is CSS). */
  onHurt: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(200, r.width);
    this.H = Math.max(200, r.height);
    // At most 1.5 pixels per point (less on big screens): there can be
    // hundreds of pests, and the art is soft-edged anyway.
    this.dpr = Math.min(this.W * this.H > 900_000 ? 1.25 : 1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.zoom = Math.min(1.6, Math.max(0.7, Math.min(this.W, this.H) / SHORT_SIDE));
    this.sprites.clear();
    this.floor = null;
  }

  /** What the run should think the screen shows, in world units. */
  get worldView(): { w: number; h: number } {
    return { w: this.W / this.zoom, h: this.H / this.zoom };
  }

  reset(): void {
    this.bits = [];
    this.nums = [];
    this.flashes = [];
    this.hurtAt = -1e9;
    this.shake = 0;
  }

  // -------------------------------------------------------------------------
  // Sprites

  /** A cached sprite drawn at size `s` (world units), centered, `half` world units each side. */
  private sprite(key: string, s: number, half: number, paint: (c: Ctx, s: number) => void, flash = false): HTMLCanvasElement {
    const k = `${key}|${flash ? 1 : 0}`;
    let canvas = this.sprites.get(k);
    if (canvas) return canvas;
    const px = this.zoom * this.dpr;
    const size = Math.ceil(half * 2 * px);
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const c = canvas.getContext('2d')!;
    c.setTransform(px, 0, 0, px, size / 2, size / 2);
    paint(c, s);
    if (flash) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.fillRect(0, 0, size, size);
    }
    this.sprites.set(k, canvas);
    return canvas;
  }

  /** Draw a sprite at world (x, y), flipped if facing left. */
  private blit(img: HTMLCanvasElement, x: number, y: number, flip: boolean, rot = 0, alpha = 1): void {
    const c = this.ctx;
    const px = this.dpr;
    const sx = (x - this.camX) * this.zoom + this.W / 2;
    const sy = (y - this.camY) * this.zoom + this.H / 2;
    const w = img.width / this.dpr;
    if (sx < -w || sx > this.W + w || sy < -w || sy > this.H + w) return;
    if (alpha !== 1) c.globalAlpha = alpha;
    if (rot) {
      const cos = Math.cos(rot) * px;
      const sin = Math.sin(rot) * px;
      c.setTransform(flip ? -cos : cos, flip ? -sin : sin, -sin, cos, sx * px, sy * px);
    } else {
      c.setTransform(flip ? -px : px, 0, 0, px, sx * px, sy * px);
    }
    c.drawImage(img, -w / 2, -w / 2, w, w);
    if (alpha !== 1) c.globalAlpha = 1;
  }

  /** Switch to drawing in world units. */
  private world(): void {
    const z = this.zoom * this.dpr;
    this.ctx.setTransform(z, 0, 0, z, (this.W / 2 - this.camX * this.zoom) * this.dpr, (this.H / 2 - this.camY * this.zoom) * this.dpr);
  }

  private screen(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private paintFloor(): HTMLCanvasElement {
    // 8×8 tiles; repeats.
    const n = 8;
    const px = this.zoom * this.dpr;
    const size = Math.round(TILE * n * px);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const c = canvas.getContext('2d')!;
    const t = size / n;
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        c.fillStyle = (i + j) % 2 ? '#8a7058' : '#7b624d';
        c.fillRect(i * t, j * t, t, t);
        // Tiles aren't perfectly even.
        c.fillStyle = `rgba(255,240,220,${rnd() * 0.04})`;
        c.fillRect(i * t, j * t, t, t);
      }
    }
    c.strokeStyle = 'rgba(40,24,14,0.4)';
    c.lineWidth = Math.max(1, px * 1.2);
    for (let i = 0; i <= n; i++) {
      c.beginPath();
      c.moveTo(i * t, 0);
      c.lineTo(i * t, size);
      c.moveTo(0, i * t);
      c.lineTo(size, i * t);
      c.stroke();
    }
    // Flour on the floor, and a few dropped sprinkles.
    for (let k = 0; k < 5; k++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = (20 + rnd() * 40) * px;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(250,244,232,0.22)');
      g.addColorStop(1, 'rgba(250,244,232,0)');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let k = 0; k < 14; k++) {
      c.save();
      c.translate(rnd() * size, rnd() * size);
      c.scale(px, px);
      c.globalAlpha = 0.45;
      drawSprinkle(c, 2.2, ['#ff6fa8', '#7cc8ff', '#ffd34d', '#b5e33b'][k % 4], rnd() * TAU);
      c.restore();
    }
    return canvas;
  }

  // -------------------------------------------------------------------------
  // Events

  consume(events: RunEvent[], run: Run, t: number): void {
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          if (!this.numbers && !e.bonk) break;
          if (this.nums.length > 46 && !e.bonk) break;
          this.nums.push({ x: e.x + (Math.random() - 0.5) * 10, y: e.y, born: t, text: String(Math.max(1, Math.round(e.damage))), bonk: e.bonk });
          if (e.bonk) this.shake = Math.max(this.shake, 3);
          break;
        case 'kill': {
          const color = ENEMY_COLOR[e.enemy];
          const n = this.bits.length > 260 ? 2 : 5;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU;
            const sp = 40 + Math.random() * 90;
            this.bits.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, born: t, life: 0.45, color, r: 1.5 + Math.random() * 2 });
          }
          if (ENEMY_BY_ID[e.enemy].boss) this.shake = 10;
          break;
        }
        case 'strike':
          this.flashes.push({ kind: 'strike', x: e.x, y: e.y, r: e.r, angle: 0, w: 0, h: 0, born: t, evolved: false });
          break;
        case 'swipe':
          this.flashes.push({ kind: 'swipe', x: e.x, y: e.y, r: 0, angle: e.angle, w: e.w, h: e.h, born: t, evolved: e.evolved });
          break;
        case 'hurt':
          this.hurtAt = t;
          this.shake = Math.max(this.shake, 4);
          this.onHurt?.();
          break;
        case 'levelup':
          this.levelAt = t;
          break;
        case 'revive':
          this.flashes.push({ kind: 'ring', x: run.x, y: run.y, r: 220, angle: 0, w: 0, h: 0, born: t, evolved: false });
          break;
        case 'pulse':
          this.flashes.push({ kind: 'ring', x: run.x, y: run.y, r: 320, angle: 0, w: 0, h: 0, born: t, evolved: true });
          break;
        case 'boss':
          this.shake = 6;
          break;
        default:
          break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Drawing

  draw(run: Run, t: number, dt: number, controls: Controls | null, player = true): void {
    const c = this.ctx;
    const z = this.zoom;
    this.camX = run.x;
    this.camY = run.y;
    if (this.shake > 0 && !this.calm) {
      this.camX += (Math.random() - 0.5) * this.shake;
      this.camY += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 30);
    }

    // The floor.
    this.screen();
    c.fillStyle = '#7b624d';
    c.fillRect(0, 0, this.W, this.H);
    this.floor ??= this.paintFloor();
    const fs = this.floor.width / this.dpr;
    const ox = ((((-this.camX * z + this.W / 2) % fs) + fs) % fs) - fs;
    const oy = ((((-this.camY * z + this.H / 2) % fs) + fs) % fs) - fs;
    for (let x = ox; x < this.W; x += fs) for (let y = oy; y < this.H; y += fs) c.drawImage(this.floor, x, y, fs, fs);

    // Frosting puddles and coffee steam, under everything.
    this.world();
    for (const p of run.puddles) this.drawPuddle(p, run.t);
    for (const w of run.weapons) {
      if (WEAPON_BY_ID[w.id].kind !== 'aura') continue;
      const r = 62 * run.weaponStats(w).area;
      const g = c.createRadialGradient(run.x, run.y, r * 0.2, run.x, run.y, r);
      g.addColorStop(0, w.evolved ? 'rgba(90,52,34,0.05)' : 'rgba(138,90,60,0.04)');
      g.addColorStop(0.8, w.evolved ? 'rgba(90,52,34,0.32)' : 'rgba(170,120,80,0.24)');
      g.addColorStop(1, 'rgba(170,120,80,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(run.x, run.y, r, 0, TAU);
      c.fill();
      c.strokeStyle = 'rgba(240,230,220,0.35)';
      c.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = t * 0.0012 + (i * TAU) / 4;
        c.beginPath();
        c.arc(run.x, run.y, r * (0.55 + 0.3 * ((i % 2) + 0.2)), a, a + 0.9);
        c.stroke();
      }
    }

    // Pickups.
    for (const p of run.pickups) {
      if (p.kind === 'xp') {
        const tier = p.value >= 20 ? 2 : p.value >= 5 ? 1 : 0;
        const img = this.sprite(`xp${tier}`, 3.4 + tier * 0.8, 7, (cc, s) => drawSprinkle(cc, s, SPRINKLE_COLORS[tier], -0.6));
        this.blit(img, p.x, p.y, false);
      } else if (p.kind === 'crumb') {
        this.blit(this.sprite('crumb', 4.5, 7, drawCrumb), p.x, p.y + Math.sin(t * 0.005 + p.x) * 1.5, false);
      } else if (p.kind === 'milk') {
        this.blit(this.sprite('milk', 7, 10, drawMilk), p.x, p.y, false);
      } else if (p.kind === 'magnet') {
        this.blit(this.sprite('magnet', 8, 11, drawMagnet), p.x, p.y, false);
      } else {
        this.world();
        c.save();
        c.translate(p.x, p.y);
        drawChest(c, 14, t);
        c.restore();
      }
    }

    // Pests, sorted so lower ones are in front.
    const frame = Math.floor(t / 140) % 2;
    const list = run.enemies.slice().sort((a, b) => a.y - b.y);
    for (const e of list) {
      const def = e.def;
      const s = def.radius * LOOK;
      const flash = run.t < e.flashUntil;
      const img = this.sprite(`e:${def.id}:${(frame + (e.uid & 1)) % 2}`, s, s * (REACH[def.id] ?? 1.5), (cc, ss) => {
        // A shadow on the floor.
        cc.fillStyle = 'rgba(0,0,0,0.25)';
        cc.beginPath();
        cc.ellipse(0, ss * 0.85, ss * 0.95, ss * 0.28, 0, 0, TAU);
        cc.fill();
        drawEnemy(cc, def.id, ss, (frame + (e.uid & 1)) % 2);
      }, flash);
      const left = e.flock ? e.flock.vx < 0 : e.x > run.x;
      this.blit(img, e.x, e.y, left);
    }

    // The muffin.
    if (player) this.drawMuffin(run, t, frame);

    // Shots and orbiting knives.
    for (const sh of run.shots) {
      const w = run.weapons[sh.slot];
      if (sh.kind === 'berry') {
        const color = w?.evolved ? WEAPON_BY_ID.blaster.evolved.color : WEAPON_BY_ID.blaster.color;
        this.blit(this.sprite(`berry:${color}:${Math.round(sh.r)}`, sh.r, sh.r * 1.6, (cc, s) => drawBerry(cc, s, color)), sh.x, sh.y, false);
      } else if (sh.kind === 'crumb') {
        this.blit(this.sprite(`shotcrumb:${Math.round(sh.r)}`, sh.r, sh.r * 1.4, drawCrumb), sh.x, sh.y, false, sh.age * 9);
      } else if (sh.kind === 'pin') {
        const color = w?.evolved ? WEAPON_BY_ID.pin.evolved.color : WEAPON_BY_ID.pin.color;
        this.blit(this.sprite(`pin:${color}:${Math.round(sh.r)}`, sh.r, sh.r * 1.3, (cc, s) => drawPin(cc, s, color)), sh.x, sh.y, false, sh.age * 14);
      } else {
        this.blit(this.sprite('toast', sh.r, sh.r * 1.5, drawToast), sh.x, sh.y, false, sh.age * 5);
      }
    }
    for (const w of run.weapons) {
      if (WEAPON_BY_ID[w.id].kind !== 'orbit') continue;
      const s = 14 * run.weaponStats(w).area;
      const color = w.evolved ? WEAPON_BY_ID.knives.evolved.color : WEAPON_BY_ID.knives.color;
      const img = this.sprite(`knife:${color}:${Math.round(s)}`, s, s * 1.2, (cc, ss) => drawKnife(cc, ss, color));
      for (const k of run.orbitPositions(w)) this.blit(img, k.x, k.y, false, k.a + Math.PI / 2);
    }

    // Sous Chef helpers, and whatever they're carrying.
    if (run.chefs.length) {
      const img = this.sprite(`chef:${frame}`, 11.5, 18, (cc, ss) => drawChef(cc, ss, frame));
      for (const ch of run.chefs) this.blit(img, ch.x, ch.y + Math.sin(t * 0.008 + ch.phase) * 2, (ch.target?.x ?? run.x) < ch.x);
    }

    this.drawFlashes(t);
    this.drawBits(t, dt);
    this.drawNumbers(t);
    this.drawPointers(run, t);

    // (Night at the edges, and red when you're hurt, are CSS over the canvas.)
    this.screen();
    if (controls?.stick) this.drawStick(controls.stick);
  }

  private drawMuffin(run: Run, t: number, frame: number): void {
    const c = this.ctx;
    const s = PLAYER.radius * LOOK;
    const def = MUFFIN_BY_ID[run.muffin];
    const hurt = t - this.hurtAt < 250;
    const face: MuffinFace = run.state === 'dead' ? 'dead' : hurt ? 'hurt' : run.t < run.hopUntil ? 'bonk' : 'happy';
    const f = run.moving || run.t < run.hopUntil ? frame : 0;
    const img = this.sprite(`m:${run.muffin}:${f}:${face}`, s, s * 1.7, (cc, ss) => drawMuffin(cc, ss, def, f, face));
    // The hop is a little jump.
    const k = run.t < run.hopUntil ? 1 - (run.hopUntil - run.t) / 0.18 : 0;
    const lift = Math.sin(Math.min(1, k) * Math.PI) * 14;
    this.world();
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(run.x, run.y + s * 1.05, s * (0.9 - lift * 0.02), s * 0.25, 0, 0, TAU);
    c.fill();
    // Blink while you can't be hurt.
    const safe = run.t < run.safeUntil && run.t >= run.hopUntil;
    const alpha = safe && Math.floor(t / 80) % 2 ? 0.45 : 1;
    this.blit(img, run.x, run.y - lift - s * 0.1, run.fx < 0, 0, alpha);
    // Health under the muffin, and the hop recharging.
    this.world();
    const w = 30;
    const y = run.y + s * 1.45;
    c.fillStyle = 'rgba(20,10,6,0.75)';
    c.fillRect(run.x - w / 2 - 1, y - 1, w + 2, 5);
    c.fillStyle = run.hp / run.stats.maxHp < 0.3 ? '#ff5c5c' : '#ff9a2e';
    c.fillRect(run.x - w / 2, y, (w * Math.max(0, run.hp)) / run.stats.maxHp, 3);
    const ready = Math.min(1, 1 - (run.hopReadyAt - run.t) / 3.5);
    if (ready < 1) {
      c.fillStyle = 'rgba(124,200,255,0.8)';
      c.fillRect(run.x - w / 2, y + 4, w * ready, 1.5);
    }
    const lv = (t - this.levelAt) / 600;
    if (lv < 1) {
      c.strokeStyle = `rgba(255,211,77,${1 - lv})`;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(run.x, run.y, 20 + lv * 60, 0, TAU);
      c.stroke();
    }
  }

  private drawPuddle(p: Run['puddles'][number], now: number): void {
    const c = this.ctx;
    if (now < p.landAt) {
      // Still in the air.
      const k = 1 - (p.landAt - now) / 0.35;
      const x = p.fromX + (p.x - p.fromX) * k;
      const y = p.fromY + (p.y - p.fromY) * k - Math.sin(k * Math.PI) * 50;
      c.fillStyle = '#fff1f6';
      c.strokeStyle = INK;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(x, y, 7, 0, TAU);
      c.fill();
      c.stroke();
      return;
    }
    const left = p.until - now;
    const fade = Math.min(1, left / 0.5);
    const grow = Math.min(1, (now - p.landAt) / 0.15);
    const r = p.r * grow;
    c.globalAlpha = 0.85 * fade;
    c.fillStyle = '#ffe3ef';
    c.strokeStyle = 'rgba(42,26,18,0.5)';
    c.lineWidth = 1.5;
    c.beginPath();
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * TAU;
      const rr = r * (0.92 + (i % 2 ? 0.1 : 0) + Math.sin(a * 3 + p.x) * 0.04);
      if (i === 0) c.moveTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.7);
      else c.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.7);
    }
    c.closePath();
    c.fill();
    c.stroke();
    for (let i = 0; i < 6; i++) {
      const a = i * 2.4 + p.y;
      c.save();
      c.translate(p.x + Math.cos(a) * r * 0.55, p.y + Math.sin(a) * r * 0.35);
      drawSprinkle(c, 2.4, ['#ff6fa8', '#7cc8ff', '#ffd34d'][i % 3], a);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  private drawFlashes(t: number): void {
    const c = this.ctx;
    this.world();
    this.flashes = this.flashes.filter((f) => {
      const age = (t - f.born) / 1000;
      if (f.kind === 'strike') {
        if (age > 0.45) return false;
        const fall = Math.min(1, age / 0.12);
        if (fall < 1) {
          // Sprinkles falling from the sky.
          for (let i = 0; i < 5; i++) {
            c.save();
            c.translate(f.x + (i - 2) * 6, f.y - 120 * (1 - fall) - i * 8);
            drawSprinkle(c, 3, ['#ff6fa8', '#7cc8ff', '#ffd34d', '#b5e33b', '#c58aff'][i], Math.PI / 2);
            c.restore();
          }
        } else {
          const k = (age - 0.12) / 0.33;
          c.strokeStyle = `rgba(255,111,168,${1 - k})`;
          c.lineWidth = 3;
          c.beginPath();
          c.arc(f.x, f.y, f.r * (0.4 + k * 0.7), 0, TAU);
          c.stroke();
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            c.save();
            c.globalAlpha = 1 - k;
            c.translate(f.x + Math.cos(a) * f.r * k, f.y + Math.sin(a) * f.r * k * 0.7);
            drawSprinkle(c, 2.6, ['#ff6fa8', '#7cc8ff', '#ffd34d', '#b5e33b'][i % 4], a);
            c.restore();
          }
        }
        return true;
      }
      if (f.kind === 'swipe') {
        if (age > 0.2) return false;
        const k = age / 0.2;
        c.save();
        c.translate(f.x, f.y);
        c.rotate(f.angle);
        c.globalAlpha = 1 - k;
        c.strokeStyle = f.evolved ? '#ffd08a' : '#f4f6fa';
        for (let i = 0; i < 4; i++) {
          c.lineWidth = 3 - i * 0.5;
          c.beginPath();
          c.ellipse(-f.w * 0.1, 0, f.w * (0.42 - i * 0.04), f.h * (0.5 - i * 0.06), 0, -Math.PI * 0.55 + k * 0.4, Math.PI * 0.55 + k * 0.4);
          c.stroke();
        }
        c.restore();
        return true;
      }
      if (age > 0.6) return false;
      const k = age / 0.6;
      // A Fridge Magnet pull is mint; a revive is butter yellow.
      c.strokeStyle = f.evolved ? `rgba(94,224,176,${1 - k})` : `rgba(255,211,77,${1 - k})`;
      c.lineWidth = 6;
      c.beginPath();
      c.arc(f.x, f.y, f.r * k, 0, TAU);
      c.stroke();
      return true;
    });
  }

  private drawBits(t: number, dt: number): void {
    const c = this.ctx;
    this.world();
    this.bits = this.bits.filter((b) => {
      const age = (t - b.born) / 1000;
      if (age > b.life) return false;
      b.vy += 300 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      c.globalAlpha = 1 - age / b.life;
      c.fillStyle = b.color;
      c.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      return true;
    });
    c.globalAlpha = 1;
  }

  private drawNumbers(t: number): void {
    const c = this.ctx;
    this.screen();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    this.nums = this.nums.filter((n) => {
      const age = (t - n.born) / 1000;
      const life = n.bonk ? 0.9 : 0.55;
      if (age > life) return false;
      const x = (n.x - this.camX) * this.zoom + this.W / 2;
      const y = (n.y - this.camY) * this.zoom + this.H / 2 - age * 40;
      c.globalAlpha = Math.min(1, (life - age) / 0.2);
      if (n.bonk) {
        const pop = 1 + Math.max(0, 0.4 - age) * 1.5;
        c.font = `400 ${Math.round(20 * pop)}px 'Bagel Fat One', Rubik, system-ui, sans-serif`;
        c.lineWidth = 5;
        c.strokeStyle = INK;
        c.strokeText('BONK!', x, y - 14);
        c.fillStyle = '#ffd34d';
        c.fillText('BONK!', x, y - 14);
        c.font = `700 ${Math.round(14 * pop)}px Rubik, system-ui, sans-serif`;
        c.lineWidth = 4;
        c.strokeText(n.text, x, y + 4);
        c.fillStyle = '#fff4c0';
        c.fillText(n.text, x, y + 4);
      } else {
        c.font = '700 12px Rubik, system-ui, sans-serif';
        c.lineWidth = 3;
        c.strokeStyle = INK;
        c.strokeText(n.text, x, y);
        c.fillStyle = '#ffffff';
        c.fillText(n.text, x, y);
      }
      return true;
    });
    c.globalAlpha = 1;
  }

  /** Arrows at the edge of the screen toward pie tins and bosses you can't see. */
  private drawPointers(run: Run, t: number): void {
    const c = this.ctx;
    this.screen();
    const targets: { x: number; y: number; color: string }[] = [];
    for (const p of run.pickups) if (p.kind === 'chest') targets.push({ x: p.x, y: p.y, color: '#ffd34d' });
    for (const e of run.enemies) if (e.def.boss) targets.push({ x: e.x, y: e.y, color: '#ff5c5c' });
    for (const p of targets) {
      const sx = (p.x - this.camX) * this.zoom + this.W / 2;
      const sy = (p.y - this.camY) * this.zoom + this.H / 2;
      if (sx > 0 && sx < this.W && sy > 0 && sy < this.H) continue;
      const a = Math.atan2(sy - this.H / 2, sx - this.W / 2);
      const m = 26;
      const k = Math.min((this.W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (this.H / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
      const x = this.W / 2 + Math.cos(a) * k;
      const y = this.H / 2 + Math.sin(a) * k;
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.globalAlpha = 0.7 + Math.sin(t * 0.01) * 0.3;
      c.fillStyle = p.color;
      c.strokeStyle = INK;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(12, 0);
      c.lineTo(-8, -9);
      c.lineTo(-4, 0);
      c.lineTo(-8, 9);
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    }
  }

  private drawStick(s: { ox: number; oy: number; x: number; y: number }): void {
    const c = this.ctx;
    c.globalAlpha = 0.5;
    c.strokeStyle = '#fff4e6';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(s.ox, s.oy, 46, 0, TAU);
    c.stroke();
    const dx = s.x - s.ox;
    const dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    const k = d > 46 ? 46 / d : 1;
    c.fillStyle = '#fff4e6';
    c.beginPath();
    c.arc(s.ox + dx * k, s.oy + dy * k, 18, 0, TAU);
    c.fill();
    c.globalAlpha = 1;
  }
}

/** A muffin's portrait for menus: drawn into `canvas` at its CSS size. */
export function paintMuffin(canvas: HTMLCanvasElement, id: MuffinId, face: MuffinFace = 'happy', locked = false): void {
  const r = canvas.getBoundingClientRect();
  const w = r.width || canvas.width;
  const h = r.height || canvas.height;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const s = Math.min(w, h) * 0.32;
  c.translate(w / 2, h / 2 - s * 0.05);
  const def = MUFFIN_BY_ID[id];
  if (locked) {
    c.globalAlpha = 0.9;
    drawMuffin(c, s, { ...def, liner: '#3a2c48', top: '#4a3a5a', spots: '#3a2c48' }, 0, 'happy');
  } else {
    drawMuffin(c, s, def, 0, face);
  }
}

/** A pest's portrait for menus. */
export function paintEnemy(canvas: HTMLCanvasElement, id: EnemyId): void {
  const r = canvas.getBoundingClientRect();
  const w = r.width || canvas.width;
  const h = r.height || canvas.height;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.translate(w / 2, h / 2);
  drawEnemy(c, id, Math.min(w, h) * 0.24, 0);
}
