// Hammy himself, drawn on a canvas. Usually he's Cube Hammy: a box with War's
// eyes and lips. Some days he's a round, sweaty hamster with buck teeth, a
// meatball sub or a train instead, in whatever fit he has on. Also his
// skeleton, for afterwards.
import type { FitId, FormId } from './defs';

export type Face = 'happy' | 'joy' | 'meh' | 'sad' | 'sick' | 'shock' | 'smug' | 'eat' | 'dead' | 'sleep';

export interface Look {
  form: FormId;
  fit: FitId;
  face: Face;
  /** 0..1: how green he's turned (stink, sickness, rot). */
  green: number;
  /** Squash and stretch: 1 is round. */
  sx: number;
  sy: number;
  /** Rotation around his feet, radians. */
  lean: number;
  /** Facing left instead of right. */
  flip: boolean;
  blink: boolean;
  /** 0..1 how open his mouth is (chewing, talking). */
  mouth: number;
  /** Arms up (being held or flying). */
  armsUp: boolean;
  /** 0..1 how badly the astronaut helmet has fogged up. */
  fog: number;
  /** How far the train's wheels have turned, radians. */
  roll: number;
}

export const defaultLook = (fit: FitId, form: FormId = 'cube'): Look => ({
  form,
  fit,
  face: 'happy',
  green: 0,
  sx: 1,
  sy: 1,
  lean: 0,
  flip: false,
  blink: false,
  mouth: 0,
  armsUp: false,
  fog: 0,
  roll: 0,
});

/** Half width and half height of each form, in multiples of r. */
export const EXTENTS: Record<FormId, { w: number; h: number }> = {
  cube: { w: 1, h: 0.95 },
  hamster: { w: 1, h: 0.92 },
  sub: { w: 1.55, h: 0.62 },
  train: { w: 1.45, h: 0.95 },
};

/**
 * Where his face sits on each form (from the body's center, facing right, in
 * multiples of r), how big it is, and where a hat goes above it.
 */
export const HEADS: Record<FormId, { x: number; y: number; s: number; hat: number }> = {
  cube: { x: 0, y: 0, s: 1, hat: -0.9 },
  hamster: { x: 0, y: 0, s: 1, hat: -0.92 * 0.92 },
  sub: { x: 0.78, y: -0.12, s: 0.6, hat: -0.41 },
  train: { x: -0.8, y: -0.18, s: 0.5, hat: -0.56 },
};

const TAU = Math.PI * 2;
const INK = '#2b1a10';

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
}

function furColors(fit: FitId, green: number): { fur: string; belly: string; dark: string } {
  const gold = fit === 'golden';
  const fur = gold ? '#f2bf2a' : '#d9965a';
  const belly = gold ? '#fff0a8' : '#f7e1c2';
  const dark = gold ? '#b8860b' : '#a8673a';
  const sick = '#7f9a3c';
  return { fur: mix(fur, sick, green * 0.8), belly: mix(belly, '#c9d68a', green * 0.7), dark: mix(dark, '#4f6420', green * 0.8) };
}

/** A color on one of his other forms: gold if he's golden, green if he's going off. */
function tone(color: string, look: Look, gold = '#f2bf2a'): string {
  return mix(look.fit === 'golden' ? gold : color, '#7f9a3c', look.green * 0.7);
}

/** Draw Hammy with his body centered on (x, y), r wide either side (wider as a sub or a train). */
export function drawHammy(c: CanvasRenderingContext2D, x: number, y: number, r: number, look: Look, t: number): void {
  const ry = r * EXTENTS[look.form].h;
  c.save();
  c.translate(x, y + ry);
  c.rotate(look.lean);
  c.scale(look.sx * (look.flip ? -1 : 1), look.sy);
  c.translate(0, -ry);
  c.lineWidth = Math.max(1.2, r * 0.06);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = INK;
  if (look.form === 'cube') drawCube(c, r, look, t);
  else if (look.form === 'sub') drawSub(c, r, look, t);
  else if (look.form === 'train') drawTrain(c, r, look, t);
  else drawHamster(c, r, ry, look, t);
  c.restore();
}

function drawEars(c: CanvasRenderingContext2D, spots: readonly (readonly [number, number])[], er: number, fur: string): void {
  for (const [ex, ey] of spots) {
    c.fillStyle = fur;
    ellipse(c, ex, ey, er, er * 0.9);
    c.fill();
    c.stroke();
    c.fillStyle = '#f2a0a6';
    ellipse(c, ex, ey + er * 0.1, er * 0.55, er * 0.45);
    c.fill();
  }
}

/** His face, hat and glasses, on whatever he is today. */
function drawHead(c: CanvasRenderingContext2D, r: number, look: Look, t: number, skin: string): void {
  const head = HEADS[look.form];
  const hr = r * head.s;
  c.save();
  c.translate(head.x * r, head.y * r);
  drawFace(c, hr, hr * 0.92, look, t, skin);
  drawHeadFit(c, hr, hr * 0.92, look, t, head.hat * r);
  c.restore();
}

function drawHamster(c: CanvasRenderingContext2D, r: number, ry: number, look: Look, t: number): void {
  const { fur, belly, dark } = furColors(look.fit, look.green);

  // Tail, feet and ears sit behind the body.
  c.fillStyle = fur;
  ellipse(c, -r * 0.92, ry * 0.45, r * 0.13, r * 0.09, -0.5);
  c.fill();
  c.stroke();
  for (const fx of [-0.45, 0.4]) {
    c.fillStyle = '#f09aa0';
    ellipse(c, fx * r + r * 0.08, ry * 0.94, r * 0.24, r * 0.12);
    c.fill();
    c.stroke();
  }
  drawEars(
    c,
    [
      [-0.42 * r, -0.78 * ry],
      [0.5 * r, -0.8 * ry],
    ],
    r * 0.22,
    fur,
  );

  // Body.
  c.fillStyle = fur;
  ellipse(c, 0, 0, r, ry);
  c.fill();
  c.save();
  ellipse(c, 0, 0, r, ry);
  c.clip();
  c.fillStyle = dark;
  c.globalAlpha = 0.35;
  ellipse(c, -r * 0.55, -ry * 0.2, r * 0.7, ry * 1.1);
  c.fill();
  c.globalAlpha = 1;
  c.fillStyle = belly;
  ellipse(c, r * 0.18, ry * 0.42, r * 0.62, ry * 0.6);
  c.fill();
  drawBodyFit(c, r, ry, look, t);
  c.restore();
  ellipse(c, 0, 0, r, ry);
  c.stroke();

  // Arms.
  c.fillStyle = look.fit === 'astronaut' ? '#e8edf3' : look.fit === 'gamer' ? '#4b2f7a' : fur;
  if (look.armsUp) {
    ellipse(c, -r * 0.78, -ry * 0.45, r * 0.12, r * 0.24, 0.5);
    c.fill();
    c.stroke();
    ellipse(c, r * 0.86, -ry * 0.48, r * 0.12, r * 0.24, -0.5);
  } else {
    ellipse(c, -r * 0.5, ry * 0.3, r * 0.12, r * 0.2, 0.5);
    c.fill();
    c.stroke();
    ellipse(c, r * 0.68, ry * 0.26, r * 0.12, r * 0.2, -0.6);
  }
  c.fill();
  c.stroke();
  if (look.fit === 'hotdog') drawBun(c, r, ry);

  drawHead(c, r, look, t, fur);
}

