// Hot Wing Challenge: a guy at a sports-bar wing-eating contest works through
// ever-hotter wings while the Scoville meter climbs. His face goes red, his
// eyes bulge, he sweats and steams, and the bar behind him heats up from
// wood paneling to a wall of flames. The crash is one of three ways a contest
// ends: he bursts into flames, cries into a glass of milk, or passes out in
// the sauce.
import {
  TAU,
  Streamer,
  clamp,
  ease,
  flow,
  lcg,
  makeHeat,
  mix,
  type Anchor,
  type Frame,
  type RiderFrame,
  type Theme,
  type ThemeScene,
} from './kit';

type Snack = 'wing' | 'pepper' | 'sauce' | 'celery' | 'dip';
const SNACKS: readonly Snack[] = ['wing', 'wing', 'pepper', 'sauce', 'celery', 'dip'];
const PEPPER = ['#e8301f', '#ff7a1f', '#5cc13c', '#b01e4a'];
const INK = '#2a0d08';

const heat = makeHeat([
  [1, [255, 226, 122]],
  [2, [255, 178, 61]],
  [5, [255, 122, 31]],
  [10, [255, 59, 47]],
  [50, [255, 242, 207]],
]);

/** A drumstick pointing right from the origin: sauced meat, a bone and a knob. */
function drumstick(c: CanvasRenderingContext2D, s: number, sauce = '#c8581e', bite = false): void {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1, s * 0.07);
  c.fillStyle = '#f4ecd8';
  c.beginPath();
  c.moveTo(s * 0.1, -s * 0.07);
  c.lineTo(s * 0.72, -s * 0.07);
  c.arc(s * 0.74, -s * 0.12, s * 0.09, Math.PI * 0.5, Math.PI * 2.1, true);
  c.arc(s * 0.74, s * 0.12, s * 0.09, -Math.PI * 0.1, Math.PI * 1.5, true);
  c.lineTo(s * 0.1, s * 0.07);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = sauce;
  c.beginPath();
  c.ellipse(-s * 0.2, 0, s * 0.46, s * 0.3, 0, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(255,200,120,0.5)';
  c.beginPath();
  c.ellipse(-s * 0.28, -s * 0.1, s * 0.22, s * 0.08, -0.2, 0, TAU);
  c.fill();
  if (bite) {
    c.fillStyle = '#f4ecd8';
    c.beginPath();
    c.arc(-s * 0.55, -s * 0.08, s * 0.14, 0, TAU);
    c.fill();
  }
}

function drawSnack(c: CanvasRenderingContext2D, kind: Snack, x: number, y: number, s: number, rot: number, hue: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.lineJoin = 'round';
  switch (kind) {
    case 'wing':
      drumstick(c, s * 0.9);
      break;
    case 'pepper': {
      c.fillStyle = PEPPER[hue % PEPPER.length];
      c.strokeStyle = INK;
      c.lineWidth = Math.max(1, s * 0.06);
      c.beginPath();
      c.moveTo(-s * 0.4, -s * 0.12);
      c.quadraticCurveTo(s * 0.3, -s * 0.3, s * 0.55, s * 0.28);
      c.quadraticCurveTo(s * 0.1, s * 0.12, -s * 0.4, s * 0.16);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#3f9b2a';
      c.beginPath();
      c.ellipse(-s * 0.46, 0, s * 0.14, s * 0.2, 0, 0, TAU);
      c.fill();
      c.stroke();
      break;
    }
    case 'sauce': {
      c.fillStyle = '#d9281a';
      c.strokeStyle = INK;
      c.lineWidth = Math.max(1, s * 0.06);
      c.beginPath();
      c.roundRect(-s * 0.2, -s * 0.2, s * 0.4, s * 0.7, s * 0.08);
      c.fill();
      c.stroke();
      c.fillRect(-s * 0.1, -s * 0.42, s * 0.2, s * 0.24);
      c.strokeRect(-s * 0.1, -s * 0.42, s * 0.2, s * 0.24);
      c.fillStyle = '#fff3d6';
      c.fillRect(-s * 0.2, s * 0.05, s * 0.4, s * 0.25);
      c.fillStyle = '#d9281a';
      c.beginPath();
      c.arc(0, s * 0.17, s * 0.07, 0, TAU);
      c.fill();
      break;
    }
    case 'celery': {
      c.strokeStyle = '#8fd45a';
      c.lineWidth = Math.max(2, s * 0.2);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-s * 0.5, 0);
      c.lineTo(s * 0.3, 0);
      c.stroke();
      c.strokeStyle = '#3f9b2a';
      c.lineWidth = Math.max(1.5, s * 0.1);
      for (const d of [-1, 0, 1]) {
        c.beginPath();
        c.moveTo(s * 0.3, 0);
        c.lineTo(s * 0.62, d * s * 0.2);
        c.stroke();
      }
      break;
    }
    case 'dip': {
      c.fillStyle = '#fff';
      c.strokeStyle = INK;
      c.lineWidth = Math.max(1, s * 0.06);
      c.beginPath();
      c.moveTo(-s * 0.3, -s * 0.15);
      c.lineTo(s * 0.3, -s * 0.15);
      c.lineTo(s * 0.22, s * 0.3);
      c.lineTo(-s * 0.22, s * 0.3);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#dbe9ff';
      c.beginPath();
      c.ellipse(0, -s * 0.15, s * 0.3, s * 0.1, 0, 0, TAU);
      c.fill();
      c.stroke();
      break;
    }
  }
  c.restore();
}

