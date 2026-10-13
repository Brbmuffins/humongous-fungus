import '@fontsource/gluten/latin-700.css';
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-500.css';
import '@fontsource/figtree/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles.css';

import { fmt } from '@shared/format';
import { CloudSave, localSave as makeLocalSave } from '@shared/storage';
import { GOODS, GOOD_BY_ID, RANKS, UPGRADE_BY_ID, type GoodId, type UpgradeId } from './defs';
import { buy, buyUpgrade, forage, mostYouCanBuy, rankIndex, sell, step, type AwayReport } from './game';
import { TownScene } from './scene';
import { deserialize, newGame, serialize, type SporeState } from './state';
import { GameUI, type Controller } from './ui';
import { askForReminders, buzz, clearReminders, isNative, nativeSave, onAppState, scheduleReminder } from './native';

const localSave = makeLocalSave('sporemonger.save.v1', ['sporeggar.save.v1']);
const LOCAL_SAVE_MS = 5_000;
const CLOUD_SAVE_MS = 60_000;

interface HotData {
  save?: string;
  /** Save from the phone's own storage (native app only). */
  native?: string | null;
}
interface HotApi {
  ready?: (start: (data?: HotData) => void) => void;
  snapshot?: (fn: () => HotData) => void;
  data?: HotData;
}

/** Of several saves, the one simulated most recently. */
function newest(saves: SporeState[]): SporeState | null {
  return saves.reduce<SporeState | null>((best, s) => (!best || s.updatedAt > best.updatedAt ? s : best), null);
}

class Game implements Controller {
  state: SporeState;
  private ui: GameUI;
  private scene: TownScene;
  private cloud = new CloudSave();
  private canvas = document.getElementById('scene') as HTMLCanvasElement;
  private lastUi = 0;
  private lastLocal = 0;
  private lastCloud = 0;
  private cloudDirty = false;
  private rank: number;
  private hadSave: boolean;

  constructor(hot: HotData) {
    const saves = [hot.save, hot.native, localSave.load()]
      .map((raw) => (raw ? deserialize(raw) : null))
      .filter((s): s is SporeState => s !== null);
    const loaded = newest(saves);
    this.hadSave = loaded !== null;
    this.state = loaded ?? newGame(Date.now());
    this.rank = rankIndex(this.state);
    this.scene = new TownScene(this.canvas, this.state.seed);
    this.ui = new GameUI(this);
    const report = step(this.state, Date.now());
    this.rank = rankIndex(this.state);
    if (!loaded) this.ui.showIntro();
    else if (report) this.welcome(report);
    this.bind();
    void clearReminders();
    if (!isNative) void this.connectCloud();
    requestAnimationFrame(this.frame);
  }

  private frame = (t: number): void => {
    const now = Date.now();
    const report = step(this.state, now);
    if (report) this.welcome(report);
    this.checkRank();
    this.scene.draw(t);
    this.ui.updateHeader();
    if (now - this.lastUi > 200) {
      this.ui.sync();
      this.lastUi = now;
    }
    if (now - this.lastLocal > LOCAL_SAVE_MS) this.saveLocal(now);
    if (this.cloudDirty && now - this.lastCloud > CLOUD_SAVE_MS) this.saveCloud(now);
    requestAnimationFrame(this.frame);
  };

  private welcome(report: AwayReport): void {
    if (this.ui.modalOpen) return;
    this.ui.showWelcome(report);
  }

  private checkRank(): void {
    const r = rankIndex(this.state);
    if (r <= this.rank) return;
    this.rank = r;
    buzz.success();
    const goods = GOODS.filter((g) => g.rank === r).map((g) => g.name.toLowerCase());
    this.ui.toast(`You're a ${RANKS[r].name.toLowerCase()} now.${goods.length ? ` The ${goods.join(' and ')} sellers will deal with you.` : ''}`);
    this.cloudDirty = true;
    this.ui.sync();
  }