/** Little stick arms that only come out when he's held or flying. */
function stickArms(c: CanvasRenderingContext2D, from: readonly (readonly [number, number])[], r: number, up: boolean, color: string): void {
  if (!up) return;
  c.save();
  c.strokeStyle = color;
  c.lineWidth = Math.max(1.5, r * 0.07);
  for (const [i, [x, y]] of from.entries()) {
    const side = i === 0 ? -1 : 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + side * r * 0.28, y - r * 0.35);
    c.stroke();
  }
  c.restore();
}


// ---------------------------------------------------------------------------
// Cube Hammy: a box with War's eyes and lips. Drawn by hand until photos come
// in; drop eyes.png, mouth.png and mouth-open.png into ../assets/face/ (cut
// out, transparent background) and they're used instead.

const FACE_FILES = import.meta.glob('../assets/face/*.{png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const facePics: Partial<Record<'eyes' | 'mouth' | 'mouth-open', HTMLImageElement>> = {};
for (const [path, url] of Object.entries(FACE_FILES)) {
  const name = path.split('/').pop()!.replace(/\.\w+$/, '');
  if (name !== 'eyes' && name !== 'mouth' && name !== 'mouth-open') continue;
  const img = new Image();
  img.src = url;
  facePics[name] = img;
}
const pic = (name: keyof typeof facePics): HTMLImageElement | null => {
  const img = facePics[name];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
};

/** Front face of the cube; the top and left side recede up and to the left. */
const CUBE = { x0: -0.65, x1: 0.95, y0: -0.62, y1: 0.98, dx: -0.35, dy: -0.3 };

function drawCube(c: CanvasRenderingContext2D, r: number, look: Look, t: number): void {
  const { x0, x1, y0, y1, dx, dy } = CUBE;
  const skin = tone('#e9a066', look);
  const topSkin = tone('#f6c08a', look, '#ffe08a');
  const sideSkin = tone('#c27a42', look, '#b8860b');
  const ry = r * EXTENTS.cube.h;

  // Sneakers and arms behind the box.
  for (const fx of [-0.3, 0.55]) {
    c.fillStyle = '#f4f1ea';
    ellipse(c, fx * r, y1 * r + r * 0.03, r * 0.24, r * 0.11);
    c.fill();
    c.stroke();
    c.fillStyle = '#e8443a';
    c.fillRect(fx * r - r * 0.2, y1 * r - r * 0.02, r * 0.4, r * 0.05);
  }
  c.fillStyle = skin;
  if (look.armsUp) {
    ellipse(c, x0 * r - r * 0.08, -r * 0.55, r * 0.1, r * 0.24, 0.5);
    c.fill();
    c.stroke();
    ellipse(c, x1 * r + r * 0.08, -r * 0.6, r * 0.1, r * 0.24, -0.5);
  } else {
    ellipse(c, x0 * r - r * 0.05, r * 0.4, r * 0.1, r * 0.22, 0.4);
    c.fill();
    c.stroke();
    ellipse(c, x1 * r + r * 0.05, r * 0.4, r * 0.1, r * 0.22, -0.4);
  }
  c.fill();
  c.stroke();

  // The box: top, side, then the front with his face on it.
  c.fillStyle = topSkin;
  c.beginPath();
  c.moveTo(x0 * r, y0 * r);
  c.lineTo(x1 * r, y0 * r);
  c.lineTo((x1 + dx) * r, (y0 + dy) * r);
  c.lineTo((x0 + dx) * r, (y0 + dy) * r);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = sideSkin;
  c.beginPath();
  c.moveTo(x0 * r, y0 * r);
  c.lineTo(x0 * r, y1 * r);
  c.lineTo((x0 + dx) * r, (y1 + dy) * r);
  c.lineTo((x0 + dx) * r, (y0 + dy) * r);
  c.closePath();
  c.fill();
  c.stroke();
  const front = () => {
    c.beginPath();
    c.roundRect(x0 * r, y0 * r, (x1 - x0) * r, (y1 - y0) * r, r * 0.12);
  };
  c.fillStyle = skin;
  front();
  c.fill();
  c.save();
  front();
  c.clip();
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fillRect(x0 * r, y0 * r, (x1 - x0) * r * 0.35, (y1 - y0) * r);
  // Shirts start below his mouth.
  c.translate(0, r * 0.32);
  drawBodyFit(c, r, ry, look, t);
  c.restore();
  front();
  c.stroke();
  if (look.fit === 'hotdog') drawBun(c, r, ry);

  drawCubeFace(c, r, look, t, skin);
  drawHeadFit(c, r, ry, look, t, HEADS.cube.hat * r);
}

function drawCubeFace(c: CanvasRenderingContext2D, r: number, look: Look, t: number, skin: string): void {
  const face = look.face;
  const eyes: [number, number][] = [
    [0.02 * r, -0.34 * r],
    [0.55 * r, -0.36 * r],
  ];
  const ew = r * 0.19;
  const eh = r * 0.12;
  const blink = look.blink && face !== 'shock' && face !== 'dead';
  const photoEyes = pic('eyes');
  if (photoEyes && face !== 'dead') {
    const w = r * 1.0;
    const h = (w * photoEyes.naturalHeight) / photoEyes.naturalWidth;
    const squint = blink || face === 'joy' || face === 'sleep' ? 0.15 : face === 'smug' || face === 'sick' ? 0.6 : face === 'shock' ? 1.2 : 1;
    c.drawImage(photoEyes, r * 0.28 - w / 2, -r * 0.35 - (h * squint) / 2, w, h * squint);
  } else {
    for (const [ex, ey] of eyes) {
      // Purple eyeshadow, like the avatar.
      c.fillStyle = 'rgba(150,70,190,0.55)';
      ellipse(c, ex, ey - eh * 0.55, ew * 1.15, eh * 0.9);
      c.fill();
      if (face === 'dead') {
        c.beginPath();
        c.moveTo(ex - ew * 0.7, ey - eh);
        c.lineTo(ex + ew * 0.7, ey + eh);
        c.moveTo(ex + ew * 0.7, ey - eh);
        c.lineTo(ex - ew * 0.7, ey + eh);
        c.stroke();
        continue;
      }
      if (blink || face === 'joy' || face === 'sleep') {
        c.beginPath();
        if (face === 'joy') c.arc(ex, ey + eh * 0.5, ew * 0.8, Math.PI * 1.15, Math.PI * 1.85);
        else c.arc(ex, ey - eh * 0.2, ew * 0.8, Math.PI * 0.15, Math.PI * 0.85);
        c.stroke();
        continue;
      }
      const big = face === 'shock' ? 1.35 : 1;
      c.fillStyle = '#fffaf2';
      ellipse(c, ex, ey, ew * big, eh * big);
      c.fill();
      c.fillStyle = '#3b1450';
      ellipse(c, ex + ew * 0.15, ey, eh * 0.85, eh * 0.85);
      c.fill();
      c.fillStyle = '#12060f';
      ellipse(c, ex + ew * 0.15, ey, eh * 0.4, eh * 0.4);
      c.fill();
      c.fillStyle = '#fff';
      ellipse(c, ex + ew * 0.35, ey - eh * 0.35, eh * 0.22, eh * 0.22);
      c.fill();
      // Heavy upper lid and lashes.
      c.beginPath();
      c.ellipse(ex, ey, ew * big, eh * big, 0, Math.PI * 1.02, Math.PI * 1.98);
      c.stroke();
      if (face === 'smug' || face === 'sick') {
        c.fillStyle = skin;
        c.fillRect(ex - ew * 1.1, ey - eh * 1.2, ew * 2.2, eh * (face === 'sick' ? 1.3 : 1.05));
        c.beginPath();
        c.moveTo(ex - ew, ey - eh * 0.1);
        c.lineTo(ex + ew, ey - eh * 0.1);
        c.stroke();
      }
    }
    if (face === 'sad') {
      const ty = ((t / 1400) % 1) * r * 0.5;
      c.fillStyle = '#7cc8ff';
      ellipse(c, eyes[1][0] + ew * 0.4, eyes[1][1] + eh * 1.6 + ty, eh * 0.35, eh * 0.55);
      c.fill();
    }
  }

  // The lips.
  const mx = r * 0.3;
  const my = r * 0.08;
  const mw = r * 0.42;
  c.save();
  c.lineWidth = Math.max(1, r * 0.03);
  const open = face === 'shock' ? 0.9 : face === 'eat' ? look.mouth : Math.max(look.mouth, face === 'joy' ? 0.3 : 0);
  const photoMouth = open > 0.25 ? pic('mouth-open') ?? pic('mouth') : pic('mouth');
  if (photoMouth && face !== 'dead') {
    const w = r * 0.95;
    const h = (w * photoMouth.naturalHeight) / photoMouth.naturalWidth;
    const stretch = photoMouth === pic('mouth-open') ? 1 : 1 + open * 0.5;
    c.drawImage(photoMouth, mx - w / 2, my - (h * stretch) / 2, w, h * stretch);
    c.restore();
    return;
  }
  const curve = face === 'sad' || face === 'sick' ? -1 : face === 'meh' ? 0 : face === 'smug' ? 0.5 : 1;
  const lip = tone('#d23ca0', look, '#e0a020');
  const gap = r * 0.16 * open;
  c.fillStyle = lip;
  // Upper lip, with a dip in the middle.
  c.beginPath();
  c.moveTo(mx - mw, my + curve * -r * 0.04);
  c.quadraticCurveTo(mx - mw * 0.5, my - r * 0.2, mx, my - r * 0.1);
  c.quadraticCurveTo(mx + mw * 0.5, my - r * 0.2, mx + mw, my + curve * -r * 0.04 - (face === 'smug' ? r * 0.06 : 0));
  c.quadraticCurveTo(mx, my + r * 0.04, mx - mw, my + curve * -r * 0.04);
  c.fill();
  c.stroke();
  if (gap > 0.5) {
    c.fillStyle = '#3a0b22';
    ellipse(c, mx, my + gap * 0.5, mw * 0.75, gap * 0.6 + 1);
    c.fill();
  }
  // Lower lip: big.
  c.fillStyle = lip;
  c.beginPath();
  c.moveTo(mx - mw * 0.9, my + gap + curve * -r * 0.02);
  c.quadraticCurveTo(mx, my + gap + r * (0.34 - curve * 0.06), mx + mw * 0.9, my + gap + curve * -r * 0.02);
  c.quadraticCurveTo(mx, my + gap + r * 0.03, mx - mw * 0.9, my + gap + curve * -r * 0.02);
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(255,170,220,0.6)';
  ellipse(c, mx - mw * 0.2, my + gap + r * 0.08, mw * 0.3, r * 0.03, -0.1);
  c.fill();
  if (face === 'dead') {
    c.fillStyle = '#f07a8a';
    ellipse(c, mx + mw * 0.2, my + r * 0.26, r * 0.08, r * 0.1, 0.2);
    c.fill();
    c.stroke();
  }
  c.restore();
}

function drawSub(c: CanvasRenderingContext2D, r: number, look: Look, t: number): void {
  const W = r * EXTENTS.sub.w;
  const H = r * EXTENTS.sub.h;
  const bread = tone('#d99a52', look);
  const crust = tone('#b8773a', look, '#d9a520');
  const top = tone('#e8b46a', look, '#ffd34d');
  const sauce = tone('#c8372b', look, '#e0a020');
  const meat = tone('#7a3b1f', look, '#b8860b');
  const { fur } = furColors(look.fit, look.green);

  // Pink hamster feet and a tail: still Hammy under there.
  for (const fx of [-0.7, 0.5]) {
    c.fillStyle = '#f09aa0';
    ellipse(c, fx * r, H * 0.98, r * 0.2, r * 0.1);
    c.fill();
    c.stroke();
  }
  c.fillStyle = fur;
  ellipse(c, -W * 0.98, H * 0.15, r * 0.12, r * 0.08, -0.4);
  c.fill();
  c.stroke();
  stickArms(
    c,
    [
      [-W * 0.75, H * 0.15],
      [W * 0.75, H * 0.15],
    ],
    r,
    look.armsUp,
    INK,
  );

  // Bottom of the roll.
  c.fillStyle = bread;
  c.beginPath();
  c.ellipse(0, H * 0.05, W, H * 0.92, 0, 0, Math.PI);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = crust;
  c.globalAlpha = 0.4;
  c.beginPath();
  c.ellipse(0, H * 0.05, W * 0.96, H * 0.82, 0, Math.PI * 0.15, Math.PI * 0.85);
  c.lineTo(0, H * 0.5);
  c.fill();
  c.globalAlpha = 1;

  // Sauce, dripping, and the meatballs.
  c.fillStyle = sauce;
  c.beginPath();
  c.moveTo(-W * 0.92, H * 0.02);
  for (let i = 0; i <= 12; i++) {
    const x = -W * 0.92 + (i / 12) * W * 1.84;
    c.lineTo(x, H * 0.1 + Math.sin(i * 1.7) * H * 0.08);
  }
  c.lineTo(W * 0.92, -H * 0.05);
  c.closePath();
  c.fill();
  for (const [dx, k] of [
    [-0.45, 0],
    [0.1, 1.3],
    [0.55, 2.1],
  ]) {
    const drip = (Math.sin(t * 0.002 + k) + 1) * 0.5;
    ellipse(c, dx * W, H * (0.22 + drip * 0.18), r * 0.05, r * (0.07 + drip * 0.05));
    c.fill();
  }
  for (let i = 0; i < 5; i++) {
    const mx = -W * 0.7 + i * W * 0.35;
    c.fillStyle = meat;
    ellipse(c, mx, -H * 0.02, r * 0.27, r * 0.24);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.22)';
    ellipse(c, mx - r * 0.08, -H * 0.12, r * 0.08, r * 0.05);
    c.fill();
  }
  // Melted cheese.
  c.fillStyle = look.fit === 'golden' ? '#fff0a8' : '#ffd45c';
  c.beginPath();
  c.moveTo(-W * 0.85, -H * 0.12);
  for (let i = 0; i <= 10; i++) {
    const x = -W * 0.85 + (i / 10) * W * 1.7;
    c.lineTo(x, -H * 0.12 + (i % 2 ? H * 0.18 : 0));
  }
  c.lineTo(W * 0.85, -H * 0.2);
  c.lineTo(-W * 0.85, -H * 0.2);
  c.closePath();
  c.fill();

  // Ears on the top of the roll, then the roll itself.
  const head = HEADS.sub;
  drawEars(
    c,
    [
      [(head.x - 0.32) * r, -H * 0.88],
      [(head.x + 0.3) * r, -H * 0.8],
    ],
    r * 0.14,
    fur,
  );
  c.fillStyle = top;
  c.beginPath();
  c.ellipse(0, -H * 0.12, W * 0.97, H * 0.85, 0, Math.PI, TAU);
  c.quadraticCurveTo(0, -H * 0.02, -W * 0.97, -H * 0.12);
  c.fill();
  c.stroke();
  // Score marks on the crust.
  c.strokeStyle = 'rgba(120,70,25,0.55)';
  for (const sx of [-0.6, -0.25, 0.1]) {
    c.beginPath();
    c.moveTo(sx * W, -H * 0.72);
    c.quadraticCurveTo((sx + 0.08) * W, -H * 0.82, (sx + 0.16) * W, -H * 0.7);
    c.stroke();
  }
  c.strokeStyle = INK;
  c.fillStyle = 'rgba(255,255,255,0.25)';
  ellipse(c, -W * 0.4, -H * 0.62, W * 0.18, H * 0.08, -0.1);
  c.fill();

  drawHead(c, r, look, t, top);
}