/** One tongue of flame, base centered at (x, y), growing up by h. */
function tongue(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sway: number): void {
  c.beginPath();
  c.moveTo(x - w, y);
  c.bezierCurveTo(x - w * 1.1, y - h * 0.4, x + sway * 0.4 - w * 0.2, y - h * 0.6, x + sway, y - h);
  c.bezierCurveTo(x + sway * 0.4 + w * 0.3, y - h * 0.55, x + w * 1.2, y - h * 0.4, x + w, y);
  c.closePath();
}

/** The flames in a layered red, orange and yellow. */
function fire(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sway: number, a = 1): void {
  c.globalAlpha = a * 0.75;
  c.fillStyle = '#e8301f';
  tongue(c, x, y, w, h, sway);
  c.fill();
  c.fillStyle = '#ff8a1f';
  tongue(c, x, y, w * 0.72, h * 0.78, sway * 0.8);
  c.fill();
  c.fillStyle = '#ffe45c';
  tongue(c, x, y, w * 0.4, h * 0.5, sway * 0.5);
  c.fill();
  c.globalAlpha = 1;
}

interface Eater {
  /** 0 (cool) to 1 (very hot) */
  heat: number;
  t: number;
  mode: 'sit' | 'eat' | 'burn' | 'cry' | 'pass';
  /** Crash progress in seconds. */
  since: number;
  /** Where the hand-held wing goes (0 resting, 1 at the mouth). */
  bite: number;
}

/**
 * The contestant, front on, head centered at the origin: blue jersey and a
 * stained bib, a red headband and a handlebar mustache. His face reddens with
 * the heat; eyes bulge; the mouth chomps, then gapes.
 */
