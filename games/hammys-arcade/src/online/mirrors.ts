// What this page knows about each game's shared round: a copy kept up to date
// from the sky's events, and the calls that send your choices to the server.
// They are the "round sources" the screens in games/hammygotchi/src draw from.
import type { CrossingSource, LiveBig, LiveCrossing, LiveDrop, LiveMines, LiveRocket, MinesSource, PlinkoSource, RocketSource, SlotsSource, SourceReply } from '@hammygotchi/roundsource';
import type { SlotSpin } from '@hammygotchi/slots';
import { causeOf, crashOf, floorOf, laneRoll, plinkoPathOf, slotsSpinOf, truckOf } from '../../shared/derive';
import { shortHash, verifySeed } from '../../shared/fair';
import type { BoardKind, BoardMine, BoardPeriod, BoardRow, BoardState, Snapshot } from '../../shared/protocol';
import type { Api, Answer } from './api';
import type { Sky } from './sky';
import type { OnlineWallet } from './wallet';

const OK = '✓';
const BAD = '✗ DOES NOT MATCH';

abstract class Mirror {
  constructor(
    protected sky: Sky,
    protected api: Api,
    protected wallet: OnlineWallet,
  ) {}

  get me(): string {
    return this.wallet.id;
  }

  now(): number {
    return this.sky.now();
  }

  online(): boolean {
    return this.sky.up;
  }

  protected mine(riders: readonly { id: string }[] | undefined): boolean {
    return !!riders?.some((x) => x.id === this.wallet.id);
  }

  /** Send a choice; the answer's `me` brings your coins up to date. */
  protected async send(path: string, body: Record<string, unknown> = {}): Promise<Answer> {
    const r = await this.api.post(path, body);
    if (r.me) this.wallet.applyMe(r.me);
    return r;
  }

  protected plain(r: Answer): SourceReply {
    return r.ok ? { ok: true } : { ok: false, message: r.message };
  }
}

// Fart Rocket ----------------------------------------------------------------------

export class RocketMirror extends Mirror implements RocketSource {
  private r: LiveRocket | null = null;
  private hash = '';
  private seen = '';
  private hist: number[] = [];

  constructor(sky: Sky, api: Api, wallet: OnlineWallet) {
    super(sky, api, wallet);
    sky.on('snapshot', (d: Snapshot) => {
      this.hist = [...d.rocket.history];
      this.take(d.rocket.round);
    });
    sky.on('rocket.betting', (d) => this.take(d.round));
    sky.on('rocket.bet', (d) => {
      if (this.r?.id !== d.round) return;
      const r = this.r!;
      r.riders = r.riders.filter((x) => x.id !== d.rider.id);
      r.riders.push(d.rider);
    });
    sky.on('rocket.left', (d) => {
      if (this.r?.id === d.round) this.r!.riders = this.r!.riders.filter((x) => x.id !== d.id);
    });
    sky.on('rocket.start', (d) => {
      if (this.r?.id !== d.round) return;
      const r = this.r!;
      r.phase = 'fly';
      r.flightAt = d.flightAt;
      r.riders = d.riders;
    });
    sky.on('rocket.bail', (d) => {
      if (this.r?.id !== d.round) return;
      const r = this.r!;
      const x = r.riders.find((y) => y.id === d.id);
      if (x) x.out = d.mult;
      if (d.id === this.wallet.id) this.wallet.refresh();
    });
    sky.on('rocket.crash', (d) => {
      if (this.r?.id !== d.round) return;
      const r = this.r!;
      r.phase = 'crash';
      r.crash = d.crash;
      r.cause = d.cause;
      this.hist.unshift(d.crash);
      this.hist.length = Math.min(this.hist.length, 14);
      if (this.mine(r.riders)) this.wallet.refresh();
    });
    sky.on('rocket.reveal', (d) => {
      if (this.r?.id !== d.round) return;
      const r = this.r!;
      const ok = verifySeed(d.seed, this.hash) && r.crash !== undefined && crashOf(d.seed) === r.crash && causeOf(d.seed, r.crash) === r.cause;
      this.seen = ok ? `${OK} the seed matches, and the crash was worked out again here` : BAD;
    });
  }

