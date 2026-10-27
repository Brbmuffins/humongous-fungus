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

/** Fart Rocket's engine: one long fart that climbs with him. */
export interface Engine {
  /** 0 on the roof, about 1 at the moon, more after. */
  set(level: number): void;
  stop(): void;
}

export function engine(): Engine | null {
  const a = ready();
  if (!a || !noise) return null;
  const t = a.currentTime;
  const o = a.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = 60;
  const lfo = a.createOscillator();
  lfo.frequency.value = 18;
  const depth = a.createGain();
  depth.gain.value = 22;
  lfo.connect(depth).connect(o.frequency);
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 320;
  f.Q.value = 4;
  const src = a.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const nf = a.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = 500;
  nf.Q.value = 0.8;
  const ng = a.createGain();
  ng.gain.value = 0.35;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.15);
  o.connect(f).connect(g);
  src.connect(nf).connect(ng).connect(g);
  g.connect(master!);
  o.start(t);
  lfo.start(t);
  src.start(t, Math.random());
  let stopped = false;
  return {
    set(level: number): void {
      if (stopped) return;
      const now = a.currentTime;
      const l = Math.min(2.5, Math.max(0, level));
      o.frequency.setTargetAtTime(60 + l * 120, now, 0.1);
      lfo.frequency.setTargetAtTime(18 + l * 26, now, 0.1);
      f.frequency.setTargetAtTime(320 + l * 800, now, 0.1);
      nf.frequency.setTargetAtTime(500 + l * 900, now, 0.1);
    },
    stop(): void {
      if (stopped) return;
      stopped = true;
      const now = a.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      for (const n of [o, lfo, src]) n.stop(now + 0.3);
    },
  };
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
  /** A train's fart: two whistle notes with steam. */
  toot(size: number): void {
    const dur = 0.2 + size * 0.35;
    tone('triangle', 587, 587, 0, dur, 0.16);
    tone('triangle', 740, 740, 0, dur, 0.12);
    tone('triangle', 880, 880, 0, dur, 0.08);
    hiss(0, dur, 2500, 0.08);
    if (size > 0.9) {
      tone('triangle', 587, 587, dur + 0.08, dur * 1.4, 0.16);
      tone('triangle', 740, 740, dur + 0.08, dur * 1.4, 0.12);
    }
  },
  pow(): void {
    hiss(0, 0.12, 900, 0.5, 'lowpass');
    tone('sine', 140, 50, 0, 0.18, 0.5);
  },
  splat(): void {
    hiss(0, 0.25, 700, 0.35, 'lowpass');
    tone('sine', 260, 90, 0, 0.15, 0.25);
  },
  fuse(): void {
    hiss(0, 1.6, 5000, 0.06, 'highpass');
  },
  bang(): void {
    hiss(0, 0.9, 400, 0.7, 'lowpass');
    hiss(0, 0.2, 3000, 0.4);
    tone('sine', 90, 30, 0, 0.5, 0.6);
  },
  giggle(): void {
    const base = 900 + Math.random() * 300;
    tone('sine', base, base * 1.3, 0, 0.06, 0.08);
    tone('sine', base * 1.1, base * 1.4, 0.08, 0.06, 0.08);
  },
  poof(): void {
    hiss(0, 0.5, 1500, 0.25);
    tone('sine', 300, 900, 0, 0.3, 0.1);
  },
  flush(): void {
    hiss(0, 1.4, 600, 0.35, 'lowpass');
    hiss(0.2, 1.0, 1800, 0.1);
    tone('sine', 220, 90, 0.9, 0.4, 0.12);
  },
  sizzle(): void {
    hiss(0, 1.2, 6000, 0.12, 'highpass');
  },
  /** The smoke alarm: three shrill beeps. */
  alarm(): void {
    for (let i = 0; i < 3; i++) tone('square', 3100, 3100, i * 0.18, 0.1, 0.07);
  },
  /** The fridge door, and something heavy and wet landing. */
  fridge(): void {
    tone('sine', 120, 90, 0, 0.12, 0.2);
    tone('sine', 200, 60, 0.25, 0.14, 0.35);
    hiss(0.25, 0.1, 500, 0.12, 'lowpass');
  },
  slurp(): void {
    tone('sawtooth', 300, 900, 0, 0.25, 0.06);
    hiss(0, 0.3, 2500, 0.12);
  },
  /** A long, wet, low burp. */
  burp(): void {
    const a = ready();
    if (!a) return;
    const t = a.currentTime;
    const dur = 0.45 + Math.random() * 0.25;
    const o = a.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95 + Math.random() * 25, t);
    o.frequency.linearRampToValueAtTime(70, t + dur);
    const lfo = a.createOscillator();
    lfo.frequency.value = 28 + Math.random() * 10;
    const depth = a.createGain();
    depth.gain.value = 18;
    lfo.connect(depth).connect(o.frequency);
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 520;
    f.Q.value = 3;
    const g = a.createGain();
    env(g, t, 0.5, 0.03, dur * 0.6, dur * 0.4);
    o.connect(f).connect(g).connect(master!);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  },
  /** Something small and wet. */
  squelch(): void {
    tone('sine', 900, 220, 0, 0.09, 0.12);
    hiss(0, 0.08, 1400, 0.06);
  },
  /** The robot vacuum backing off. */
  beep(): void {
    tone('square', 1320, 1320, 0, 0.06, 0.05);
    tone('square', 990, 990, 0.08, 0.08, 0.05);
  },
  /** Trash down the chute: a flap, then a long rattle into the dark. */
  chute(): void {
    tone('triangle', 260, 140, 0, 0.06, 0.12);
    hiss(0.05, 0.35, 700, 0.05);
    tone('square', 180, 90, 0.32, 0.05, 0.04);
  },
  /** A poop dropped into the bowl from a height. */
  plunk(): void {
    tone('sine', 520, 140, 0, 0.12, 0.22);
    hiss(0.02, 0.18, 2400, 0.06, 'highpass');
  },
  /** Up and off the roof. */
  whoosh(): void {
    hiss(0, 0.7, 900, 0.22);
    tone('sine', 200, 1200, 0, 0.5, 0.08);
  },
  /** Bailed out in time: the register. */
  kaching(): void {
    tone('square', 1319, 1319, 0, 0.06, 0.1);
    tone('square', 1760, 1760, 0.06, 0.06, 0.1);
    tone('square', 2637, 2637, 0.12, 0.22, 0.1);
  },
  /** All the way back down. */
  fall(): void {
    tone('sine', 1400, 160, 0.1, 1.1, 0.12);
  },
};