function drawEater(c: CanvasRenderingContext2D, s: number, e: Eater): void {
  const burnt = e.mode === 'burn' ? clamp((e.since - 0.15) / 0.5) : 0;
  const skin = mix(mix('#f3c9a0', '#d6342a', clamp(e.heat * 1.15)), '#2b2321', burnt);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.4, s * 0.07);
  // Jersey and bib.
  c.fillStyle = '#2f6fdb';
  c.beginPath();
  c.moveTo(-s * 0.95, s * 1.5);
  c.quadraticCurveTo(-s * 1.0, s * 0.72, -s * 0.34, s * 0.6);
  c.lineTo(s * 0.34, s * 0.6);
  c.quadraticCurveTo(s * 1.0, s * 0.72, s * 0.95, s * 1.5);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#fffaf0';
  c.beginPath();
  c.moveTo(-s * 0.4, s * 0.62);
  c.lineTo(s * 0.4, s * 0.62);
  c.lineTo(s * 0.32, s * 1.5);
  c.lineTo(-s * 0.32, s * 1.5);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#d62e1a';
  for (const [dx, dy, r] of [[-0.12, 0.95, 0.09], [0.14, 1.15, 0.12], [-0.05, 1.3, 0.07], [0.2, 0.82, 0.06]] as const) {
    c.beginPath();
    c.arc(dx * s, dy * s, r * s, 0, TAU);
    c.fill();
  }
  // Arms: the left rests, the right brings the wing to his mouth.
  const hand = { x: s * (0.92 - e.bite * 0.62), y: s * (0.95 - e.bite * 0.7) };
  c.strokeStyle = INK;
  c.lineWidth = Math.max(4, s * 0.3);
  c.beginPath();
  c.moveTo(-s * 0.75, s * 0.85);
  c.lineTo(-s * 1.0, s * 1.35);
  c.moveTo(s * 0.75, s * 0.85);
  c.lineTo(hand.x, hand.y);
  c.stroke();
  c.strokeStyle = '#2f6fdb';
  c.lineWidth = Math.max(2.4, s * 0.2);
  c.beginPath();
  c.moveTo(-s * 0.75, s * 0.85);
  c.lineTo(-s * 1.0, s * 1.35);
  c.moveTo(s * 0.75, s * 0.85);
  c.lineTo(hand.x, hand.y);
  c.stroke();
  if (e.mode !== 'pass' && e.mode !== 'cry' && e.mode !== 'burn') {
    c.save();
    c.translate(hand.x, hand.y);
    c.rotate(-0.5 - e.bite * 0.9);
    drumstick(c, s * 0.9, '#c8581e', e.bite > 0.6);
    c.restore();
  }
  // Head and ears.
  c.fillStyle = skin;
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.4, s * 0.07);
  for (const d of [-1, 1]) {
    c.beginPath();
    c.arc(d * s * 0.6, s * 0.05, s * 0.16, 0, TAU);
    c.fill();
    c.stroke();
  }
  c.beginPath();
  c.ellipse(0, 0, s * 0.64, s * 0.66, 0, 0, TAU);
  c.fill();
  c.stroke();
  // Hair tufts and the headband.
  c.fillStyle = e.mode === 'burn' ? '#3a2a22' : '#5a3418';
  for (const [dx, h] of [[-0.3, 0.28], [0, 0.4], [0.3, 0.26]] as const) {
    c.beginPath();
    c.moveTo((dx - 0.14) * s, -s * 0.55);
    c.lineTo(dx * s + (burnt ? Math.sin(e.t * 0.02 + dx * 9) * s * 0.04 : 0), -s * (0.55 + h + burnt * 0.25));
    c.lineTo((dx + 0.14) * s, -s * 0.55);
    c.closePath();
    c.fill();
    c.stroke();
  }
  c.save();
  c.beginPath();
  c.ellipse(0, 0, s * 0.64, s * 0.66, 0, 0, TAU);
  c.clip();
  c.fillStyle = '#e63946';
  c.fillRect(-s, -s * 0.46, s * 2, s * 0.2);
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(0, -s * 0.36, s * 0.07, 0, TAU);
  c.fill();
  c.restore();
  c.beginPath();
  c.moveTo(-s * 0.63, -s * 0.46);
  c.lineTo(s * 0.63, -s * 0.46);
  c.moveTo(-s * 0.64, -s * 0.26);
  c.lineTo(s * 0.64, -s * 0.26);
  c.stroke();
  // Eyes.
  const ey = -s * 0.07;
  const ex = s * 0.24;
  if (e.mode === 'pass') {
    c.lineWidth = Math.max(1.4, s * 0.07);
    for (const d of [-1, 1]) {
      c.beginPath();
      c.moveTo(d * ex - s * 0.08, ey - s * 0.08);
      c.lineTo(d * ex + s * 0.08, ey + s * 0.08);
      c.moveTo(d * ex + s * 0.08, ey - s * 0.08);
      c.lineTo(d * ex - s * 0.08, ey + s * 0.08);
      c.stroke();
    }
  } else if (e.mode === 'cry') {
    c.lineWidth = Math.max(1.4, s * 0.07);
    for (const d of [-1, 1]) {
      c.beginPath();
      c.arc(d * ex, ey + s * 0.04, s * 0.1, Math.PI + 0.3, TAU - 0.3);
      c.stroke();
    }
  } else {
    const r = s * (0.13 + e.heat * 0.07);
    for (const d of [-1, 1]) {
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(d * ex, ey, r, 0, TAU);
      c.fill();
      c.stroke();
      if (e.heat > 0.4 && e.mode !== 'burn') {
        c.strokeStyle = '#e8301f';
        c.lineWidth = Math.max(0.8, s * 0.025);
        for (let i = 0; i < 4; i++) {
          const a = i * 1.6 + (d > 0 ? 0.5 : 0);
          c.beginPath();
          c.moveTo(d * ex + Math.cos(a) * r, ey + Math.sin(a) * r);
          c.lineTo(d * ex + Math.cos(a) * r * 0.5, ey + Math.sin(a) * r * 0.5);
          c.stroke();
        }
        c.strokeStyle = INK;
        c.lineWidth = Math.max(1.4, s * 0.07);
      }
      c.fillStyle = INK;
      c.beginPath();
      c.arc(d * ex + (e.mode === 'burn' ? 0 : Math.sin(e.t * 0.01) * r * 0.2), ey, r * (e.mode === 'burn' ? 0.25 : 0.4 - e.heat * 0.12), 0, TAU);
      c.fill();
    }
    // Worried brows.
    c.lineWidth = Math.max(1.4, s * 0.07);
    for (const d of [-1, 1]) {
      c.beginPath();
      c.moveTo(d * ex - d * s * 0.16, ey - s * (0.2 + e.heat * 0.03));
      c.lineTo(d * ex + d * s * 0.14, ey - s * (0.32 + e.heat * 0.1));
      c.stroke();
    }
  }
  // Mustache and mouth.
  const chew = e.mode === 'eat' ? Math.abs(Math.sin(e.t * 0.012)) : 0;
  const my = s * 0.34;
  if (e.mode === 'cry') {
    c.fillStyle = '#6a1638';
    c.beginPath();
    c.ellipse(0, my + s * 0.08, s * 0.16, s * 0.1 + Math.abs(Math.sin(e.t * 0.02)) * s * 0.04, 0, 0, TAU);
    c.fill();
    c.stroke();
  } else if (e.mode === 'pass') {
    c.fillStyle = '#6a1638';
    c.beginPath();
    c.ellipse(0, my + s * 0.1, s * 0.14, s * 0.1, 0, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = '#ff6b9e';
    c.beginPath();
    c.ellipse(s * 0.05, my + s * 0.22, s * 0.07, s * 0.12, 0.1, 0, TAU);
    c.fill();
    c.stroke();
  } else if (e.mode === 'burn') {
    c.fillStyle = '#6a1638';
    c.beginPath();
    c.ellipse(0, my + s * 0.08, s * 0.1, s * 0.14, 0, 0, TAU);
    c.fill();
    c.stroke();
  } else {
    const open = e.mode === 'sit' ? 0.02 : 0.05 + chew * 0.12 + e.heat * 0.1;
    c.fillStyle = '#6a1638';
    c.beginPath();
    c.ellipse(0, my + s * 0.08, s * (0.15 + e.heat * 0.05), s * open + s * 0.03, 0, 0, TAU);
    c.fill();
    c.stroke();
    if (e.heat > 0.7) {
      c.fillStyle = '#ff6b9e';
      c.beginPath();
      c.ellipse(s * 0.03, my + s * (0.17 + open), s * 0.08, s * 0.1, 0.1, 0, TAU);
      c.fill();
      c.stroke();
    }
  }
  c.fillStyle = e.mode === 'burn' ? '#1a1210' : '#4a2a12';
  const wig = e.mode === 'eat' ? Math.sin(e.t * 0.012) * s * 0.03 : 0;
  for (const d of [-1, 1]) {
    c.beginPath();
    c.moveTo(0, my - s * 0.04);
    c.quadraticCurveTo(d * s * 0.18, my - s * 0.12 - wig, d * s * 0.42, my - s * 0.02 + wig);
    c.quadraticCurveTo(d * s * 0.2, my + s * 0.0, 0, my + s * 0.02);
    c.closePath();
    c.fill();
    c.stroke();
  }
}