  private take(round: (LiveRocket & { hash: string; seed?: string }) | null): void {
    this.r = round;
    this.hash = round?.hash ?? '';
    this.seen = '';
    if (round?.seed && round.crash !== undefined) this.seen = verifySeed(round.seed, round.hash) && crashOf(round.seed) === round.crash ? `${OK} the seed matches` : BAD;
  }

  round(): LiveRocket | null {
    return this.r;
  }

  history(): readonly number[] {
    return this.hist;
  }

  fair(): string {
    if (!this.r) return '';
    return `Flight ${this.r.id} · committed ${shortHash(this.hash)} · ${this.seen || 'the seed is shown when it ends'}`;
  }

  async bet(amount: number, auto: number | null): Promise<SourceReply> {
    return this.plain(await this.send('rocket/bet', { amount, ...(auto !== null ? { auto } : {}) }));
  }
  async unbet(): Promise<SourceReply> {
    return this.plain(await this.send('rocket/unbet'));
  }
  async bail(): Promise<SourceReply> {
    return this.plain(await this.send('rocket/bail'));
  }
}

// Hammy Crossing -------------------------------------------------------------------

export class CrossingMirror extends Mirror implements CrossingSource {
  private r: LiveCrossing | null = null;
  private hash = '';
  private seen = '';

  constructor(sky: Sky, api: Api, wallet: OnlineWallet) {
    super(sky, api, wallet);
    sky.on('snapshot', (d: Snapshot) => this.take(d.crossing.round));
    sky.on('crossing.betting', (d) => this.take(d.round));
    sky.on('crossing.bet', (d) => {
      if (this.r?.id !== d.round) return;
      const r = this.r!;
      r.crossers = r.crossers.filter((x) => x.id !== d.crosser.id);
      r.crossers.push(d.crosser);
    });
    sky.on('crossing.left', (d) => {
      if (this.r?.id === d.round) this.r!.crossers = this.r!.crossers.filter((x) => x.id !== d.id);
    });
    sky.on('crossing.start', (d) => {
      if (this.r?.id !== d.round) return;
      const r = this.r!;
      r.phase = 'cross';
      r.goAt = d.goAt;
      r.laneMs = d.laneMs;
      r.lane = 1;
      r.crossers = d.crossers;
    });
    sky.on('crossing.lane', (d) => {
      if (this.r?.id !== d.round) return;
      const r = this.r!;
      r.lanes.push({ lane: d.lane, u: d.u, truck: d.truck, at: d.at, results: d.results });
      this.apply(d.results);
      r.lane = d.lane + 1;
      if (this.mine(d.results)) this.wallet.refresh();
    });
    sky.on('crossing.cash', (d) => {
      if (this.r?.id !== d.round) return;
      const r = this.r!;
      const x = r.crossers.find((y) => y.id === d.id);
      if (x) Object.assign(x, { state: 'cashed', lane: d.lane, mult: d.mult });
      if (d.id === this.wallet.id) this.wallet.refresh();
    });
    sky.on('crossing.end', (d) => {
      if (this.r?.id !== d.round) return;
      const r = this.r!;
      r.phase = 'end';
      this.apply(d.results);
      const seed: string = d.seed;
      const ok = verifySeed(seed, this.hash) && r.lanes.every((l) => l.u === laneRoll(seed, l.lane) && l.truck === truckOf(seed, l.lane));
      this.seen = ok ? `${OK} the seed matches, and every lane's roll was worked out again here` : BAD;
      if (this.mine(r.crossers)) this.wallet.refresh();
    });
  }

  private apply(results: { id: string; state: any; lane: number; mult: number }[]): void {
    for (const x of results) {
      const c = this.r?.crossers.find((y) => y.id === x.id);
      if (c) Object.assign(c, { state: x.state, lane: x.lane, mult: x.mult });
    }
  }

  private take(round: any): void {
    this.r = round ? { ...round, lanes: [] } : null;
    this.hash = round?.hash ?? '';
    this.seen = '';
  }

  round(): LiveCrossing | null {
    return this.r;
  }