function drawTrain(c: CanvasRenderingContext2D, r: number, look: Look, t: number): void {
  const red = tone('#d6332b', look);
  const blue = tone('#2f6fd6', look, '#e0a820');
  const roof = tone('#1f4c9e', look, '#b8860b');
  const brass = look.fit === 'golden' ? '#fff0a8' : '#f2c14e';
  const plate = tone('#f4e6c8', look, '#fff0a8');
  const { fur } = furColors(look.fit, look.green);

  // Smokestack, dome and cab roof sit above; ears peek over the roof.
  drawEars(
    c,
    [
      [-1.1 * r, -0.8 * r],
      [-0.5 * r, -0.82 * r],
    ],
    r * 0.14,
    fur,
  );
  c.fillStyle = '#25202b';
  c.beginPath();
  c.moveTo(0.86 * r, -0.28 * r);
  c.lineTo(0.8 * r, -0.86 * r);
  c.lineTo(1.18 * r, -0.86 * r);
  c.lineTo(1.12 * r, -0.28 * r);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillRect(0.76 * r, -0.94 * r, 0.46 * r, 0.1 * r);
  c.strokeRect(0.76 * r, -0.94 * r, 0.46 * r, 0.1 * r);
  c.fillStyle = brass;
  c.beginPath();
  c.arc(0.35 * r, -0.28 * r, 0.17 * r, Math.PI, TAU);
  c.fill();
  c.stroke();

  // Boiler, with brass bands and a headlamp.
  c.fillStyle = red;
  c.beginPath();
  c.roundRect(-0.3 * r, -0.3 * r, 1.58 * r, 0.66 * r, [0, 0.3 * r, 0.3 * r, 0]);
  c.fill();
  c.stroke();
  c.fillStyle = brass;
  for (const bx of [0.15, 0.68]) c.fillRect(bx * r, -0.3 * r, 0.08 * r, 0.66 * r);
  c.fillStyle = '#ffe58a';
  ellipse(c, 1.24 * r, -0.12 * r, 0.1 * r, 0.1 * r);
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.2)';
  c.fillRect(-0.25 * r, -0.24 * r, 1.4 * r, 0.1 * r);

  // Cab: this is the face end.
  c.fillStyle = blue;
  c.fillRect(-1.38 * r, -0.62 * r, 1.12 * r, 0.98 * r);
  c.strokeRect(-1.38 * r, -0.62 * r, 1.12 * r, 0.98 * r);
  c.fillStyle = roof;
  c.fillRect(-1.48 * r, -0.76 * r, 1.32 * r, 0.16 * r);
  c.strokeRect(-1.48 * r, -0.76 * r, 1.32 * r, 0.16 * r);
  c.fillStyle = plate;
  c.beginPath();
  c.roundRect(-1.26 * r, -0.54 * r, 0.9 * r, 0.7 * r, 0.12 * r);
  c.fill();
  c.stroke();

  // Frame, cowcatcher and wheels.
  c.fillStyle = '#25202b';
  c.fillRect(-1.42 * r, 0.34 * r, 2.72 * r, 0.14 * r);
  c.beginPath();
  c.moveTo(1.22 * r, 0.34 * r);
  c.lineTo(1.45 * r, 0.82 * r);
  c.lineTo(1.0 * r, 0.82 * r);
  c.lineTo(1.0 * r, 0.48 * r);
  c.closePath();
  c.fill();
  c.stroke();
  const wr = 0.26 * r;
  for (const wx of [-1.0, -0.45, 0.35]) {
    c.fillStyle = '#1b1720';
    ellipse(c, wx * r, 0.95 * r - wr, wr, wr);
    c.fill();
    c.stroke();
    c.strokeStyle = brass;
    c.lineWidth = Math.max(1, r * 0.04);
    for (let k = 0; k < 3; k++) {
      const a = look.roll + (k * Math.PI) / 3;
      c.beginPath();
      c.moveTo(wx * r - Math.cos(a) * wr * 0.75, 0.95 * r - wr - Math.sin(a) * wr * 0.75);
      c.lineTo(wx * r + Math.cos(a) * wr * 0.75, 0.95 * r - wr + Math.sin(a) * wr * 0.75);
      c.stroke();
    }
    c.strokeStyle = INK;
    c.lineWidth = Math.max(1.2, r * 0.06);
  }
  // The rod that joins the wheels, going round with them.
  const rod = 0.95 * r - wr + Math.sin(look.roll) * wr * 0.5;
  c.strokeStyle = '#c9ccd6';
  c.lineWidth = Math.max(1.5, r * 0.06);
  c.beginPath();
  c.moveTo(-1.0 * r + Math.cos(look.roll) * wr * 0.5, rod);
  c.lineTo(0.35 * r + Math.cos(look.roll) * wr * 0.5, rod);
  c.stroke();
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.2, r * 0.06);
  stickArms(
    c,
    [
      [-1.38 * r, -0.1 * r],
      [-0.26 * r, -0.1 * r],
    ],
    r,
    look.armsUp,
    INK,
  );
  // A tiny hamster tail off the back.
  c.fillStyle = fur;
  ellipse(c, -1.5 * r, 0.1 * r, r * 0.1, r * 0.07, -0.4);
  c.fill();
  c.stroke();

  drawHead(c, r, look, t, plate);
}

