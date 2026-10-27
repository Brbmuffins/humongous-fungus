// Every sound, made on the spot with Web Audio: no files. The rush is a
// whine that climbs with the multiplier over a heartbeat that speeds up; in
// the Sugar theme the crash is a deflating wah-wah and then a snore. Other
// themes bring their own timbres, jingles and crashes (a SoundProfile and a
// crash sound from themes/kit.ts); the sounds themselves are made here.
// Browsers only allow sound after the first tap, so `unlock` runs on the
// first pointer or key press.
import type { CrashSound, SoundProfile } from './themes/kit';
import { sugar } from './themes/sugar';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let noise: AudioBuffer | null = null;
let whine: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
let nextBeat = 0;
let profile: SoundProfile = sugar.sound;

/** Use a theme's timbres and jingles from now on. */
export function setProfile(p: SoundProfile): void {
  profile = p;
  sfx.rushOff();
}

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
const pitch = (m: number): number => profile.whine.base * (1 + Math.log2(Math.max(1, m)) * profile.whine.slope);
const bpm = (m: number): number => Math.min(220, profile.beat.bpm + Math.log2(Math.max(1, m)) * profile.beat.slope);

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** Crackles, like a fryer or a wire: n short bursts spread over `span` seconds. */
function crackle(at: number, span: number, n: number, peak: number): void {
  for (let i = 0; i < n; i++) hiss(at + Math.random() * span, 0.02, rand(2500, 7000), 3000, peak, 'highpass', 0.002);
}

/** The ways a round can end, other than the sugar crash's own (see `sfx.crash`). */
const crashes: Record<Exclude<CrashSound, 'wah'>, () => void> = {
  // Up in flames: a whoosh, a fryer's crackle, then fsss.
  sizzle() {
    hiss(0, 0.6, 300, 2600, 0.2, 'bandpass', 0.05);
    tone('sawtooth', 220, 60, 0.1, 0.7, 0.05);
    crackle(0.2, 1.2, 16, 0.1);
    hiss(1.0, 0.8, 6000, 1500, 0.07, 'highpass', 0.1);
  },
  // Crying into a glass of milk: two sad wobbling notes, then glug glug glug.
  glug() {
    wah(330, 0.05, 0.45, true);
    wah(294, 0.5, 0.9, true);
    for (let i = 0; i < 5; i++) tone('sine', rand(280, 380), 160, 1.5 + i * 0.13, 0.09, 0.09);
  },
  // Face first into the sauce: a wet splat and a blorp.
  splat() {
    hiss(0, 0.25, 900, 200, 0.2, 'lowpass', 0.005);
    tone('sine', 150, 50, 0, 0.3, 0.2);
    tone('sine', 200, 420, 0.22, 0.2, 0.08);
    tone('sine', 300, 150, 0.5, 0.25, 0.06);
  },
  // A balloon pops, squeaks as the rest leak, and she splashes down.
  pop() {
    hiss(0, 0.08, 9000, 4000, 0.4, 'highpass', 0.001);
    tone('square', 1200, 150, 0, 0.08, 0.12);
    tone('triangle', 900, 250, 0.15, 0.6, 0.07);
    hiss(1.0, 0.5, 2500, 600, 0.1, 'lowpass', 0.02);
  },
  // A power line: a buzz, a crackle, a sproing and a soft landing in hay.
  zap() {
    tone('sawtooth', 120, 60, 0, 0.5, 0.09);
    hiss(0, 0.5, 5000, 3000, 0.15, 'highpass', 0.002);
    crackle(0, 0.5, 10, 0.12);
    tone('sine', 200, 900, 0.5, 0.3, 0.07);
    hiss(1.0, 0.4, 2500, 1000, 0.08, 'bandpass');
  },
  // Head over heels: thuds that get smaller, some clatter, a soft fump.
  tumble() {
    [0, 0.22, 0.4, 0.52].forEach((at, i) => {
      tone('sine', 170 - i * 20, 55, at, 0.12, 0.2 - i * 0.03);
      hiss(at, 0.06, 1800, 900, 0.1, 'bandpass', 0.002);
    });
    hiss(0.7, 0.4, 900, 300, 0.1, 'lowpass', 0.02);
  },
  // HONK, HONK, and then the tumble.
  honk() {
    wah(420, 0, 0.25, false);
    wah(380, 0.3, 0.3, false);
    [0.65, 0.85, 1.0, 1.1].forEach((at, i) => {
      tone('sine', 170 - i * 20, 55, at, 0.12, 0.2 - i * 0.03);
      hiss(at, 0.06, 1800, 900, 0.1, 'bandpass', 0.002);
    });
    hiss(1.3, 0.4, 900, 300, 0.1, 'lowpass', 0.02);
  },
  // A racing heart that stutters, a thump, a long flat beeeep.
  faint() {
    for (let i = 0; i < 12; i++) tone('sine', 95, 60, i * (0.14 - i * 0.008), 0.06, 0.16);
    tone('sine', 100, 50, 1.2, 0.2, 0.2);
    tone('sine', 880, 880, 1.3, 0.7, 0.03);
  },
  // A pour, a splash, and one sad trombone note.
  spill() {
    hiss(0, 0.9, 900, 500, 0.12, 'bandpass', 0.05);
    hiss(0.2, 0.2, 3000, 800, 0.12);
    wah(392, 0.9, 0.8, true);
  },
  // Keys mashed by a sleeping head, a thud, and a snore.
  clack() {
    for (let i = 0; i < 14; i++) hiss(i * 0.05 + Math.random() * 0.02, 0.02, rand(2500, 4500), 2000, 0.1, 'bandpass', 0.001);
    tone('sine', 110, 60, 0.75, 0.25, 0.12);
    snore(1.2);
  },
};