/** The plate on the table, with a few wings: the launch pad. */
function drawPlate(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.save();
  c.translate(x, y);
  c.fillStyle = '#7a4a2a';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.2, s * 0.06);
  c.beginPath();
  c.roundRect(-s * 1.6, 0, s * 3.2, s * 0.32, s * 0.08);
  c.fill();
  c.stroke();
  c.fillStyle = '#fffaf0';
  c.beginPath();
  c.ellipse(0, -s * 0.04, s * 0.95, s * 0.26, 0, 0, TAU);
  c.fill();
  c.stroke();
  for (const [dx, dy, r] of [[-0.45, -0.2, -0.3], [0, -0.28, 0.1], [0.45, -0.18, 0.5]] as const) {
    c.save();
    c.translate(dx * s, dy * s);
    c.rotate(r);
    drumstick(c, s * 0.7);
    c.restore();
  }
  c.restore();
}

class WingsScene implements ThemeScene {
  private snacks = new Streamer<Snack>(SNACKS, PEPPER.length, drawSnack);
  /** How hot the room is, 0 to 1: eased, so it cools slowly after a crash. */
  private k = 0;
  private embers: { x: number; y: number; vy: number; r: number; ph: number }[] = [];
  private nextEmber = 0;
  private nextSweat = 0;
  private nextSteam = 0;
  private nextSmoke = 0;
  private nextFlame = 0;
  private nextTear = 0;
  private crowd: { x: number; h: number; ph: number; arm: boolean }[] = [];
  private splatted = false;

  constructor() {
    const rnd = lcg(11);
    for (let i = 0; i < 40; i++) this.crowd.push({ x: rnd(), h: 0.8 + rnd() * 0.5, ph: rnd() * TAU, arm: rnd() < 0.3 });
  }

