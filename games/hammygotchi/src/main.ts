import '@fontsource/bagel-fat-one/latin-400.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/latin-700.css';
import './styles.css';

import { fmt } from '@shared/format';
import { CloudSave, localSave as makeLocalSave } from '@shared/storage';
import { FIT_BY_ID, FOOD_BY_ID, FORM_BY_ID, VOICEMAIL, type FitId, type FoodId, type FormId, type ToyId } from './defs';
import {
  adopt,
  buyFit,
  buyToy,
  canCall,
  declineCall,
  endCall,
  fling,
  formFor,
  hose,
  isAlive,
  order,
  pet,
  pickToy,
  play,
  scoop,
  scoopAll,
  deadFor,
  sendText,
  step,
  wake,
  wearFit,
  type AwayReport,
  type HammyEvent,
} from './game';
import { TankScene } from './scene';
import { setSound, sfx, unlock } from './sound';
import { deserialize, newGame, serialize, type HammyState } from './state';
import { GameUI, type Controller } from './ui';
import { askForReminders, buzz, clearReminders, isNative, nativeSave, onAppState, scheduleReminders } from './native';

const localSave = makeLocalSave('hammygotchi.save.v1');
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
function newest(saves: HammyState[]): HammyState | null {
  return saves.reduce<HammyState | null>((best, s) => (!best || s.updatedAt > best.updatedAt ? s : best), null);
}

class Game implements Controller {
  state: HammyState;
  private ui: GameUI;
  private scene: TankScene;
  private cloud = new CloudSave();
  private canvas = document.getElementById('tank') as HTMLCanvasElement;
  private lastUi = 0;
  private lastLocal = 0;
  private lastCloud = 0;
  private cloudDirty = false;
  private hadSave: boolean;
  /** Messages already on screen, so a new one from him dings once. */
  private shownMessages = 0;
  /** Today's form, worked out once a minute rather than every frame. */
  private formCache = { at: 0, form: 'hamster' as FormId };

  constructor(hot: HotData) {
    const saves = [hot.save, hot.native, localSave.load()]
      .map((raw) => (raw ? deserialize(raw) : null))
      .filter((s): s is HammyState => s !== null);
    const loaded = newest(saves);
    this.hadSave = loaded !== null;
    this.state = loaded ?? newGame(Date.now());
    setSound(this.state.sound);
    this.scene = new TankScene(this.canvas, {
      pet: () => this.pet(),
      fling: (speed) => this.fling(speed),
      scoop: (i) => this.scoopOne(i),
      play: (toy) => this.played(toy),
    });
    this.ui = new GameUI(this);
    const { away } = step(this.state, Date.now());
    wake(this.state, Date.now());
    this.shownMessages = this.visibleMessages();
    if (!loaded) {
      this.state.seenForm = this.form;
      this.ui.showIntro();
    } else if (away) this.welcome(away);
    this.bind();
    void clearReminders();
    if (!isNative) void this.connectCloud();
    requestAnimationFrame(this.frame);
  }

  private visibleMessages(): number {
    const now = Date.now();
    return this.state.messages.filter((m) => m.at <= now).length;
  }

