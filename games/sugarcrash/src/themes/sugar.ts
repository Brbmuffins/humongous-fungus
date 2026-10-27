// Sugar Rush: the original look. Our muffin kid eats a bag of candy and rides
// the sugar line, vibrating harder and sweating sprinkles, while donuts,
// candy, soda cans, lollipops and gummy bears stream past. On a crash the kid
// flops over asleep and the color drains out for a beat.
import { BOT_NAMES } from '../defs';
import {
  TAU,
  Streamer,
  ease,
  flow,
  lcg,
  makeHeat,
  pick,
  type Anchor,
  type Frame,
  type RiderFrame,
  type Theme,
  type ThemeScene,
} from './kit';

type Treat = 'donut' | 'candy' | 'soda' | 'lolly' | 'gummy';
const CANDY = ['#ff5fa2', '#5ff2c4', '#ffe45c', '#9b7bff', '#5cc8ff', '#ff9b3d'];
const TREATS: readonly Treat[] = ['donut', 'candy', 'soda', 'lolly', 'gummy'];

/** Mint, then lemon, orange, bubblegum and grape as the rush builds. */
export const heat = makeHeat([
  [1, [95, 242, 196]],
  [2, [255, 228, 92]],
  [5, [255, 155, 61]],
  [10, [255, 95, 162]],
  [50, [155, 123, 255]],
]);

/** The flavor readout in the corner: sugar, in made-up units, climbing with the rush. */
export const sugarLevel = (m: number): number => Math.round(90 + (m - 1) * 62);

/** A donut: the launch pad. */
export function drawDonut(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, hue: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(1, 0.42);
  c.fillStyle = '#d9954a';
  c.beginPath();
  c.arc(0, 0, s, 0, TAU);
  c.arc(0, 0, s * 0.38, 0, TAU, true);
  c.fill('evenodd');
  c.fillStyle = hue ? CANDY[hue % CANDY.length] : '#ff8cc2';
  c.beginPath();
  c.arc(0, -s * 0.12, s * 0.86, 0, TAU);
  c.arc(0, -s * 0.12, s * 0.42, 0, TAU, true);
  c.fill('evenodd');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const r = s * (0.55 + (i % 3) * 0.1);
    c.strokeStyle = CANDY[(i + 1) % CANDY.length];
    c.lineWidth = s * 0.08;
    c.beginPath();
    c.moveTo(Math.cos(a) * r, Math.sin(a) * r - s * 0.12);
    c.lineTo(Math.cos(a + 0.18) * r, Math.sin(a + 0.18) * r - s * 0.12);
    c.stroke();
  }
  c.restore();
}

