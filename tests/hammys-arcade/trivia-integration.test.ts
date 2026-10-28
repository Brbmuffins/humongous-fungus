// The Damp Seat on the real bundled server, started on a free port at four
// times speed, with two players over real HTTP and Server-Sent Events: one in
// the hot seat and one in the crowd.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRIVIA } from '../../games/hammygotchi/src/trivia/bank';
import { START_COINS } from '../../games/hammys-arcade/shared/protocol';

const ROOT = resolve(__dirname, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'damp-int-'));
const bundleDir = join(tmp, 'bundle');
const dataDir = join(tmp, 'data');
let proc: ChildProcess | null = null;
let base = '';
let output = '';

async function startServer(): Promise<void> {
  proc = spawn(process.execPath, [join(bundleDir, 'server.mjs')], { env: { ...process.env, PORT: '0', DATA_DIR: dataDir, HOST: '127.0.0.1', TRIVIA_TIME_SCALE: '4' }, stdio: ['ignore', 'pipe', 'pipe'] });
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

interface Ev {
  name: string;
  data: any;
}

class Sky {
  events: Ev[] = [];
  private ctl = new AbortController();
  async open(): Promise<this> {
    const res = await fetch(`${base}/arcade/api/sky`, { signal: this.ctl.signal, headers: { Accept: 'text/event-stream' } });
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
  async find(pred: (e: Ev) => boolean, ms = 20_000, from = 0): Promise<Ev> {
    const end = Date.now() + ms;
    for (;;) {
      const e = this.events.slice(from).find(pred);
      if (e) return e;
      if (Date.now() > end) throw new Error(`timed out waiting; saw ${this.events.map((x) => x.name).join(',')}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}

interface Who {
  name: string;
  secret: string;
  id: string;
  ip: string;
  sky: Sky;
}

async function post(path: string, body: object, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}/arcade/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
}

async function enter(name: string, ip: string): Promise<Who> {
  const r = await post('hello', { name }, { 'X-Real-IP': ip });
  expect(r.status).toBe(200);
  return { name: r.json.me.name, secret: r.json.secret, id: r.json.me.id, ip, sky: await new Sky().open() };
}

const act = (w: Who, path: string, body: object = {}) => post(path, { ...body, secret: w.secret }, { 'X-Real-IP': w.ip });

beforeAll(async () => {
  execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.arcade-server.config.ts'], { cwd: ROOT, env: { ...process.env, ARCADE_SERVER_OUT: bundleDir }, stdio: 'pipe' });
  await startServer();
}, 120_000);

afterAll(async () => {
  const p = proc;
  proc = null;
  if (p) {
    const done = new Promise<void>((ok) => p.once('exit', () => ok()));
    p.kill('SIGTERM');
    await done;
  }
  rmSync(tmp, { recursive: true, force: true });
});

describe('The Damp Seat on the bundled server, with two players over SSE', () => {
  it('turns strangers and unknown actions away', async () => {
    expect((await post('trivia/join', { secret: 'nope'.repeat(10) })).status).toBe(401);
    const w = await enter('Nosy', '198.51.100.40');
    expect((await act(w, 'trivia/dance')).status).toBe(404);
    expect((await act(w, 'trivia/answer', { round: 1, i: 0, choice: 0 })).json).toMatchObject({ ok: false });
    w.sky.close();
  });

  it('plays a round: one in the hot seat, one in the crowd, and the prize is paid by the house', { timeout: 60_000 }, async () => {
    const a = await enter('Hotseat', '198.51.100.41');
    const b = await enter('Crowdie', '198.51.100.42');
    const j1 = await act(a, 'trivia/volunteer');
    const j2 = await act(b, 'trivia/join');
    expect(j1.json).toMatchObject({ ok: true, you: { volunteer: true } });
    expect(j2.json).toMatchObject({ ok: true, you: { role: 'crowd' } });

    // The question arrives on both pages, three answers, and no hint of which is right.
    const askA = await a.sky.find((e) => e.name === 'trivia.ask' && e.data.hot?.id === a.id, 30_000);
    const askB = await b.sky.find((e) => e.name === 'trivia.ask' && e.data.round === askA.data.round, 5000);
    expect(askB.data.q.answers).toHaveLength(3);
    const raw = JSON.stringify(askA.data);
    const bank = TRIVIA.find((q) => q.q === askA.data.q.text)!;
    expect(raw).not.toContain(bank.fact);
    expect(raw).not.toContain(bank.source);
    expect(raw).not.toMatch(/correct/);
    expect(askA.data.q.answers.slice().sort()).toEqual(bank.answers.slice().sort());
    expect(askA.data.hot).toMatchObject({ name: 'Hotseat', real: true });
    expect(askA.data.humans.map((h: any) => h.id).sort()).toEqual([b.id].sort());

    // A page that connects in the middle of the question is told no more.
    const late = await new Sky().open();
    const snap = late.events.find((e) => e.name === 'snapshot')!.data.trivia.round;
    expect(snap.id).toBe(askA.data.round);
    if (snap.phase === 'ask') expect(JSON.stringify(snap)).not.toContain(bank.fact);
    late.close();

    // Both pick the right one (the test knows the bank; a page cannot).
    const shown = askA.data.q.answers.indexOf(bank.answers[bank.correct]);
    const body = { round: askA.data.round, i: 0, choice: shown };
    const ra = await act(a, 'trivia/answer', body);
    expect(ra.json).toMatchObject({ ok: true, you: { role: 'hot', picked: shown } });
    expect((await act(a, 'trivia/answer', body)).json).toMatchObject({ ok: false, error: 'already' });
    const rb = await act(b, 'trivia/answer', body);
    expect(rb.json).toMatchObject({ ok: true, you: { role: 'crowd', picked: shown } });

    // After the answers close: the right one, why, and where to check.
    const rev = await b.sky.find((e) => e.name === 'trivia.reveal' && e.data.round === askA.data.round, 15_000);
    expect(rev.data.reveal.correct).toBe(shown);
    expect(rev.data.reveal.fact).toBe(bank.fact);
    expect(rev.data.reveal.source).toBe(bank.source);
    expect(rev.data.reveal.source).toMatch(/^https?:\/\//);
    expect(rev.data.reveal.hotOk).toBe(true);
    expect(rev.data.reveal.outBots.length).toBeGreaterThan(0);
    expect((await act(b, 'trivia/answer', body)).json).toMatchObject({ ok: false });

    // The hot seat takes the pot: only they can, and they are paid from the house.
    const dec = await a.sky.find((e) => e.name === 'trivia.decide' && e.data.round === askA.data.round, 15_000);
    expect(dec.data.pot).toBe(rev.data.reveal.pot);
    expect((await act(b, 'trivia/take')).json).toMatchObject({ ok: false, error: 'not_in' });
    const t = await act(a, 'trivia/take');
    expect(t.json.ok).toBe(true);
    const end = await b.sky.find((e) => e.name === 'trivia.end' && e.data.round === askA.data.round, 5000);
    expect(end.data.end.outcome).toBe('took');
    expect(end.data.end.payouts).toEqual([{ id: a.id, name: 'Hotseat', role: 'hot', due: dec.data.pot, paid: dec.data.pot }]);
    expect(t.json.me.coins).toBe(START_COINS + dec.data.pot);
    expect((await act(b, 'me')).json.me.coins).toBe(START_COINS);
    expect(t.json.you.earned).toBe(dec.data.pot);

    // The next round follows by itself.
    await b.sky.find((e) => e.name === 'trivia.round' && e.data.round.id === askA.data.round + 1, 15_000);
    const h = await (await fetch(`${base}/arcade/api/health`)).json();
    expect(h.rounds.trivia).toBeTruthy();
    a.sky.close();
    b.sky.close();
  });

  it('knocks the crowd member out for a wrong answer, and pays the one still standing when the hot seat falls', { timeout: 60_000 }, async () => {
    const a = await enter('Oops', '198.51.100.43');
    const b = await enter('Steady', '198.51.100.44');
    await act(a, 'trivia/volunteer');
    await act(b, 'trivia/join');
    const ask = await a.sky.find((e) => e.name === 'trivia.ask' && e.data.hot?.id === a.id, 30_000);
    const bank = TRIVIA.find((q) => q.q === ask.data.q.text)!;
    const shown = ask.data.q.answers.indexOf(bank.answers[bank.correct]);
    const body = { round: ask.data.round, i: 0 };
    expect((await act(a, 'trivia/answer', { ...body, choice: (shown + 1) % 3 })).json.ok).toBe(true);
    expect((await act(b, 'trivia/answer', { ...body, choice: shown })).json.ok).toBe(true);
    const end = await b.sky.find((e) => e.name === 'trivia.end' && e.data.round === ask.data.round, 20_000);
    expect(end.data.end.outcome).toBe('busted');
    const mine = end.data.end.payouts.find((p: any) => p.id === b.id);
    expect(mine.paid).toBeGreaterThanOrEqual(5);
    expect(end.data.end.payouts.find((p: any) => p.id === a.id)).toBeUndefined();
    expect((await act(b, 'me')).json.me.coins).toBe(START_COINS + mine.paid);
    expect((await act(a, 'me')).json.me.coins).toBe(START_COINS);
    a.sky.close();
    b.sky.close();
  });
});
