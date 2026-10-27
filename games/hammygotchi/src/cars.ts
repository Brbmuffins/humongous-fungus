// What's coming down the road in Hammy Crossing, drawn from straight above:
// paint with a bit of curve to it, glass, lights, a shadow on the asphalt,
// and whatever makes each one itself (the cop car's light bar, the couch in
// the pickup, the smoke out of Train Hammy). Every vehicle drives down the
// screen; it's drawn with its front bumper at the point given and the rest
// of it trailing back up the road.
import type { CarKind } from './crossing';

type Ctx = CanvasRenderingContext2D;

/** How long each one is, in multiples of the lane's car width. */
const LENGTH: Record<CarKind, number> = {
  scooter: 1.05,
  dorkitos: 2.7,
  train: 7.2,
  garbage: 2.6,
  ambulance: 2.3,
  cart: 0.95,
  tractor: 1.7,
  racecar: 2.1,
  bus: 3.5,
  grandma: 1.15,
  cops: 1.9,
  pickup: 2.1,
};

export const carLength = (kind: CarKind, w: number): number => LENGTH[kind] * w;

/** Paint across the width: darker at the sides, a highlight off-centre, as if it's rounded. */
function paint(c: Ctx, w: number, color: string, shade = 'rgba(0, 0, 0, 0.35)'): CanvasGradient {
  const g = c.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, shade);
  g.addColorStop(0.18, color);
  g.addColorStop(0.38, 'rgba(255, 255, 255, 0.35)');
  g.addColorStop(0.5, color);
  g.addColorStop(0.85, color);
  g.addColorStop(1, shade);
  return g;
}

/** One rounded block of the vehicle, painted. Spans y0 (front) back to y1. */
function block(c: Ctx, w: number, y0: number, y1: number, color: string, r = w * 0.18): void {
  c.fillStyle = color;
  c.beginPath();
  c.roundRect(-w / 2, y1, w, y0 - y1, r);
  c.fill();
  c.fillStyle = paint(c, w, 'rgba(0, 0, 0, 0)');
  c.fill();
}

function shadow(c: Ctx, w: number, L: number): void {
  c.fillStyle = 'rgba(0, 0, 0, 0.32)';
  c.beginPath();
  c.roundRect(-w / 2 + w * 0.1, -L + w * 0.14, w, L, w * 0.2);
  c.fill();
}

/** A windscreen: dark glass, a little narrower at the back, with a streak of sky in it. */
function glass(c: Ctx, w: number, y0: number, y1: number, inset = 0.12): void {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#1c2b44');
  g.addColorStop(1, '#3d5a85');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(-w / 2 + w * inset, y0);
  c.lineTo(w / 2 - w * inset, y0);
  c.lineTo(w / 2 - w * (inset + 0.06), y1);
  c.lineTo(-w / 2 + w * (inset + 0.06), y1);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  c.lineWidth = Math.max(1, w * 0.04);
  c.beginPath();
  c.moveTo(-w * 0.18, y0 - (y0 - y1) * 0.2);
  c.lineTo(w * 0.05, y1 + (y0 - y1) * 0.2);
  c.stroke();
}

function headlights(c: Ctx, w: number, y: number): void {
  c.fillStyle = '#fff6c8';
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.ellipse(sx * w * 0.32, y - w * 0.05, w * 0.1, w * 0.05, 0, 0, Math.PI * 2);
    c.fill();
  }
  // A little throw of light on the road ahead.
  const g = c.createLinearGradient(0, y, 0, y + w * 0.9);
  g.addColorStop(0, 'rgba(255, 246, 200, 0.28)');
  g.addColorStop(1, 'rgba(255, 246, 200, 0)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(-w * 0.42, y);
  c.lineTo(w * 0.42, y);
  c.lineTo(w * 0.62, y + w * 0.9);
  c.lineTo(-w * 0.62, y + w * 0.9);
  c.closePath();
  c.fill();
}

function taillights(c: Ctx, w: number, y: number): void {
  c.fillStyle = '#ff3b30';
  for (const sx of [-1, 1]) c.fillRect(sx * w * 0.32 - w * 0.08, y, w * 0.16, w * 0.06);
}

function mirrors(c: Ctx, w: number, y: number, color: string): void {
  c.fillStyle = color;
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.ellipse(sx * w * 0.56, y, w * 0.08, w * 0.05, 0, 0, Math.PI * 2);
    c.fill();
  }
}

