import '@fontsource/bagel-fat-one/latin-400.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-700.css';
import './styles.css';

import { CloudSave, localSave as makeLocalSave } from '@shared/storage';
import { ENEMY_BY_ID, GAME_SPEEDS, MUFFIN_BY_ID, PANTRY_BY_ID, PASSIVE_BY_ID, WEAPON_BY_ID, WIN_CRUMBS, type EnemyId, type GameSpeed, type MuffinId, type PantryId } from './defs';
import { Controls } from './input';
import { autoPicking, bankRun, bankUnbanked, buyPantry, deserialize, newMeta, pick, serialize, unlock, type MetaState } from './meta';
import { buzz, isNative, nativeSave, onAppState } from './native';
import { Run, type Offer, type RunEvent } from './run';
import { setSound, sfx, suspend, unlock as unlockAudio } from './sound';
import { UI, type Controller, type Screen } from './ui';
import { View } from './view';

const localSave = makeLocalSave('lastmuffin.save.v1');
/** The longest single step of the simulation, in seconds. */
const STEP = 1 / 30;
const CLOUD_SAVE_MS = 30_000;

interface HotData {
  save?: string;
  native?: string | null;
}
interface HotApi {
  ready?: (start: (data?: HotData) => void) => void;
  snapshot?: (fn: () => HotData) => void;
  data?: HotData;
}

class Game implements Controller {
  meta: MetaState;
  run: Run | null = null;
  /** A muffin wandering around behind the menus. */
  private demo: Run | null = null;
  /** The run that just ended, still shown behind the results. */
  private ended: Run | null = null;
  private view: View;
  private controls: Controls;
  private ui: UI;
  private cloud = new CloudSave();
  private canvas = document.getElementById('game') as HTMLCanvasElement;
  private last = 0;
  private endAt = 0;
  private slowFor = 0;
  private smoothFor = 0;
  private lowered = 0;
  private met = new Set<EnemyId>();
  private lastCloud = 0;
  private hadSave: boolean;

  constructor(hot: HotData) {
    const saves = [hot.save, hot.native, localSave.load()].map((raw) => (raw ? deserialize(raw) : null)).filter((s): s is MetaState => s !== null);
    const loaded = saves.reduce<MetaState | null>((best, s) => (!best || s.updatedAt > best.updatedAt ? s : best), null);
    this.hadSave = loaded !== null;
    this.meta = loaded ?? newMeta(Date.now());
    setSound(this.meta.sound);
    this.view = new View(this.canvas);
    const ouch = document.getElementById('ouch')!;
    this.view.onHurt = () => {
      ouch.classList.remove('hit');
      void ouch.offsetWidth;
      ouch.classList.add('hit');
    };
    this.controls = new Controls(document.getElementById('stage')!, document.getElementById('hop')!);
    this.controls.enabled = false;
    this.ui = new UI(this);
    this.newDemo();
    this.ui.show('title');
    const back = bankUnbanked(this.meta);
    if (back) {
      this.ui.warn(`You left mid-run: +${back} crumbs banked`, 3500);
      this.save();
    }
    this.bind();
    if (!isNative) void this.connectCloud();
    requestAnimationFrame(this.frame);
  }

  private newDemo(): void {
    const d = new Run({ muffin: this.meta.muffin, pantry: {}, seed: 99 });
    d.view = this.view.worldView;
    d.hp = d.stats.maxHp = 1e9;
    d.revives = 1e9;
    this.demo = d;
  }