  fair(): string {
    if (!this.r) return '';
    return `Road ${this.r.id} · committed ${shortHash(this.hash)} · ${this.seen || 'the seed is shown when it ends'}`;
  }

  async bet(amount: number, difficulty: string): Promise<SourceReply> {
    return this.plain(await this.send('crossing/bet', { amount, difficulty }));
  }
  async unbet(): Promise<SourceReply> {
    return this.plain(await this.send('crossing/unbet'));
  }
  async go(lane: number): Promise<SourceReply> {
    return this.plain(await this.send('crossing/go', { lane }));
  }
  async cash(): Promise<SourceReply> {
    return this.plain(await this.send('crossing/cash'));
  }
}

// Hammy Mines ----------------------------------------------------------------------

export class MinesMirror extends Mirror implements MinesSource {
  private r: LiveMines | null = null;
  private hash = '';
  private seed = '';
  private seen = '';

  constructor(sky: Sky, api: Api, wallet: OnlineWallet) {
    super(sky, api, wallet);
    sky.on('snapshot', (d: Snapshot) => this.take(d.mines.round));
    sky.on('mines.round', (d) => this.take(d.round));
    sky.on('mines.run', (d) => {
      if (this.r?.id !== d.round) return;
      const r = this.r!;
      r.runners = r.runners.filter((x) => x.id !== d.runner.id);
      r.runners.push(d.runner);
    });
    sky.on('mines.left', (d) => {
      if (this.r?.id === d.round) this.r!.runners = this.r!.runners.filter((x) => x.id !== d.id);
    });
    sky.on('mines.progress', (d) => {
      if (this.r?.id !== d.round) return;
      const r = this.r!;
      const x = r.runners.find((y) => y.id === d.id);
      if (x) Object.assign(x, { picks: d.picks, mult: d.mult, state: d.state });
      if (d.id === this.wallet.id) this.wallet.refresh();
    });
    sky.on('mines.end', (d) => {
      if (this.r?.id !== d.round) return;
      const r = this.r!;
      r.phase = 'end';
      r.runners = d.runners;
      this.seed = d.seed;
      this.seen = verifySeed(d.seed, this.hash) ? `${OK} the seed matches, and every floor can be laid out again from it` : BAD;
      if (this.mine(d.runners)) this.wallet.refresh();
    });
  }

  private take(round: any): void {
    this.r = round;
    this.hash = round?.hash ?? '';
    this.seed = round?.seed ?? '';
    this.seen = this.seed ? (verifySeed(this.seed, this.hash) ? `${OK} the seed matches` : BAD) : '';
  }

  round(): LiveMines | null {
    return this.r;
  }

  fair(): string {
    if (!this.r) return '';
    return `Floor ${this.r.id} · committed ${shortHash(this.hash)} · ${this.seen || 'the seed is shown when it ends'}`;
  }

  floor(grid: number, mines: number): boolean[] | null {
    if (!this.seed || (grid !== 4 && grid !== 8 && grid !== 16)) return null;
    return floorOf(this.seed, grid, mines);
  }

  async start(amount: number, grid: number, mines: number): Promise<SourceReply<{ endsAt: number }>> {
    const r = await this.send('mines/start', { amount, grid, mines });
    return r.ok ? { ok: true, endsAt: Number(r.endsAt) } : { ok: false, message: r.message };
  }
  async open(index: number): Promise<SourceReply<{ safe: boolean; picks: number; mult: number; state: string; won?: number }>> {
    const r = await this.send('mines/open', { index });
    return r.ok ? { ok: true, safe: !!r.safe, picks: Number(r.picks), mult: Number(r.mult), state: String(r.state), ...(r.won !== undefined ? { won: Number(r.won) } : {}) } : { ok: false, message: r.message };
  }
  async cash(): Promise<SourceReply<{ mult: number; won: number }>> {
    const r = await this.send('mines/cash');
    return r.ok ? { ok: true, mult: Number(r.mult), won: Number(r.won) } : { ok: false, message: r.message };
  }
}

// Poop Plinko ----------------------------------------------------------------------

export class PlinkoMirror extends Mirror implements PlinkoSource {
  private hash = '';
  private epoch = 1;
  private first = 1;
  private drops: LiveDrop[] = [];
  /** This seed's drops, for checking them when it is revealed. */
  private epochDrops: LiveDrop[] = [];
  private seen = '';
  private listeners = new Set<(d: LiveDrop) => void>();

