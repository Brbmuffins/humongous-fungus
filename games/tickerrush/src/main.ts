import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/latin-800.css';
import '@fontsource/rubik/latin-900-italic.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-700.css';
import './styles.css';

import { CloudSave, localSave as makeLocalSave } from '@shared/storage';
import type { Mark } from './chart';
import { DAY_LENGTHS, DAY_MINUTES, GOAL, SIZES, SIZE_ORDER, STEP, STOCKS, type SizeId, type StockId, type ToolId } from './defs';
import { Desk, type Fill, type Reject } from './desk';
import { Hud, money, signed, type HudActions } from './hud';
import { Market, type DayEvent } from './market';
import { buyTool, deskOptions, finishDay, has, loadCareer, newCareer, settleLeftDay, setupFor, type Career, type DaySummary, type Settings } from './meta';
import { buzz, isNative, nativeSave, onAppState } from './native';
import { render, type Controller, type Screen } from './screens';
import { setSound, sfx, suspend, unlock } from './sound';

const localSave = makeLocalSave('tickerrush.save.v1');
const CLOUD_SAVE_MS = 30_000;
const MAX_STEPS_PER_FRAME = 80;
/** Screens you visit and come back from. */
const SIDE: readonly Screen[] = ['tools', 'records', 'settings', 'help'];

const REJECT: Record<Reject, string> = {
  halted: 'Halted: wait for it to reopen',
  closed: 'The market is closed',
  locked: 'The risk desk has your keys',
  'no-room': 'No buying power left',
  flat: 'Nothing to close',
};

interface HotData {
  save?: string;
  native?: string | null;
}
interface HotApi {
  ready?: (start: (data?: HotData) => void) => void;
  snapshot?: (fn: () => HotData) => void;
  data?: HotData;
}

const seed = () => (Math.random() * 2 ** 32) >>> 0;

class Game implements Controller, HudActions {
  career: Career;
  today: Market | null = null;
  summary: DaySummary | null = null;
  /** What's on screen: today's market, or a demo behind the menus. */
  private market: Market;
  /** The market on screen is a demo, not a trading day. */
  private demoing = true;
  private desk: Desk | null = null;
  private hud: Hud;
  private selected: StockId;
  private live = false;
  private paused = false;
  private screen: Screen | null = null;
  private from: Screen = 'title';
  private acc = 0;
  private last = 0;
  private fills = new Map<StockId, Mark[]>();
  private goalSaid = false;
  private halts = 0;
  private cloud = new CloudSave();
  private lastCloud = 0;
  private hadSave: boolean;
  private screenEl = document.getElementById('screen')!;

  constructor(hot: HotData) {
    const saves = [hot.save, hot.native, localSave.load()].map((raw) => loadCareer(raw ?? null)).filter((c): c is Career => c !== null);
    const loaded = saves.reduce<Career | null>((best, c) => (!best || c.updatedAt > best.updatedAt ? c : best), null);
    this.hadSave = loaded !== null;
    this.career = loaded ?? newCareer(seed());
    setSound(this.career.settings.sound);
    this.hud = new Hud(this);
    this.market = this.demo();
    this.selected = this.market.tickers[0].def.id;
    this.hud.setup(this.market);
    const left = settleLeftDay(this.career);
    if (left) {
      this.summary = left;
      this.save(true);
      this.show('summary');
      this.hud.toast(`You left mid-session: the desk closed you out at ${money(left.equity)} (${signed(left.pnl)}).`, 5000);
    } else this.show('title');
    this.bind();
    if (!isNative) void this.connectCloud();
    requestAnimationFrame(this.frame);
  }

  // -------------------------------------------------------------------------
  // The loop

  private frame = (now: number): void => {
    const real = Math.min(0.25, Math.max(0, (now - (this.last || now)) / 1000));
    this.last = now;
    const running = this.live ? !this.paused : this.demoing;
    if (running) {
      this.acc += real * this.stepsPerSecond();
      let n = Math.min(MAX_STEPS_PER_FRAME, Math.floor(this.acc));
      this.acc -= Math.floor(this.acc);
      while (n-- > 0 && !this.market.done) this.step();
      if (this.demoing && this.market.done) this.swapDemo();
    }
    this.hud.update(
      {
        market: this.market,
        desk: this.desk,
        selected: this.selected,
        size: this.career.settings.size,
        level2: has(this.career, 'level2'),
        fills: this.fills.get(this.selected) ?? [],
        pace: this.pace(),
      },
      now,
    );
    requestAnimationFrame(this.frame);
  };