/** One of the treats that fly past. */
function drawTreat(c: CanvasRenderingContext2D, kind: Treat, x: number, y: number, s: number, rot: number, color: string): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.lineJoin = 'round';
  switch (kind) {
    case 'donut': {
      c.fillStyle = '#d9954a';
      c.beginPath();
      c.arc(0, 0, s * 0.6, 0, TAU);
      c.arc(0, 0, s * 0.22, 0, TAU, true);
      c.fill('evenodd');
      c.fillStyle = color;
      c.beginPath();
      c.arc(0, 0, s * 0.52, 0, TAU);
      c.arc(0, 0, s * 0.26, 0, TAU, true);
      c.fill('evenodd');
      c.lineWidth = Math.max(1, s * 0.06);
      c.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        c.strokeStyle = CANDY[(i + 2) % CANDY.length];
        c.beginPath();
        c.moveTo(Math.cos(a) * s * 0.38, Math.sin(a) * s * 0.38);
        c.lineTo(Math.cos(a + 0.25) * s * 0.4, Math.sin(a + 0.25) * s * 0.4);
        c.stroke();
      }
      break;
    }
    case 'candy': {
      c.fillStyle = color;
      c.beginPath();
      c.ellipse(0, 0, s * 0.38, s * 0.28, 0, 0, TAU);
      c.fill();
      for (const d of [-1, 1]) {
        c.beginPath();
        c.moveTo(d * s * 0.32, 0);
        c.lineTo(d * s * 0.7, -s * 0.24);
        c.lineTo(d * s * 0.62, 0);
        c.lineTo(d * s * 0.7, s * 0.24);
        c.closePath();
        c.fill();
      }
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = Math.max(1, s * 0.06);
      c.beginPath();
      c.moveTo(-s * 0.15, -s * 0.22);
      c.lineTo(s * 0.05, s * 0.24);
      c.moveTo(s * 0.12, -s * 0.24);
      c.lineTo(s * 0.28, s * 0.14);
      c.stroke();
      break;
    }
    case 'soda': {
      const w = s * 0.5;
      const h = s * 0.9;
      c.fillStyle = color;
      c.beginPath();
      c.roundRect(-w / 2, -h / 2, w, h, w * 0.18);
      c.fill();
      c.fillStyle = '#d7dde6';
      c.fillRect(-w / 2, -h / 2, w, h * 0.12);
      c.fillRect(-w / 2, h / 2 - h * 0.1, w, h * 0.1);
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.beginPath();
      c.ellipse(0, 0, w * 0.32, h * 0.16, 0, 0, TAU);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(-w * 0.32, -h * 0.32, w * 0.12, h * 0.6);
      break;
    }
    case 'lolly': {
      c.strokeStyle = '#f4f0ea';
      c.lineWidth = Math.max(1.5, s * 0.08);
      c.beginPath();
      c.moveTo(0, s * 0.1);
      c.lineTo(0, s * 0.85);
      c.stroke();
      c.fillStyle = color;
      c.beginPath();
      c.arc(0, -s * 0.15, s * 0.42, 0, TAU);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.lineWidth = Math.max(1, s * 0.07);
      c.beginPath();
      for (let i = 0; i < 40; i++) {
        const a = i * 0.45;
        const r = (i / 40) * s * 0.38;
        const px = Math.cos(a) * r;
        const py = -s * 0.15 + Math.sin(a) * r;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.stroke();
      break;
    }
    case 'gummy': {
      c.fillStyle = color;
      c.globalAlpha *= 0.9;
      c.beginPath();
      c.arc(0, -s * 0.28, s * 0.2, 0, TAU);
      c.arc(-s * 0.18, -s * 0.44, s * 0.09, 0, TAU);
      c.arc(s * 0.18, -s * 0.44, s * 0.09, 0, TAU);
      c.ellipse(0, s * 0.1, s * 0.27, s * 0.32, 0, 0, TAU);
      c.arc(-s * 0.26, -s * 0.02, s * 0.09, 0, TAU);
      c.arc(s * 0.26, -s * 0.02, s * 0.09, 0, TAU);
      c.arc(-s * 0.16, s * 0.42, s * 0.11, 0, TAU);
      c.arc(s * 0.16, s * 0.42, s * 0.11, 0, TAU);
      c.fill();
      break;
    }
  }
  c.restore();
}

/**
 * Our muffin kid: a striped liner with a face, a frosted top with sprinkles
 * and a cherry, and little arms. `m` drives how wired it is: wider eyes, then
 * spinning ones; a bigger grin, then the tongue; arms up. Asleep: eyes shut.
 */
