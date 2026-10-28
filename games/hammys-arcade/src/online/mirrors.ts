// What this page knows about each game's shared round: a copy kept up to date
// from the sky's events, and the calls that send your choices to the server.
// They are the "round sources" the screens in games/hammygotchi/src draw from.
import type { DealEvent } from '@hammygotchi/deal';
import type { CrossingSource, DealReaction, DealSource, LiveCrossing, LiveDealTable, LiveDrop, LiveMines, LiveRocket, MinesSource, PlinkoSource, RocketSource, SourceReply } from '@hammygotchi/roundsource';
import { causeOf, crashOf, dealLayoutOf, floorOf, laneRoll, plinkoPathOf, truckOf } from '../../shared/derive';
import { shortHash, verifySeed } from '../../shared/fair';
import { DEAL_REACTS, type DealTable, type Snapshot } from '../../shared/protocol';
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

// Pizza Boxes ----------------------------------------------------------------------

/** How long winnings from a kept box stay out of the coin count if the screen never says the reveal is over. */
const HOLD_MAX_MS = 5000;
/** Rounds that just ended, kept so a page that is looking at one can still show how it came out. */
const ENDED_KEPT = 12;

export class DealMirror extends Mirror implements DealSource {
  readonly reacts: readonly string[] = DEAL_REACTS;
  private tables = new Map<number, LiveDealTable>();
  private ended = new Map<number, LiveDealTable>();
  private seen = new Map<number, string>();
  private mineId = 0;
  private held = 0;
  private holdTimer: ReturnType<typeof setTimeout> | undefined;
  /** Requests of ours in flight: their answers carry the coins, so the sky need not ask. */
  private acting = 0;
  private steps = new Set<(t: LiveDealTable, events: DealEvent[]) => void>();
  private cheers = new Set<(r: DealReaction) => void>();
  private changes = new Set<() => void>();

  constructor(sky: Sky, api: Api, wallet: OnlineWallet) {
    super(sky, api, wallet);
    sky.on('snapshot', (d: Snapshot) => {
      const mine = this.tables.get(this.mineId);
      this.tables = new Map(d.deal.live.map((t) => [t.id, { ...t }]));
      if (mine && !this.tables.has(mine.id) && mine.phase !== 'done') this.tables.set(mine.id, mine);
      const own = d.deal.live.find((t) => t.who === this.wallet.id && t.phase !== 'done');
      if (own) this.mineId = own.id;
      this.changed();
      void this.resume();
    });
    sky.on('deal.step', (d: { table: DealTable; events?: DealEvent[] }) => this.take(d.table, d.events ?? [], false));
    sky.on('deal.react', (d: DealReaction) => {
      for (const f of [...this.cheers]) f(d);
    });
  }

  private changed(): void {
    for (const f of [...this.changes]) f();
  }

  /** A step of some round, from the sky or from the answer to our own request. */
  private take(t: DealTable, events: DealEvent[], fromReply: boolean): void {
    const known = this.tables.get(t.id) ?? this.ended.get(t.id);
    if (known && t.v <= known.v) {
      // Nothing new, but a snapshot may have brought a round of ours that we have not yet claimed (a page that came back).
      if (t.who === this.wallet.id && t.phase !== 'done' && this.mineId !== t.id) {
        this.mineId = t.id;
        this.changed();
      }
      return;
    }
    const lt: LiveDealTable = { ...t };
    if (t.phase === 'done') this.verify(lt);
    if (t.phase === 'done') {
      this.tables.delete(t.id);
      this.ended.set(t.id, lt);
      for (const k of [...this.ended.keys()].slice(0, Math.max(0, this.ended.size - ENDED_KEPT))) this.ended.delete(k);
    } else {
      this.tables.set(t.id, lt);
    }
    const mine = t.who === this.wallet.id;
    if (mine) {
      this.mineId = t.phase === 'done' ? 0 : t.id;
      // Settled by the server on its own (the clock ran out): the coins changed without us asking.
      if (t.phase === 'done' && !fromReply && !this.acting) this.wallet.refresh();
    }
    for (const f of [...this.steps]) f(lt, events);
    this.changed();
  }

  /** The seed is out: check it is the one that was promised, and lay the whole floor out again. */
  private verify(t: LiveDealTable): void {
    if (!t.seed) return;
    let good = verifySeed(t.seed, t.hash);
    if (good) {
      const all = dealLayoutOf(t.seed).prizes;
      const o = t.outcome;
      good = t.opened.every((x) => all[x.box] === x.prize) && (!o || o.box === null || all[o.box] === o.boxPrize);
      if (good) t.all = all;
    }
    this.seen.set(t.id, good ? `${OK} the seed matches, and every box was laid out again here` : BAD);
  }

