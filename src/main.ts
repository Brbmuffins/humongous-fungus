import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-600.css';
import './styles.css';

import {
  BLOOM_INTERVAL,
  BLOOM_LIFETIME_SECONDS,
  PRODUCER_BY_ID,
  PRODUCER_IDS,
  SPECIMEN_BY_ID,
  biomeName,
  jarLabel,
  type ProducerId,
} from './game/defs';
import {
  baseRate,
  bloomRateMult,
  buyProducer,
  buyUpgrade,
  earn,
  frenzyActive,
  harvest,
  maxBuyable,
  owned,
  sealJar,
  startCultivation,
  startFrenzy,
  step,
  tapValue,
  totalRate,
  type AwayReport,
} from './game/economy';
import { fmt } from './game/format';
import { deserialize, newGame, pickBest, serialize, type GameState } from './game/state';
import { JarRenderer, type WorldView } from './render/jar';
import { CloudSave, localSave } from './storage';
import { GameUI, type BuyAmount, type Controller } from './ui/ui';

/** Gaps at least this long get the welcome-back screen. */
const WELCOME_SECONDS = 60;
const LOCAL_SAVE_MS = 5_000;
const CLOUD_SAVE_MS = 60_000;

interface HotData {
  save?: string;
}
interface HotApi {
  ready?: (start: (data?: HotData) => void) => void;
  snapshot?: (fn: () => HotData) => void;
  data?: HotData;
}

class Game implements Controller {
  state: GameState;
  buyAmount: BuyAmount = 1;
  private renderer: JarRenderer;
  private ui: GameUI;
  private cloud = new CloudSave();
  private canvas = document.getElementById('jar') as HTMLCanvasElement;
  private bloom: { x: number; bornAt: number; ttl: number } | null = null;
  private nextBloomAt = 0;
  private lastLocalSave = 0;
  private lastCloudSave = 0;
  private cloudDirty = false;
  private lastUiSync = 0;
  private pendingWelcome: AwayReport | null = null;

  constructor(hot: HotData) {
    const saves = [hot.save, localSave.load()]
      .map((raw) => (raw ? deserialize(raw) : null))
      .filter((s): s is GameState => s !== null);
    const loaded = pickBest(saves);
    this.state = loaded ?? newGame(Date.now());

    this.renderer = new JarRenderer(this.canvas);
    this.ui = new GameUI(this);
    const report = step(this.state, Date.now());
    if (!loaded) this.ui.showIntro();
    else if (report && report.elapsed >= WELCOME_SECONDS) this.welcome(report);
    this.scheduleBloom(Date.now(), true);

    this.bindInput();
    void this.connectCloud();
    requestAnimationFrame(this.frame);
  }

  // -------------------------------------------------------------------------
  // Loop

  private frame = (t: number): void => {
    const now = Date.now();
    const report = step(this.state, now);
    if (report && report.elapsed >= WELCOME_SECONDS) this.welcome(report);
    this.updateBloom(now);
    this.renderer.setView(this.view(now));
    this.renderer.draw(t);
    this.ui.updateCounter(now);
    if (now - this.lastUiSync > 200) {
      this.ui.sync();
      this.lastUiSync = now;
    }
    if (now - this.lastLocalSave > LOCAL_SAVE_MS) this.saveLocal(now);
    if (this.cloudDirty && now - this.lastCloudSave > CLOUD_SAVE_MS) this.saveCloud(now);
    requestAnimationFrame(this.frame);
  };

  private view(now: number): WorldView {
    const s = this.state;
    const counts = Object.fromEntries(PRODUCER_IDS.map((id) => [id, owned(s, id)])) as Record<ProducerId, number>;
    const others = PRODUCER_IDS.reduce((sum, id) => (id === 'hyphae' ? sum : sum + owned(s, id)), 0);
    return {
      counts,
      specimens: new Set(s.specimens),
      jarIndex: s.jarIndex,
      seed: s.seed,
      rate: totalRate(s, now),
      network: 14 + 15 * Math.sqrt(counts.hyphae) + 3 * Math.sqrt(others) + 8 * Math.log10(1 + s.jarTotal),
      frenzy: frenzyActive(s, now),
      bloom: this.bloom,
      now,
    };
  }

  private welcome(report: AwayReport): void {
    // One welcome at a time; a second long gap while it is open adds to it.
    if (this.ui.modalOpen) {
      if (this.pendingWelcome) {
        this.pendingWelcome.earned += report.earned;
        this.pendingWelcome.elapsed += report.elapsed;
      }
      return;
    }
    this.pendingWelcome = report;
    this.ui.showWelcome(report, () => {
      this.pendingWelcome = null;
      this.renderer.burst(18);
    });
  }

  // -------------------------------------------------------------------------
  // Blooms: a golden mushroom that appears now and then while you watch.

  private scheduleBloom(now: number, first = false): void {
    const [lo, hi] = BLOOM_INTERVAL;
    const wait = (lo + Math.random() * (hi - lo)) / bloomRateMult(this.state);
    this.nextBloomAt = now + (first ? wait * 0.5 : wait) * 1000;
  }

  private updateBloom(now: number): void {
    if (this.bloom && now > this.bloom.bornAt + this.bloom.ttl) {
      this.bloom = null;
      this.scheduleBloom(now);
    }
    if (!this.bloom && now >= this.nextBloomAt) {
      // Wait until the jar has something growing and no dialog is open.
      if (this.state.jarTotal < 200 || this.ui.modalOpen || document.hidden) {
        this.nextBloomAt = now + 5000;
        return;
      }
      this.bloom = { x: 0.18 + Math.random() * 0.64, bornAt: now, ttl: BLOOM_LIFETIME_SECONDS * 1000 };
      if (this.state.stats.blooms === 0) this.ui.toast('A golden bloom appeared. Tap it before it fades.');
    }
  }

