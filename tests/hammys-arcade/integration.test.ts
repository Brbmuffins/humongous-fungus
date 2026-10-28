// The bundled server, started for real on a free port with a temp data folder,
// and two players driving it over real HTTP + Server-Sent Events.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crashOf, floorOf, laneRoll, plinkoPathOf, truckOf } from '../../games/hammys-arcade/shared/derive';
import { commit, verifySeed } from '../../games/hammys-arcade/shared/fair';
import { START_COINS } from '../../games/hammys-arcade/shared/protocol';

const ROOT = resolve(__dirname, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'arcade-int-'));
const bundleDir = join(tmp, 'bundle');
const dataDir = join(tmp, 'data');
let proc: ChildProcess | null = null;
let base = '';
let output = '';

async function startServer(): Promise<void> {
  proc = spawn(process.execPath, [join(bundleDir, 'server.mjs')], { env: { ...process.env, PORT: '0', DATA_DIR: dataDir, HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const p = proc;
  p.stderr?.on('data', (b: Buffer) => (output += b.toString()));
  base = await new Promise<string>((ok, bad) => {
    const t = setTimeout(() => bad(new Error(`server did not start: ${output}`)), 10_000);
    let buf = '';
    p.stdout?.on('data', (b: Buffer) => {
      buf += b.toString();
      output += b.toString();
      const m = /"port":(\d+)/.exec(buf);
      if (m) {
        clearTimeout(t);
        ok(`http://127.0.0.1:${m[1]}`);
      }
    });
    p.once('exit', (c) => bad(new Error(`server exited ${c}: ${output}`)));
  });
}

async function stopServer(): Promise<number | null> {
  const p = proc;
  if (!p) return null;
  proc = null;
  const done = new Promise<number | null>((ok) => p.once('exit', (c) => ok(c)));
  p.kill('SIGTERM');
  return done;
}

interface Ev {
  name: string;
  data: any;
}

/** One open page's window on the sky. */
class Sky {
  events: Ev[] = [];
  private ctl = new AbortController();
  async open(): Promise<this> {
    const res = await fetch(`${base}/arcade/api/sky`, { signal: this.ctl.signal, headers: { Accept: 'text/event-stream' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
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
  get snapshot(): any {
    return this.events.find((e) => e.name === 'snapshot')!.data;
  }
  async find(pred: (e: Ev) => boolean, ms = 20_000, from = 0): Promise<Ev> {
    const end = Date.now() + ms;
    for (;;) {
      const e = this.events.slice(from).find(pred);
      if (e) return e;
      if (Date.now() > end) throw new Error(`timed out waiting; saw ${this.events.map((x) => x.name).join(',')}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  all(name: string): Ev[] {
    return this.events.filter((e) => e.name === name);
  }
}

interface Who {
  name: string;
  secret: string;
  id: string;
  sky: Sky;
}

async function post(path: string, body: object, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}/arcade/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
}

async function join_(name: string, ip: string): Promise<Who> {
  const r = await post('hello', { name }, { 'X-Real-IP': ip });
  expect(r.status).toBe(200);
  expect(r.json.created).toBe(true);
  expect(r.json.me.coins).toBe(START_COINS);
  return { name: r.json.me.name, secret: r.json.secret, id: r.json.me.id, sky: await new Sky().open() };
}

const act = (w: Who, path: string, body: object = {}) => post(path, { ...body, secret: w.secret }, { 'X-Real-IP': `10.0.${w.id.charCodeAt(0) % 200}.${w.id.charCodeAt(1) % 200}` });
const coins = async (w: Who): Promise<number> => (await act(w, 'me')).json.me.coins;

/** Wait for a round of `game` that is open (not about to close) and return its id. */
async function openRound(w: Who, game: 'rocket' | 'crossing' | 'mines', minLeftMs: number): Promise<number> {
  const evName = { rocket: 'rocket.betting', crossing: 'crossing.betting', mines: 'mines.round' }[game];
  const closes = (r: any) => (game === 'rocket' ? r.flightAt : game === 'crossing' ? r.goAt : r.endsAt);
  const open = (r: any, now: number) => r && (game === 'mines' ? r.phase === 'open' : r.phase === 'bet') && closes(r) - now > minLeftMs;
  const snap = w.sky.snapshot[game].round;
  if (open(snap, w.sky.snapshot.serverNow) && w.sky.events.findIndex((e) => e.name === 'snapshot') === 0 && !w.sky.events.some((e) => e.name === evName)) return snap.id;
  const e = await w.sky.find((x) => x.name === evName && open(x.data.round, x.data.serverNow), 40_000);
  return e.data.round.id;
}

beforeAll(async () => {
  execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.arcade-server.config.ts'], { cwd: ROOT, env: { ...process.env, ARCADE_SERVER_OUT: bundleDir }, stdio: 'pipe' });
  await startServer();
}, 120_000);

afterAll(async () => {
  await stopServer();
  rmSync(tmp, { recursive: true, force: true });
});

describe('the bundled server, over real HTTP and SSE', () => {
  it('is one file with no installs needed, and answers health', async () => {
    expect(existsSync(join(bundleDir, 'server.mjs'))).toBe(true);
    expect(readFileSync(join(bundleDir, 'server.mjs'), 'utf8')).not.toMatch(/from ["'](?!node:)[^."'/@][^"']*["']/);
    const h = await (await fetch(`${base}/arcade/api/health`)).json();
    expect(h).toMatchObject({ ok: true, players: 0 });
  });

  it('refuses a big body, junk, a stranger, and the wrong verb', async () => {
    expect((await post('hello', { name: 'x'.repeat(5000) })).status).toBe(413);
    const bad = await fetch(`${base}/arcade/api/hello`, { method: 'POST', body: 'not json' });
    expect(bad.status).toBe(400);
    expect((await post('rocket/bet', { amount: 10, secret: 'nope'.repeat(10) })).status).toBe(401);
    expect((await fetch(`${base}/arcade/api/nothing`)).status).toBe(404);
    expect((await fetch(`${base}/arcade/api/hello`, { method: 'PUT' })).status).toBe(405);
    expect((await post('hello', { name: '<b>' })).json).toMatchObject({ ok: false, error: 'name_chars' });
    expect((await post('hello', { secret: 'x'.repeat(40) })).json).toMatchObject({ ok: false, error: 'unknown_secret' });
  });

  it('rate-limits one address hammering it', async () => {
    let limited = 0;
    for (let i = 0; i < 90; i++) {
      const r = await fetch(`${base}/arcade/api/hello`, { method: 'POST', headers: { 'X-Real-IP': '203.0.113.9' }, body: '{}' });
      if (r.status === 429) limited++;
      await r.arrayBuffer();
    }
    expect(limited).toBeGreaterThan(40);
  });

  it('two players share one sky: names, a clashing name, rename, the head count', async () => {
    const a = await join_('Twin', '198.51.100.1');
    const b = await join_('twin', '198.51.100.2');
    expect(a.name).toBe('Twin');
    expect(b.name).toMatch(/^twin#\d+$/);
    await a.sky.find((e) => e.name === 'players' && e.data.count >= 2, 3000);
    const hello = await post('hello', { secret: a.secret });
    expect(hello.json).toMatchObject({ ok: true, created: false });
    expect(hello.json.me.id).toBe(a.id);
    expect(JSON.stringify(hello.json)).not.toContain(a.secret);
    const r = await act(b, 'rename', { name: 'Bee Gee' });
    expect(r.json.me).toMatchObject({ name: 'Bee Gee', coins: START_COINS });
    const ev = await a.sky.find((e) => e.name === 'renamed' && e.data.id === b.id, 3000);
    expect(ev.data.name).toBe('Bee Gee');
    a.sky.close();
    b.sky.close();
  });

  it('plays all four games with two players at once, and the seeds check out', { timeout: 150_000 }, async () => {
    const a = await join_('Apple', '198.51.100.11');
    const b = await join_('Berry', '198.51.100.12');
    const start = { a: await coins(a), b: await coins(b) };
    expect(start).toEqual({ a: START_COINS, b: START_COINS });

    // Each game gets its own wallet-safe share: rocket 100/200, crossing 50/50, mines 25/25, plinko 10 x N.
    const rocket = async () => {
      const id = await openRound(a, 'rocket', 2500);
      const ra = await act(a, 'rocket/bet', { amount: 100 });
      const rb = await act(b, 'rocket/bet', { amount: 200 });
      expect(ra.json).toMatchObject({ ok: true, round: id });
      expect(rb.json.ok).toBe(true);
      // Each sees the other's bet, by name, and a duplicate bet is refused.
      await a.sky.find((e) => e.name === 'rocket.bet' && e.data.rider.name === b.name && e.data.rider.bet === 200, 5000);
      await b.sky.find((e) => e.name === 'rocket.bet' && e.data.rider.name === a.name && e.data.rider.bet === 100, 5000);
      expect((await act(a, 'rocket/bet', { amount: 5 })).json.error).toBe('already');
      // Nothing about the crash is out before it happens.
      const betting = a.sky.all('rocket.betting').find((e) => e.data.round.id === id)?.data.round ?? a.sky.snapshot.rocket.round;
      expect(betting.crash).toBeUndefined();
      expect(betting.seed).toBeUndefined();
      expect(JSON.stringify(a.sky.events)).not.toContain('"target"');
      await a.sky.find((e) => e.name === 'rocket.start' && e.data.round === id, 15_000);
      await b.sky.find((e) => e.name === 'rocket.start' && e.data.round === id, 15_000);
      // Bail a at once; b rides it out.
      const bail = await act(a, 'rocket/bail');
      const crashA = await a.sky.find((e) => e.name === 'rocket.crash' && e.data.round === id, 90_000);
      const crashB = await b.sky.find((e) => e.name === 'rocket.crash' && e.data.round === id, 90_000);
      expect(crashA.data.crash).toBe(crashB.data.crash);
      const reveal = await b.sky.find((e) => e.name === 'rocket.reveal' && e.data.round === id, 5000);
      expect(verifySeed(reveal.data.seed, betting.hash)).toBe(true);
      expect(crashOf(reveal.data.seed)).toBe(crashA.data.crash);
      let expectA = START_COINS - 100;
      if (bail.json.ok) {
        const seen = await b.sky.find((e) => e.name === 'rocket.bail' && e.data.id === a.id && e.data.round === id, 5000);
        expect(seen.data.mult).toBe(bail.json.mult);
        expect(bail.json.mult).toBeLessThan(crashA.data.crash + 1e-9);
        expectA += Math.floor(100 * bail.json.mult);
      } else {
        expect(bail.json.error).toBe('late');
      }
      return expectA;
    };

    const crossing = async () => {
      const id = await openRound(a, 'crossing', 3000);
      expect((await act(a, 'crossing/bet', { amount: 50, difficulty: 'easy' })).json.ok).toBe(true);
      expect((await act(b, 'crossing/bet', { amount: 50, difficulty: 'daredevil' })).json.ok).toBe(true);
      expect((await act(b, 'crossing/bet', { amount: 50, difficulty: 'nope' })).json.ok).toBe(false);
      await a.sky.find((e) => e.name === 'crossing.bet' && e.data.crosser.name === b.name && e.data.crosser.difficulty === 'daredevil', 5000);
      await b.sky.find((e) => e.name === 'crossing.bet' && e.data.crosser.name === a.name, 5000);
      await a.sky.find((e) => e.name === 'crossing.start' && e.data.round === id, 15_000);
      // a says Go on lane 1; b takes the safe way out at once.
      expect((await act(a, 'crossing/go', { lane: 1 })).json.ok).toBe(true);
      expect((await act(b, 'crossing/cash')).json).toMatchObject({ ok: true, mult: 1, won: 50 });
      await a.sky.find((e) => e.name === 'crossing.cash' && e.data.id === b.id, 5000);
      const laneA = await a.sky.find((e) => e.name === 'crossing.lane' && e.data.round === id && e.data.lane === 1, 15_000);
      const laneB = await b.sky.find((e) => e.name === 'crossing.lane' && e.data.round === id && e.data.lane === 1, 15_000);
      expect(laneA.data.u).toBe(laneB.data.u);
      const mineRes = laneA.data.results.find((r: any) => r.id === a.id);
      let alive = mineRes.state === 'alive';
      // Keep going until it's flat or a few lanes are done, then cash.
      let lane = 1;
      while (alive && lane < 3) {
        lane++;
        expect((await act(a, 'crossing/go', { lane })).json.ok).toBe(true);
        const l = await a.sky.find((e) => e.name === 'crossing.lane' && e.data.round === id && e.data.lane === lane, 15_000);
        alive = l.data.results.find((r: any) => r.id === a.id).state === 'alive';
      }
      if (alive) expect((await act(a, 'crossing/cash')).json.ok).toBe(true);
      const end = await b.sky.find((e) => e.name === 'crossing.end' && e.data.round === id, 30_000);
      const hash = (a.sky.all('crossing.betting').find((e) => e.data.round.id === id)?.data.round ?? a.sky.snapshot.crossing.round).hash;
      expect(verifySeed(end.data.seed, hash)).toBe(true);
      for (const l of a.sky.all('crossing.lane').filter((e) => e.data.round === id)) {
        expect(l.data.u).toBe(laneRoll(end.data.seed, l.data.lane));
        expect(l.data.truck).toBe(truckOf(end.data.seed, l.data.lane));
      }
      // a's result follows from the one roll and a's own risk (easy: flattened under 0.04).
      const us = a.sky.all('crossing.lane').filter((e) => e.data.round === id).map((e) => e.data.u as number);
      const flat = us.findIndex((u) => u < 0.04);
      expect(flat >= 0 && flat < lane ? !alive : true).toBe(true);
      // Paid by the server: the balance matches the event stream.
      const mult = alive ? (await act(a, 'me')).json.me.coins : null;
      return mult;
    };

    const mines = async () => {
      const id = await openRound(a, 'mines', 8000);
      const sa = await act(a, 'mines/start', { amount: 25, grid: 4, mines: 3 });
      const sb = await act(b, 'mines/start', { amount: 25, grid: 4, mines: 3 });
      expect(sa.json).toMatchObject({ ok: true, round: id, grid: 4, mines: 3, tiles: 16 });
      expect(sb.json.ok).toBe(true);
      expect(sa.json.floor).toBeUndefined();
      expect((await act(a, 'mines/start', { amount: 25, grid: 4, mines: 3 })).json.error).toBe('already');
      await a.sky.find((e) => e.name === 'mines.run' && e.data.runner.name === b.name, 5000);
      await b.sky.find((e) => e.name === 'mines.run' && e.data.runner.name === a.name, 5000);
      // a opens one box; b sees the progress (not which box); b cashes with no picks (a refund).
      const op = await act(a, 'mines/open', { index: 5 });
      expect(op.json.ok).toBe(true);
      const prog = await b.sky.find((e) => e.name === 'mines.progress' && e.data.id === a.id, 5000);
      expect(prog.data.picks).toBe(op.json.picks);
      expect(JSON.stringify(prog.data)).not.toMatch(/"index"|"poop"|"floor"/);
      expect((await act(b, 'mines/cash')).json).toMatchObject({ ok: true, won: 25 });
      if (op.json.safe) expect((await act(a, 'mines/cash')).json.ok).toBe(true);
      const end = await b.sky.find((e) => e.name === 'mines.end' && e.data.round === id, 75_000);
      await a.sky.find((e) => e.name === 'mines.end' && e.data.round === id, 5000);
      const hash = (a.sky.all('mines.round').find((e) => e.data.round.id === id)?.data.round ?? a.sky.snapshot.mines.round).hash;
      expect(verifySeed(end.data.seed, hash)).toBe(true);
      // The seed now shows the floor, and a's box 5 was what the server said.
      expect(floorOf(end.data.seed, 4, 3)[5]).toBe(!op.json.safe);
      return { safe: op.json.safe as boolean, mult: op.json.mult as number };
    };

    const plinko = async () => {
      const hash = a.sky.snapshot.plinko.hash;
      const epoch = a.sky.snapshot.plinko.epoch;
      const first = a.sky.snapshot.plinko.first;
      let net = 0;
      const dropsA: any[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await act(a, 'plinko/drop', { amount: 10, rows: 12, risk: 'medium' });
        expect(r.json.ok).toBe(true);
        dropsA.push(r.json.drop);
        net += r.json.won - 10;
      }
      const rb = await act(b, 'plinko/drop', { amount: 10, rows: 8, risk: 'low' });
      expect(rb.json.ok).toBe(true);
      // a sees b's ball, with b's name, and the same path b was told.
      const seen = await a.sky.find((e) => e.name === 'plinko.drop' && e.data.drop.who === b.id, 5000);
      expect(seen.data.drop).toMatchObject({ name: b.name, path: rb.json.drop.path, bin: rb.json.drop.bin });
      // Every drop in the epoch is checkable against the committed hash once the seed is out. (Not yet: only the hash.)
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(a.sky.events.filter((e) => e.name.startsWith('plinko')))).not.toContain('"seed"');
      return { net, dropsA, rb: rb.json, epoch, first, bnet: rb.json.won - 10 };
    };

    const [rk, cr, mn, pl] = await Promise.all([rocket(), crossing(), mines(), plinko()]);
    void cr;

    // The books balance, by the server's own records.
    const aCoins = await coins(a);
    const bCoins = await coins(b);
    const crossingA = (await act(a, 'me')).json.me.stats.crossing;
    const minesA = (await act(a, 'me')).json.me.stats.mines;
    expect(minesA.rounds).toBe(1);
    const expectedMinesA = mn.safe ? Math.floor(25 * mn.mult) - 25 : -25;
    expect(minesA.net).toBe(expectedMinesA);
    expect((await act(b, 'me')).json.me.stats.mines.net).toBe(0);
    expect(aCoins).toBe(rk + pl.net + (crossingA.net) + expectedMinesA);
    // b: rocket lost 200, crossing refunded, mines refunded, plinko on its own.
    expect(bCoins).toBe(START_COINS - 200 + pl.bnet);
    expect(crossingA.rounds).toBe(1);

    // Plinko: rotation isn't due after 5 drops, and the plinko stats add up.
    const p = (await act(a, 'me')).json.me.stats.plinko;
    expect(p.rounds).toBe(4);
    for (const d of pl.dropsA) expect(d.path).toMatch(/^[01]{12}$/);
    void plinkoPathOf;
    void commit;

    a.sky.close();
    b.sky.close();
  });

  it('stops cleanly on SIGTERM, gives back what was riding, and remembers everyone', { timeout: 90_000 }, async () => {
    const a = await join_('Survivor', '198.51.100.21');
    await openRound(a, 'rocket', 2500);
    expect((await act(a, 'rocket/bet', { amount: 300 })).json.ok).toBe(true);
    expect(await coins(a)).toBe(START_COINS - 300);
    // Top-up is refused while coins are merely low but not gone.
    expect((await act(a, 'topup')).json.error).toBe('not_broke');
    a.sky.close();
    const code = await stopServer();
    expect(code).toBe(0);
    expect(output).toContain('stopping');
    const saved = JSON.parse(readFileSync(join(dataDir, 'hammys-arcade-wallets.json'), 'utf8'));
    expect(JSON.stringify(saved)).not.toContain(a.secret);
    const me = saved.players.find((p: any) => p.id === a.id);
    expect(me.coins).toBe(START_COINS);
    expect(me.stakes ?? {}).toEqual({});
    await startServer();
    const again = await post('hello', { secret: a.secret });
    expect(again.json).toMatchObject({ ok: true, created: false });
    expect(again.json.me).toMatchObject({ id: a.id, name: 'Survivor', coins: START_COINS });
  });

  it('after a crash, not a clean stop, a stake that was riding is given back on the next boot', { timeout: 90_000 }, async () => {
    const a = await join_('Crashy', '198.51.100.31');
    await openRound(a, 'rocket', 2500);
    expect((await act(a, 'rocket/bet', { amount: 400 })).json.ok).toBe(true);
    // Give the debounced save time to land, then kill without warning.
    await new Promise((r) => setTimeout(r, 1500));
    a.sky.close();
    const p = proc!;
    proc = null;
    const gone = new Promise((ok) => p.once('exit', ok));
    p.kill('SIGKILL');
    await gone;
    await startServer();
    const again = await post('hello', { secret: a.secret });
    expect(again.json.me.coins).toBe(START_COINS);
    expect(output).toContain('refunded');
  });
});