/** Tyres that stick out past the body. */
function tyres(c: Ctx, spots: readonly (readonly [number, number])[], tw: number, tl: number): void {
  c.fillStyle = '#16141a';
  for (const [x, y] of spots) {
    c.beginPath();
    c.roundRect(x - tw / 2, y - tl / 2, tw, tl, tw * 0.3);
    c.fill();
  }
}

/** A light bar, flashing. */
function lightBar(c: Ctx, w: number, y: number, t: number, colors: readonly [string, string]): void {
  const on = Math.floor(t * 6) % 2;
  c.fillStyle = '#d9d9e0';
  c.fillRect(-w * 0.36, y - w * 0.07, w * 0.72, w * 0.14);
  c.fillStyle = on ? colors[0] : 'rgba(80, 0, 0, 0.6)';
  c.fillRect(-w * 0.34, y - w * 0.05, w * 0.32, w * 0.1);
  c.fillStyle = on ? 'rgba(0, 20, 80, 0.6)' : colors[1];
  c.fillRect(w * 0.02, y - w * 0.05, w * 0.32, w * 0.1);
  // The glow.
  const g = c.createRadialGradient(on ? -w * 0.18 : w * 0.18, y, 0, on ? -w * 0.18 : w * 0.18, y, w * 0.55);
  g.addColorStop(0, on ? 'rgba(255, 60, 60, 0.35)' : 'rgba(60, 120, 255, 0.35)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  c.fillStyle = g;
  c.fillRect(-w * 0.75, y - w * 0.55, w * 1.5, w * 1.1);
}

function puff(c: Ctx, x: number, y: number, r: number, t: number): void {
  for (let i = 0; i < 3; i++) {
    const k = (t * 1.4 + i / 3) % 1;
    c.fillStyle = `rgba(230, 230, 235, ${0.55 * (1 - k)})`;
    c.beginPath();
    c.arc(x + Math.sin(i * 2.3 + t) * r * 0.6, y - k * r * 4, r * (0.6 + k * 1.2), 0, Math.PI * 2);
    c.fill();
  }
}

/** A four-door car: hood, windscreen, roof, back window, boot. */
function sedan(c: Ctx, w: number, L: number, body: string, roof: string): void {
  block(c, w, 0, -L, body);
  glass(c, w, -L * 0.24, -L * 0.38);
  c.fillStyle = roof;
  c.beginPath();
  c.roundRect(-w * 0.36, -L * 0.7, w * 0.72, L * 0.32, w * 0.1);
  c.fill();
  glass(c, w * 0.92, -L * 0.7, -L * 0.8, 0.16);
  headlights(c, w, 0);
  taillights(c, w, -L + w * 0.02);
  mirrors(c, w, -L * 0.27, body);
}

/** Draw `kind` with its front bumper at (x, front), `w` wide, driving down the screen. */
export function drawCar(c: Ctx, kind: CarKind, x: number, front: number, w: number, t: number): void {
  const L = carLength(kind, w);
  c.save();
  c.translate(x, front);
  c.lineJoin = 'round';
  switch (kind) {
    case 'cops': {
      shadow(c, w, L);
      sedan(c, w, L, '#16161c', '#f4f4f8');
      lightBar(c, w, -L * 0.52, t, ['#ff3b30', '#3d8bff']);
      break;
    }
    case 'racecar': {
      const bw = w * 0.56;
      shadow(c, w * 0.9, L);
      tyres(c, [[-w * 0.42, -L * 0.18], [w * 0.42, -L * 0.18], [-w * 0.44, -L * 0.78], [w * 0.44, -L * 0.78]], w * 0.2, w * 0.36);
      // Front wing, nose, body, rear wing.
      c.fillStyle = '#1d1d24';
      c.fillRect(-w * 0.5, -w * 0.08, w, w * 0.1);
      block(c, bw * 0.55, 0, -L * 0.45, '#e8261d', bw * 0.2);
      block(c, bw, -L * 0.3, -L * 0.92, '#e8261d', bw * 0.3);
      c.fillStyle = '#1d1d24';
      c.fillRect(-w * 0.48, -L * 0.98, w * 0.96, w * 0.16);
      // The driver's helmet, and his number.
      c.fillStyle = '#ffd34d';
      c.beginPath();
      c.arc(0, -L * 0.56, bw * 0.24, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(0, -L * 0.32, bw * 0.22, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#111';
      c.font = `900 ${bw * 0.3}px Rubik, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('7', 0, -L * 0.32 + 1);
      break;
    }
    case 'ambulance': {
      shadow(c, w, L);
      block(c, w, 0, -L, '#f6f6f8');
      glass(c, w, -L * 0.06, -L * 0.2);
      c.fillStyle = '#ff3b30';
      c.fillRect(-w / 2, -L * 0.7, w * 0.08, L * 0.5);
      c.fillRect(w / 2 - w * 0.08, -L * 0.7, w * 0.08, L * 0.5);
      // The cross on the roof.
      c.fillRect(-w * 0.08, -L * 0.62, w * 0.16, w * 0.5);
      c.fillRect(-w * 0.25, -L * 0.62 + w * 0.17, w * 0.5, w * 0.16);
      lightBar(c, w, -L * 0.27, t, ['#ff3b30', '#ff3b30']);
      headlights(c, w, 0);
      taillights(c, w, -L + w * 0.02);
      mirrors(c, w, -L * 0.12, '#f6f6f8');
      break;
    }
    case 'dorkitos':
    case 'garbage': {
      const dork = kind === 'dorkitos';
      const cab = w * 0.72;
      shadow(c, w, L);
      // The box (or the compactor) behind the cab.
      block(c, w * 1.02, -cab - w * 0.06, -L, dork ? '#ffb43d' : '#2f7a3a', w * 0.08);
      if (dork) {
        // A giant Dorkito on the roof.
        const cy = -cab - (L - cab) / 2;
        const s = w * 0.42;
        c.fillStyle = '#ff7a1a';
        c.strokeStyle = '#b4520a';
        c.lineWidth = Math.max(1.5, w * 0.04);
        c.beginPath();
        c.moveTo(0, cy + s);
        c.lineTo(s * 0.9, cy - s * 0.6);
        c.lineTo(-s * 0.9, cy - s * 0.6);
        c.closePath();
        c.fill();
        c.stroke();
        c.fillStyle = '#d4481a';
        for (const [dx, dy] of [[-0.2, -0.1], [0.2, 0.2], [0.05, -0.35]] as const) c.fillRect(dx * s, cy + dy * s, s * 0.14, s * 0.14);
      } else {
        // Ribs along the compactor, and trash hanging off the back.
        c.fillStyle = 'rgba(0, 0, 0, 0.22)';
        for (let i = 1; i < 7; i++) c.fillRect(-w * 0.5, -cab - w * 0.06 - ((L - cab) * i) / 7, w * 1.02, w * 0.05);
        c.fillStyle = '#c9b38a';
        c.fillRect(-w * 0.3, -L - w * 0.08, w * 0.22, w * 0.12);
        c.fillStyle = '#e0e0e8';
        c.fillRect(w * 0.05, -L - w * 0.05, w * 0.18, w * 0.1);
      }
      block(c, w * 0.92, 0, -cab, dork ? '#ff7a1a' : '#3c9a48');
      glass(c, w * 0.92, -cab * 0.12, -cab * 0.42);
      headlights(c, w * 0.92, 0);
      mirrors(c, w, -cab * 0.3, dork ? '#ff7a1a' : '#3c9a48');
      taillights(c, w, -L + w * 0.02);
      break;
    }
    case 'bus': {
      shadow(c, w, L);
      block(c, w, 0, -L, '#ffc61a', w * 0.12);
      glass(c, w, -w * 0.05, -w * 0.22, 0.08);
      // Roof stripes and hatches.
      c.fillStyle = '#1d1d24';
      c.fillRect(-w * 0.5, -L * 0.2, w * 0.05, -L * 0.75);
      c.fillRect(w * 0.45, -L * 0.2, w * 0.05, -L * 0.75);
      c.fillStyle = 'rgba(0, 0, 0, 0.18)';
      for (const y of [0.35, 0.7]) c.fillRect(-w * 0.18, -L * y, w * 0.36, w * 0.3);
      c.fillStyle = '#1d1d24';
      c.font = `900 ${w * 0.16}px Rubik, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.save();
      c.translate(0, -L * 0.53);
      c.rotate(-Math.PI / 2);
      c.fillText('SCHOOL BUS', 0, 0);
      c.restore();
      headlights(c, w, 0);
      taillights(c, w, -L + w * 0.02);
      mirrors(c, w, -w * 0.12, '#1d1d24');
      break;
    }
    case 'pickup': {
      shadow(c, w, L);
      // The bed, with a couch in it.
      block(c, w, -L * 0.52, -L, '#2f5fb0', w * 0.1);
      c.fillStyle = '#1a2f55';
      c.fillRect(-w * 0.4, -L * 0.96, w * 0.8, L * 0.42);
      c.fillStyle = '#8a5a3c';
      c.beginPath();
      c.roundRect(-w * 0.38, -L * 0.93, w * 0.76, L * 0.36, w * 0.06);
      c.fill();
      c.fillStyle = '#a8724e';
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.roundRect(-w * 0.3 + i * w * 0.2, -L * 0.85, w * 0.18, L * 0.22, w * 0.04);
        c.fill();
      }
      block(c, w, 0, -L * 0.52, '#3a72d4');
      glass(c, w, -L * 0.2, -L * 0.32);
      glass(c, w * 0.9, -L * 0.46, -L * 0.52, 0.16);
      headlights(c, w, 0);
      taillights(c, w, -L + w * 0.02);
      mirrors(c, w, -L * 0.22, '#3a72d4');
      break;
    }
    case 'tractor': {
      shadow(c, w * 0.9, L);
      tyres(c, [[-w * 0.24, -w * 0.25], [w * 0.24, -w * 0.25]], w * 0.16, w * 0.32);
      tyres(c, [[-w * 0.42, -L * 0.75], [w * 0.42, -L * 0.75]], w * 0.3, w * 0.62);
      block(c, w * 0.36, 0, -L * 0.6, '#3c9a48', w * 0.1);
      block(c, w * 0.62, -L * 0.55, -L, '#3c9a48', w * 0.1);
      c.fillStyle = '#ffd34d';
      c.beginPath();
      c.roundRect(-w * 0.15, -L * 0.88, w * 0.3, w * 0.3, w * 0.06);
      c.fill();
      c.fillStyle = '#1d1d24';
      c.beginPath();
      c.arc(w * 0.08, -L * 0.42, w * 0.06, 0, Math.PI * 2);
      c.fill();
      puff(c, w * 0.08, -L * 0.42, w * 0.08, t);
      headlights(c, w * 0.36, 0);
      break;
    }
    case 'train': {
      // Train Hammy: a locomotive and two cars, coupled.
      const loco = w * 2.4;
      const car = w * 2.2;
      const gap = w * 0.2;
      shadow(c, w, L);
      // Coal tender, then a passenger car.
      block(c, w * 0.96, -loco - gap, -loco - gap - car, '#2a2a30', w * 0.08);
      c.fillStyle = '#111115';
      c.fillRect(-w * 0.36, -loco - gap - car * 0.92, w * 0.72, car * 0.84);
      c.fillStyle = '#2f2f36';
      for (let i = 0; i < 9; i++) c.fillRect(-w * 0.3 + ((i * 37) % 5) * w * 0.12, -loco - gap - car * (0.15 + (i * 0.09)), w * 0.1, w * 0.1);
      block(c, w * 0.96, -loco - gap * 2 - car, -L, '#2f7a3a', w * 0.08);
      c.fillStyle = 'rgba(255, 255, 255, 0.25)';
      for (let i = 0; i < 4; i++) c.fillRect(-w * 0.3, -loco - gap * 2 - car - car * (0.12 + i * 0.22), w * 0.6, car * 0.1);
      // Couplings.
      c.fillStyle = '#555';
      c.fillRect(-w * 0.06, -loco - gap, w * 0.12, gap);
      c.fillRect(-w * 0.06, -loco - gap * 2 - car, w * 0.12, gap);
      // The locomotive: cowcatcher, boiler, funnel, cab.
      c.fillStyle = '#8a8a96';
      c.beginPath();
      c.moveTo(0, w * 0.18);
      c.lineTo(w * 0.48, -w * 0.12);
      c.lineTo(-w * 0.48, -w * 0.12);
      c.closePath();
      c.fill();
      block(c, w * 0.78, -w * 0.08, -loco * 0.7, '#c62f2f', w * 0.38);
      c.fillStyle = 'rgba(255, 210, 80, 0.8)';
      for (let i = 1; i < 4; i++) c.fillRect(-w * 0.39, -loco * (0.16 * i + 0.04), w * 0.78, w * 0.05);
      block(c, w, -loco * 0.68, -loco, '#7a1d1d', w * 0.1);
      glass(c, w, -loco * 0.7, -loco * 0.78, 0.14);
      c.fillStyle = '#1d1d24';
      c.beginPath();
      c.arc(0, -loco * 0.2, w * 0.17, 0, Math.PI * 2);
      c.fill();
      puff(c, 0, -loco * 0.2, w * 0.16, t);
      headlights(c, w * 0.6, w * 0.05);
      break;
    }
    case 'scooter': {
      const sw = w * 0.36;
      shadow(c, sw, L);
      tyres(c, [[0, -w * 0.06], [0, -L + w * 0.08]], sw * 0.36, w * 0.24);
      block(c, sw, -w * 0.08, -L * 0.8, '#e8261d', sw * 0.4);
      // Handlebars.
      c.strokeStyle = '#1d1d24';
      c.lineWidth = Math.max(1.5, w * 0.05);
      c.beginPath();
      c.moveTo(-w * 0.28, -L * 0.22);
      c.lineTo(w * 0.28, -L * 0.22);
      c.stroke();
      // The driver, from above: shoulders and a helmet.
      c.fillStyle = '#2b2b34';
      c.beginPath();
      c.ellipse(0, -L * 0.42, w * 0.3, w * 0.13, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ff3d2e';
      c.beginPath();
      c.arc(0, -L * 0.4, w * 0.15, 0, Math.PI * 2);
      c.fill();
      // The DoorDosh box.
      c.fillStyle = '#ff3d2e';
      c.beginPath();
      c.roundRect(-w * 0.27, -L * 0.98, w * 0.54, w * 0.46, w * 0.06);
      c.fill();
      c.fillStyle = '#fff';
      c.font = `900 ${w * 0.2}px Rubik, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('DD', 0, -L * 0.98 + w * 0.24);
      headlights(c, sw, 0);
      break;
    }
    case 'cart': {
      const cw = w * 0.62;
      shadow(c, cw, L);
      tyres(c, [[-cw * 0.4, -w * 0.06], [cw * 0.4, -w * 0.06], [-cw * 0.46, -L + w * 0.1], [cw * 0.46, -L + w * 0.1]], w * 0.08, w * 0.12);
      // Wire basket, wider at the back.
      c.fillStyle = 'rgba(200, 205, 215, 0.25)';
      c.strokeStyle = '#c8cdd7';
      c.lineWidth = Math.max(1, w * 0.03);
      c.beginPath();
      c.moveTo(-cw * 0.4, -w * 0.06);
      c.lineTo(cw * 0.4, -w * 0.06);
      c.lineTo(cw * 0.5, -L * 0.86);
      c.lineTo(-cw * 0.5, -L * 0.86);
      c.closePath();
      c.fill();
      c.stroke();
      for (let i = 1; i < 5; i++) {
        const y = -w * 0.06 - (L * 0.8 * i) / 5;
        c.beginPath();
        c.moveTo(-cw * 0.45, y);
        c.lineTo(cw * 0.45, y);
        c.stroke();
      }
      // A bag of Dorkitos riding in it.
      c.fillStyle = '#ff7a1a';
      c.fillRect(-cw * 0.2, -L * 0.6, cw * 0.32, L * 0.32);
      c.fillStyle = '#e8261d';
      c.fillRect(-cw * 0.55, -L * 0.95, cw * 1.1, w * 0.07);
      break;
    }
    case 'grandma': {
      const gw = w * 0.5;
      shadow(c, gw, L);
      block(c, gw, -w * 0.12, -L, '#c43c6a', gw * 0.3);
      // Her basket up front.
      c.fillStyle = '#a8763e';
      c.beginPath();
      c.roundRect(-gw * 0.46, -w * 0.02, gw * 0.92, -w * 0.3, w * 0.04);
      c.fill();
      c.strokeStyle = '#7a5226';
      c.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        c.beginPath();
        c.moveTo(-gw * 0.46 + (gw * 0.92 * i) / 4, -w * 0.02);
        c.lineTo(-gw * 0.46 + (gw * 0.92 * i) / 4, -w * 0.32);
        c.stroke();
      }
      // Grandma: cardigan shoulders, grey bun.
      c.fillStyle = '#9b84c9';
      c.beginPath();
      c.ellipse(0, -L * 0.6, gw * 0.62, w * 0.16, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#d8d8de';
      c.beginPath();
      c.arc(0, -L * 0.58, w * 0.15, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#b9b9c2';
      c.beginPath();
      c.arc(0, -L * 0.66, w * 0.07, 0, Math.PI * 2);
      c.fill();
      break;
    }
  }
  c.restore();
}

/** A tile of asphalt grit, to fill the road with. */
export function asphalt(c: Ctx): CanvasPattern | null {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 96;
  const t = tile.getContext('2d');
  if (!t) return null;
  t.fillStyle = '#34323d';
  t.fillRect(0, 0, 96, 96);
  for (let i = 0; i < 420; i++) {
    const v = Math.random();
    t.fillStyle = v < 0.5 ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 255, 255, 0.07)';
    t.fillRect(Math.random() * 96, Math.random() * 96, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
  }
  return c.createPattern(tile, 'repeat');
}