  /** Ask for our own round (we may have one from before the page was closed or the server restarted). */
  async resume(): Promise<void> {
    if (!this.api.secret) return;
    const r = await this.api.post('deal/mine');
    if (!r.ok) return;
    if (r.table) this.take(r.table as DealTable, [], true);
    else if (this.mineId) {
      // It ended while we were away.
      this.mineId = 0;
      this.wallet.refresh();
      this.changed();
    }
  }

  live(): readonly LiveDealTable[] {
    return [...this.tables.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  mineTable(): LiveDealTable | null {
    return this.tables.get(this.mineId) ?? null;
  }

  table(id: number): LiveDealTable | null {
    return this.tables.get(id) ?? this.ended.get(id) ?? null;
  }

  fair(): string {
    return this.fairOf(this.mineId);
  }

  fairOf(id: number): string {
    const t = this.table(id);
    if (!t) return '';
    return `Round ${t.id} · committed ${shortHash(t.hash)} · ${this.seen.get(id) || 'the seed is shown when it ends'}`;
  }

  onStep(f: (t: LiveDealTable, events: DealEvent[]) => void): () => void {
    this.steps.add(f);
    return () => this.steps.delete(f);
  }

  onReact(f: (r: DealReaction) => void): () => void {
    this.cheers.add(f);
    return () => this.cheers.delete(f);
  }

  onChange(f: () => void): () => void {
    this.changes.add(f);
    return () => this.changes.delete(f);
  }

  /** Keep winnings out of the coin count until the box has been opened on screen. */
  private hold(coins: number): void {
    if (coins <= 0) return;
    this.release();
    this.held = coins;
    this.wallet.hold(coins);
    this.holdTimer = setTimeout(() => this.release(), HOLD_MAX_MS);
  }

  release(): void {
    clearTimeout(this.holdTimer);
    if (!this.held) return;
    const n = this.held;
    this.held = 0;
    this.wallet.release(n);
  }

  private async act(path: string, body: Record<string, unknown> = {}): Promise<Answer> {
    this.acting += 1;
    try {
      const r = await this.api.post(path, body);
      const ok = r.ok ? r : null;
      const t = ok?.table as DealTable | undefined;
      // A box that is kept pays at once on the server, but is only opened on screen a moment later.
      const how = t?.outcome?.how;
      if (t && t.phase === 'done' && how && how !== 'deal' && how !== 'left-offer' && how !== 'refund') this.hold(Number(ok?.won) || 0);
      if (r.me) this.wallet.applyMe(r.me);
      if (t) this.take(t, (ok?.events as DealEvent[] | undefined) ?? [], true);
      return r;
    } finally {
      this.acting -= 1;
    }
  }

  async bet(amount: number): Promise<SourceReply<{ table: LiveDealTable; won: number }>> {
    const r = await this.act('deal/bet', { amount });
    const t = r.ok ? this.table(Number((r.table as DealTable | undefined)?.id)) : null;
    return r.ok && t ? { ok: true, table: t, won: 0 } : { ok: false, message: r.ok ? 'The arcade did not answer properly.' : r.message };
  }
  async pick(box: number): Promise<SourceReply> {
    return this.plain(await this.act('deal/pick', { box }));
  }
  async open(box: number): Promise<SourceReply> {
    return this.plain(await this.act('deal/open', { box }));
  }
  async answer(deal: boolean): Promise<SourceReply<{ won: number }>> {
    const r = await this.act('deal/answer', { deal });
    return r.ok ? { ok: true, won: Number(r.won) || 0 } : { ok: false, message: r.message };
  }
  async swap(swapIt: boolean): Promise<SourceReply<{ won: number }>> {
    const r = await this.act('deal/swap', { swap: swapIt });
    return r.ok ? { ok: true, won: Number(r.won) || 0 } : { ok: false, message: r.message };
  }
  async leave(): Promise<SourceReply<{ won: number }>> {
    const r = await this.act('deal/leave');
    return r.ok ? { ok: true, won: Number(r.won) || 0 } : { ok: false, message: r.message };
  }
  async react(table: number, r: number): Promise<SourceReply> {
    return this.plain(await this.send('deal/react', { table, r }));
  }
}