  /** Market minutes per real second. */
  private pace(): number {
    return DAY_MINUTES / DAY_LENGTHS[this.career.settings.length].seconds;
  }

  private stepsPerSecond(): number {
    return this.pace() / STEP;
  }

  private step(): void {
    const m = this.market;
    const events = m.step();
    if (!this.live || !this.desk) return;
    for (const e of events) this.onEvent(e);
    for (const f of this.desk.check(m)) this.onFill(f);
    if (!this.goalSaid && this.desk.dayPnl(m) >= this.desk.startEquity * GOAL) {
      this.goalSaid = true;
      this.hud.banner('GOAL HIT', `${signed(this.desk.dayPnl(m), false)} today. Keep it or press it?`, 'up');
      this.hud.confetti();
      sfx.goal();
      this.buzz('success');
    }
    if (m.done) this.endDay();
  }

  private onEvent(e: DayEvent): void {
    const m = this.market;
    switch (e.kind) {
      case 'news': {
        this.hud.breaking(e.news);
        sfx.news();
        this.tip('news', 'Breaking news moves prices. Tap the headline to jump to that stock, then be quick.');
        break;
      }
      case 'halt': {
        this.halts++;
        const mine = e.id === this.selected || this.desk?.positions.has(e.id);
        if (mine || has(this.career, 'scanner')) {
          sfx.halt();
          this.hud.toast(`⏸ ${e.id} halted ${e.up ? 'up' : 'down'}: too far, too fast.`, 2600);
          this.buzz('heavy');
        }
        if (mine) this.tip('halt', 'Halted! It reopens in a few seconds, often with a jump. You can\'t trade it until then.');
        break;
      }
      case 'resume': {
        if (e.id === this.selected) this.hud.float(`REOPENED ${e.gap >= 0 ? '+' : '−'}${Math.abs(e.gap * 100).toFixed(1)}%`, e.gap >= 0 ? 'up' : 'down');
        break;
      }
      case 'candle': {
        // A checkpoint, in case the app closes mid-session.
        if (this.desk) {
          this.career.live = { day: this.career.day, equity: this.desk.equity(m) };
          this.save();
        }
        break;
      }
      case 'power': {
        this.hud.banner('POWER HOUR', 'The last hour gets busy', 'info');
        break;
      }
      case 'close':
        break;
    }
  }

  private onFill(f: Fill): void {
    const list = this.fills.get(f.id) ?? [];
    list.push({ t: this.market.t, price: f.price, side: f.qty > 0 ? 1 : -1 });
    this.fills.set(f.id, list);
    sfx.fill(f.qty > 0 ? 1 : -1);
    this.buzz('tap');
    if (f.why === 'stop') this.hud.float(`STOPPED OUT ${f.id}`, 'down');
    if (f.why === 'target') this.hud.float(`TARGET HIT ${f.id}`, 'up');
    if (f.why === 'risk' && this.desk?.locked) {
      this.hud.banner('RISK DESK', 'You hit the daily loss limit. Keys taken till tomorrow.', 'down');
      sfx.locked();
      this.buzz('bad');
    }
    const t = f.closed;
    if (t) {
      const big = t.pnl > this.desk!.startEquity * 0.01;
      this.hud.float(signed(t.pnl), t.pnl >= 0 ? (big ? 'big' : 'up') : 'down');
      if (t.pnl >= 0) {
        sfx.win(big);
        if (big) this.hud.confetti();
        this.buzz('success');
      } else sfx.loss();
    } else if (f.why === 'manual') {
      this.tip('filled', `You're ${f.qty > 0 ? 'long' : 'short'}. Watch the P&L, then close with the other button.`);
    }
  }

  // -------------------------------------------------------------------------
  // Days