  private frame = (t: number): void => {
    const now = Date.now();
    const { events, away } = step(this.state, now);
    if (away) {
      this.welcome(away);
    } else {
      for (const e of events) this.react(e);
    }
    const shown = this.visibleMessages();
    if (shown !== this.shownMessages) {
      const last = this.state.messages.filter((m) => m.at <= now).pop();
      if (shown > this.shownMessages && last?.from === 'hammy') sfx.ding();
      this.shownMessages = shown;
    }
    const s = this.state;
    this.checkForm();
    this.scene.setView({
      now,
      form: this.form,
      fit: s.fit,
      toy: s.toy,
      belly: s.belly,
      fresh: s.fresh,
      mood: s.mood,
      health: s.health,
      poops: s.poops,
      orders: s.orders,
      deadFor: deadFor(s, now),
    });
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

  /** Something happened while you're watching. */
  private react(e: HammyEvent): void {
    const s = this.state;
    switch (e.type) {
      case 'fart':
        this.scene.fart(e.size);
        buzz.fart(e.size);
        break;
      case 'poop':
        // It came out of him, so it lands behind him.
        s.poops[s.poops.length - 1] = this.scene.buttX();
        this.scene.poop();
        this.cloudDirty = true;
        break;
      case 'delivery':
        this.scene.deliver(e.food);
        if (e.self) this.ui.toast(`Hammy's own ${FOOD_BY_ID[e.food].name.toLowerCase()} showed up`);
        break;
      case 'selfOrder':
        this.ui.toast(`Hammy ordered ${FOOD_BY_ID[e.food].name.toLowerCase()} on your coins (−${fmt(e.cost)}, tip included)`, 4500);
        buzz.bad();
        this.cloudDirty = true;
        break;
      case 'text':
        if (this.ui.currentTab !== 'phone') this.ui.toast(`Hammy: ${e.text}`);
        break;
      case 'ring':
        if (this.ui.modalOpen || document.visibilityState !== 'visible') declineCall(s, Date.now(), true);
        else this.ring();
        break;
      case 'died':
        this.ui.closeModal();
        this.scene.died();
        buzz.bad();
        this.ui.setTab('care');
        this.persist();
        break;
      default:
        break;
    }
  }

  get form(): FormId {
    const now = Date.now();
    if (now - this.formCache.at > 60_000) this.formCache = { at: now, form: formFor(this.state, now) };
    return this.formCache.form;
  }

  /** A new day, a new Hammy shape: show it happen once. */
  private checkForm(): void {
    const form = this.form;
    if (form === this.state.seenForm || this.ui.modalOpen || !isAlive(this.state)) return;
    this.state.seenForm = form;
    this.scene.morph(form);
    this.ui.toast(`Today Hammy is ${FORM_BY_ID[form].today}`, 4000);
    this.changed();
  }

  private welcome(r: AwayReport): void {
    if (this.ui.modalOpen) return;
    this.ui.showWelcome(r);
  }

  private bind(): void {
    const firstTouch = () => {
      unlock();
      window.removeEventListener('pointerdown', firstTouch, true);
      window.removeEventListener('keydown', firstTouch, true);
    };
    window.addEventListener('pointerdown', firstTouch, true);
    window.addEventListener('keydown', firstTouch, true);
    this.canvas.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      this.scene.patFromKeyboard();
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
        void scheduleReminders(this.state);
      },
      foreground: () => {
        void clearReminders();
        wake(this.state, Date.now());
      },
      back: () => {
        if (!this.ui.modalOpen) return false;
        this.ui.closeModal();
        return true;
      },
    });
  }

  // The tank ---------------------------------------------------------------

  private pet(): void {
    if (pet(this.state, Date.now())) this.cloudDirty = true;
    buzz.tap();
  }

  private fling(speed: number): void {
    if (speed < 200) return;
    fling(this.state, Date.now());
    this.cloudDirty = true;
  }

  private scoopOne(i: number): void {
    this.scene.scoopFx(i);
    const got = scoop(this.state, i);
    if (!got) return;
    sfx.coin();
    buzz.tap();
    this.scene.popup(`+${got}`);
    this.changed();
  }

  private played(toy: ToyId): void {
    const got = play(this.state, toy, Date.now());
    if (!got) return;
    if (got.coins) this.scene.popup(`+${got.coins}`);
    if (got.mood < 0) buzz.fart(0.6);
    else buzz.tap();
    this.cloudDirty = true;
  }

  private ring(): void {
    this.ui.showRinging({
      answer: () => this.talk(true),
      decline: () => {
        declineCall(this.state, Date.now(), false);
        this.changed();
      },
      miss: () => {
        declineCall(this.state, Date.now(), true);
        this.changed();
      },
    });
  }

  private talk(incoming: boolean): void {
    this.ui.showCall(incoming, (seconds) => {
      const { mood, coins } = endCall(this.state, seconds, Date.now(), incoming);
      this.ui.toast(`Call ended · +${Math.round(mood)} mood${coins ? ` · +${coins} coins` : ''}`);
      if (coins) sfx.coin();
      this.changed(true);
    });
  }

  // Controller ---------------------------------------------------------------

  order(id: FoodId): void {
    if (!order(this.state, id, Date.now())) return;
    sfx.send();
    buzz.tap();
    this.ui.toast(`${FOOD_BY_ID[id].name} ordered. The driver is on the way.`);
    // Feeding him is when a heads-up about him becomes useful.
    void askForReminders();
    this.changed();
  }

  scoopAll(): void {
    this.state.poops.forEach((_, i) => this.scene.scoopFx(i));
    const got = scoopAll(this.state);
    if (!got) return;
    sfx.coin();
    this.scene.popup(`+${got}`);
    this.changed();
  }

  hose(): void {
    if (!hose(this.state, Date.now())) return;
    this.scene.hose();
    buzz.tap();
    this.changed();
  }

  text(id: string): void {
    if (!sendText(this.state, id, Date.now())) return;
    sfx.send();
    this.shownMessages = this.visibleMessages();
    this.changed();
  }

  call(): void {
    const now = Date.now();
    if (!isAlive(this.state)) {
      this.ui.toast('The number you have dialed is no longer in service.', 4000);
      return;
    }
    if (!canCall(this.state, now)) {
      this.ui.toast(`Straight to voicemail: “${VOICEMAIL}”`, 5000);
      return;
    }
    this.talk(false);
  }

  buyFit(id: FitId): void {
    if (!buyFit(this.state, id)) return;
    sfx.buy();
    buzz.success();
    this.ui.toast(`${FIT_BY_ID[id].name}: looking good. Still stinks.`);
    this.changed(true);
  }

  buyToy(id: ToyId): void {
    if (!buyToy(this.state, id)) return;
    sfx.buy();
    buzz.success();
    this.scene.setToy();
    this.ui.toyPicked(id);
    this.changed(true);
  }

  pickToy(id: ToyId): void {
    if (!pickToy(this.state, id)) return;
    this.scene.setToy();
    buzz.tap();
    if (id !== 'hand' || this.state.stats.toys === 0) this.ui.toyPicked(id);
    this.changed();
  }

  wearFit(id: FitId): void {
    if (!wearFit(this.state, id)) return;
    buzz.tap();
    this.changed();
  }

  adopt(): void {
    if (!adopt(this.state, Date.now())) return;
    this.scene.spawn();
    this.shownMessages = 0;
    buzz.success();
    this.ui.toast(`Hammy #${this.state.n} has entered the tank`);
    this.changed(true);
  }

  toggleSound(): void {
    this.state.sound = !this.state.sound;
    setSound(this.state.sound);
    this.changed();
  }

  eraseSave(): void {
    Object.assign(this.state, newGame(Date.now()));
    localSave.clear();
    nativeSave.clear();
    setSound(true);
    this.formCache.at = 0;
    this.scene.setToy();
    this.scene.spawn();
    this.ui.setTab('care');
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
    for (const e of step(this.state, now).events) if (e.type === 'died') this.scene.died();
    this.saveLocal(now);
    if (this.cloudDirty || now - this.lastCloud > CLOUD_SAVE_MS) this.saveCloud(now);
  }

  private async connectCloud(): Promise<void> {
    if (!(await this.cloud.connect())) return;
    const raw = await this.cloud.load();
    const remote = raw ? deserialize(raw) : null;
    const take = (message: string | null) => {
      Object.assign(this.state, remote);
      setSound(this.state.sound);
      this.ui.closeModal();
      const { away } = step(this.state, Date.now());
      wake(this.state, Date.now());
      this.shownMessages = this.visibleMessages();
      this.ui.sync(true);
      if (away) this.welcome(away);
      else if (message) this.ui.toast(message);
      this.saveLocal(Date.now());
    };
    // The cloud copy wins if it was played more recently (another device).
    if (remote && remote.updatedAt > this.state.updatedAt + 5_000 && remote.createdAt === this.state.createdAt) take('Loaded your saved Hammy');
    // A new device with no local save: take the cloud Hammy.
    else if (remote && !this.hadSave) take('Loaded your saved Hammy');
    else this.saveCloud(Date.now());
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
