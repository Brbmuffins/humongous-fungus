// His own voice. Recordings go in ../assets/voice/, named after what he's
// saying: fart.m4a, fart-2.m4a, toilet.mp3, hungry-1.wav. The name before the
// number is one of the SAYS keys in defs.ts, or roadtrip, form, call or
// hello (see assets/voice/README.md). When a line has a recording, it plays
// along with the speech bubble; when it doesn't, he just says it in text.
const FILES = import.meta.glob('../assets/voice/*.{mp3,m4a,aac,ogg,wav,webm}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const clips = new Map<string, string[]>();
for (const [path, url] of Object.entries(FILES)) {
  const name = path.split('/').pop()!.replace(/\.\w+$/, '').toLowerCase();
  const kind = name.replace(/[-_ ]*\d+$/, '');
  clips.set(kind, [...(clips.get(kind) ?? []), url]);
}

let enabled = true;
let playing: HTMLAudioElement | null = null;

export function setVoice(on: boolean): void {
  enabled = on;
  if (!on) playing?.pause();
}

export const hasVoice = (kind: string): boolean => clips.has(kind);

/** Play one of his recordings for this kind of line. False if there are none. */
export function speak(kind: string): boolean {
  const list = clips.get(kind);
  if (!enabled || !list) return false;
  // One line at a time; he doesn't talk over himself.
  if (playing && !playing.ended && !playing.paused) return true;
  try {
    playing = new Audio(list[Math.floor(Math.random() * list.length)]);
    void playing.play().catch(() => {});
  } catch {
    return false;
  }
  return true;
}
