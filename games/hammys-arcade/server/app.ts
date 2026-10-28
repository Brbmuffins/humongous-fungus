// The server's HTTP side: the sky (Server-Sent Events), the players' requests
// (JSON POSTs), the clock that drives every game's rounds, and the limits.
// Zero runtime dependencies: node:http, node:crypto, node:fs.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { API, type BoardState, type Snapshot } from '../shared/protocol';
import type { BoardChange } from './board';
import { CrossingGame } from './crossing';
import { newSeed, type Env, type Game, type Res } from './engine';
import { Buckets } from './limits';
import { MinesGame } from './mines';
import { PlinkoGame } from './plinko';
import { RocketGame } from './rocket';
import { SlotsGame } from './slots';
import { Store } from './store';

export interface AppOptions {
  host?: string;
  port: number;
  /** Where the wallet file lives; omit to keep wallets in memory only. */
  dataDir?: string | null;
  /** If set, GET / serves this folder's index.html (local testing; in production nginx serves the page). */
  staticDir?: string | null;
  now?: () => number;
  newSeed?: () => string;
  saveDelayMs?: number;
  log?: (line: string) => void;
}

/** The largest request body we read. */
export const MAX_BODY = 2048;
/** Pages kept open per address, and all together. */
export const MAX_SSE_PER_IP = 8;
export const MAX_SSE = 5000;
/** A client that has this much unsent is too slow: dropped. */
const MAX_BUFFERED = 256 * 1024;
const KEEPALIVE_MS = 15_000;

interface Client {
  id: string;
  res: ServerResponse;
  ip: string;
}

const STATUS: Record<string, number> = { bad_request: 400, unauthorized: 401, not_found: 404, too_large: 413, rate: 429, unknown_secret: 401, full: 503 };

export class App {
  readonly store: Store;
  readonly games: { rocket: RocketGame; crossing: CrossingGame; mines: MinesGame; plinko: PlinkoGame; slots: SlotsGame };
  readonly env: Env;
  readonly server: Server;
  private clients = new Map<string, Client>();
  private perIp = new Map<string, number>();
  private keepalive: ReturnType<typeof setInterval> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wakePending = false;
  private closed = false;
  private now: () => number;
  private ipLimit: Buckets;
  private playerLimit: Buckets;
  private helloLimit: Buckets;
  private staticHtml: string | null = null;
  private log: (line: string) => void;

  constructor(private opts: AppOptions) {
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((l) => console.log(l));
    this.store = new Store({ file: opts.dataDir ? join(opts.dataDir, 'hammys-arcade-wallets.json') : null, now: this.now, saveDelayMs: opts.saveDelayMs });
    const refunded = this.store.load();
    if (refunded.refunded) this.log(JSON.stringify({ msg: 'refunded rounds a restart cut short', coins: refunded.refunded }));
    this.ipLimit = new Buckets(60, 20, this.now);
    this.playerLimit = new Buckets(30, 10, this.now);
    this.helloLimit = new Buckets(10, 1 / 6, this.now);
    this.env = {
      now: this.now,
      store: this.store,
      emit: (name, data) => this.broadcast(name, data),
      clients: () => this.clients.size,
      newSeed: opts.newSeed ?? newSeed,
      wake: () => this.wake(),
    };
    this.store.onBoard = (changes) => this.boardChanged(changes);
    this.games = { rocket: new RocketGame(this.env), crossing: new CrossingGame(this.env), mines: new MinesGame(this.env), plinko: new PlinkoGame(this.env), slots: new SlotsGame(this.env) };
    if (opts.staticDir) this.staticHtml = readFileSync(join(opts.staticDir, 'index.html'), 'utf8');
    this.server = createServer((req, res) => {
      this.route(req, res).catch((e: unknown) => {
        this.log(JSON.stringify({ msg: 'request failed', error: e instanceof Error ? e.message : String(e) }));
        if (!res.headersSent) this.send(res, 500, { ok: false, error: 'server', message: 'Something went wrong.' });
        else res.destroy();
      });
    });
    this.server.keepAliveTimeout = 5000;
  }

  private all(): Game[] {
    return [this.games.rocket, this.games.crossing, this.games.mines, this.games.plinko, this.games.slots];
  }

