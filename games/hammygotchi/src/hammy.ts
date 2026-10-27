// Hammy himself, drawn on a canvas: a round, sweaty little guy with buck
// teeth, in whatever fit he has on. Also his skeleton, for afterwards.
import type { FitId } from './defs';

export type Face = 'happy' | 'joy' | 'meh' | 'sad' | 'sick' | 'shock' | 'smug' | 'eat' | 'dead' | 'sleep';

export interface Look {
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
}

export const defaultLook = (fit: FitId): Look => ({
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
});

const TAU = Math.PI * 2;
const INK = '#2b1a10';

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
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

/** Draw Hammy with his body centered on (x, y), r wide either side. */
export function drawHammy(c: CanvasRenderingContext2D, x: number, y: number, r: number, look: Look, t: number): void {
  const ry = r * 0.92;
  const lw = Math.max(1.2, r * 0.06);
  const { fur, belly, dark } = furColors(look.fit, look.green);
  c.save();
  c.translate(x, y + ry);
  c.rotate(look.lean);
  c.scale(look.sx * (look.flip ? -1 : 1), look.sy);
  c.translate(0, -ry);
  c.lineWidth = lw;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = INK;

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
  for (const [ex, ey] of [
    [-0.42, -0.78],
    [0.5, -0.8],
  ] as const) {
    c.fillStyle = fur;
    ellipse(c, ex * r, ey * ry, r * 0.22, r * 0.2);
    c.fill();
    c.stroke();
    c.fillStyle = '#f2a0a6';
    ellipse(c, ex * r, ey * ry + r * 0.02, r * 0.12, r * 0.1);
    c.fill();
  }

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

  drawFace(c, r, ry, look, t, fur);
  drawHeadFit(c, r, ry, look, t);
  c.restore();
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

function drawHeadFit(c: CanvasRenderingContext2D, r: number, ry: number, look: Look, t: number): void {
  const top = -ry * 0.92;
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
export function paintPortrait(canvas: HTMLCanvasElement, fit: FitId, face: Face = 'happy', t = 0): void {
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
  const r = Math.min(w, h) * 0.3;
  drawHammy(c, w / 2, h * 0.58, r, { ...defaultLook(fit), face }, t);
}