  private bind(): void {
    const doForage = (x: number, y: number) => {
      const v = forage(this.state);
      this.scene.burst(x, y, `+${fmt(v)} ${v === 1 ? 'cap' : 'caps'}`);
      buzz.tap();
      this.cloudDirty = true;
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      doForage(e.clientX - rect.left, e.clientY - rect.top);
    });
    this.canvas.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      doForage(rect.width / 2, rect.height * 0.6);
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    new ResizeObserver(() => this.scene.resize()).observe(this.canvas);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.persist();
    });
    window.addEventListener('pagehide', () => this.persist());
    onAppState({
      background: () => {
        this.persist();
        void scheduleReminder(this.state);
      },
      foreground: () => void clearReminders(),
      back: () => {
        if (!this.ui.modalOpen) return false;
        this.ui.closeModal();
        return true;
      },
    });
  }

  // Controller ---------------------------------------------------------------

  buy(id: GoodId, amount: number | 'max'): void {
    const n = amount === 'max' ? mostYouCanBuy(this.state, id) : amount;
    if (!buy(this.state, id, n)) return;
    buzz.trade();
    // Holding stock is when a heads-up about prices becomes useful.
    void askForReminders();
    this.changed();
  }

  sell(id: GoodId, amount: number | 'all'): void {
    const held = this.state.market.goods[id].held;
    // "Sell 10" of 9.98 rotting crates sells them all.
    const n = amount === 'all' || amount >= Math.round(held) ? held : amount;
    const value = sell(this.state, id, n);
    if (value <= 0) return;
    buzz.trade();
    if (n >= held) this.ui.toast(`Sold your ${GOOD_BY_ID[id].units} for ${fmt(value)} caps`);
    this.changed();
  }

  upgrade(id: UpgradeId): void {
    if (!buyUpgrade(this.state, id)) return;
    buzz.success();
    this.ui.toast(`${UPGRADE_BY_ID[id].name} improved`);
    this.changed(true);
  }

  eraseSave(): void {
    Object.assign(this.state, newGame(Date.now()));
    this.rank = 0;
    localSave.clear();
    nativeSave.clear();
    this.ui.setTab('trade');
    this.changed(true);
    this.ui.showIntro();
  }

  refresh(): void {
    this.ui.sync();
  }

  private changed(saveNow = false): void {
    this.cloudDirty = true;
    this.ui.sync();
    if (saveNow) this.persist();
  }

  // Saving -------------------------------------------------------------------

  private saveLocal(now: number): void {
    const raw = serialize(this.state);
    localSave.save(raw);
    nativeSave.save(raw);
    this.lastLocal = now;
  }

  private saveCloud(now: number): void {
    if (!this.cloud.ready) return;
    void this.cloud.save(serialize(this.state));
    this.lastCloud = now;
    this.cloudDirty = false;
  }

  private persist(): void {
    const now = Date.now();
    step(this.state, now);
    this.saveLocal(now);
    if (this.cloudDirty || now - this.lastCloud > CLOUD_SAVE_MS) this.saveCloud(now);
  }

  private async connectCloud(): Promise<void> {
    if (!(await this.cloud.connect())) return;
    const raw = await this.cloud.load();
    const remote = raw ? deserialize(raw) : null;
    // The cloud copy wins if it was played more recently (another device).
    if (remote && remote.updatedAt > this.state.updatedAt + 5_000 && remote.createdAt === this.state.createdAt) {
      Object.assign(this.state, remote);
      this.rank = rankIndex(this.state);
      this.ui.closeModal();
      const report = step(this.state, Date.now());
      this.ui.sync(true);
      if (report) this.welcome(report);
      else this.ui.toast('Loaded your saved stall');
      this.saveLocal(Date.now());
    } else if (remote && !this.hadSave) {
      // A new device with no local save: take the cloud stall.
      Object.assign(this.state, remote);
      this.rank = rankIndex(this.state);
      this.ui.closeModal();
      step(this.state, Date.now());
      this.ui.sync(true);
      this.ui.toast('Loaded your saved stall');
    } else {
      this.saveCloud(Date.now());
    }
  }

  snapshot(): HotData {
    return { save: serialize(this.state) };
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