  constructor(sky: Sky, api: Api, wallet: OnlineWallet) {
    super(sky, api, wallet);
    sky.on('snapshot', (d: Snapshot) => {
      this.hash = d.plinko.hash;
      this.epoch = d.plinko.epoch;
      this.first = d.plinko.first;
      this.drops = [...d.plinko.recent];
      this.epochDrops = this.drops.filter((x) => x.n >= this.first);
      this.seen = '';
    });
    sky.on('plinko.drop', (d: { drop: LiveDrop }) => {
      this.add(d.drop);
      if (d.drop.who !== this.wallet.id) for (const f of [...this.listeners]) f(d.drop);
    });
    sky.on('plinko.epoch', (d) => {
      this.hash = d.hash;
      this.epoch = d.epoch;
      this.first = d.first;
      this.epochDrops = [];
    });
    sky.on('plinko.reveal', (d) => {
      const mine = this.epochDrops.filter((x) => x.n >= d.first && x.n <= d.last);
      const ok = verifySeed(d.seed, d.hash) && mine.every((x) => plinkoPathOf(d.seed, x.n, x.rows).map((b) => (b ? '1' : '0')).join('') === x.path);
      this.seen = ok ? `${OK} seed ${d.epoch} matches, and ${mine.length} drops were worked out again here` : BAD;
    });
  }

  private add(d: LiveDrop): void {
    if (this.drops.some((x) => x.n === d.n && x.who === d.who)) return;
    this.drops.push(d);
    if (this.drops.length > 12) this.drops.shift();
    if (d.n >= this.first) {
      this.epochDrops.push(d);
      if (this.epochDrops.length > 300) this.epochDrops.shift();
    }
  }

  recent(): readonly LiveDrop[] {
    return [...this.drops].reverse();
  }

  fair(): string {
    return `Seed ${this.epoch} · committed ${shortHash(this.hash)} · ${this.seen || 'the seed is shown after a hundred drops'}`;
  }

  onDrop(f: (d: LiveDrop) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  release(coins: number): void {
    this.wallet.release(coins);
  }

  async drop(amount: number, rows: number, risk: string): Promise<SourceReply<{ drop: LiveDrop; won: number }>> {
    const ctl = await this.api.post('plinko/drop', { amount, rows, risk });
    // The win is already in your wallet on the server: keep it back until the poop lands.
    if (ctl.ok) this.wallet.hold(Number(ctl.won) || 0);
    if (ctl.me) this.wallet.applyMe(ctl.me);
    if (!ctl.ok) return { ok: false, message: ctl.message };
    this.add(ctl.drop);
    return { ok: true, drop: ctl.drop, won: Number(ctl.won) || 0 };
  }
}

// Hammy Slots -----------------------------------------------------------------------

export class SlotsMirror extends Mirror implements SlotsSource {
  private hash = '';
  private epoch = 1;
  /** Big wins, oldest first. */
  private bigs: LiveBig[] = [];
  /** This page's own spins in the seed's epoch (and the big wins others were told of), for checking them when it is revealed. */
  private spins: { n: number; units: number; stops: number[] }[] = [];
  private seen = '';
  private listeners = new Set<(w: LiveBig) => void>();

  constructor(sky: Sky, api: Api, wallet: OnlineWallet) {
    super(sky, api, wallet);
    sky.on('snapshot', (d: Snapshot) => {
      this.hash = d.slots.hash;
      this.epoch = d.slots.epoch;
      this.bigs = [...d.slots.feed];
      this.spins = [];
      this.seen = '';
    });
    sky.on('slots.big', (d: { win: LiveBig }) => {
      this.addBig(d.win);
      // Your own win is already on your reels: it would only spoil them.
      if (d.win.who !== this.wallet.id) for (const f of [...this.listeners]) f(d.win);
    });
    sky.on('slots.epoch', (d) => {
      this.hash = d.hash;
      this.epoch = d.epoch;
      this.spins = [];
    });
    sky.on('slots.reveal', (d) => {
      const own = this.spins.filter((x) => x.n >= d.first && x.n <= d.last);
      const told = this.bigs.filter((b) => b.real && b.n >= d.first && b.n <= d.last);
      const same = (x: { n: number; units: number; stops: number[] }) => {
        const again = slotsSpinOf(d.seed, x.n);
        return again.units === x.units && again.stops.join() === x.stops.join();
      };
      const ok = verifySeed(d.seed, d.hash) && own.every(same) && told.every((b) => slotsSpinOf(d.seed, b.n).mult === b.mult);
      this.seen = ok ? `${OK} seed ${d.epoch} matches, and ${own.length} of your spins${told.length ? ` and ${told.length} big wins` : ''} were worked out again here` : BAD;
    });
  }

