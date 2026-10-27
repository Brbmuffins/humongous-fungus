// Every sound, made on the spot with Web Audio: no files. Browsers only allow
// sound after the first tap, so `unlock` runs on the first pointer or key
// press. Busy sounds (hits, pickups) are rate-limited so a swarm doesn't
// turn into noise.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let noise: AudioBuffer | null = null;
const last = new Map<string, number>();

export function setSound(on: boolean): void {
  enabled = on;
  if (master) master.gain.value = on ? 0.5 : 0;
}

export function unlock(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.5 : 0;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Pause all sound while the game is in the background. */
export function suspend(on: boolean): void {
  if (!ctx) return;
  if (on) void ctx.suspend();
  else void ctx.resume();
}

function ready(name: string, gapMs: number): AudioContext | null {
  if (!enabled || !ctx || !master || ctx.state !== 'running') return null;
  const now = performance.now();
  if (now - (last.get(name) ?? -1e9) < gapMs) return null;
  last.set(name, now);
  return ctx;
}

function env(g: GainNode, t: number, peak: number, attack: number, release: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
}

function tone(a: AudioContext, type: OscillatorType, from: number, to: number, at: number, dur: number, peak: number): void {
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  env(g, t, peak, 0.005, dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function hiss(a: AudioContext, at: number, dur: number, freq: number, peak: number, type: BiquadFilterType = 'bandpass'): void {
  if (!noise) return;
  const t = a.currentTime + at;
  const src = a.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = a.createGain();
  env(g, t, peak, 0.005, dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

let xpStreak = 0;
let xpAt = 0;

export const sfx = {
  shoot(): void {
    const a = ready('shoot', 70);
    if (a) tone(a, 'sine', 700, 380, 0, 0.06, 0.05);
  },
  swoosh(): void {
    const a = ready('swoosh', 120);
    if (a) hiss(a, 0, 0.14, 1800, 0.1);
  },
  hit(): void {
    const a = ready('hit', 45);
    if (a) tone(a, 'triangle', 240 + Math.random() * 60, 120, 0, 0.05, 0.06);
  },
  /** The good one. */
  bonk(): void {
    const a = ready('bonk', 90);
    if (!a) return;
    tone(a, 'sine', 160, 520, 0, 0.12, 0.25);
    tone(a, 'square', 90, 60, 0, 0.08, 0.06);
  },
  pop(): void {
    const a = ready('pop', 40);
    if (a) tone(a, 'sine', 500 + Math.random() * 200, 90, 0, 0.07, 0.06);
  },
  /** Sprinkles: each one in a quick run a little higher. */
  sprinkle(): void {
    const now = performance.now();
    xpStreak = now - xpAt < 300 ? Math.min(14, xpStreak + 1) : 0;
    xpAt = now;
    const a = ready('xp', 35);
    if (a) {
      const f = 880 * 2 ** (xpStreak / 12);
      tone(a, 'sine', f, f, 0, 0.06, 0.05);
    }
  },
  crumb(): void {
    const a = ready('crumb', 60);
    if (!a) return;
    tone(a, 'square', 988, 988, 0, 0.05, 0.05);
    tone(a, 'square', 1319, 1319, 0.05, 0.1, 0.05);
  },
  levelUp(): void {
    const a = ready('level', 200);
    if (a) [523, 659, 784, 1047].forEach((f, i) => tone(a, 'triangle', f, f, i * 0.07, 0.16, 0.12));
  },
  hurt(): void {
    const a = ready('hurt', 150);
    if (!a) return;
    tone(a, 'sawtooth', 200, 70, 0, 0.18, 0.12);
    hiss(a, 0, 0.12, 600, 0.1, 'lowpass');
  },
  hop(): void {
    const a = ready('hop', 100);
    if (a) tone(a, 'sine', 220, 660, 0, 0.14, 0.14);
  },
  /** The Fridge Magnet pulling every sprinkle in. */
  pulse(): void {
    const a = ready('pulse', 500);
    if (!a) return;
    tone(a, 'sine', 300, 1200, 0, 0.35, 0.1);
    hiss(a, 0, 0.3, 2500, 0.06);
  },
  milk(): void {
    const a = ready('milk', 100);
    if (a) [660, 880].forEach((f, i) => tone(a, 'sine', f, f * 1.05, i * 0.08, 0.14, 0.1));
  },
  boss(): void {
    const a = ready('boss', 500);
    if (!a) return;
    tone(a, 'sawtooth', 110, 105, 0, 0.6, 0.12);
    tone(a, 'sawtooth', 82, 80, 0.1, 0.8, 0.12);
  },
  chest(): void {
    const a = ready('chest', 300);
    if (a) [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(a, 'triangle', f, f, i * 0.06, 0.2, 0.1));
  },
  click(): void {
    const a = ready('click', 30);
    if (a) tone(a, 'sine', 900, 700, 0, 0.04, 0.05);
  },
  buy(): void {
    const a = ready('buy', 100);
    if (a) [784, 988, 1175].forEach((f, i) => tone(a, 'square', f, f, i * 0.06, 0.08, 0.06));
  },
  win(): void {
    const a = ready('win', 1000);
    if (a) [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(a, 'triangle', f, f, i * 0.11, 0.22, 0.12));
  },
  lose(): void {
    const a = ready('lose', 1000);
    if (a) [392, 370, 349, 262].forEach((f, i) => tone(a, 'sawtooth', f, f * 0.98, i * 0.3, i === 3 ? 0.9 : 0.28, 0.08));
  },
};
