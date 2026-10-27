// Talking to Hammy for real: type anything to him in the Phone tab, or say
// it on a call, and he answers in character (out loud, on calls).
//
// His words come from Claude. Inside claude.ai the page asks Claude itself
// (the `sample` capability, on the viewer's own account, which asks them to
// allow it the first time). Anywhere else (the phone apps, a plain browser)
// it uses an Anthropic API key added in the Life tab. With neither, he falls
// back to his canned replies.
//
// His voice is ElevenLabs when there's a key and a voice ID (clone War's
// voice there and paste its ID), and the device's own speech when there
// isn't. On the phone apps the ElevenLabs request goes through the native
// HTTP stack. Pages inside claude.ai can't reach the network, so there it's
// always the device's voice.
//
// The keys stay on this device, apart from the save (which syncs).
import Anthropic from '@anthropic-ai/sdk';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { HAMMY_PERSONA, TALK_STYLE } from './defs';
import { playClip, stopClip } from './sound';

const KEY = 'hammygotchi.talk.v1';
/** The model for your own key. Low effort keeps his replies quick. */
const MODEL = 'claude-opus-5-5';
const ELEVEN_MODEL = 'eleven_flash_v2_5';
/** How much of the conversation he remembers when he answers. */
const HISTORY = 16;

export interface TalkSettings {
  anthropicKey: string;
  elevenKey: string;
  voiceId: string;
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
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    anthropicKey: str(raw.anthropicKey),
    elevenKey: str(raw.elevenKey),
    voiceId: str(raw.voiceId),
    speakCalls: raw.speakCalls !== false,
    readTexts: raw.readTexts === true,
  };
}

export function saveTalk(t: TalkSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // Private mode: it lasts until the page closes.
  }
}

/** The last thing that went wrong talking to him, for the Life tab. */
let trouble = '';
export const problem = (): string => trouble;

// ---------------------------------------------------------------------------
// His brain

export type Brain = 'claude' | 'key' | 'canned';
export interface Turn {
  from: 'you' | 'hammy';
  text: string;
}

type SampleTurn = { role: 'user' | 'assistant'; content: string };
type SampleFn = (input: string | SampleTurn[], options?: { modelTier?: 'quick' | 'default' | 'complex'; cache?: boolean; signal?: AbortSignal }) => Promise<{ text: string }>;
interface ClaudeRuntime {
  use?(name: 'sample'): Promise<SampleFn | null>;
}

/** Inside claude.ai there's a runtime, and pages there have no network of their own. */
const runtime = (window as unknown as { claude?: ClaudeRuntime }).claude;
const sampling: Promise<SampleFn | null> = runtime?.use ? runtime.use('sample').catch(() => null) : Promise.resolve(null);
/** The viewer said no to Claude, or it can't run here: stop asking for this view. */
let sampleOff = false;
const OFF = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);

export async function brain(): Promise<Brain> {
  if (!sampleOff && (await sampling)) return 'claude';
  return loadTalk().anthropicKey ? 'key' : 'canned';
}

function instructions(about: string, mode: 'text' | 'call'): string {
  return `${HAMMY_PERSONA}\n\n${TALK_STYLE[mode]}\n\nWhat's going on in the unit right now:\n${about}`;
}

/** Take off what an answer sometimes comes wrapped in. */
export function tidyReply(text: string): string {
  let t = text.trim();
  // Quotes around a name tag, or a name tag around quotes.
  for (let i = 0; i < 2; i++) {
    t = t.replace(/^hammy\s*:\s*/i, '').trim();
    if (/^["“][\s\S]*["”]$/.test(t)) t = t.slice(1, -1).trim();
  }
  return t.slice(0, 400);
}

/**
 * Ask him. `history` is the conversation so far, oldest first, without what
 * you just said. Resolves with his answer, or null when there's no brain to
 * ask (or it failed): use a canned reply then.
 */