function drawFace(c: CanvasRenderingContext2D, r: number, ry: number, look: Look, t: number, fur: string): void {
  const fx = r * 0.14;
  const eyeY = -ry * 0.3;
  const eyes: [number, number][] = [
    [fx - r * 0.24, eyeY],
    [fx + r * 0.26, eyeY - r * 0.02],
  ];
  const face = look.face;
  c.strokeStyle = INK;
  c.fillStyle = INK;

  // Cheeks first, so the eyes sit on top.
  const puff = face === 'eat' ? 1.5 : 1;
  c.fillStyle = look.green > 0.5 ? 'rgba(150,190,90,0.5)' : 'rgba(255,118,140,0.45)';
  ellipse(c, fx - r * 0.5, -ry * 0.06, r * 0.16 * puff, r * 0.11 * puff);
  c.fill();
  ellipse(c, fx + r * 0.52, -ry * 0.08, r * 0.15 * puff, r * 0.1 * puff);
  c.fill();

  c.fillStyle = INK;
  const er = r * 0.085;
  for (const [ex, ey] of eyes) {
    if (face === 'dead') {
      c.beginPath();
      c.moveTo(ex - er, ey - er);
      c.lineTo(ex + er, ey + er);
      c.moveTo(ex + er, ey - er);
      c.lineTo(ex - er, ey + er);
      c.stroke();
    } else if (face === 'joy' || face === 'sleep' || (look.blink && face !== 'shock')) {
      c.beginPath();
      if (face === 'joy') c.arc(ex, ey + er * 0.4, er, Math.PI * 1.1, Math.PI * 1.9);
      else c.arc(ex, ey - er * 0.2, er, Math.PI * 0.15, Math.PI * 0.85);
      c.stroke();
    } else if (face === 'shock') {
      c.fillStyle = '#fff';
      ellipse(c, ex, ey, er * 1.5, er * 1.7);
      c.fill();
      c.stroke();
      c.fillStyle = INK;
      ellipse(c, ex + er * 0.2, ey, er * 0.5, er * 0.6);
      c.fill();
    } else {
      ellipse(c, ex, ey, er, er * 1.2);
      c.fill();
      c.fillStyle = '#fff';
      ellipse(c, ex + er * 0.35, ey - er * 0.45, er * 0.35, er * 0.35);
      c.fill();
      c.fillStyle = INK;
      if (face === 'smug' || face === 'sick') {
        // Heavy lids.
        c.fillStyle = fur;
        c.fillRect(ex - er * 1.3, ey - er * 1.5, er * 2.6, er * (face === 'sick' ? 1.6 : 1.3));
        c.beginPath();
        c.moveTo(ex - er * 1.2, ey - er * (face === 'sick' ? 0 : 0.2));
        c.lineTo(ex + er * 1.2, ey - er * (face === 'sick' ? 0 : 0.2));
        c.stroke();
        c.fillStyle = INK;
      }
    }
  }
  if (face === 'sad') {
    c.beginPath();
    c.moveTo(eyes[0][0] - er * 1.4, eyes[0][1] - er * 1.6);
    c.lineTo(eyes[0][0] + er * 1.1, eyes[0][1] - er * 2.3);
    c.moveTo(eyes[1][0] - er * 1.1, eyes[1][1] - er * 2.3);
    c.lineTo(eyes[1][0] + er * 1.4, eyes[1][1] - er * 1.6);
    c.stroke();
    // A tear that runs and drops.
    const ty = ((t / 1400) % 1) * r * 0.5;
    c.fillStyle = '#7cc8ff';
    ellipse(c, eyes[1][0] + er * 0.6, eyes[1][1] + er * 1.4 + ty, er * 0.4, er * 0.6);
    c.fill();
  }

  // Nose, mouth and those teeth.
  const nx = fx + r * 0.02;
  const ny = -ry * 0.1;
  c.fillStyle = '#e8687a';
  ellipse(c, nx, ny, r * 0.07, r * 0.05);
  c.fill();
  c.stroke();
  const my = ny + r * 0.1;
  const open = face === 'shock' ? 0.8 : face === 'eat' ? look.mouth : Math.max(look.mouth, face === 'joy' ? 0.35 : 0);
  if (face === 'dead') {
    c.fillStyle = '#f07a8a';
    ellipse(c, nx + r * 0.06, my + r * 0.12, r * 0.07, r * 0.1, 0.2);
    c.fill();
    c.stroke();
  }
  c.beginPath();
  if (open > 0.05) {
    c.fillStyle = '#5a1f24';
    ellipse(c, nx, my + r * 0.04 * open, r * 0.11, r * (0.03 + 0.09 * open));
    c.fill();
    c.stroke();
  } else if (face === 'sad' || face === 'sick') {
    c.moveTo(nx - r * 0.12, my + r * 0.05);
    c.quadraticCurveTo(nx, my - r * 0.04, nx + r * 0.12, my + r * 0.05);
    c.stroke();
  } else if (face === 'meh') {
    c.moveTo(nx - r * 0.1, my);
    c.lineTo(nx + r * 0.1, my);
    c.stroke();
  } else if (face === 'smug') {
    c.moveTo(nx - r * 0.1, my);
    c.quadraticCurveTo(nx + r * 0.06, my + r * 0.05, nx + r * 0.14, my - r * 0.05);
    c.stroke();
  } else {
    c.moveTo(nx - r * 0.12, my - r * 0.02);
    c.quadraticCurveTo(nx - r * 0.06, my + r * 0.05, nx, my);
    c.quadraticCurveTo(nx + r * 0.06, my + r * 0.05, nx + r * 0.12, my - r * 0.02);
    c.stroke();
  }
  if (face !== 'dead') {
    c.fillStyle = '#fffdf4';
    c.lineWidth = Math.max(1, r * 0.035);
    const tw = r * 0.055;
    const th = r * (face === 'shock' ? 0.07 : 0.1);
    c.fillRect(nx - tw, my + r * 0.01, tw * 0.95, th);
    c.strokeRect(nx - tw, my + r * 0.01, tw * 0.95, th);
    c.fillRect(nx + tw * 0.05, my + r * 0.01, tw * 0.95, th);
    c.strokeRect(nx + tw * 0.05, my + r * 0.01, tw * 0.95, th);
  }
  // Whiskers.
  c.lineWidth = Math.max(0.8, r * 0.022);
  c.strokeStyle = 'rgba(43,26,16,0.55)';
  c.beginPath();
  for (const k of [-1, 0, 1]) {
    c.moveTo(nx - r * 0.2, ny + k * r * 0.04);
    c.lineTo(nx - r * 0.52, ny + k * r * 0.1 - r * 0.02);
    c.moveTo(nx + r * 0.2, ny + k * r * 0.04);
    c.lineTo(nx + r * 0.5, ny + k * r * 0.1 - r * 0.02);
  }
  c.stroke();
  c.lineWidth = Math.max(1.2, r * 0.06);
  c.strokeStyle = INK;
}