  private bind(): void {
    const first = () => {
      unlockAudio();
      window.removeEventListener('pointerdown', first, true);
      window.removeEventListener('keydown', first, true);
    };
    window.addEventListener('pointerdown', first, true);
    window.addEventListener('keydown', first, true);
    new ResizeObserver(() => {
      this.view.resize();
      for (const r of [this.run, this.demo]) if (r) r.view = this.view.worldView;
    }).observe(this.canvas);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.away();
      suspend(document.visibilityState === 'hidden');
    });
    window.addEventListener('pagehide', () => this.away());
    onAppState({
      background: () => this.away(),
      foreground: () => {},
      back: () => {
        if (this.run?.state === 'playing' && this.ui.current === null) {
          this.show('pause');
          return true;
        }
        if (this.ui.current === 'pause') {
          this.resume();
          return true;
        }
        if (this.ui.current && this.ui.current !== 'title' && !this.run) {
          this.show('title');
          return true;
        }
        return false;
      },
    });
  }

  /** Going to the background: pause, and keep the crumbs safe if it never comes back. */
  private away(): void {
    if (this.run && this.run.state === 'playing' && this.ui.current === null) this.show('pause');
    this.meta.unbanked = this.run ? this.run.banked(WIN_CRUMBS) : 0;
    this.save(true);
  }

  // -------------------------------------------------------------------------
  // The loop

  private frame = (t: number): void => {
    // Real time, however slowly the screen keeps up: a slow frame is played
    // as several short steps rather than slowing the night down.
    const real = Math.min(0.25, Math.max(0, (t - (this.last || t)) / 1000));
    this.last = t;
    const dt = Math.min(0.05, real);
    this.watchSpeed(real);
    const run = this.run;
    if (run) {
      const input = this.controls.read();
      // Game speed: the night plays faster than real time.
      const play = real * GAME_SPEEDS[this.meta.speed].scale;
      const steps = Math.ceil(play / STEP);
      for (let i = 0; i < steps && run.state === 'playing' && this.ui.current === null; i++) {
        const events = run.step(play / steps, i === 0 ? input : { ...input, hop: false });
        this.view.consume(events, run, t);
        this.react(events);
        this.afterStep(run);
      }
      this.view.draw(run, t, dt, run.state === 'playing' && this.ui.current === null ? this.controls : null);
      this.ui.updateHud(run);
      if (this.endAt && t >= this.endAt) {
        this.endAt = 0;
        this.finish();
      }
    } else if (this.ended) {
      this.view.draw(this.ended, t, dt, null);
    } else if (this.demo) {
      const d = this.demo;
      const a = t * 0.0004;
      const events = d.step(dt, { x: Math.cos(a), y: Math.sin(a * 1.7), hop: false });
      this.view.consume(events.filter((e) => e.type === 'kill' || e.type === 'strike' || e.type === 'swipe'), d, t);
      if (d.state === 'levelup') d.choose(0);
      if (d.state === 'chest') d.closeChest();
      if (d.state === 'won' || d.t > 300) this.newDemo();
      this.view.draw(d, t, dt, null, this.ui.current !== 'title');
    }
    requestAnimationFrame(this.frame);
  };

  /**
   * If the screen can't keep up (frames slower than about 40 a second for a
   * couple of seconds), draw with fewer pixels; if it's been smooth for a
   * while, try more again. Only during a run, when it matters.
   */
  private watchSpeed(real: number): void {
    // Menus and level-ups don't count, but don't reset the tally either.
    if (!this.run || this.run.state !== 'playing' || this.ui.current !== null || real <= 0) return;
    if (real > 1 / 40) {
      this.slowFor += real;
      this.smoothFor = 0;
    } else if (real < 1 / 55) {
      this.smoothFor += real;
      this.slowFor = Math.max(0, this.slowFor - real);
    }
    const d = this.view.pixelDensity;
    if (this.slowFor > 2 && d > 0.75) {
      this.slowFor = 0;
      if (this.view.setDensity(d - 0.25)) this.run.view = this.view.worldView;
    } else if (this.smoothFor > 20 && d < 1.5 && this.lowered < 3) {
      // Back up a notch, but give up after bouncing a few times.
      this.smoothFor = 0;
      this.lowered += 1;
      if (this.view.setDensity(d + 0.25)) this.run.view = this.view.worldView;
    }
  }

  /** Sounds, buzzes and words for what just happened. */
  private react(events: RunEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          if (e.bonk) sfx.bonk();
          else sfx.hit();
          break;
        case 'kill':
          sfx.pop();
          this.met.add(e.enemy);
          break;
        case 'fire': {
          const kind = WEAPON_BY_ID[e.weapon].kind;
          if (kind === 'shoot' || kind === 'nova') sfx.shoot();
          else if (kind === 'swipe' || kind === 'boomerang') sfx.swoosh();
          break;
        }
        case 'pickup':
          if (e.kind === 'xp') sfx.sprinkle();
          else if (e.kind === 'crumb') sfx.crumb();
          else if (e.kind === 'milk') {
            sfx.milk();
            this.ui.warn('Milk! +30 health', 1400);
          } else if (e.kind === 'magnet') {
            sfx.milk();
            this.ui.warn('Fridge magnet! Every sprinkle comes to you.', 1800);
          }
          break;
        case 'levelup':
          sfx.levelUp();
          buzz.tap();
          break;
        case 'hurt':
          sfx.hurt();
          buzz.hurt();
          break;
        case 'hop':
          sfx.hop();
          break;
        case 'boss':
          sfx.boss();
          buzz.heavy();
          this.met.add(e.enemy);
          this.ui.banner('Here comes', ENEMY_BY_ID[e.enemy].name);
          break;
        case 'bossDown':
          buzz.success();
          this.ui.warn(`${ENEMY_BY_ID[e.enemy].name} is down! Grab the pie tin.`, 3000);
          break;
        case 'warning':
          this.ui.warn(e.text);
          break;
        case 'chest':
          sfx.chest();
          buzz.success();
          break;
        case 'pulse':
          sfx.pulse();
          break;
        case 'revive':
          sfx.levelUp();
          this.ui.warn('Day-old discount: back on your feet!', 2500);
          break;
        case 'win':
          sfx.win();
          buzz.success();
          break;
        case 'dead':
          sfx.lose();
          buzz.bad();
          this.endAt = performance.now() + 1600;
          this.controls.enabled = false;
          break;
        default:
          break;
      }
    }
  }

  /** A run that stopped for something gets its screen (or the Recipe Book handles it). */
  private afterStep(run: Run): void {
    if (autoPicking(this.meta)) this.autoPick(run);
    if (run.state === 'levelup') this.ui.show('levelup');
    else if (run.state === 'chest') this.ui.show('chest');
    else if (run.state === 'won') this.ui.show('sunrise');
  }

  /** The Recipe Book picks level-ups and opens pie tins, and says what it did. */
  private autoPick(run: Run): void {
    const said: string[] = [];
    const name = (o: Offer) =>
      o.type === 'weapon' ? `${WEAPON_BY_ID[o.id].name} ${o.level}` : o.type === 'passive' ? `${PASSIVE_BY_ID[o.id].name} ${o.level}` : o.type === 'snack' ? 'a snack' : 'milk';
    for (let guard = 0; guard < 50 && (run.state === 'levelup' || run.state === 'chest'); guard++) {
      if (run.state === 'levelup') {
        const o = run.offers[run.autoChoice()];
        run.choose(run.offers.indexOf(o));
        said.push(name(o));
      } else {
        const ch = run.chest!;
        if (ch.evolved) said.push(`${WEAPON_BY_ID[ch.evolved].evolved.name}!`);
        else said.push(...ch.upgrades.map(name));
        run.closeChest();
      }
    }
    if (said.length) this.ui.warn(`📖 ${said.join(' · ')}`, 2000);
  }

  // -------------------------------------------------------------------------
  // Controller

  start(): void {
    this.slowFor = this.smoothFor = 0;
    const run = new Run({ muffin: this.meta.muffin, pantry: this.meta.pantry, seed: Date.now() % 2147483647, autoHop: this.meta.autoHop });
    run.view = this.view.worldView;
    this.run = run;
    this.ended = null;
    this.met.clear();
    this.endAt = 0;
    this.view.reset();
    this.controls.reset();
    this.controls.enabled = true;
    this.ui.show(null);
    this.ui.showHud(true);
    this.ui.warn('Move with your thumb. Your weapons fire on their own.', 3000);
    sfx.click();
  }

  private finish(): void {
    const run = this.run;
    if (!run) return;
    const summary = run.summary(WIN_CRUMBS);
    const evolved = run.weapons.filter((w) => w.evolved).map((w) => w.id);
    const banked = bankRun(this.meta, summary, [...this.met], evolved);
    this.save(true);
    this.ended = run;
    this.run = null;
    this.controls.enabled = false;
    this.ui.showHud(false);
    this.ui.show('results', { summary, banked });
    if (banked.unlocked.length) sfx.chest();
  }

  pick(id: MuffinId): void {
    if (!pick(this.meta, id)) return;
    sfx.click();
    this.newDemo();
    this.save();
    this.ui.show('select');
  }

  unlock(id: MuffinId): void {
    if (!unlock(this.meta, id)) return;
    pick(this.meta, id);
    sfx.buy();
    buzz.success();
    this.newDemo();
    this.save(true);
    this.ui.show('select');
    this.ui.warn(`${MUFFIN_BY_ID[id].name} joins the bakery!`);
  }

  buy(id: PantryId): void {
    if (!buyPantry(this.meta, id)) return;
    sfx.buy();
    buzz.tap();
    this.save(true);
    this.ui.show('pantry');
    this.ui.warn(`${PANTRY_BY_ID[id].name}: level ${this.meta.pantry[id]}`, 1400);
  }

  choose(i: number): void {
    const run = this.run;
    if (!run) return;
    run.choose(i);
    sfx.click();
    this.ui.show(run.state === 'levelup' ? 'levelup' : null);
  }

  reroll(): void {
    if (!this.run?.reroll()) return;
    sfx.click();
    this.ui.show('levelup');
  }

  skip(): void {
    const run = this.run;
    if (!run) return;
    run.skip();
    this.ui.show(run.state === 'levelup' ? 'levelup' : null);
  }

  closeChest(): void {
    const run = this.run;
    if (!run) return;
    run.closeChest();
    this.ui.show(run.state === 'levelup' ? 'levelup' : null);
  }

  keepGoing(): void {
    this.run?.keepGoing();
    this.ui.show(null);
  }

  headHome(): void {
    this.finish();
  }

  resume(): void {
    const run = this.run;
    if (!run) return;
    this.controls.reset();
    if (run.state === 'levelup') this.ui.show('levelup');
    else if (run.state === 'chest') this.ui.show('chest');
    else if (run.state === 'won') this.ui.show('sunrise');
    else this.ui.show(null);
  }

  giveUp(): void {
    this.finish();
  }

  show(screen: Screen): void {
    if (screen === 'title' || screen === 'select' || screen === 'pantry' || screen === 'records') this.ended = null;
    this.ui.show(screen);
  }

  toggleAutoPick(): void {
    this.meta.autoPick = !this.meta.autoPick;
    this.save();
    const run = this.run;
    // Turned on from the level-up screen: pick this one too.
    if (run && autoPicking(this.meta) && (run.state === 'levelup' || run.state === 'chest')) {
      this.autoPick(run);
      this.resume();
      return;
    }
    this.ui.show(this.ui.current);
  }

  cycleSpeed(): void {
    const order: GameSpeed[] = ['normal', 'fast', 'turbo'];
    this.meta.speed = order[(order.indexOf(this.meta.speed) + 1) % order.length];
    sfx.click();
    this.save();
    this.ui.show(this.ui.current);
  }

  toggleAutoHop(): void {
    this.meta.autoHop = !this.meta.autoHop;
    if (this.run) this.run.setAutoHop(this.meta.autoHop);
    this.save();
    this.ui.show(this.ui.current);
  }

  toggleSound(): void {
    this.meta.sound = !this.meta.sound;
    setSound(this.meta.sound);
    this.save();
    this.ui.show(this.ui.current);
  }

  eraseSave(): void {
    Object.assign(this.meta, newMeta(Date.now()));
    localSave.clear();
    nativeSave.clear();
    setSound(true);
    this.save(true);
    this.newDemo();
    this.ui.show('title');
  }

  // -------------------------------------------------------------------------
  // Saving

  private save(cloudNow = false): void {
    this.meta.updatedAt = Date.now();
    const raw = serialize(this.meta);
    localSave.save(raw);
    nativeSave.save(raw);
    if (this.cloud.ready && (cloudNow || Date.now() - this.lastCloud > CLOUD_SAVE_MS)) {
      this.lastCloud = Date.now();
      void this.cloud.save(raw);
    }
  }

  private async connectCloud(): Promise<void> {
    if (!(await this.cloud.connect())) return;
    const raw = await this.cloud.load();
    const remote = raw ? deserialize(raw) : null;
    // The cloud copy wins if it's newer (another device), or on a new device.
    if (remote && (remote.updatedAt > this.meta.updatedAt + 5_000 || !this.hadSave)) {
      Object.assign(this.meta, remote);
      setSound(this.meta.sound);
      bankUnbanked(this.meta);
      localSave.save(serialize(this.meta));
      if (!this.run) {
        this.newDemo();
        this.ui.show(this.ui.current ?? 'title');
      }
    } else {
      this.save(true);
    }
  }

  snapshot(): HotData {
    return { save: serialize(this.meta) };
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