  backdrop(f: Frame): void {
    const { c, W, H, now, dt } = f;
    const target = f.phase === 'betting' ? 0 : clamp(Math.log2(Math.max(1, f.m)) / Math.log2(50));
    this.k += (target - this.k) * Math.min(1, dt * (target > this.k ? 6 : 0.9));
    const k = this.k;
    // The wall: dark paneling, heating to a glow.
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mix('#1a0907', '#4a0f06', k));
    g.addColorStop(1, mix('#2b130b', '#b3340a', k));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(0,0,0,0.2)';
    c.lineWidth = 1;
    for (let x = 18; x < W; x += 38) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, H * 0.7);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,200,150,0.06)';
    c.fillRect(0, H * 0.7, W, 4);
    // Pendant lamps and their light.
    for (const lx of [0.18, 0.5, 0.82]) {
      const sway = Math.sin(now * 0.0009 + lx * 9) * 0.04;
      const x = W * lx;
      c.fillStyle = `rgba(255,225,170,${0.05 + 0.03 * Math.sin(now * 0.004 + lx * 20) + k * 0.05})`;
      c.beginPath();
      c.moveTo(x - 6, 14);
      c.lineTo(x + 6, 14);
      c.lineTo(x + 6 + (W * 0.12 + sway * W), H * 0.78);
      c.lineTo(x - 6 - (W * 0.12 - sway * W), H * 0.78);
      c.closePath();
      c.fill();
      c.strokeStyle = '#120706';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 8);
      c.stroke();
      c.fillStyle = '#3a1a10';
      c.beginPath();
      c.moveTo(x - 9, 15);
      c.quadraticCurveTo(x, 2, x + 9, 15);
      c.closePath();
      c.fill();
    }
    // The neon sign.
    const sw = Math.min(124, W * 0.32);
    const sx = W - sw - 14;
    const flick = Math.sin(now * 0.021) > -0.9 ? 1 : 0.35;
    c.save();
    c.globalAlpha = 0.85 * flick;
    c.shadowColor = '#ff3d81';
    c.shadowBlur = 10;
    c.strokeStyle = '#ff6fa5';
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(sx, 28, sw, 24, 8);
    c.stroke();
    c.fillStyle = '#ffd0e2';
    c.font = "900 13px Rubik, sans-serif";
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('WING-OFF', sx + sw / 2, 41);
    c.restore();

    // Flames, licking higher with the heat.
    const n = Math.ceil(W / 30);
    const fh = H * 0.62 * k ** 1.15;
    if (fh > 3) {
      for (let i = -1; i <= n; i++) {
        const fl = 0.55 + 0.45 * Math.sin(now * 0.006 + i * 2.3) * Math.sin(now * 0.0037 + i * 0.9);
        const x = (i + 0.5) * (W / n);
        fire(c, x, H + 4, 26, fh * (0.6 + 0.4 * ((i * 7) % 5) / 4) * fl, Math.sin(now * 0.004 + i) * 8, 0.55 + 0.3 * k);
      }
    }
    // Embers rising.
    if (!f.calm && this.k > 0.08 && now > this.nextEmber) {
      this.nextEmber = now + 90 / (0.3 + this.k * 3);
      this.embers.push({ x: Math.random() * W, y: H + 4, vy: -(50 + Math.random() * 90), r: 1 + Math.random() * 1.8, ph: Math.random() * TAU });
    }
    this.embers = this.embers.filter((e) => {
      e.y += e.vy * dt;
      e.x += Math.sin(now * 0.004 + e.ph) * 14 * dt;
      c.fillStyle = `rgba(255,${150 + Math.floor(e.ph * 15)},60,${clamp(e.y / H) * 0.9})`;
      c.beginPath();
      c.arc(e.x, e.y, e.r, 0, TAU);
      c.fill();
      return e.y > -4;
    });

    // The crowd, in silhouette, bobbing along, hands up as the heat builds.
    const cw = W / this.crowd.length;
    c.fillStyle = 'rgba(14,5,3,0.78)';
    const roar = 1 + this.k * 2.5;
    this.crowd.forEach((p, i) => {
      const x = (i + 0.5) * cw;
      const bob = Math.sin(now * 0.004 * roar + p.ph) * (2 + this.k * 3);
      const r = Math.min(13, cw * 0.62) * p.h;
      const y = H - 3 - r * 0.6 + bob;
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.rect(x - r * 1.15, y + r * 0.7, r * 2.3, r * 2);
      c.fill();
      if (p.arm && this.k > 0.05) {
        c.strokeStyle = 'rgba(14,5,3,0.78)';
        c.lineWidth = r * 0.45;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(x + r * 0.9, y + r);
        c.lineTo(x + r * 1.5, y - r * 1.3 + Math.sin(now * 0.008 + p.ph) * 4);
        c.stroke();
      }
    });
    this.snacks.update(f, flow(f, 50, 100, 280));
  }

  rider(f: RiderFrame): Anchor {
    const { c, now, phase, since } = f;
    // The contestant is drawn a bit bigger than the other characters: he has a lot of face to show.
    const s = f.s * 1.45;
    const hot = clamp(Math.log2(Math.max(1, f.m)) / Math.log2(25));
    const e: Eater = { heat: hot, t: now, mode: 'eat', since: 0, bite: 0 };
    if (phase === 'betting') {
      // At the table: a plate of wings, a deep breath, the first one in hand.
      const x = f.padX + s * 1.0;
      drawPlate(c, x, f.padY - s * 0.1, s * 0.9);
      c.save();
      c.translate(x, f.padY - s * 1.9 + Math.sin(now * 0.003) * s * 0.04);
      e.mode = 'sit';
      e.bite = 0.25 + 0.2 * Math.sin(now * 0.004);
      drawEater(c, s * 0.95, e);
      c.restore();
      return { x, y: f.padY - s * 1.9 };
    }
    if (phase === 'flying') {
      const shake = f.calm ? 0 : s * Math.min(0.12, 0.03 * Math.log2(f.m));
      const x = f.tipX + (Math.random() - 0.5) * shake * 2;
      const y = f.tipY - s * 1.0 + (Math.random() - 0.5) * shake * 2;
      e.bite = 0.5 + 0.5 * Math.sin(now * (0.012 + hot * 0.012));
      c.save();
      c.translate(x, y);
      c.rotate(f.dir * 0.12);
      drawEater(c, s, e);
      c.restore();
      if (!f.calm) {
        if (now > this.nextSweat) {
          this.nextSweat = now + Math.max(40, 300 / (hot * 4 + 0.6));
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
          f.puff(x + Math.cos(a) * s * 0.55, y - s * 0.35, Math.cos(a) * 110, Math.sin(a) * 90 - 20, 'drop', 700 + Math.random() * 400, 2 + Math.random() * 1.4, '#9fe3ff', 520);
        }
        if (hot > 0.55 && now > this.nextSteam) {
          this.nextSteam = now + 120;
          for (const d of [-1, 1]) f.puff(x + d * s * 0.7, y, d * 20, -70, 'dot', 900, 3 + Math.random() * 2, 'rgba(255,255,255,0.55)', -40);
        }
      }
      return { x, y };
    }
    // The crash.
    const x = f.tipX + (f.rightX - f.tipX) * 0.04 * f.plunge;
    const y = f.tipY - s * 1.0 + (f.floorY - f.tipY - s * 0.2) * f.plunge * 0.9;
    e.heat = 1;
    e.since = since;
    if (f.variant === 0) {
      // Burst into flames, then stand there, charred and smoking.
      e.mode = 'burn';
      c.save();
      c.translate(x, y);
      drawEater(c, s, e);
      c.restore();
      const life = clamp(1 - (since - 0.9) / 0.8);
      if (since < 1.7) {
        const grow = ease(since / 0.25) * life;
        for (let i = -2; i <= 2; i++) {
          const fl = 0.7 + 0.3 * Math.sin(now * 0.02 + i * 2);
          fire(c, x + i * s * 0.28, y - s * 0.35 + Math.abs(i) * s * 0.18, s * 0.3, s * (1.5 - Math.abs(i) * 0.3) * grow * fl, Math.sin(now * 0.012 + i) * s * 0.2);
        }
        if (!f.calm && now > this.nextFlame) {
          this.nextFlame = now + 40;
          f.puff(x + (Math.random() - 0.5) * s, y - s * 0.6, (Math.random() - 0.5) * 60, -90 - Math.random() * 60, 'flame', 600, s * 0.5, 'rgba(255,200,80,0.9)', -60);
        }
      }
      if (since > 0.6 && !f.calm && now > this.nextSmoke) {
        this.nextSmoke = now + 160;
        f.puff(x + (Math.random() - 0.5) * s * 0.5, y - s * 0.7, (Math.random() - 0.5) * 20, -45, 'dot', 1500, 3 + Math.random() * 3, 'rgba(60,55,55,0.6)', -10);
      }
      if (since > 1.0) {
        c.fillStyle = '#2b2321';
        for (let i = 0; i < 5; i++) {
          const fx = x + Math.sin(i * 7 + now * 0.001) * s * 0.7;
          const fy = y - s * 0.6 + ((now * 0.03 + i * 17) % (s * 2.4));
          c.globalAlpha = 0.6;
          c.fillRect(fx, fy, 2, 2);
        }
        c.globalAlpha = 1;
      }
      return { x, y };
    }
    if (f.variant === 1) {
      // Crying into a glass of milk.
      e.mode = 'cry';
      const rise = ease((since - 0.2) / 0.5);
      const sob = Math.sin(since * 22) * s * 0.03 * Math.min(1, since);
      // The glass rises into the front of the picture.
      const gx = x + s * 0.1;
      const gy = y + s * 1.6 + (1 - rise) * s * 2.4;
      c.save();
      c.translate(x + sob, y + rise * s * 0.1);
      c.rotate(0.28 * rise);
      drawEater(c, s, e);
      c.restore();
      c.save();
      c.translate(gx, gy);
      c.fillStyle = 'rgba(210,235,255,0.35)';
      c.strokeStyle = 'rgba(235,245,255,0.85)';
      c.lineWidth = Math.max(1.4, s * 0.07);
      c.beginPath();
      c.moveTo(-s * 0.75, -s * 0.9);
      c.lineTo(s * 0.75, -s * 0.9);
      c.lineTo(s * 0.55, s * 0.9);
      c.lineTo(-s * 0.55, s * 0.9);
      c.closePath();
      c.fill();
      c.save();
      c.clip();
      const level = 0.15 + 0.5 * clamp((since - 0.5) / 2.2);
      c.fillStyle = '#fffdf8';
      c.fillRect(-s, s * 0.9 - level * s * 1.8, s * 2, level * s * 1.8 + 1);
      c.restore();
      c.stroke();
      c.restore();
      if (!f.calm && since > 0.35 && now > this.nextTear) {
        this.nextTear = now + 70;
        for (const d of [-1, 1]) f.puff(x + d * s * 0.3 + s * 0.12, y + s * 0.05, d * 30, 60, 'drop', 800, 2.4, '#7fd0ff', 520);
      }
      return { x, y };
    }
    // Out cold in the sauce: down he goes, flat on his back, wing dropped.
    e.mode = 'pass';
    const over = ease((since - 0.35) / 0.4);
    const ox = x + s * 0.2 * over;
    const oy = y + s * 0.5 * over;
    const puddle = clamp((since - 0.6) / 1.0);
    c.fillStyle = '#c8200f';
    c.beginPath();
    c.ellipse(ox, oy + s * 0.75, s * (0.3 + puddle * 1.5), s * (0.1 + puddle * 0.32), 0, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,120,90,0.5)';
    c.beginPath();
    c.ellipse(ox - s * 0.2, oy + s * 0.72, s * puddle * 0.5, s * puddle * 0.1, 0, 0, TAU);
    c.fill();
    c.save();
    c.translate(ox, oy);
    c.rotate((Math.PI / 2) * over * 0.9 + (since > 0.8 ? Math.sin(now * 0.004) * 0.02 : 0));
    drawEater(c, s, e);
    c.restore();
    if (since > 0.5 && !this.splatted) {
      this.splatted = true;
      for (let i = 0; i < (f.calm ? 4 : 14); i++) {
        const a = Math.random() * TAU;
        f.puff(ox, oy + s * 0.5, Math.cos(a) * 140, Math.sin(a) * 140 - 120, 'drop', 900, 2.6 + Math.random() * 1.6, '#d62e1a', 520);
      }
    }
    if (since < 0.1) this.splatted = false;
    if (since > 1.0 && now > this.nextSmoke) {
      this.nextSmoke = now + 700;
      f.puff(ox + s * 0.8, oy - s * 0.5, 14 + Math.random() * 10, -34, 'text', 1800, 9 + Math.random() * 5, '#ffd9c8', 0, 'z');
    }
    return { x: ox, y: oy };
  }
}