function drawBodyFit(c: CanvasRenderingContext2D, r: number, ry: number, look: Look, t: number): void {
  switch (look.fit) {
    case 'classic': {
      // The shirt. White once.
      c.fillStyle = '#f3efe6';
      c.fillRect(-r, ry * 0.12, r * 2, ry);
      c.strokeStyle = 'rgba(43,26,16,0.5)';
      c.beginPath();
      c.moveTo(-r, ry * 0.12);
      c.quadraticCurveTo(r * 0.15, ry * 0.26, r, ry * 0.12);
      c.stroke();
      c.fillStyle = 'rgba(255,138,31,0.75)';
      ellipse(c, r * 0.3, ry * 0.45, r * 0.12, r * 0.08, 0.4);
      c.fill();
      ellipse(c, -r * 0.2, ry * 0.65, r * 0.08, r * 0.06);
      c.fill();
      c.fillStyle = 'rgba(120,80,40,0.5)';
      ellipse(c, r * 0.05, ry * 0.8, r * 0.16, r * 0.07, -0.2);
      c.fill();
      c.strokeStyle = INK;
      break;
    }
    case 'gamer': {
      c.fillStyle = '#4b2f7a';
      c.fillRect(-r, ry * 0.05, r * 2, ry);
      c.fillStyle = '#3a2361';
      c.fillRect(-r * 0.2, ry * 0.45, r * 0.8, ry * 0.3);
      c.strokeStyle = '#e8e0ff';
      c.beginPath();
      c.moveTo(r * 0.0, ry * 0.08);
      c.lineTo(r * -0.04, ry * 0.36);
      c.moveTo(r * 0.36, ry * 0.08);
      c.lineTo(r * 0.4, ry * 0.36);
      c.stroke();
      c.strokeStyle = INK;
      break;
    }
    case 'cowboy': {
      c.fillStyle = '#c83a32';
      c.beginPath();
      c.moveTo(-r * 0.8, ry * 0.05);
      c.quadraticCurveTo(r * 0.15, ry * 0.2, r * 0.95, ry * 0.02);
      c.lineTo(r * 0.2, ry * 0.62);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#fff';
      for (const [dx, dy] of [
        [0, 0.2],
        [0.3, 0.18],
        [-0.3, 0.16],
        [0.15, 0.38],
      ]) {
        ellipse(c, dx * r, dy * ry, r * 0.03, r * 0.03);
        c.fill();
      }
      break;
    }
    case 'hotdog': {
      c.strokeStyle = '#f5c518';
      c.lineWidth = r * 0.09;
      c.beginPath();
      for (let i = 0; i <= 8; i++) {
        const px = -r * 0.7 + (i / 8) * r * 1.5;
        const py = ry * 0.2 + (i % 2 ? -1 : 1) * r * 0.07;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.stroke();
      c.lineWidth = Math.max(1.2, r * 0.06);
      c.strokeStyle = INK;
      break;
    }
    case 'astronaut': {
      c.fillStyle = '#e8edf3';
      c.fillRect(-r, ry * 0.15, r * 2, ry);
      c.fillStyle = '#9aa7b8';
      c.fillRect(-r * 0.1, ry * 0.4, r * 0.55, ry * 0.3);
      for (const [i, col] of ['#ff5c5c', '#ffd34d', '#4fc3ff'].entries()) {
        c.fillStyle = col;
        ellipse(c, r * 0.02 + i * r * 0.16, ry * 0.55, r * 0.045, r * 0.045);
        c.fill();
      }
      break;
    }
    case 'wizard': {
      // The beard.
      c.fillStyle = '#f4f1ea';
      c.beginPath();
      c.moveTo(-r * 0.32, ry * 0.0);
      c.quadraticCurveTo(r * 0.14, ry * 0.15, r * 0.6, ry * 0.0);
      c.quadraticCurveTo(r * 0.5, ry * 0.7, r * 0.14, ry * 1.0);
      c.quadraticCurveTo(-r * 0.2, ry * 0.7, -r * 0.32, ry * 0.0);
      c.fill();
      c.stroke();
      break;
    }
    case 'golden': {
      const k = (Math.sin(t * 0.004) + 1) / 2;
      c.fillStyle = `rgba(255,255,255,${0.15 + k * 0.2})`;
      ellipse(c, -r * 0.35, -ry * 0.45, r * 0.2, r * 0.12, -0.6);
      c.fill();
      break;
    }
    default:
      break;
  }
}

function drawBun(c: CanvasRenderingContext2D, r: number, ry: number): void {
  c.fillStyle = '#e0a458';
  for (const side of [-1, 1]) {
    c.beginPath();
    c.ellipse(side * r * 0.95, ry * 0.2, r * 0.3, ry * 0.82, side * 0.08, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.25)';
    ellipse(c, side * r * 0.95 - r * 0.08, ry * -0.2, r * 0.07, ry * 0.3, side * 0.08);
    c.fill();
    c.fillStyle = '#e0a458';
  }
}

function drawHeadFit(c: CanvasRenderingContext2D, r: number, ry: number, look: Look, t: number, top: number): void {
  switch (look.fit) {
    case 'roadtrip': {
      // Trucker cap: foam front, mesh back, brim forward.
      c.fillStyle = '#2f6fd6';
      c.beginPath();
      c.ellipse(-r * 0.05, top + r * 0.18, r * 0.62, r * 0.42, 0, Math.PI, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#f7f3ea';
      c.beginPath();
      c.ellipse(r * 0.12, top + r * 0.16, r * 0.38, r * 0.38, 0, Math.PI * 1.05, Math.PI * 1.95);
      c.fill();
      c.fillStyle = '#ff8a1f';
      c.font = `700 ${Math.round(r * 0.18)}px Rubik, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.fillText('GAS', r * 0.12, top + r * 0.06);
      c.fillStyle = '#244f9e';
      c.beginPath();
      c.ellipse(r * 0.45, top + r * 0.2, r * 0.42, r * 0.09, 0.08, 0, TAU);
      c.fill();
      c.stroke();
      // Gas-station shades.
      c.fillStyle = 'rgba(25,20,30,0.92)';
      const ey = -ry * 0.3;
      for (const ex of [r * -0.1, r * 0.4]) {
        c.beginPath();
        c.ellipse(ex, ey, r * 0.17, r * 0.12, 0, 0, TAU);
        c.fill();
        c.stroke();
      }
      c.beginPath();
      c.moveTo(r * 0.07, ey - r * 0.02);
      c.lineTo(r * 0.23, ey - r * 0.02);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.6)';
      c.beginPath();
      c.moveTo(r * -0.18, ey - r * 0.04);
      c.lineTo(r * -0.08, ey - r * 0.08);
      c.moveTo(r * 0.32, ey - r * 0.04);
      c.lineTo(r * 0.42, ey - r * 0.08);
      c.stroke();
      c.strokeStyle = INK;
      break;
    }
    case 'gamer': {
      const hue = (t * 0.12) % 360;
      c.strokeStyle = '#1d1726';
      c.lineWidth = r * 0.1;
      c.beginPath();
      c.arc(0, -ry * 0.25, r * 0.86, Math.PI * 1.12, Math.PI * 1.88);
      c.stroke();
      c.lineWidth = Math.max(1.2, r * 0.06);
      c.strokeStyle = INK;
      for (const side of [-1, 1]) {
        c.fillStyle = '#1d1726';
        ellipse(c, side * r * 0.86, -ry * 0.25, r * 0.15, r * 0.22);
        c.fill();
        c.stroke();
        c.fillStyle = `hsl(${hue + (side > 0 ? 120 : 0)},95%,60%)`;
        ellipse(c, side * r * 0.86, -ry * 0.25, r * 0.07, r * 0.12);
        c.fill();
      }
      // Mic boom, right by the mouth (and everything else).
      c.strokeStyle = '#1d1726';
      c.lineWidth = r * 0.05;
      c.beginPath();
      c.moveTo(r * 0.86, -ry * 0.1);
      c.quadraticCurveTo(r * 0.75, ry * 0.12, r * 0.32, ry * 0.05);
      c.stroke();
      c.fillStyle = '#1d1726';
      ellipse(c, r * 0.3, ry * 0.05, r * 0.07, r * 0.06);
      c.fill();
      c.lineWidth = Math.max(1.2, r * 0.06);
      c.strokeStyle = INK;
      break;
    }
    case 'cowboy': {
      c.fillStyle = '#8a5a2b';
      c.beginPath();
      c.ellipse(0, top + r * 0.22, r * 1.05, r * 0.16, -0.04, 0, TAU);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(-r * 0.5, top + r * 0.2);
      c.quadraticCurveTo(-r * 0.55, top - r * 0.45, -r * 0.1, top - r * 0.35);
      c.quadraticCurveTo(0, top - r * 0.22, r * 0.1, top - r * 0.35);
      c.quadraticCurveTo(r * 0.55, top - r * 0.45, r * 0.5, top + r * 0.2);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#4a2f16';
      c.fillRect(-r * 0.5, top + r * 0.04, r * 1.0, r * 0.1);
      break;
    }
    case 'shroom': {
      c.fillStyle = '#e8443a';
      c.beginPath();
      c.ellipse(0, top + r * 0.2, r * 0.85, r * 0.6, 0, Math.PI, TAU);
      c.quadraticCurveTo(0, top + r * 0.34, -r * 0.85, top + r * 0.2);
      c.fill();
      c.stroke();
      c.fillStyle = '#fff6e8';
      for (const [dx, dy, rr] of [
        [-0.45, -0.05, 0.12],
        [0.05, -0.3, 0.14],
        [0.5, -0.02, 0.11],
        [-0.12, 0.06, 0.07],
      ]) {
        ellipse(c, dx * r, top + r * 0.2 + dy * r, rr * r, rr * r * 0.8);
        c.fill();
      }
      break;
    }
    case 'astronaut': {
      // Sealed helmet. Whatever he lets out stays in there with him.
      c.fillStyle = `rgba(150,200,90,${0.08 + look.fog * 0.5})`;
      ellipse(c, 0, -ry * 0.25, r * 1.08, ry * 0.92);
      c.fill();
      c.strokeStyle = 'rgba(220,235,255,0.9)';
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.beginPath();
      c.arc(0, -ry * 0.25, r * 0.88, Math.PI * 1.15, Math.PI * 1.45);
      c.stroke();
      c.strokeStyle = INK;
      c.fillStyle = '#b8c3d1';
      c.fillRect(-r * 0.9, ry * 0.32, r * 1.8, r * 0.14);
      c.strokeRect(-r * 0.9, ry * 0.32, r * 1.8, r * 0.14);
      c.beginPath();
      c.moveTo(r * 0.3, -ry * 1.12);
      c.lineTo(r * 0.42, -ry * 1.42);
      c.stroke();
      c.fillStyle = Math.sin(t * 0.008) > 0 ? '#ff5c5c' : '#7a2020';
      ellipse(c, r * 0.43, -ry * 1.46, r * 0.06, r * 0.06);
      c.fill();
      break;
    }
    case 'wizard': {
      c.fillStyle = '#5b3cc4';
      c.beginPath();
      c.moveTo(-r * 0.62, top + r * 0.22);
      c.quadraticCurveTo(-r * 0.1, top - r * 0.4, r * 0.25, top - r * 1.25);
      c.quadraticCurveTo(r * 0.18, top - r * 0.3, r * 0.66, top + r * 0.22);
      c.closePath();
      c.fill();
      c.stroke();
      c.beginPath();
      c.ellipse(0, top + r * 0.22, r * 0.85, r * 0.14, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#ffd34d';
      for (const [dx, dy] of [
        [-0.15, -0.1],
        [0.18, -0.55],
        [0.3, -0.05],
      ])
        star(c, dx * r, top + dy * r, r * 0.09);
      break;
    }
    case 'golden': {
      c.fillStyle = '#ffd34d';
      c.beginPath();
      const cy = top + r * 0.1;
      c.moveTo(-r * 0.38, cy);
      c.lineTo(-r * 0.42, cy - r * 0.38);
      c.lineTo(-r * 0.2, cy - r * 0.18);
      c.lineTo(0, cy - r * 0.46);
      c.lineTo(r * 0.2, cy - r * 0.18);
      c.lineTo(r * 0.42, cy - r * 0.38);
      c.lineTo(r * 0.38, cy);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#e8443a';
      ellipse(c, 0, cy - r * 0.1, r * 0.06, r * 0.06);
      c.fill();
      for (let i = 0; i < 3; i++) {
        const a = t * 0.002 + i * 2.1;
        const k = (Math.sin(t * 0.006 + i * 1.7) + 1) / 2;
        c.fillStyle = `rgba(255,240,170,${k})`;
        star(c, Math.cos(a) * r * 1.2, -ry * 0.2 + Math.sin(a) * r * 0.9, r * 0.08 * (0.5 + k));
      }
      break;
    }
    default:
      break;
  }
}

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const rr = i % 2 ? r * 0.4 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}

/** What's left: a skeleton on its back, centered on (x, y). */
export function drawSkeleton(c: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  if (alpha <= 0) return;
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.strokeStyle = '#efe6d2';
  c.fillStyle = '#efe6d2';
  c.lineCap = 'round';
  c.lineWidth = Math.max(2, r * 0.1);
  // Spine.
  c.beginPath();
  c.moveTo(-r * 0.75, r * 0.1);
  c.quadraticCurveTo(-r * 0.1, -r * 0.05, r * 0.45, r * 0.08);
  c.stroke();
  // Ribs.
  c.lineWidth = Math.max(1.5, r * 0.07);
  for (let i = 0; i < 4; i++) {
    const rx = -r * 0.45 + i * r * 0.22;
    c.beginPath();
    c.moveTo(rx, r * 0.06);
    c.quadraticCurveTo(rx - r * 0.1, -r * 0.32, rx + r * 0.04, -r * 0.4);
    c.stroke();
  }
  // Little legs, up in the air.
  for (const lx of [-r * 0.45, r * 0.15]) {
    c.beginPath();
    c.moveTo(lx, r * 0.02);
    c.lineTo(lx + r * 0.06, -r * 0.5);
    c.stroke();
    ellipse(c, lx + r * 0.06, -r * 0.55, r * 0.07, r * 0.05);
    c.fill();
  }
  // Tail bone.
  c.beginPath();
  c.moveTo(-r * 0.75, r * 0.1);
  c.lineTo(-r * 1.0, r * 0.0);
  c.stroke();
  // Skull, with the teeth still on.
  ellipse(c, r * 0.72, r * 0.02, r * 0.36, r * 0.3);
  c.fill();
  c.fillStyle = '#2a1f2e';
  ellipse(c, r * 0.68, -r * 0.06, r * 0.08, r * 0.09);
  c.fill();
  ellipse(c, r * 0.88, -r * 0.04, r * 0.07, r * 0.08);
  c.fill();
  c.fillStyle = '#efe6d2';
  c.fillRect(r * 0.96, r * 0.1, r * 0.06, r * 0.12);
  c.fillRect(r * 1.03, r * 0.1, r * 0.06, r * 0.12);
  c.restore();
}

/** Hammy as a small picture on its own canvas, for the shop and the phone. */
export function paintPortrait(canvas: HTMLCanvasElement, fit: FitId, face: Face = 'happy', t = 0, form: FormId = 'cube'): void {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || canvas.width;
  const h = rect.height || canvas.height;
  if (w < 4 || h < 4) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  // Sized so a hat still fits on top, whatever he is today.
  const ext = EXTENTS[form];
  const r = Math.min((w * 0.4) / ext.w, (h * 0.3) / Math.max(0.92, ext.h));
  drawHammy(c, w / 2, h * 0.58 + (0.92 - ext.h) * r * 0.5, r, { ...defaultLook(fit, form), face }, t);
}
