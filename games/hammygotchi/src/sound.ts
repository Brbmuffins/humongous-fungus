// Every sound in the game, made on the spot with Web Audio: no files. Farts
// are a wobbling sawtooth through a low filter with a puff of noise, so no two
// are the same. Browsers only allow sound after the first tap, so `unlock`
// runs on the first pointer or key press.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let noise: AudioBuffer | null = null;

export function setSound(on: boolean): void {
  enabled = on;
  if (master) master.gain.value = on ? 0.6 : 0;
}

export function unlock(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.6 : 0;
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

function ready(): AudioContext | null {
  return enabled && ctx && master && ctx.state === 'running' ? ctx : null;
}

function env(g: GainNode, t: number, peak: number, attack: number, hold: number, release: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

function tone(type: OscillatorType, from: number, to: number, at: number, dur: number, peak = 0.3): void {
  const a = ready();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  env(g, t, peak, 0.01, dur * 0.4, dur * 0.6);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function hiss(at: number, dur: number, freq: number, peak: number, type: BiquadFilterType = 'bandpass'): void {
  const a = ready();
  if (!a || !noise) return;
  const t = a.currentTime + at;
  const src = a.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = 1.2;
  const g = a.createGain();
  env(g, t, peak, 0.01, dur * 0.3, dur * 0.7);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

export const sfx = {
  /** size about 0.4 (squeak) to 1.4 (the big one). */
  fart(size: number): void {
    const a = ready();
    if (!a || !noise) return;
    const t = a.currentTime;
    const dur = 0.18 + size * 0.45 + Math.random() * 0.2;
    const base = 55 + Math.random() * 60 - size * 15;
    const o = a.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * (1.1 + Math.random() * 0.4), t);
    o.frequency.exponentialRampToValueAtTime(base * 0.7, t + dur);
    const lfo = a.createOscillator();
    lfo.frequency.value = 14 + Math.random() * 22;
    const depth = a.createGain();
    depth.gain.value = base * (0.3 + Math.random() * 0.3);
    lfo.connect(depth).connect(o.frequency);
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 280 + Math.random() * 380;
    f.Q.value = 5;
    const g = a.createGain();
    env(g, t, 0.55 * Math.min(1, 0.5 + size * 0.4), 0.015, dur * 0.55, dur * 0.45);
    o.connect(f).connect(g).connect(master!);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    hiss(0, dur * 0.9, 300 + Math.random() * 300, 0.12 * size);
  },
  plop(): void {
    tone('sine', 320, 70, 0, 0.18, 0.4);
    hiss(0.02, 0.08, 900, 0.05);
  },
  coin(): void {
    tone('square', 988, 988, 0, 0.07, 0.12);
    tone('square', 1319, 1319, 0.07, 0.16, 0.12);
  },
  ding(): void {
    tone('sine', 1568, 1568, 0, 0.12, 0.2);
    tone('sine', 2093, 2093, 0.1, 0.25, 0.16);
  },
  send(): void {
    tone('sine', 700, 1100, 0, 0.09, 0.15);
  },
  /** One burst of the ringtone; the call screen repeats it. */
  ring(): void {
    for (let i = 0; i < 6; i++) tone('triangle', i % 2 ? 1180 : 1500, i % 2 ? 1180 : 1500, i * 0.07, 0.07, 0.18);
  },
  crunch(): void {
    for (let i = 0; i < 4; i++) hiss(i * 0.11, 0.07, 2200 + Math.random() * 1500, 0.22, 'highpass');
  },
  splash(): void {
    hiss(0, 0.9, 1200, 0.3, 'lowpass');
    hiss(0.1, 0.6, 3000, 0.12);
  },
  boing(): void {
    tone('sine', 180, 520, 0, 0.16, 0.22);
  },
  bonk(): void {
    tone('triangle', 160, 60, 0, 0.12, 0.3);
  },
  buy(): void {
    [784, 988, 1175, 1568].forEach((f, i) => tone('square', f, f, i * 0.07, 0.09, 0.1));
  },
  glitch(): void {
    for (let i = 0; i < 5; i++) tone('square', 200 + Math.random() * 900, 80 + Math.random() * 300, i * 0.05, 0.05, 0.08);
  },
  /** Wah, wah, wah, wahhh. */
  sad(): void {
    const a = ready();
    if (!a) return;
    const notes = [392, 370, 349, 330];
    notes.forEach((f, i) => {
      const t = a.currentTime + i * 0.45;
      const dur = i === 3 ? 1.3 : 0.4;
      const o = a.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      if (i === 3) {
        const lfo = a.createOscillator();
        lfo.frequency.value = 6;
        const depth = a.createGain();
        depth.gain.value = 8;
        lfo.connect(depth).connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + dur);
      }
      const flt = a.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 900;
      const g = a.createGain();
      env(g, t, 0.18, 0.03, dur * 0.6, dur * 0.4);
      o.connect(flt).connect(g).connect(master!);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  },
  lose(): void {
    tone('square', 220, 110, 0, 0.35, 0.16);
    tone('square', 165, 82, 0.35, 0.6, 0.16);
  },
};