  private catchBloom(now: number): void {
    const s = this.state;
    this.bloom = null;
    this.scheduleBloom(now);
    s.stats.blooms += 1;
    if (Math.random() < 0.55) {
      startFrenzy(s, now);
      this.ui.toast('Frenzy: production ×7 for 30 seconds');
    } else {
      const amount = Math.min(s.nutrients * 0.15, baseRate(s) * 900) + 13;
      earn(s, amount);
      this.ui.toast(`Windfall: +${fmt(amount)} nutrients`);
    }
    this.renderer.burst(24);
    this.cloudDirty = true;
  }

  // -------------------------------------------------------------------------
  // Input

  private bindInput(): void {
    this.canvas.addEventListener('pointerdown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const now = Date.now();
      if (this.bloom && this.renderer.hitBloom(x, y)) this.catchBloom(now);
      else this.tap(x, y, now);
    });
    this.canvas.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const now = Date.now();
      if (this.bloom) this.catchBloom(now);
      else this.tap(rect.width / 2, rect.height * 0.7, now);
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    new ResizeObserver(() => this.renderer.resize()).observe(this.canvas);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.persist();
    });
    window.addEventListener('pagehide', () => this.persist());
  }

  private tap(x: number, y: number, now: number): void {
    const s = this.state;
    const value = tapValue(s, now);
    earn(s, value);
    s.stats.taps += 1;
    this.renderer.tap(x, y, `+${fmt(value)}`);
    this.cloudDirty = true;
  }

  // -------------------------------------------------------------------------
  // Controller (called by the UI)

  setBuyAmount(a: BuyAmount): void {
    this.buyAmount = a;
    this.ui.sync();
  }

  buyProducer(id: ProducerId): void {
    const s = this.state;
    const def = PRODUCER_BY_ID[id];
    const n = this.buyAmount === 'max' ? maxBuyable(def, owned(s, id), s.nutrients) : this.buyAmount;
    const first = owned(s, id) === 0;
    if (!buyProducer(s, id, n)) return;
    this.renderer.burst(first ? 20 : 8);
    if (first && s.jarIndex === 0 && id !== 'hyphae') this.ui.toast(`${def.plural} moved into the jar`);
    this.changed();
  }

  buyUpgrade(id: string): void {
    if (!buyUpgrade(this.state, id)) return;
    this.renderer.burst(10);
    this.changed();
  }

  cultivate(id: string): void {
    if (!startCultivation(this.state, id, Date.now())) return;
    const sp = SPECIMEN_BY_ID.get(id);
    this.ui.toast(`${sp?.name ?? 'Specimen'} planted. Come back when it is grown.`);
    this.changed(true);
  }

  harvest(): void {
    const id = harvest(this.state, Date.now());
    if (!id) return;
    const sp = SPECIMEN_BY_ID.get(id);
    this.renderer.burst(30);
    this.ui.toast(`${sp?.name ?? 'Specimen'} harvested. ${sp?.effectText ?? ''}`.trim());
    this.changed(true);
  }

  seal(): void {
    const gain = sealJar(this.state, Math.floor(Math.random() * 2 ** 31));
    if (!gain) return;
    const s = this.state;
    this.bloom = null;
    this.ui.setTab('grow');
    this.ui.toast(`Released ${fmt(gain)} spores. ${jarLabel(s.jarIndex)} · ${biomeName(s.jarIndex)} begins.`);
    this.changed(true);
  }

  eraseSave(): void {
    const fresh = newGame(Date.now());
    Object.assign(this.state, fresh);
    this.bloom = null;
    localSave.clear();
    this.ui.setTab('grow');
    this.changed(true);
    this.ui.showIntro();
  }

  drawIcon(canvas: HTMLCanvasElement, kind: string): void {
    this.renderer.drawIcon(canvas, kind, this.state.jarIndex);
  }

  refresh(): void {
    this.ui.sync();
  }

  /** After a purchase: refresh the UI now and save soon. */
  private changed(saveNow = false): void {
    this.cloudDirty = true;
    this.ui.sync();
    if (saveNow) this.persist();
  }

  // -------------------------------------------------------------------------
  // Saving

  private saveLocal(now: number): void {
    localSave.save(serialize(this.state));
    this.lastLocalSave = now;
  }

  private saveCloud(now: number): void {
    if (!this.cloud.ready) return;
    void this.cloud.save(serialize(this.state));
    this.lastCloudSave = now;
    this.cloudDirty = false;
  }

  private persist(): void {
    const now = Date.now();
    step(this.state, now);
    this.saveLocal(now);
    if (this.cloudDirty || now - this.lastCloudSave > CLOUD_SAVE_MS) this.saveCloud(now);
  }

  private async connectCloud(): Promise<void> {
    if (!(await this.cloud.connect())) return;
    const raw = await this.cloud.load();
    const remote = raw ? deserialize(raw) : null;
    if (remote && remote.lifetime > this.state.lifetime + 1) {
      // The cloud copy has more progress (another device, or cleared storage).
      Object.assign(this.state, remote);
      this.bloom = null;
      this.ui.closeModal();
      const report = step(this.state, Date.now());
      this.ui.sync(true);
      if (report && report.elapsed >= WELCOME_SECONDS) this.welcome(report);
      else this.ui.toast('Loaded your saved jar');
      this.saveLocal(Date.now());
    } else {
      this.saveCloud(Date.now());
    }
  }

  snapshot(): HotData {
    return { save: serialize(this.state) };
  }
}

function start(data?: HotData): void {
  const game = new Game(data ?? {});
  hot?.snapshot?.(() => game.snapshot());
}

const hot = (window as unknown as { claude?: { hot?: HotApi } }).claude?.hot;
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
