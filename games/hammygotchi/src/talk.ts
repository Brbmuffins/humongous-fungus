// Talking to Hammy: what you type to him in the Phone tab, or say on a
// call, gets an answer from his own lines (cannedReply in game.ts), and on
// calls he says it out loud. Everything here runs on the device for free:
// no accounts, no keys, nothing sent anywhere.
//
// His voice is one of the device's own voices, always the same one: picked
// once (or in the Life tab) and remembered, so it never changes from one
// line to the next. Your voice, on calls, is the browser's own speech
// recognition where it has one.

const KEY = 'hammygotchi.talk.v1';

export interface TalkSettings {
  /** Which of this device's voices is his (its voiceURI), once picked. */
  deviceVoice: string;
  /** He talks out loud on calls. */
  speakCalls: boolean;
  /** His texts get read out loud too. */
  readTexts: boolean;
}

export function loadTalk(): TalkSettings {
  let raw: Partial<TalkSettings> = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<TalkSettings>;
  } catch {
    // Nothing saved, or storage is blocked: the defaults.
  }
  const t = {
    deviceVoice: typeof raw.deviceVoice === 'string' ? raw.deviceVoice : '',
    speakCalls: raw.speakCalls !== false,
    readTexts: raw.readTexts === true,
  };
  // Older versions kept API keys here. Nothing uses them now: wipe them off the device.
  if (Object.keys(raw).some((k) => !(k in t))) saveTalk(t);
  return t;
}

export function saveTalk(t: TalkSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ deviceVoice: t.deviceVoice, speakCalls: t.speakCalls, readTexts: t.readTexts }));
  } catch {
    // Private mode: it lasts until the page closes.
  }
}

// ---------------------------------------------------------------------------
// His voice

let sound = true;
let busy = false;

export function setTalkSound(on: boolean): void {
  sound = on;
  if (!on) hush();
}

export const hasVoice = (): boolean => 'speechSynthesis' in window;

export const speaking = (): boolean => busy || (hasVoice() && speechSynthesis.speaking);

export function hush(): void {
  if (hasVoice()) speechSynthesis.cancel();
  busy = false;
}

/** What a voice should read: sound effects without their *asterisks*, and no emoji. */
export function spoken(text: string): string {
  return text
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Say it out loud. Resolves when he's done, or straight away if he can't. */
export async function speakLine(text: string): Promise<void> {
  const words = spoken(text);
  if (!sound || !words) return;
  hush();
  busy = true;
  try {
    await deviceSay(words, loadTalk());
  } finally {
    busy = false;
  }
}

const MALE = /daniel|fred|alex|aaron|arthur|guy|david|mark|james|rishi|tom|lee|male/i;

/**
 * The voices he could have on this device, best first: English, on the
 * device itself (online voices can drop out and get swapped for another
 * mid-sentence), then male-sounding ones.
 */
export function deviceVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  const score = (v: SpeechSynthesisVoice) => (v.localService ? 4 : 0) + (MALE.test(v.name) ? 2 : 0) + (/^en[-_]us/i.test(v.lang) ? 1 : 0);
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('en'))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

let voicesLoaded: Promise<void> | null = null;

/** Browsers load their voice list a moment after the page: wait for it (briefly), once. */
export function loadVoices(): Promise<void> {
  voicesLoaded ??= new Promise((resolve) => {
    if (!('speechSynthesis' in window) || speechSynthesis.getVoices().length) return resolve();
    const done = () => {
      speechSynthesis.removeEventListener('voiceschanged', done);
      resolve();
    };
    speechSynthesis.addEventListener('voiceschanged', done);
    window.setTimeout(done, 2000);
  });
  return voicesLoaded;
}

/** His voice on this device: the one picked in the Life tab, or the best one, remembered so it never changes. */
export function hisDeviceVoice(t = loadTalk()): SpeechSynthesisVoice | null {
  const all = deviceVoices();
  const picked = t.deviceVoice ? all.find((v) => v.voiceURI === t.deviceVoice) : undefined;
  if (picked || !all.length) return picked ?? null;
  saveTalk({ ...t, deviceVoice: all[0].voiceURI });
  return all[0];
}

/** The device's own voice (always the same one), pitched down a bit. */
async function deviceSay(words: string, t: TalkSettings): Promise<void> {
  if (!('speechSynthesis' in window)) return;
  await loadVoices();
  const voice = hisDeviceVoice(t);
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(words);
    u.pitch = 0.75;
    u.rate = 1.05;
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    // Some browsers never say they're done: don't wait forever.
    const done = window.setTimeout(resolve, 2500 + words.length * 90);
    u.onend = u.onerror = () => {
      window.clearTimeout(done);
      resolve();
    };
    speechSynthesis.speak(u);
  });
}

// ---------------------------------------------------------------------------
// Your voice, on calls: speech recognition where the browser has it.

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionClass = new () => Recognition;
const Rec = ((window as unknown as { SpeechRecognition?: RecognitionClass }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionClass }).webkitSpeechRecognition) as RecognitionClass | undefined;
let micOff = false;

export const canListen = (): boolean => !!Rec && !micOff;

/**
 * Listen for one thing you say. Calls `heard` as the words come in and once
 * more with `final` when you stop. Returns a function that stops listening.
 */
export function listen(heard: (text: string, final: boolean) => void, failed: () => void): () => void {
  if (!Rec) {
    failed();
    return () => {};
  }
  const rec = new Rec();
  rec.lang = navigator.language || 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  let text = '';
  let sent = false;
  rec.onresult = (e) => {
    text = Array.from(e.results, (r) => r[0]?.transcript ?? '').join(' ').trim();
    heard(text, false);
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') micOff = true;
    if (!text) failed();
  };
  rec.onend = () => {
    if (sent) return;
    sent = true;
    if (text) heard(text, true);
  };
  try {
    hush();
    rec.start();
  } catch {
    micOff = true;
    failed();
  }
  return () => {
    try {
      rec.stop();
    } catch {
      // Already stopped.
    }
  };
}