export function drawKid(c: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, m: number, mode: 'pad' | 'ride' | 'asleep', tilt: number): void {
  const wired = Math.min(1, Math.log2(Math.max(1, m)) / Math.log2(10));
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  c.strokeStyle = '#2a0f2e';
  c.lineWidth = Math.max(1.4, s * 0.07);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  // Arms: down on the pad and asleep, up and waving on the ride.
  const up = mode === 'ride' ? 0.4 + wired * 0.6 : 0;
  for (const side of [-1, 1]) {
    const wave = mode === 'ride' ? Math.sin(t * (0.01 + wired * 0.03) + side) * 0.35 : 0;
    const a = side * (Math.PI / 2 + 0.5 - up * 1.4 + wave);
    c.beginPath();
    c.moveTo(side * s * 0.5, s * 0.15);
    c.lineTo(side * s * 0.5 + Math.sin(a) * s * 0.55 * side, s * 0.15 - Math.cos(a) * s * 0.55);
    c.stroke();
  }
  // The liner, striped.
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(-s * 0.62, -s * 0.05);
  c.lineTo(s * 0.62, -s * 0.05);
  c.lineTo(s * 0.46, s * 0.72);
  c.lineTo(-s * 0.46, s * 0.72);
  c.closePath();
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = '#ff8cc2';
  for (let i = -4; i <= 4; i += 2) {
    c.beginPath();
    c.moveTo(i * s * 0.14 - s * 0.07, -s * 0.05);
    c.lineTo(i * s * 0.14 + s * 0.07, -s * 0.05);
    c.lineTo(i * s * 0.1 + s * 0.05, s * 0.72);
    c.lineTo(i * s * 0.1 - s * 0.05, s * 0.72);
    c.closePath();
    c.fill();
  }
  c.restore();
  c.stroke();
  // The top: frosting over a muffin dome, with sprinkles and a cherry.
  c.fillStyle = '#c9803d';
  c.beginPath();
  c.ellipse(0, -s * 0.12, s * 0.72, s * 0.5, 0, Math.PI, TAU);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#ffd3ec';
  c.beginPath();
  c.moveTo(-s * 0.66, -s * 0.16);
  for (let i = 0; i <= 6; i++) {
    const px = -s * 0.66 + (i / 6) * s * 1.32;
    c.quadraticCurveTo(px - s * 0.11, -s * (0.05 + (i % 2) * 0.08), px, -s * 0.16);
  }
  c.ellipse(0, -s * 0.16, s * 0.66, s * 0.44, 0, 0, Math.PI, true);
  c.closePath();
  c.fill();
  c.stroke();
  c.lineWidth = Math.max(1.2, s * 0.06);
  for (let i = 0; i < 8; i++) {
    const a = Math.PI + 0.35 + (i / 7) * (Math.PI - 0.7);
    const r = s * (0.22 + (i % 3) * 0.1);
    c.strokeStyle = CANDY[i % CANDY.length];
    c.beginPath();
    c.moveTo(Math.cos(a) * r, -s * 0.2 + Math.sin(a) * r * 0.75);
    c.lineTo(Math.cos(a + 0.2) * r, -s * 0.2 + Math.sin(a + 0.2) * r * 0.75);
    c.stroke();
  }
  c.strokeStyle = '#2a0f2e';
  c.lineWidth = Math.max(1.2, s * 0.05);
  c.beginPath();
  c.moveTo(0, -s * 0.62);
  c.quadraticCurveTo(s * 0.08, -s * 0.8, s * 0.18, -s * 0.84);
  c.stroke();
  c.fillStyle = '#ff3355';
  c.beginPath();
  c.arc(0, -s * 0.6, s * 0.12, 0, TAU);
  c.fill();
  c.stroke();
  // The face, on the liner.
  const ey = s * 0.2;
  const ex = s * 0.2;
  c.fillStyle = '#2a0f2e';
  if (mode === 'asleep') {
    c.lineWidth = Math.max(1.4, s * 0.06);
    for (const side of [-1, 1]) {
      c.beginPath();
      c.arc(side * ex, ey, s * 0.09, 0.2, Math.PI - 0.2);
      c.stroke();
    }
    c.beginPath();
    c.arc(0, s * 0.46, s * 0.06, 0, TAU);
    c.stroke();
  } else {
    const r = s * (0.1 + wired * 0.06);
    for (const side of [-1, 1]) {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(side * ex, ey, r, 0, TAU);
      c.fill();
      c.stroke();
      if (m >= 5) {
        // Spinning spiral eyes.
        c.strokeStyle = '#2a0f2e';
        c.lineWidth = Math.max(1, s * 0.035);
        c.beginPath();
        const spin = t * (0.008 + wired * 0.02) * side;
        for (let i = 0; i < 22; i++) {
          const a = spin + i * 0.55;
          const rr = (i / 22) * r * 0.9;
          const px = side * ex + Math.cos(a) * rr;
          const py = ey + Math.sin(a) * rr;
          if (i === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.stroke();
        c.lineWidth = Math.max(1.4, s * 0.07);
      } else {
        c.fillStyle = '#2a0f2e';
        c.beginPath();
        c.arc(side * ex + s * 0.02, ey + s * 0.01, r * (0.5 - wired * 0.15), 0, TAU);
        c.fill();
      }
    }
    // The grin, bigger as it gets wired; the tongue past 10×.
    const gw = s * (0.16 + wired * 0.12);
    c.fillStyle = '#6a1638';
    c.beginPath();
    c.moveTo(-gw, s * 0.4);
    c.quadraticCurveTo(0, s * (0.48 + wired * 0.18), gw, s * 0.4);
    c.closePath();
    c.fill();
    c.stroke();
    if (m >= 10) {
      c.fillStyle = '#ff6b9e';
      c.beginPath();
      c.ellipse(s * 0.04, s * (0.52 + wired * 0.08), s * 0.07, s * 0.09, 0.2, 0, TAU);
      c.fill();
    }
  }
  c.restore();
}

class SugarScene implements ThemeScene {
  private sparkles: { x: number; y: number; r: number; tw: number; layer: number }[] = [];
  private treats = new Streamer<Treat>(TREATS, CANDY.length, (c, kind, x, y, s, rot, hue) => drawTreat(c, kind, x, y, s, rot, CANDY[hue]));
  private nextSweat = 0;
  private nextZ = 0;

  constructor() {
    const rnd = lcg(7);
    for (let i = 0; i < 70; i++) this.sparkles.push({ x: rnd(), y: rnd(), r: 0.8 + rnd() * 1.6, tw: rnd() * TAU, layer: i % 3 });
  }

  backdrop(f: Frame): void {
    const { c, W, H, dt, now } = f;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a0b2c');
    g.addColorStop(0.6, '#230f3a');
    g.addColorStop(1, '#2c1243');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // Candy-colored bokeh, drifting.
    const t = now * 0.00005;
    for (const [x, y, r, col] of [
      [0.2 + Math.sin(t) * 0.05, 0.25, 0.5, 'rgba(255,95,162,0.13)'],
      [0.85, 0.7 + Math.cos(t * 1.3) * 0.05, 0.45, 'rgba(95,242,196,0.08)'],
      [0.6 + Math.cos(t * 0.7) * 0.06, 0.15, 0.3, 'rgba(255,228,92,0.06)'],
    ] as const) {
      const ng = c.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * Math.max(W, H));
      ng.addColorStop(0, col);
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = ng;
      c.fillRect(0, 0, W, H);
    }
    // Sparkles, and treats streaming past faster as the rush builds.
    const fl = flow(f);
    for (const sp of this.sparkles) {
      const k = [0.3, 0.6, 1][sp.layer];
      sp.x = (((sp.x + (fl.vx * k * dt) / W) % 1) + 1) % 1;
      sp.y = (((sp.y + (fl.vy * k * dt) / H) % 1) + 1) % 1;
      const a = 0.25 + 0.35 * Math.sin(now * 0.003 + sp.tw);
      if (a <= 0.02) continue;
      c.strokeStyle = `rgba(255,230,250,${a})`;
      c.lineWidth = 1;
      const x = sp.x * W;
      const y = sp.y * H;
      c.beginPath();
      c.moveTo(x - sp.r * 1.6, y);
      c.lineTo(x + sp.r * 1.6, y);
      c.moveTo(x, y - sp.r * 1.6);
      c.lineTo(x, y + sp.r * 1.6);
      c.stroke();
    }
    this.treats.update(f, fl);
  }

  rider(f: RiderFrame): Anchor {
    const { c, s, now, m, phase } = f;
    // Our kid: bouncing on a donut before the rush, riding the line, or flat out asleep.
    if (phase === 'betting') {
      drawDonut(c, f.padX + s * 0.9, f.padY - s * 0.05, s * 0.9, 0, 0);
      const kx = f.padX + s * 0.9;
      const ky = f.padY - s * 1.05 - Math.abs(Math.sin(now * 0.008)) * s * 0.35;
      drawKid(c, kx, ky, s, now, 1, 'pad', 0);
      return { x: kx, y: ky };
    }
    if (phase === 'flying') {
      const shake = f.calm ? 0 : s * Math.min(0.16, 0.04 * Math.log2(m));
      const kx = f.tipX + (Math.random() - 0.5) * shake * 2;
      const ky = f.tipY - s * 0.85 + (Math.random() - 0.5) * shake * 2;
      drawKid(c, kx, ky, s, now, m, 'ride', f.dir * 0.25);
      // Sweating sprinkles, faster the higher it gets.
      if (!f.calm && now > this.nextSweat) {
        this.nextSweat = now + Math.max(30, 260 / Math.max(1, Math.log2(m) + 0.5));
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        f.puff(kx + Math.cos(a) * s * 0.6, ky - s * 0.5, Math.cos(a) * 90, Math.sin(a) * 120 - 40, 'stick', 800 + Math.random() * 400, 2.5 + Math.random() * 1.2, pick(CANDY), 520);
      }
      return { x: kx, y: ky };
    }
    // Flop: down with the line, then over on its side, asleep.
    const kx = f.tipX + (f.rightX - f.tipX) * 0.04 * f.plunge;
    const ky = f.tipY + (f.floorY - f.tipY) * f.plunge - s * 0.55;
    const over = ease((f.since * 1000 - 350) / 350);
    drawKid(c, kx, ky, s, now, 1, 'asleep', (Math.PI / 2) * over);
    if (f.since > 0.7 && now > this.nextZ) {
      this.nextZ = now + 650;
      f.puff(kx + s * 0.4, ky - s * 0.6, 16 + Math.random() * 10, -36, 'text', 1800, 9 + Math.random() * 5, '#d9d2ff', 0, 'z');
    }
    return { x: kx, y: ky };
  }
}

export const sugar: Theme = {
  id: 'sugar',
  name: 'Sugar Rush',
  chip: 'Sugar',
  icon: '🧁',
  blurb: 'The muffin kid on a candy high',
  logo: ['Sugar', 'Crash'],
  logoIcon: null,
  themeColor: '#160a24',
  css: {
    '--bg': '#160a24',
    '--bg2': '#1d0e2f',
    '--panel': '#23113a',
    '--panel2': '#2d1749',
    '--line': '#3e2161',
    '--hover': '#3a1d5c',
    '--text': '#fff0fa',
    '--muted': '#c3a6d6',
    '--green': '#5ff2c4',
    '--green-deep': '#1fae84',
    '--red': '#ff4d61',
    '--gold': '#ffc94a',
    '--orange': '#ff9b3d',
    '--pink': '#ff5fa2',
    '--lemon': '#ffe45c',
    '--glow': '255, 95, 162',
    '--stage': '#1a0b2c',
    '--bet-hi': '#8dffdc',
    '--bet-lo': '#1fae84',
    '--bet-edge': '#0e6b52',
    '--bet-ink': '#04211a',
    '--wait-hi': '#4a2a6e',
    '--wait-lo': '#361c52',
    '--wait-edge': '#1e0c30',
    '--modal': '12, 4, 20',
  },
  ink: {
    grid: '255,170,220',
    label: '255,210,235',
    glow: 'rgba(255,170,220,0.25)',
    fillTop: 'rgba(255,95,162,0.26)',
    fillBottom: 'rgba(95,242,196,0.03)',
    crashFillTop: 'rgba(255,77,97,0.28)',
    crashFillBottom: 'rgba(255,77,97,0.02)',
    outline: 'rgba(20,6,30,0.7)',
    edge: false,
    caption: 'rgba(255,210,235,0.85)',
    win: '#5ff2c4',
    lose: '#ff4d61',
    cash: '#ffe45c',
    crashTitle: '#ff4d61',
    crashSub: '#ffd0d6',
    pinYou: '#5ff2c4',
    pinYouText: '#042117',
    pinYouBg: 'rgba(31,170,120,0.95)',
    pinBotText: '#d6fff0',
    pinBotBg: 'rgba(40,18,62,0.85)',
    bar: ['#5ff2c4', '#ffe45c', '#ff5fa2'],
    flashMilestone: '255,228,92',
    flashCash: '95,242,196',
    flashCrash: '255,77,97',
    drain: '10,6,20',
  },
  fx: { confetti: CANDY, burst: 'stick' },
  heat,
  launchLabel: 'SUGAR RUSH IN',
  milestones: {
    2: 'SUGAR HIGH',
    5: 'ZOOMIES',
    10: 'I CAN SEE SOUNDS',
    25: 'RAINBOW MODE',
    50: 'TIME IS FAKE',
    100: 'PURE SUGAR',
    250: 'SWEET SINGULARITY',
    500: 'BEYOND SWEET',
    1000: 'GALAXY BRAIN',
  },
  readout: {
    label: 'SUGAR',
    level: sugarLevel,
    text: (level) => `SUGAR ${level} mg/dL`,
  },
  crashName: 'Sugar crash',
  crashedVerb: 'sugar-crashed',
  crashes: [{ title: 'SUGAR CRASH', caption: '', sound: 'wah' }],
  crowd: BOT_NAMES,
  refill: { who: 'Grandma', quip: 'Don’t spend it all on candy.', stat: 'Coins from Grandma' },
  help: {
    eyebrow: 'Grab a snack',
    story:
      'Every round our muffin kid eats a whole bag of candy and the sugar rush starts: the multiplier climbs from 1.00×, faster and faster. At some point the sugar crash hits. Cash out before it does and you win your bet times the multiplier. Wait too long and you get nothing but a nap.',
    back: 'Back to the rush',
  },
  sound: {
    whine: { type: 'triangle', base: 330, slope: 0.45 },
    beat: { freq: 95, bpm: 78, slope: 34 },
    launch: 'can',
    milestone: { wave: 'triangle', base: 523, ratios: [1, 2 ** (1 / 3), 2 ** (2 / 3), 2], step: 0.05 },
  },
  scene: () => new SugarScene(),
};
