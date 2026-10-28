// Talking to the arcade's server: JSON POSTs under /arcade/api/ on the same
// origin as the page. Every answer is a plain object; a server that is down,
// slow or not there at all comes back as { ok: false, error: 'network' }.
import { API, type Me } from '../../shared/protocol';

export type Answer = { ok: true; serverNow?: number; me?: Me; [k: string]: any } | { ok: false; error: string; message: string; me?: Me; serverNow?: number };

const KEY = 'hammys-arcade.player.v1';

export interface Saved {
  secret: string;
  name: string;
}

export function loadSaved(): Saved | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    return d && typeof d.secret === 'string' && d.secret.length > 20 ? { secret: d.secret, name: typeof d.name === 'string' ? d.name : '' } : null;
  } catch {
    return null;
  }
}

export function keepSaved(s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Blocked storage: you'll be asked again next time.
  }
}

export class Api {
  secret = '';

  constructor(private base = API) {}

  async post(path: string, body: Record<string, unknown> = {}, timeoutMs = 8000): Promise<Answer> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(this.base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.secret ? { ...body, secret: this.secret } : body),
        signal: ctl.signal,
        cache: 'no-store',
      });
      const json = (await res.json()) as Answer;
      if (!json || typeof json !== 'object' || typeof json.ok !== 'boolean') throw new Error('not the arcade');
      return json;
    } catch {
      return { ok: false, error: 'network', message: 'Can’t reach the arcade right now.' };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Is the arcade's server there? */
  async healthy(timeoutMs = 2500): Promise<boolean> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.base}health`, { signal: ctl.signal, cache: 'no-store' });
      const json = (await res.json()) as { ok?: unknown };
      return res.ok && json.ok === true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
