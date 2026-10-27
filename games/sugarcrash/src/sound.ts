// Every sound, made on the spot with Web Audio: no files. The rush is a
// whine that climbs with the multiplier over a heartbeat that speeds up; the
// crash is a deflating wah-wah and then a snore. Browsers only allow sound
// after the first tap, so `unlock` runs on the first pointer or key press.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let noise: AudioBuffer | null = null;
let whine: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
let nextBeat = 0;

export function setSound(on: boolean): void {
  enabled = on;
  if (master) master.gain.value = on ? 0.55 : 0;
}

export function unlock(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.55 : 0;
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

function ready(): AudioContext | null {
  return enabled && ctx && master && ctx.state === 'running' ? ctx : null;
}

function env(g: GainNode, t: number, peak: number, attack: number, release: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
}

function tone(type: OscillatorType, from: number, to: number, at: number, dur: number, peak: number): void {
  const a = ready();
  if (!a) return;
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

function hiss(at: number, dur: number, from: number, to: number, peak: number, type: BiquadFilterType = 'bandpass', attack = 0.01): void {
  const a = ready();
  if (!a || !noise) return;
  const t = a.currentTime + at;
  const src = a.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
  f.Q.value = 0.9;
  const g = a.createGain();
  env(g, t, peak, attack, dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random());
  src.stop(t + dur + attack + 0.05);
}

/** A note of the sad trombone: a sawtooth through a soft filter, with a wobble at the end. */
function wah(freq: number, at: number, dur: number, wobble: boolean): void {
  const a = ready();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(freq, t);
  f.type = 'lowpass';
  f.Q.value = 6;
  f.frequency.setValueAtTime(300, t);
  f.frequency.linearRampToValueAtTime(1400, t + dur * 0.35);
  f.frequency.linearRampToValueAtTime(400, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.04);
  g.gain.setValueAtTime(0.09, t + dur * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (wobble) {
    const lfo = a.createOscillator();
    const depth = a.createGain();
    lfo.frequency.value = 6;
    depth.gain.value = freq * 0.03;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
    o.frequency.linearRampToValueAtTime(freq * 0.94, t + dur);
  }
  o.connect(f).connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** The whine's pitch and the heart rate at multiplier m. */
const pitch = (m: number): number => 330 * (1 + Math.log2(Math.max(1, m)) * 0.45);
const bpm = (m: number): number => Math.min(220, 78 + Math.log2(Math.max(1, m)) * 34);

export const sfx = {
  /** A coin on the table. */
  bet(): void {
    tone('triangle', 900, 1300, 0, 0.05, 0.12);
    tone('sine', 2400, 2200, 0.02, 0.04, 0.05);
  },
  /** The last three seconds of the countdown. */
  count(n: number): void {
    tone('square', n > 0 ? 660 : 990, n > 0 ? 660 : 990, 0, 0.07, 0.05);
  },
  /** The rush starts: a soda can cracking open and a gulp. */
  launch(): void {
    hiss(0, 0.35, 5000, 2500, 0.2, 'highpass', 0.004);
    tone('sine', 220, 520, 0.18, 0.25, 0.14);
  },
  /** Called every frame while it climbs: the whine, and the heartbeat under it. */
  rush(m: number): void {
    const a = ready();
    if (!a) {
      this.rushOff();
      return;
    }
    if (!whine) {
      const osc = a.createOscillator();
      const lfo = a.createOscillator();
      const depth = a.createGain();
      const gain = a.createGain();
      osc.type = 'triangle';
      lfo.frequency.value = 5;
      depth.gain.value = 6;
      lfo.connect(depth).connect(osc.frequency);
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(0.03, a.currentTime + 0.6);
      osc.connect(gain).connect(master!);
      osc.start();
      lfo.start();
      whine = { osc, lfo, gain };
      nextBeat = a.currentTime + 0.1;
    }
    const t = a.currentTime;
    whine.osc.frequency.setTargetAtTime(pitch(m), t, 0.05);
    whine.lfo.frequency.setTargetAtTime(5 + Math.log2(m) * 2, t, 0.1);
    if (t >= nextBeat) {
      // Lub-dub.
      tone('sine', 95, 60, 0, 0.09, 0.22);
      tone('sine', 85, 55, 0.12, 0.08, 0.14);
      nextBeat = t + 60 / bpm(m);
    }
  },
  rushOff(): void {
    if (!whine) return;
    const w = whine;
    whine = null;
    try {
      const t = ctx!.currentTime;
      w.gain.gain.cancelScheduledValues(t);
      w.gain.gain.setTargetAtTime(0.0001, t, 0.04);
      w.osc.stop(t + 0.3);
      w.lfo.stop(t + 0.3);
    } catch {
      // Already stopped.
    }
  },
  /** Passing 2×, 5×, 10×…: a sparkly arpeggio, higher each time. */
  milestone(level: number): void {
    const base = 523 * 2 ** (level / 7);
    for (let i = 0; i < 4; i++) tone('triangle', base * 2 ** (i / 3), base * 2 ** (i / 3), i * 0.05, 0.12, 0.09);
    hiss(0.05, 0.3, 7000, 9000, 0.03, 'highpass');
  },
  /** A candy wrapper crinkling, then ka-ching. */
  cashout(big: boolean): void {
    for (let i = 0; i < 6; i++) hiss(i * 0.025 + Math.random() * 0.01, 0.025, 4000 + Math.random() * 4000, 6000, 0.12, 'highpass', 0.002);
    tone('square', 1046, 1046, 0.12, 0.06, 0.08);
    tone('square', 1568, 1568, 0.19, 0.1, 0.08);
    tone('triangle', 2093, 3136, 0.24, big ? 0.5 : 0.3, 0.07);
  },
  /** Sugar crash: a deflating wah-wah-wah-waaah, then a snore. */
  crash(): void {
    this.rushOff();
    tone('sine', 600, 90, 0, 0.5, 0.1);
    const notes = [392, 370, 349, 330];
    notes.forEach((f, i) => wah(f, 0.08 + i * 0.32, i === 3 ? 0.9 : 0.3, i === 3));
    // The snore: breathe in, rattle out.
    const snoreAt = 1.6;
    hiss(snoreAt, 0.7, 500, 900, 0.07, 'bandpass', 0.35);
    tone('sawtooth', 70, 60, snoreAt + 0.75, 0.6, 0.05);
    hiss(snoreAt + 0.75, 0.6, 400, 200, 0.06, 'lowpass', 0.05);
  },
  /** Grandma came through. */
  refill(): void {
    for (let i = 0; i < 4; i++) tone('triangle', 784 * 2 ** (i / 4), 784 * 2 ** (i / 4), i * 0.07, 0.1, 0.07);
  },
  nope(): void {
    tone('square', 220, 180, 0, 0.12, 0.05);
  },
};