  async listen(): Promise<{ host: string; port: number }> {
    const host = this.opts.host ?? '127.0.0.1';
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.opts.port, host, () => resolve());
    });
    const a = this.server.address() as AddressInfo;
    return { host, port: a.port };
  }

  /** Stop: give back what's riding on rounds that can't finish, save, hang up. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.keepalive) clearInterval(this.keepalive);
    for (const g of this.all()) g.shutdown();
    for (const c of this.clients.values()) c.res.end();
    this.clients.clear();
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
      this.server.closeAllConnections();
    });
    await this.store.flush();
  }

  // The clock ---------------------------------------------------------------------

  /** Some game's next deadline moved: look again, once, after the current work. */
  private wake(): void {
    if (this.wakePending || this.closed) return;
    this.wakePending = true;
    queueMicrotask(() => {
      this.wakePending = false;
      this.arm();
    });
  }

  private board(): BoardState {
    return this.store.board.state((id) => this.store.players.get(id));
  }

  /** A list's top ten moved (a payout, or the week turning over): tell the pages the new one. */
  private boardChanged(changes: BoardChange[]): void {
    const state = this.board();
    for (const c of changes) this.broadcast('board', { board: c.kind, period: c.period, rows: state.lists[c.kind][c.period], weekStart: state.weekStart, weekEnd: state.weekEnd });
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.closed) return;
    let next: number | null = null;
    // The week turning over is the one thing the board does on its own.
    if (this.clients.size) next = this.store.board.nextAt();
    for (const g of this.all()) {
      const t = g.nextAt();
      if (t !== null && (next === null || t < next)) next = t;
    }
    if (next === null) return;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        for (const g of this.all()) g.tick();
        const turned = this.store.board.tick();
        if (turned.length) this.boardChanged(turned);
        this.arm();
      },
      Math.min(2 ** 31 - 1, Math.max(1, next - this.now())),
    );
  }

  // The sky -----------------------------------------------------------------------

  private broadcast(name: string, data: Record<string, unknown>): void {
    if (!this.clients.size) return;
    const chunk = `event: ${name}\ndata: ${JSON.stringify({ ...data, serverNow: this.now() })}\n\n`;
    for (const c of [...this.clients.values()]) this.write(c, chunk);
  }

  private write(c: Client, chunk: string): void {
    const res = c.res;
    if (res.destroyed || res.writableEnded) return this.drop(c);
    res.write(chunk);
    // Too far behind to catch up: hang up. The page reconnects and gets a fresh snapshot.
    if (res.writableLength > MAX_BUFFERED) {
      res.destroy();
      this.drop(c);
    }
  }

  private drop(c: Client): void {
    if (!this.clients.delete(c.id)) return;
    const n = (this.perIp.get(c.ip) ?? 1) - 1;
    if (n > 0) this.perIp.set(c.ip, n);
    else this.perIp.delete(c.ip);
    if (!this.clients.size && this.keepalive) {
      clearInterval(this.keepalive);
      this.keepalive = null;
    }
    if (!this.closed) {
      this.broadcast('players', { count: this.clients.size });
      for (const g of this.all()) g.clientsChanged();
      this.wake();
    }
  }

  private snapshot(cid: string): Snapshot {
    return {
      serverNow: this.now(),
      cid,
      players: this.clients.size + 1,
      rocket: this.games.rocket.snapshot(),
      crossing: this.games.crossing.snapshot(),
      mines: this.games.mines.snapshot(),
      plinko: this.games.plinko.snapshot(),
      slots: this.games.slots.snapshot(),
      board: this.board(),
    };
  }

  private sky(req: IncomingMessage, res: ServerResponse, ip: string): void {
    if (this.clients.size >= MAX_SSE || (this.perIp.get(ip) ?? 0) >= MAX_SSE_PER_IP) {
      return this.send(res, 429, { ok: false, error: 'rate', message: 'Too many windows open.' });
    }
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const c: Client = { id: randomBytes(8).toString('hex'), res, ip };
    res.write(`retry: 2000\n\nevent: snapshot\ndata: ${JSON.stringify(this.snapshot(c.id))}\n\n`);
    this.clients.set(c.id, c);
    this.perIp.set(ip, (this.perIp.get(ip) ?? 0) + 1);
    const gone = () => this.drop(c);
    req.on('close', gone);
    res.on('close', gone);
    res.on('error', gone);
    if (!this.keepalive) {
      this.keepalive = setInterval(() => {
        for (const x of [...this.clients.values()]) this.write(x, `: keep-alive ${this.now()}\n\n`);
      }, KEEPALIVE_MS);
    }
    this.broadcast('players', { count: this.clients.size });
    for (const g of this.all()) g.clientsChanged();
    this.wake();
  }

  // Requests ----------------------------------------------------------------------

  private send(res: ServerResponse, status: number, body: object): void {
    const text = JSON.stringify({ ...body, serverNow: this.now() });
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text) });
    res.end(text);
  }

  private reply(res: ServerResponse, r: Res | { ok: false; error: string; message: string }): void {
    if (r.ok) return this.send(res, 200, r);
    this.send(res, STATUS[r.error] ?? 409, r);
  }

  /** The address a request really came from: behind nginx on this machine, the address nginx saw. */
  private ipOf(req: IncomingMessage): string {
    const peer = req.socket.remoteAddress ?? 'unknown';
    if (peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1') {
      const fwd = req.headers['x-real-ip'] ?? req.headers['x-forwarded-for'];
      const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim();
      if (first && first.length < 64) return first;
    }
    return peer;
  }

  private readBody(req: IncomingMessage): Promise<Record<string, unknown> | 'too_large' | null> {
    return new Promise((resolve) => {
      const len = Number(req.headers['content-length'] ?? 0);
      if (len > MAX_BODY) {
        req.resume();
        return resolve('too_large');
      }
      const chunks: Buffer[] = [];
      let size = 0;
      let over = false;
      req.on('data', (b: Buffer) => {
        size += b.length;
        if (size > MAX_BODY) {
          over = true;
          chunks.length = 0;
        } else if (!over) chunks.push(b);
      });
      req.on('end', () => {
        if (over) return resolve('too_large');
        if (!size) return resolve({});
        try {
          const v: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
        } catch {
          resolve(null);
        }
      });
      req.on('error', () => resolve(null));
    });
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    const ip = this.ipOf(req);

    if (req.method === 'GET' && this.staticHtml !== null && (path === '/' || path === '/arcade' || path === '/arcade/' || path === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return void res.end(this.staticHtml);
    }
    if (!path.startsWith(API)) return this.send(res, 404, { ok: false, error: 'not_found', message: 'Nothing here.' });
    const rest = path.slice(API.length).replace(/\/+$/, '');

    if (req.method === 'GET') {
      if (rest === 'health') {
        return this.send(res, 200, {
          ok: true,
          round: this.games.rocket.current,
          rounds: { rocket: this.games.rocket.current, crossing: this.games.crossing.current, mines: this.games.mines.current },
          players: this.clients.size,
        });
      }
      if (rest === 'sky') {
        if (!this.ipLimit.take(ip)) return this.send(res, 429, { ok: false, error: 'rate', message: 'Slow down.' });
        return this.sky(req, res, ip);
      }
      return this.send(res, 404, { ok: false, error: 'not_found', message: 'Nothing here.' });
    }
    if (req.method !== 'POST') return this.send(res, 405, { ok: false, error: 'bad_request', message: 'POST or GET only.' });

    if (!this.ipLimit.take(ip)) return this.send(res, 429, { ok: false, error: 'rate', message: 'Slow down.' });
    const body = await this.readBody(req);
    if (body === 'too_large') return this.send(res, 413, { ok: false, error: 'too_large', message: 'That is too much to send.' });
    if (!body) return this.send(res, 400, { ok: false, error: 'bad_request', message: 'That was not JSON.' });

    if (rest === 'hello') {
      if (!this.helloLimit.take(ip)) return this.send(res, 429, { ok: false, error: 'rate', message: 'Slow down.' });
      const p = body.secret !== undefined ? this.store.auth(body.secret) : null;
      if (p) return this.reply(res, { ok: true, created: false, me: this.store.me(p) });
      if (body.secret !== undefined && body.name === undefined) return this.reply(res, { ok: false, error: 'unknown_secret', message: 'The arcade does not know you. Pick a name.' });
      const made = this.store.create(body.name);
      if (!made.ok) return this.reply(res, { ok: false, error: made.error, message: nameMessage(made.error) });
      return this.reply(res, { ok: true, created: true, secret: made.secret, me: this.store.me(made.player) });
    }

    const player = this.store.auth(body.secret);
    if (!player) return this.send(res, 401, { ok: false, error: 'unauthorized', message: 'The arcade does not know you.' });
    if (!this.playerLimit.take(player.id)) return this.send(res, 429, { ok: false, error: 'rate', message: 'Slow down.' });

    if (rest === 'me') return this.reply(res, { ok: true, me: this.store.me(player) });
    if (rest === 'board') return this.reply(res, { ok: true, mine: this.store.board.mine(player.id, (id) => this.store.players.get(id)) });
    if (rest === 'rename') {
      const r = this.store.rename(player, body.name);
      if (!r.ok) return this.reply(res, { ok: false, error: r.error, message: nameMessage(r.error) });
      this.rename(player.id);
      return this.reply(res, { ok: true, me: this.store.me(player) });
    }
    if (rest === 'topup') {
      const given = this.store.topUp(player);
      if (!given) return this.reply(res, { ok: false, error: 'not_broke', message: 'You still have coins, or some are riding on a round.' });
      return this.reply(res, { ok: true, given, me: this.store.me(player) });
    }
    const m = /^(rocket|crossing|mines|plinko|slots)\/([a-z]+)$/.exec(rest);
    if (m) {
      const r = this.games[m[1] as 'rocket' | 'crossing' | 'mines' | 'plinko' | 'slots'].handle(m[2], player, body);
      if (r) return this.reply(res, r.ok ? { ...r, me: this.store.me(player) } : { ...r, me: this.store.me(player) } as Res);
    }
    return this.send(res, 404, { ok: false, error: 'not_found', message: 'Nothing here.' });
  }

  /** A player changed their name: tell the pages (rounds in progress keep the old one until the next). */
  private rename(id: string): void {
    const p = this.store.players.get(id);
    if (p) this.broadcast('renamed', { id, name: p.name });
  }
}

function nameMessage(error: string): string {
  switch (error) {
    case 'name_length':
      return 'Names are 2 to 16 characters.';
    case 'name_chars':
      return 'Letters, numbers, spaces, _ and - only.';
    case 'name_blocked':
      return 'Hammy won’t put that on the board. Try another.';
    case 'full':
      return 'The arcade is full.';
    default:
      return error;
  }
}
