// Every sound, made on the spot with Web Audio: no files. Browsers only allow
// sound after the first tap, so `unlock` runs on the first pointer or key
// press. Busy sounds are rate-limited so a fast tape never turns into noise.

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

/** A struck bell: a few inharmonic partials, ringing out. */
function bell(a: AudioContext, at: number, base: number, peak: number): void {
  for (const [ratio, amp, dur] of [
    [1, 1, 1.6],
    [2.76, 0.5, 1.1],
    [5.4, 0.25, 0.6],
    [8.9, 0.12, 0.35],
  ] as const) {
    tone(a, 'sine', base * ratio, base * ratio * 0.998, at, dur, peak * amp);
  }
}

export const sfx = {
  click(): void {
    const a = ready('click', 30);
    if (a) tone(a, 'sine', 900, 700, 0, 0.04, 0.05);
  },
  /** An order filled: up for buys, down for sells. */
  fill(side: 1 | -1): void {
    const a = ready('fill', 60);
    if (!a) return;
    const [f0, f1] = side > 0 ? [660, 990] : [990, 620];
    tone(a, 'square', f0, f1, 0, 0.07, 0.05);
    tone(a, 'sine', f1, f1, 0.06, 0.08, 0.06);
  },
  /** A trade closed green: the till. Bigger wins ring longer. */
  win(big: boolean): void {
    const a = ready('win', 120);
    if (!a) return;
    tone(a, 'triangle', 1319, 1319, 0, 0.09, 0.1);
    tone(a, 'triangle', 1760, 1760, 0.08, big ? 0.4 : 0.2, 0.1);
    if (big) [2093, 2637].forEach((f, i) => tone(a, 'triangle', f, f, 0.18 + i * 0.07, 0.3, 0.06));
    hiss(a, 0.02, 0.06, 6000, 0.04, 'highpass');
  },
  /** A trade closed red. */
  loss(): void {
    const a = ready('loss', 120);
    if (!a) return;
    tone(a, 'sine', 180, 70, 0, 0.22, 0.2);
    tone(a, 'sawtooth', 120, 90, 0, 0.12, 0.04);
  },
  /** Breaking news. */
  news(): void {
    const a = ready('news', 400);
    if (!a) return;
    tone(a, 'sine', 1175, 1175, 0, 0.07, 0.07);
    tone(a, 'sine', 1568, 1568, 0.09, 0.1, 0.07);
  },
  halt(): void {
    const a = ready('halt', 600);
    if (!a) return;
    for (let i = 0; i < 3; i++) {
      tone(a, 'square', 740, 740, i * 0.2, 0.09, 0.05);
      tone(a, 'square', 554, 554, i * 0.2 + 0.1, 0.09, 0.05);
    }
  },
  /** The opening and closing bell. */
  bell(): void {
    const a = ready('bell', 800);
    if (!a) return;
    for (let i = 0; i < 3; i++) bell(a, i * 0.32, 523, 0.09);
  },
  goal(): void {
    const a = ready('goal', 1000);
    if (a) [523, 659, 784, 1047, 1319].forEach((f, i) => tone(a, 'triangle', f, f, i * 0.08, 0.22, 0.1));
  },
  reject(): void {
    const a = ready('reject', 150);
    if (a) tone(a, 'sawtooth', 160, 140, 0, 0.12, 0.06);
  },
  /** The risk desk takes your keys. */
  locked(): void {
    const a = ready('locked', 1000);
    if (a) [392, 370, 349, 262].forEach((f, i) => tone(a, 'sawtooth', f, f * 0.98, i * 0.22, i === 3 ? 0.7 : 0.2, 0.07));
  },
  buyTool(): void {
    const a = ready('tool', 200);
    if (a) [784, 988, 1175, 1568].forEach((f, i) => tone(a, 'square', f, f, i * 0.06, 0.08, 0.05));
  },
};