  private addBig(w: LiveBig): void {
    if (this.bigs.some((x) => x.who === w.who && x.at === w.at && x.n === w.n)) return;
    this.bigs.push(w);
    if (this.bigs.length > 8) this.bigs.shift();
  }

  feed(): readonly LiveBig[] {
    return [...this.bigs].reverse();
  }

  fair(): string {
    return `Seed ${this.epoch} · committed ${shortHash(this.hash)} · ${this.seen || 'the seed is shown after a hundred spins'}`;
  }

  onBig(f: (w: LiveBig) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  release(coins: number): void {
    this.wallet.release(coins);
  }

  async spin(amount: number): Promise<SourceReply<{ spin: SlotSpin; won: number }>> {
    const ctl = await this.api.post('slots/spin', { amount });
    // The win is already in your wallet on the server: keep it back until the reels have stopped.
    if (ctl.ok) this.wallet.hold(Number(ctl.won) || 0);
    if (ctl.me) this.wallet.applyMe(ctl.me);
    if (!ctl.ok) return { ok: false, message: ctl.message };
    if (typeof ctl.n === 'number') {
      this.spins.push({ n: ctl.n, units: ctl.spin.units, stops: ctl.spin.stops });
      if (this.spins.length > 300) this.spins.shift();
    }
    return { ok: true, spin: ctl.spin as SlotSpin, won: Number(ctl.won) || 0 };
  }
}

// The leaderboard -------------------------------------------------------------------

/** The top ten of every list, kept up to date from the sky, and where this player stands (asked of the server). */
export class BoardMirror extends Mirror {
  state: BoardState | null = null;
  standing: BoardMine | null = null;
  private listeners = new Set<() => void>();
  private timer = 0;
  private last = 0;

  constructor(sky: Sky, api: Api, wallet: OnlineWallet) {
    super(sky, api, wallet);
    sky.on('snapshot', (d: Snapshot) => {
      this.state = d.board ?? null;
      this.changed();
      this.ask(0);
    });
    sky.on('board', (d: { board: BoardKind; period: BoardPeriod; rows: BoardRow[]; weekStart: number; weekEnd: number }) => {
      if (!this.state) return;
      this.state.lists[d.board][d.period] = d.rows;
      this.state.weekStart = d.weekStart;
      this.state.weekEnd = d.weekEnd;
      this.changed();
      this.ask();
    });
    sky.on('renamed', (d: { id: string; name: string }) => {
      const each = (rows: (BoardRow | null)[]) => rows.forEach((r) => r && r.who === d.id && (r.name = d.name));
      if (this.state) for (const k of Object.values(this.state.lists)) each([...k.week, ...k.all]);
      if (this.standing) for (const k of Object.values(this.standing)) each([k.week, k.all]);
      this.changed();
    });
  }

  onChange(f: () => void): void {
    this.listeners.add(f);
  }

  private changed(): void {
    for (const f of [...this.listeners]) f();
  }

  /** Ask where this player stands, soon, and no more than every couple of seconds. */
  ask(delay = 600): void {
    if (this.timer) return;
    const wait = Math.max(delay, this.last + 2500 - Date.now());
    this.timer = window.setTimeout(async () => {
      this.timer = 0;
      this.last = Date.now();
      const r = await this.api.post('board');
      if (!r.ok || !r.mine) return;
      this.standing = r.mine as BoardMine;
      this.changed();
    }, wait);
  }
}