export async function ask(about: string, history: readonly Turn[], said: string, mode: 'text' | 'call', signal?: AbortSignal): Promise<{ text: string; brain: Brain } | null> {
  const turns = history.filter((t) => t.text.trim()).slice(-HISTORY);
  const sample = sampleOff ? null : await sampling;
  if (sample) {
    try {
      const { text } = await sample(
        [
          { role: 'user', content: instructions(about, mode) },
          ...turns.map((t): SampleTurn => ({ role: t.from === 'you' ? 'user' : 'assistant', content: t.text })),
          { role: 'user', content: said },
        ],
        { modelTier: 'quick', cache: false, signal },
      );
      trouble = '';
      return { text: tidyReply(text), brain: 'claude' };
    } catch (e) {
      const code = String((e as { code?: unknown })?.code ?? '');
      if (!OFF.has(code)) {
        // Busy, refused or a dropped signal: just this once.
        if (code !== 'cancelled') trouble = `Claude: ${code || 'no answer'}`;
        return null;
      }
      sampleOff = true;
    }
  }
  const key = loadTalk().anthropicKey;
  if (!key) return null;
  try {
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    // A conversation has to open with you.
    const first = turns.findIndex((t) => t.from === 'you');
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...(first < 0 ? [] : turns.slice(first)).map((t): Anthropic.Beta.BetaMessageParam => ({ role: t.from === 'you' ? 'user' : 'assistant', content: t.text })),
      { role: 'user', content: said },
    ];
    const res = await client.beta.messages.create(
      {
        model: MODEL,
        max_tokens: 2000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: instructions(about, mode),
        messages,
      },
      { signal },
    );
    if (res.stop_reason === 'refusal') return null;
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    trouble = '';
    return text ? { text: tidyReply(text), brain: 'key' } : null;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) trouble = 'Anthropic: that key didn’t work.';
    else if (e instanceof Anthropic.RateLimitError) trouble = 'Anthropic: rate limited. Try again in a bit.';
    else if (e instanceof Anthropic.APIUserAbortError) trouble = '';
    else if (e instanceof Anthropic.APIError) trouble = `Anthropic: ${e.status ?? 'error'} ${e.message}`.slice(0, 160);
    else trouble = 'Anthropic: couldn’t connect.';
    return null;
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

/** Where his voice comes from right now. */
export function voiceSource(t = loadTalk()): 'eleven' | 'device' | 'none' {
  if (t.elevenKey && t.voiceId && !runtime) return 'eleven';
  return 'speechSynthesis' in window ? 'device' : 'none';
}

export const speaking = (): boolean => busy || ('speechSynthesis' in window && speechSynthesis.speaking);

export function hush(): void {
  stopClip();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
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
    const t = loadTalk();
    if (voiceSource(t) === 'eleven') {
      try {
        const audio = await eleven(words, t);
        trouble = '';
        if (await playClip(audio)) return;
      } catch (e) {
        trouble = `ElevenLabs: ${e instanceof Error ? e.message : 'couldn’t connect'}. Using this device’s voice.`;
      }
    }
    await deviceSay(words);
  } finally {
    busy = false;
  }
}

async function eleven(words: string, t: TalkSettings): Promise<ArrayBuffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(t.voiceId)}?output_format=mp3_44100_128`;
  const headers = { 'xi-api-key': t.elevenKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' };
  const body = { text: words, model_id: ELEVEN_MODEL };
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({ url, method: 'POST', headers, data: body, responseType: 'arraybuffer' });
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
    const data: unknown = res.data;
    if (typeof data === 'string') return fromBase64(data);
    if (data instanceof ArrayBuffer) return data;
    if (data instanceof Blob) return data.arrayBuffer();
    throw new Error('unexpected audio');
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}

function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64.replace(/^data:[^,]*,/, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** The device's own voice, pitched down a bit. */
function deviceSay(words: string): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(words);
    u.pitch = 0.75;
    u.rate = 1.05;
    const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
    const voice = voices.find((v) => /daniel|fred|alex|aaron|arthur|guy|male/i.test(v.name)) ?? voices.find((v) => v.localService) ?? voices[0];
    if (voice) u.voice = voice;
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