/** Breathe in, rattle out. */
function snore(at: number): void {
  hiss(at, 0.7, 500, 900, 0.07, 'bandpass', 0.35);
  tone('sawtooth', 70, 60, at + 0.75, 0.6, 0.05);
  hiss(at + 0.75, 0.6, 400, 200, 0.06, 'lowpass', 0.05);
}

const launches = {
  // A soda can cracking open and a gulp.
  can() {
    hiss(0, 0.35, 5000, 2500, 0.2, 'highpass', 0.004);
    tone('sine', 220, 520, 0.18, 0.25, 0.14);
  },
  // A wing into the fryer.
  sizzle() {
    hiss(0, 0.5, 1200, 4000, 0.16, 'bandpass', 0.02);
    crackle(0, 0.5, 9, 0.1);
    tone('sine', 150, 400, 0.15, 0.2, 0.1);
  },
  // Air in, strings off, a squeaky rise.
  whoosh() {
    hiss(0, 0.5, 300, 2500, 0.14, 'bandpass', 0.15);
    tone('sine', 700, 1400, 0, 0.3, 0.06);
    tone('sawtooth', 500, 700, 0.1, 0.25, 0.03);
  },
  // Wheels start to rattle.
  rattle() {
    for (let i = 0; i < 8; i++) hiss(i * 0.045, 0.03, 800, 500, 0.12, 'bandpass', 0.002);
    tone('square', 90, 70, 0, 0.3, 0.05);
  },
  // The grinder, then steam.
  grind() {
    tone('sawtooth', 120, 90, 0, 0.5, 0.06);
    hiss(0, 0.5, 3000, 2000, 0.1, 'bandpass');
    hiss(0.45, 0.4, 6000, 3000, 0.1, 'highpass', 0.05);
  },
};

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
  /** The rush starts: a soda can cracking open, a wing hitting the fryer, a grinder… */
  launch(): void {
    launches[profile.launch]();
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
      osc.type = profile.whine.type;
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
      tone('sine', profile.beat.freq, 60, 0, 0.09, 0.22);
      tone('sine', profile.beat.freq - 10, 55, 0.12, 0.08, 0.14);
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
  /** Passing 2×, 5×, 10×…: a sparkly run of notes, higher each time. */
  milestone(level: number): void {
    const { wave, base, ratios, step } = profile.milestone;
    const root = base * 2 ** (level / 7);
    ratios.forEach((r, i) => tone(wave, root * r, root * r, i * step, 0.12, 0.09));
    hiss(0.05, 0.3, 7000, 9000, 0.03, 'highpass');
  },
  /** A candy wrapper crinkling, then ka-ching. */
  cashout(big: boolean): void {
    for (let i = 0; i < 6; i++) hiss(i * 0.025 + Math.random() * 0.01, 0.025, 4000 + Math.random() * 4000, 6000, 0.12, 'highpass', 0.002);
    tone('square', 1046, 1046, 0.12, 0.06, 0.08);
    tone('square', 1568, 1568, 0.19, 0.1, 0.08);
    tone('triangle', 2093, 3136, 0.24, big ? 0.5 : 0.3, 0.07);
  },
  /** The round ends. Sugar crash: a deflating wah-wah-wah-waaah, then a snore; the other themes pick their own. */
  crash(kind: CrashSound = 'wah'): void {
    this.rushOff();
    if (kind !== 'wah') {
      crashes[kind]();
      return;
    }
    tone('sine', 600, 90, 0, 0.5, 0.1);
    const notes = [392, 370, 349, 330];
    notes.forEach((f, i) => wah(f, 0.08 + i * 0.32, i === 3 ? 0.9 : 0.3, i === 3));
    snore(1.6);
  },
  /** Somebody came through with coins. */
  refill(): void {
    for (let i = 0; i < 4; i++) tone('triangle', 784 * 2 ** (i / 4), 784 * 2 ** (i / 4), i * 0.07, 0.1, 0.07);
  },
  nope(): void {
    tone('square', 220, 180, 0, 0.12, 0.05);
  },
};
