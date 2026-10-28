// The shared sky: one Server-Sent Events stream with every game's news, and
// the server's clock as best this page can tell it.
import { API, type Snapshot } from '../../shared/protocol';

export const EVENTS = [
  'snapshot',
  'players',
  'renamed',
  'rocket.betting',
  'rocket.bet',
  'rocket.left',
  'rocket.start',
  'rocket.bail',
  'rocket.crash',
  'rocket.reveal',
  'crossing.betting',
  'crossing.bet',
  'crossing.left',
  'crossing.start',
  'crossing.lane',
  'crossing.cash',
  'crossing.end',
  'mines.round',
  'mines.run',
  'mines.left',
  'mines.progress',
  'mines.end',
  'plinko.drop',
  'plinko.epoch',
  'plinko.reveal',
  'slots.big',
  'slots.epoch',
  'slots.reveal',
  'board',
] as const;

type Handler = (data: any) => void;

export class Sky {
  /** How many pages are in the sky (this one too). */
  players = 1;
  /** Whether the stream is up right now. */
  up = false;
  /** This connection's id, from the last snapshot. */
  cid = '';
  private es: EventSource | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private samples: number[] = [];
  private offset = 0;
  private closed = false;
  private retry = 0;
  private first: ((ok: boolean) => void) | null = null;

  constructor(private url = `${API}sky`) {
    this.on('players', (d) => (this.players = Math.max(1, Number(d.count) || 1)));
    this.on('snapshot', (d: Snapshot) => {
      this.cid = d.cid;
      this.players = Math.max(1, d.players);
    });
  }

  /** The server's clock now, in ms. Leans a little behind rather than ahead. */
  now(): number {
    return Date.now() + this.offset;
  }

  /** Learn from a time the server stamped: the quickest trips are the truest. */
  sample(serverNow: unknown): void {
    if (typeof serverNow !== 'number' || !Number.isFinite(serverNow)) return;
    this.samples.push(serverNow - Date.now());
    if (this.samples.length > 40) this.samples.shift();
    this.offset = Math.max(...this.samples);
  }

  on(name: string, f: Handler): () => void {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(f);
    return () => set.delete(f);
  }

  private emit(name: string, data: unknown): void {
    for (const f of [...(this.handlers.get(name) ?? [])]) {
      try {
        f(data);
      } catch (e) {
        console.error(e);
      }
    }
  }

  /** Connect. Resolves true when the first snapshot lands, false if it doesn't within the time. */
  open(timeoutMs = 4000): Promise<boolean> {
    const first = new Promise<boolean>((ok) => {
      this.first = ok;
      setTimeout(() => ok(false), timeoutMs);
    });
    this.connect();
    return first;
  }

  private connect(): void {
    if (this.closed) return;
    const es = new EventSource(this.url);
    this.es = es;
    for (const name of EVENTS) {
      es.addEventListener(name, (ev) => {
        let data: any;
        try {
          data = JSON.parse((ev as MessageEvent<string>).data);
        } catch {
          return;
        }
        this.sample(data?.serverNow);
        if (name === 'snapshot') {
          this.setUp(true);
          this.retry = 0;
          this.first?.(true);
          this.first = null;
        }
        this.emit(name, data);
      });
    }
    es.addEventListener('error', () => {
      this.setUp(false);
      // The browser retries by itself while it can; if it has given up, we do.
      if (es.readyState === EventSource.CLOSED && !this.closed) {
        es.close();
        const wait = Math.min(30_000, 2000 * 2 ** Math.min(4, this.retry));
        this.retry += 1;
        setTimeout(() => this.connect(), wait);
      }
    });
  }

  private setUp(up: boolean): void {
    if (this.up === up) return;
    this.up = up;
    this.emit('status', { up });
  }

  close(): void {
    this.closed = true;
    this.es?.close();
    this.setUp(false);
  }
}