  premarket(): void {
    this.today = new Market(setupFor(this.career));
    this.market = this.today;
    this.demoing = false;
    this.desk = null;
    this.live = false;
    this.fills.clear();
    const gapper = [...this.today.tickers].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0];
    this.selected = gapper.def.id;
    this.hud.setup(this.today);
    this.show('premarket');
  }

  ringBell(): void {
    if (!this.today) return this.premarket();
    this.market = this.today;
    this.desk = new Desk(this.career.cash, deskOptions(this.career));
    this.live = true;
    this.paused = false;
    this.goalSaid = false;
    this.halts = 0;
    this.acc = 0;
    this.career.live = { day: this.career.day, equity: this.career.cash };
    this.save(true);
    this.hide();
    sfx.bell();
    this.hud.banner('OPENING BELL', `Day ${this.career.day} · 9:30`, 'info');
    this.tip('start', 'Tap BUY if you think it goes up, SHORT if you think it goes down. The other button closes it.');
  }

  private endDay(): void {
    const m = this.market;
    const desk = this.desk;
    if (!this.live || !desk) return;
    for (const f of desk.check(m)) this.onFill(f);
    this.live = false;
    const closes = Object.fromEntries(m.tickers.map((tk) => [tk.def.id, tk.price]));
    this.summary = finishDay(this.career, { equity: desk.equity(m), trades: desk.trades, fees: desk.fees, closes, halts: this.halts, locked: desk.locked });
    this.today = null;
    this.save(true);
    sfx.bell();
    this.hud.banner('CLOSING BELL', `${signed(this.summary.pnl)} today`, this.summary.pnl >= 0 ? 'up' : 'down');
    window.setTimeout(() => {
      if (!this.live) this.show('summary');
    }, 1500);
  }

  endEarly(): void {
    if (!this.live || !this.desk) return;
    for (const f of this.desk.flattenAll(this.market, 'close')) this.onFill(f);
    this.paused = false;
    // Skip to the bell: nothing left to trade.
    while (!this.market.done) this.market.step();
    this.endDay();
  }

  private demo(): Market {
    const ids = [...STOCKS].sort(() => Math.random() - 0.5).slice(0, 5).map((s) => s.id);
    const m = new Market({ seed: seed(), day: 1, ids, closes: {}, lead: 0 });
    // Start it mid-morning, so there's a chart to look at.
    for (let i = 0; i < 600; i++) m.step();
    return m;
  }

  private swapDemo(): void {
    this.market = this.demo();
    this.demoing = true;
    this.desk = null;
    this.fills.clear();
    this.selected = this.market.tickers[0].def.id;
    this.hud.setup(this.market);
  }

  // -------------------------------------------------------------------------
  // Actions from the HUD

  select(id: StockId): void {
    if (!this.market.has(id)) return;
    this.selected = id;
    sfx.click();
  }

  order(side: 1 | -1): void {
    if (!this.live || this.paused || !this.desk) return;
    const r = this.desk.order(this.market, this.selected, side, SIZES[this.career.settings.size].share);
    if (typeof r === 'string') {
      sfx.reject();
      this.hud.float(REJECT[r], 'info');
      return;
    }
    this.onFill(r);
  }

  private closeSelected(): void {
    if (!this.live || this.paused || !this.desk) return;
    const r = this.desk.close(this.market, this.selected, 'manual');
    if (typeof r === 'string') {
      if (r !== 'flat') this.hud.float(REJECT[r], 'info');
      return;
    }
    this.onFill(r);
  }

  size(id: SizeId): void {
    this.career.settings.size = id;
    sfx.click();
  }

  flattenAll(): void {
    if (!this.live || this.paused || !this.desk) return;
    for (const f of this.desk.flattenAll(this.market, 'manual')) this.onFill(f);
  }

  pause(): void {
    if (this.live) {
      this.paused = true;
      this.show('pause');
    } else if (!this.screen) this.show('title');
  }

  resume(): void {
    this.paused = false;
    this.last = 0;
    this.hide();
  }

  // -------------------------------------------------------------------------
  // Screens

  show(s: Screen): void {
    if (SIDE.includes(s) && this.screen && !SIDE.includes(this.screen)) this.from = this.screen;
    if (s === 'title' && !this.live && !this.demoing) {
      // Back on the menu: a demo plays behind it again.
      this.today = null;
      this.swapDemo();
    }
    this.screen = s;
    this.screenEl.replaceChildren(render(s, this));
    this.screenEl.hidden = false;
    this.screenEl.scrollTop = 0;
    this.screenEl.dataset.screen = s;
  }

  back(): void {
    this.show(this.live ? 'pause' : this.from);
  }

  private hide(): void {
    this.screen = null;
    this.screenEl.hidden = true;
  }

  buyTool(id: ToolId): void {
    if (this.live) return;
    if (buyTool(this.career, id)) {
      sfx.buyTool();
      this.save(true);
    }
    this.show('tools');
  }

  set<K extends keyof Settings>(k: K, v: Settings[K]): void {
    this.career.settings[k] = v;
    setSound(this.career.settings.sound);
    if (this.desk && (k === 'stop' || k === 'target') && this.desk.opts.brackets) this.desk.opts.brackets = { stop: this.career.settings.stop, target: this.career.settings.target };
    this.save();
    this.show('settings');
  }

  resetCareer(): void {
    this.career = newCareer(seed());
    this.live = false;
    this.desk = null;
    this.today = null;
    this.summary = null;
    setSound(true);
    this.save(true);
    this.show('title');
  }

  private tip(id: string, text: string): void {
    if (this.career.tips.includes(id)) return;
    this.career.tips.push(id);
    this.hud.toast(text, 4500);
  }

  private buzz(kind: 'tap' | 'heavy' | 'success' | 'bad'): void {
    if (!this.career.settings.haptics) return;
    if (kind === 'tap') buzz.tap();
    else if (kind === 'heavy') buzz.heavy();
    else if (kind === 'success') buzz.success();
    else buzz.bad();
  }

  // -------------------------------------------------------------------------
  // Input, saves

  private bind(): void {
    const first = () => unlock();
    window.addEventListener('pointerdown', first);
    window.addEventListener('keydown', first);
    window.addEventListener('resize', () => this.hud.chart.resize());
    new ResizeObserver(() => this.hud.chart.resize()).observe(document.getElementById('chart')!);
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'p' || k === 'escape') {
        if (this.live && this.paused) this.resume();
        else this.pause();
        e.preventDefault();
        return;
      }
      if (this.screen) return;
      const ids = this.market.tickers.map((tk) => tk.def.id);
      const i = ids.indexOf(this.selected);
      if (k === 'b') this.order(1);
      else if (k === 's') this.order(-1);
      else if (k === 'x') this.closeSelected();
      else if (k === 'f') this.flattenAll();
      else if (k >= '1' && k <= '4') this.size(SIZE_ORDER[Number(k) - 1]);
      else if (k === 'arrowright' || k === 'arrowdown') this.select(ids[(i + 1) % ids.length]);
      else if (k === 'arrowleft' || k === 'arrowup') this.select(ids[(i - 1 + ids.length) % ids.length]);
      else return;
      e.preventDefault();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.background();
      else suspend(false);
    });
    onAppState({
      background: () => this.background(),
      foreground: () => suspend(false),
      back: () => {
        if (this.live && !this.paused) {
          this.pause();
          return true;
        }
        if (this.screen && SIDE.includes(this.screen)) {
          this.back();
          return true;
        }
        return false;
      },
    });
  }

  private background(): void {
    if (this.live && !this.paused) this.pause();
    suspend(true);
    this.save(true);
  }

  private save(cloud = false): void {
    this.career.updatedAt = Date.now();
    const raw = JSON.stringify(this.career);
    localSave.save(raw);
    nativeSave.save(raw);
    const now = Date.now();
    if (cloud || now - this.lastCloud > CLOUD_SAVE_MS) {
      this.lastCloud = now;
      void this.cloud.save(raw);
    }
  }

  private async connectCloud(): Promise<void> {
    if (!(await this.cloud.connect())) return;
    const remote = loadCareer(await this.cloud.load());
    // The cloud copy wins if it's newer (another device), or on a new device.
    if (remote && !this.live && (remote.updatedAt > this.career.updatedAt + 5_000 || !this.hadSave)) {
      this.career = remote;
      setSound(remote.settings.sound);
      const left = settleLeftDay(this.career);
      if (left) this.summary = left;
      localSave.save(JSON.stringify(this.career));
      if (this.screen) this.show(left ? 'summary' : this.screen === 'premarket' ? 'title' : this.screen);
    } else this.save(true);
  }

  snapshot(): HotData {
    return { save: JSON.stringify(this.career) };
  }
}

async function start(data?: HotData): Promise<void> {
  const native = await nativeSave.load();
  const game = new Game({ ...data, native });
  hot?.snapshot?.(() => game.snapshot());
}

const hot = (window as unknown as { claude?: { hot?: HotApi } }).claude?.hot;
if (hot?.ready) hot.ready((data) => void start(data));
else void start(hot?.data ?? {});
