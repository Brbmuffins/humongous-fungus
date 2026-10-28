// Pizza Boxes through the real server: HTTP posts, the Server-Sent Events sky,
// a spectator on another connection, and a restart in the middle of a round.
// (The server runs in this process, on a free port, with a temp data folder.)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BOXES, ROUNDS } from '../../games/hammygotchi/src/deal';
import { App } from '../../games/hammys-arcade/server/app';
import { dealLayoutOf } from '../../games/hammys-arcade/shared/derive';
import { verifySeed } from '../../games/hammys-arcade/shared/fair';
import { DEAL_IDLE_MS, START_COINS } from '../../games/hammys-arcade/shared/protocol';

const dirs: string[] = [];
const fresh = () => {
  const d = mkdtempSync(join(tmpdir(), 'arcade-deal-live-'));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

interface Ev {
  name: string;
  data: any;
}

class Sky {
  events: Ev[] = [];
  private ctl = new AbortController();
  constructor(private base: string) {}
  async open(): Promise<this> {
    const res = await fetch(`${this.base}/arcade/api/sky`, { signal: this.ctl.signal, headers: { Accept: 'text/event-stream' } });
    expect(res.status).toBe(200);
    void (async () => {
      const dec = new TextDecoder();
      let buf = '';
      try {
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          buf += dec.decode(chunk, { stream: true });
          let i: number;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const name = /^event: (.+)$/m.exec(block)?.[1];
            const data = /^data: (.+)$/m.exec(block)?.[1];
            if (name && data) this.events.push({ name, data: JSON.parse(data) });
          }
        }
      } catch {
        // closed
      }
    })();
    await this.find((e) => e.name === 'snapshot', 3000);
    return this;
  }
  close(): void {
    this.ctl.abort();
  }
  async find(pred: (e: Ev) => boolean, ms = 8000): Promise<Ev> {
    const end = Date.now() + ms;
    for (;;) {
      const e = this.events.find(pred);
      if (e) return e;
      if (Date.now() > end) throw new Error(`timed out; saw ${this.events.map((x) => x.name).join(',')}`);
      await new Promise((r) => setTimeout(r, 15));
    }
  }
  steps(): any[] {
    return this.events.filter((e) => e.name === 'deal.step').map((e) => e.data);
  }
}