export const wings: Theme = {
  id: 'wings',
  name: 'Hot Wing Challenge',
  chip: 'Wings',
  icon: '🍗',
  blurb: 'A wing-eating contest where every wing is hotter',
  logo: ['Hot Wing', 'Challenge'],
  logoIcon: '🍗',
  themeColor: '#1c0a06',
  css: {
    '--bg': '#1c0a06',
    '--bg2': '#260f09',
    '--panel': '#33150c',
    '--panel2': '#451d10',
    '--line': '#6a2a15',
    '--hover': '#552414',
    '--text': '#fff2e8',
    '--muted': '#e0aa8c',
    '--green': '#8dffb0',
    '--green-deep': '#2fae6b',
    '--red': '#ff5a4d',
    '--gold': '#ffc94a',
    '--orange': '#ff9b3d',
    '--pink': '#ff6a2b',
    '--lemon': '#ffe45c',
    '--glow': '255, 90, 31',
    '--stage': '#1c0a06',
    '--bet-hi': '#e6ffa8',
    '--bet-lo': '#86c92a',
    '--bet-edge': '#4f7f10',
    '--bet-ink': '#1c2e00',
    '--wait-hi': '#6a3a22',
    '--wait-lo': '#4a2414',
    '--wait-edge': '#2a1208',
    '--modal': '20, 6, 2',
  },
  ink: {
    grid: '255,190,140',
    label: '255,225,200',
    glow: 'rgba(255,170,90,0.28)',
    fillTop: 'rgba(255,90,30,0.30)',
    fillBottom: 'rgba(255,200,60,0.03)',
    crashFillTop: 'rgba(255,77,77,0.28)',
    crashFillBottom: 'rgba(255,77,77,0.02)',
    outline: 'rgba(30,8,4,0.78)',
    edge: true,
    caption: 'rgba(255,225,200,0.9)',
    win: '#8dffb0',
    lose: '#ff5a4d',
    cash: '#ffe45c',
    crashTitle: '#ff6a3a',
    crashSub: '#ffd9c8',
    pinYou: '#8dffb0',
    pinYouText: '#06230f',
    pinYouBg: 'rgba(40,170,95,0.95)',
    pinBotText: '#ffe9d6',
    pinBotBg: 'rgba(50,16,8,0.88)',
    bar: ['#ffe45c', '#ff9b3d', '#ff3b2f'],
    flashMilestone: '255,150,50',
    flashCash: '141,255,176',
    flashCrash: '255,60,30',
    drain: '20,8,4',
  },
  fx: { confetti: ['#ff6a2b', '#ffc94a', '#ff3b2f', '#ffe45c', '#fff2cf'], burst: 'dot' },
  heat,
  launchLabel: 'FIRST WING IN',
  milestones: {
    2: 'MILD',
    5: 'MEDIUM',
    10: 'I’M FINE',
    25: 'GHOST PEPPER',
    50: 'CAROLINA REAPER',
    100: 'I CAN SEE MY ANCESTORS',
    250: 'NOT A WING ANYMORE',
    500: 'TASTE BUDS RETIRED',
    1000: 'SPICE DEITY',
  },
  readout: {
    label: 'SCOVILLE',
    level: (m) => Math.round(800 * m ** 2.3),
    text: (level) => `SCOVILLE ${level.toLocaleString('en-US')} SHU`,
  },
  crashName: 'Burnout',
  crashedVerb: 'burned out',
  crashes: [
    { title: 'BURNT OUT', caption: 'He did say he was fine.', sound: 'sizzle' },
    { title: 'MILK TIME', caption: 'A glass of milk. A lot of feelings.', sound: 'glug' },
    { title: 'SAUCE COMA', caption: 'Out cold. Still holding the napkin.', sound: 'splat' },
  ],
  crowd: [
    'WingCommander',
    'Buffalo_Bill',
    'DrumstickDan',
    'HotLipsHank',
    'Sauce_Boss',
    'CeleryStick',
    'BlueCheeseBob',
    'FlatNotDrum',
    'Mild_Mitch',
    'NapkinNate',
    'ScovilleSue',
    'ReaperRick',
    'HabaneroHal',
    'JalapenoJoe',
    'TabascoTina',
    'SrirachaSam',
    'ExtraCrispyCal',
    'DipItDeb',
    'LemonPepperLou',
    'HoneyBBQHolly',
    'GhostPepperGus',
    'CayenneKane',
    'ChiliChad',
    'WaterPlease',
    'MilkIsLife',
    'SweatyBetty',
    'FryerGuy',
    'ToothpickTodd',
    'OrderUpOlga',
    'BonelessBrad',
    'PaprikaPete',
    'TheSauceFather',
    'FlamingoFred',
    'FingerLickinLen',
    'DoubleDipDee',
    'ExtraNapkins',
    'CluckNorris',
    'WingManWally',
    'BirdIsTheWord',
    'ThighsOfFury',
  ],
  refill: { who: 'Big Tony', quip: 'First round of milk is on me.', stat: 'Coins from Big Tony' },
  help: {
    eyebrow: 'Grab a napkin',
    story:
      'It’s the Hot Wing Challenge. Every round our contestant starts on the mild wings and works up to the sauce nobody should eat, and the multiplier climbs from 1.00× with every bite. At some point he can’t take it any more. Cash out before he does and you win your bet times the multiplier. Wait too long and you get nothing but a glass of milk.',
    back: 'Back to the wings',
  },
  sound: {
    whine: { type: 'sawtooth', base: 150, slope: 0.5 },
    beat: { freq: 80, bpm: 90, slope: 30 },
    launch: 'sizzle',
    milestone: { wave: 'square', base: 392, ratios: [1, 1.25, 1.5, 1.875], step: 0.05 },
  },
  scene: () => new WingsScene(),
};