let ipN = 0;
class Arcade {
  base = '';
  offset = 0;
  app!: App;
  constructor(private dir: string = fresh()) {}
  /** The same data folder, a new server. */
  again(): Arcade {
    return new Arcade(this.dir);
  }
  async start(): Promise<this> {
    this.app = new App({ port: 0, host: '127.0.0.1', dataDir: this.dir, saveDelayMs: 20, now: () => Date.now() + this.offset, log: () => {} });
    const at = await this.app.listen();
    this.base = `http://127.0.0.1:${at.port}`;
    return this;
  }
  async stop(): Promise<void> {
    await this.app.close();
  }
  async post(path: string, body: object, ip = `10.1.0.${++ipN}`): Promise<{ status: number; json: any }> {
    const res = await fetch(`${this.base}/arcade/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  }
  sky(): Promise<Sky> {
    return new Sky(this.base).open();
  }
}

/** A signed-in player on a server. */
class Who {
  secret = '';
  id = '';
  constructor(
    public a: Arcade,
    public name: string,
    private ip = `10.9.0.${++ipN}`,
  ) {}
  async hello(): Promise<this> {
    const r = await this.a.post('hello', this.secret ? { secret: this.secret } : { name: this.name }, this.ip);
    expect(r.status).toBe(200);
    this.secret = r.json.secret ?? this.secret;
    this.id = r.json.me.id;
    return this;
  }
  go(path: string, body: object = {}) {
    return this.a.post(path, { secret: this.secret, ...body }, this.ip);
  }
}

const shutBoxes = (mine: number) => Array.from({ length: BOXES }, (_, i) => i).filter((i) => i !== mine);

describe('Pizza Boxes on the live server', () => {
  it('a spectator on another connection sees the whole round as it happens, and nothing early', async () => {
    const a = await new Arcade().start();
    try {
      const player = await new Who(a, 'Host').hello();
      const fan = await new Who(a, 'Fan').hello();
      const eye = await a.sky();
      const hostSky = await a.sky();
      expect(eye.events[0].data.deal).toEqual({ live: [] });

      const bet = await player.go('deal/bet', { amount: 200 });
      expect(bet.status).toBe(200);
      expect(bet.json.me.coins).toBe(START_COINS - 200);
      expect(bet.json.me.riding).toBe(true);
      const id = bet.json.table.id;
      const first = await eye.find((e) => e.name === 'deal.step');
      expect(first.data.table).toMatchObject({ id, name: 'Host', bet: 200, phase: 'pick', v: 0 });
      expect(first.data.table.hash).toMatch(/^[0-9a-f]{64}$/);

      await player.go('deal/pick', { box: 6 });
      const shut = shutBoxes(6);
      for (let i = 0; i < ROUNDS[0]; i++) await player.go('deal/open', { box: shut.shift() });
      await eye.find((e) => e.name === 'deal.step' && e.data.events.some((x: any) => x.type === 'offer'));
      // A page that connects now is told about the round in its first message.
      const late = await a.sky();
      expect(late.events[0].data.deal.live).toHaveLength(1);
      expect(late.events[0].data.deal.live[0]).toMatchObject({ id, phase: 'call', mine: 6 });
      late.close();

      // The fan cheers; the host and the other watcher hear it. A stranger's moves do nothing.
      const cheer = await fan.go('deal/react', { table: id, r: 1 });
      expect(cheer.json.ok).toBe(true);
      const heard = await hostSky.find((e) => e.name === 'deal.react');
      expect(heard.data).toMatchObject({ table: id, name: 'Fan', r: 1 });
      expect((await eye.find((e) => e.name === 'deal.react')).data.r).toBe(1);
      expect((await fan.go('deal/react', { table: id, r: 2 })).status).toBe(429);
      expect((await fan.go('deal/react', { table: id, r: 99 })).status).toBe(400);
      expect((await fan.go('deal/open', { box: 12 })).json).toMatchObject({ ok: false, error: 'not_in' });
      expect((await fan.go('deal/answer', { deal: true })).json).toMatchObject({ ok: false, error: 'not_in' });
      expect((await a.post('deal/react', { table: id, r: 0 })).status).toBe(401);

      // Nothing about a shut box or the seed went out so far.
      const seenSoFar = JSON.stringify(eye.events);
      expect(seenSoFar).not.toMatch(/"seed"/);
      expect(seenSoFar).not.toMatch(/"(prizes|layout|wobble)"/);

      // The host plays to the end.
      let r = await player.go('deal/answer', { deal: false });
      expect(r.json.ok).toBe(true);
      for (let k = 1; k < ROUNDS.length; k++) {
        for (let i = 0; i < ROUNDS[k]; i++) await player.go('deal/open', { box: shut.shift() });
        r = await player.go('deal/answer', { deal: false });
      }
      const end = await player.go('deal/swap', { swap: true });
      expect(end.json.table.phase).toBe('done');
      const done = (await eye.find((e) => e.name === 'deal.step' && e.data.table.phase === 'done')).data;
      expect(verifySeed(done.table.seed, done.table.hash)).toBe(true);
      const floor = dealLayoutOf(done.table.seed).prizes;
      for (const o of done.table.opened) expect(floor[o.box]).toBe(o.prize);
      expect(done.table.outcome.how).toBe('swap');
      expect(end.json.me.coins).toBe(START_COINS - 200 + Math.floor(200 * done.table.outcome.mult));
      expect(end.json.me.riding).toBe(false);
      // The watcher got every step, in order, and none twice.
      const vs = eye.steps().map((s) => s.table.v);
      expect(vs).toEqual([...vs.keys()]);
      expect(eye.steps().map((s) => s.table.id)).toEqual(vs.map(() => id));
      eye.close();
      hostSky.close();
    } finally {
      await a.stop();
    }
  }, 30_000);

  it('a round in progress survives a restart: same boxes, same stake, same commitment, and it finishes and pays', async () => {
    const a = await new Arcade().start();
    let b: Arcade | null = null;
    try {
      const player = await new Who(a, 'Survivor').hello();
      const bet = await player.go('deal/bet', { amount: 300 });
      const hash = bet.json.table.hash;
      const id = bet.json.table.id;
      await player.go('deal/pick', { box: 11 });
      const shut = shutBoxes(11);
      for (let i = 0; i < ROUNDS[0]; i++) await player.go('deal/open', { box: shut.shift() });
      await player.go('deal/answer', { deal: false });
      const opened = (await player.go('deal/open', { box: shut.shift() })).json.table.opened;
      expect(opened).toHaveLength(6);
      // The server stops (and saves) and comes back from the same folder.
      await a.stop();
      b = await a.again().start();
      player.a = b;
      const again = await player.hello();
      const mine = await again.go('deal/mine');
      expect(mine.json.table).toMatchObject({ id, hash, phase: 'open', mine: 11, bet: 300, v: 8 });
      expect(mine.json.table.opened).toEqual(opened);
      expect(mine.json.me).toMatchObject({ coins: START_COINS - 300, riding: true });
      // A page that connects is told about it, with no more than before.
      const eye = await b.sky();
      expect(eye.events[0].data.deal.live.filter((t: any) => t.real)).toEqual([mine.json.table]);
      expect(JSON.stringify(eye.events)).not.toContain('"seed"');
      // And the round goes on.
      for (let i = 0; i < ROUNDS[1] - 1; i++) await player.go('deal/open', { box: shut.shift() });
      expect((await player.go('deal/answer', { deal: false })).json.ok).toBe(true);
      for (let k = 2; k < ROUNDS.length; k++) {
        for (let i = 0; i < ROUNDS[k]; i++) await player.go('deal/open', { box: shut.shift() });
        await player.go('deal/answer', { deal: false });
      }
      const end = await player.go('deal/swap', { swap: false });
      expect(end.json.table.phase).toBe('done');
      expect(end.json.table.hash).toBe(hash);
      expect(verifySeed(end.json.table.seed, hash)).toBe(true);
      const floor = dealLayoutOf(end.json.table.seed).prizes;
      for (const o of opened) expect(floor[o.box]).toBe(o.prize);
      expect(end.json.me.coins).toBe(START_COINS - 300 + Math.floor(300 * floor[11]));
      expect(end.json.me.riding).toBe(false);
      eye.close();
    } finally {
      await a.stop().catch(() => {});
      await b?.stop();
    }
  }, 40_000);

  it('a round nobody finishes settles itself after the timeout, even across a restart, and the watchers hear it', async () => {
    const a = await new Arcade().start();
    let b: Arcade | null = null;
    try {
      const player = await new Who(a, 'Wanderer').hello();
      await player.go('deal/bet', { amount: 100 });
      await player.go('deal/pick', { box: 1 });
      await a.stop();
      b = await a.again().start();
      player.a = b;
      const eye = await b.sky();
      const live = eye.events[0].data.deal.live.filter((t: any) => t.real);
      expect(live).toHaveLength(1);
      // The wait starts again after a restart; then the clock runs out.
      expect(live[0].expiresAt).toBeGreaterThan(Date.now() + DEAL_IDLE_MS - 5000);
      b.offset = DEAL_IDLE_MS + 1000;
      b.app.games.deal.tick();
      const done = (await eye.find((e) => e.name === 'deal.step' && e.data.table.phase === 'done')).data.table;
      expect(done.outcome.how).toBe('left-box');
      expect(verifySeed(done.seed, done.hash)).toBe(true);
      const me = await player.hello();
      const mine = await me.go('deal/mine');
      expect(mine.json.table).toBeNull();
      expect(mine.json.me.riding).toBe(false);
      expect(mine.json.me.coins).toBe(START_COINS - 100 + Math.floor(100 * done.outcome.mult));
      eye.close();
    } finally {
      await a.stop().catch(() => {});
      await b?.stop();
    }
  }, 40_000);

  it('the cast plays a round for the pages watching when nobody else is', async () => {
    const a = await new Arcade().start();
    try {
      const eye = await a.sky();
      const first = await eye.find((e) => e.name === 'deal.step', 12_000);
      expect(first.data.table).toMatchObject({ real: false, phase: 'pick' });
      const second = await eye.find((e) => e.name === 'deal.step' && e.data.table.v === 2, 12_000);
      expect(second.data.table.opened.length + (second.data.table.mine === null ? 0 : 1)).toBeGreaterThan(0);
      eye.close();
    } finally {
      await a.stop();
    }
  }, 40_000);
});
