import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/latin-800.css';
import '@fontsource/rubik/latin-900.css';
import '@fontsource/rubik/latin-900-italic.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-700.css';
import './styles.css';

import { mulberry32 } from '@shared/rng';
import { CloudSave, localSave as makeLocalSave } from '@shared/storage';
import { MILESTONES, MIN_BET, REFILL_COINS } from './defs';
import { newSeed, seal, verify } from './fair';
import { Table, payoutFor, type Bet, type RoundSpec, type TableEvent } from './game';
import {
  YOU,
  autoCashed,
  broke,
  cancelBet,
  cashOut,
  clampBet,
  clampTarget,
  crashed,
  loadSave,
  newSave,
  placeBet,
  placeQueued,
  queueBet,
  settleLeft,
  tickRefill,
  type RoundRecord,
  type Save,
} from './meta';
import { buzz, isNative, nativeSave, onAppState } from './native';
import { Sky, fmtX } from './scene';
import { setSound, sfx, suspend, unlock } from './sound';
import { Ui, type ActionState, type Controller } from './ui';

const localSave = makeLocalSave('sugarcrash.save.v1');
const LOCAL_SAVE_MS = 5_000;
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

type Sealed = Omit<RoundSpec, 'id'>;

class Game implements Controller {
  save: Save;
  private table: Table | null = null;
  private sky: Sky;
  private ui: Ui;
  /** Rounds sealed and waiting their turn. */
  private sealed: Sealed[] = [];
  private sealing = false;
  /** The pause is over and the next round is waiting to be sealed. */
  private starved = false;
  private last = 0;
  private lastLocal = 0;
  private lastCloud = 0;
  private lastBeep = -1;
  private cloud = new CloudSave();
  private hadSave: boolean;
  private canvas = document.getElementById('sky') as HTMLCanvasElement;
  private roll = mulberry32((Math.random() * 2 ** 32) >>> 0);

  constructor(hot: HotData) {
    const saves = [hot.save, hot.native, localSave.load()].map((raw) => loadSave(raw ?? null)).filter((s): s is Save => s !== null);
    const loaded = saves.reduce<Save | null>((best, s) => (!best || s.updatedAt > best.updatedAt ? s : best), null);
    this.hadSave = loaded !== null;
    this.save = loaded ?? newSave(Date.now());
    setSound(this.save.settings.sound);
    this.sky = new Sky(this.canvas);
    this.ui = new Ui(this);
    const p = this.save.pending;
    const left = settleLeft(this.save);
    if (p && left !== null) {
      this.ui.toast(left ? `Your bet from last time cashed out at ${fmtX(p.target!)}×: +${(left - p.amount).toLocaleString('en-US')}` : `Your bet from last time sugar-crashed at ${fmtX(p.crash)}×.`, 4500);
      this.persist(true);
    }
    if (!loaded) this.ui.showHelp(true);
    this.bind();
    void this.fill().then(() => this.next());
    if (!isNative) void this.connectCloud();
    requestAnimationFrame(this.frame);
  }

  // -------------------------------------------------------------------------
  // Rounds

  /** Keep two rounds sealed ahead. */
  private async fill(): Promise<void> {
    if (this.sealing) return;
    this.sealing = true;
    try {
      while (this.sealed.length < 2) {
        const s = await seal(newSeed());
        this.sealed.push(s);
      }
    } finally {
      this.sealing = false;
    }
    if (this.starved) this.next();
  }

  private next(): void {
    const sealed = this.sealed.shift();
    if (!sealed) {
      this.starved = true;
      void this.fill();
      return;
    }
    this.starved = false;
    const spec: RoundSpec = { id: this.save.nextRound++, ...sealed };
    if (this.table) this.table.begin(spec);
    else this.table = new Table(spec, this.roll);
    this.sky.newRound();
    this.ui.resetRows();
    this.lastBeep = -1;
    const q = placeQueued(this.save, this.table);
    if (q === 'ok') {
      const mine = this.table.yours!;
      this.ui.addRow(mine, this.table.bets);
      sfx.bet();
    } else if (q) this.ui.toast('Your queued bet didn’t go through: not enough coins.');
    this.ui.announce(`Round ${spec.id}: bets are open.`);
    void this.fill();
    this.persist();
  }

  // -------------------------------------------------------------------------
  // The loop

  private frame = (now: number): void => {
    const dt = Math.min(0.25, Math.max(0, (now - (this.last || now)) / 1000));
    this.last = now;
    const t = this.table;
    if (t) {
      for (const e of t.step(dt)) this.on(e);
      if (t.phase === 'betting') {
        const left = Math.ceil(t.countdown);
        if (left <= 3 && left !== this.lastBeep && t.countdown > 0) {
          this.lastBeep = left;
          sfx.count(left);
        }
      } else if (t.phase === 'flying') sfx.rush(t.multiplier);
      const you = t.yours;
      this.sky.draw(now, { phase: t.phase, t: t.t, m: t.multiplier, crash: t.round.crash, countdown: t.countdown, you: you ? { amount: you.amount, cashedAt: you.cashedAt, payout: you.payout } : null });
      // The color drains out of the whole page for a beat after a crash.
      document.body.classList.toggle('drained', this.sky.drained(now, t.phase));
    }
    if (tickRefill(this.save, Date.now())) {
      sfx.refill();
      this.ui.toast(`Grandma slipped you ${REFILL_COINS.toLocaleString('en-US')} coins. “Don’t spend it all on candy.”`, 4500);
      this.persist(true);
    }
    this.ui.update(this.actionState(), now);
    const wall = Date.now();
    if (wall - this.lastLocal > LOCAL_SAVE_MS) this.persist();
    requestAnimationFrame(this.frame);
  };

  private on(e: TableEvent): void {
    const t = this.table!;
    switch (e.type) {
      case 'join':
        this.ui.addRow(e.bet, t.bets);
        break;
      case 'launch':
        sfx.launch();
        this.sky.launch();
        this.ui.announce('Launched.');
        break;
      case 'milestone':
        sfx.milestone(MILESTONES.indexOf(e.at));
        this.sky.milestone(e.at);
        break;
      case 'cashout':
        if (e.bet.you) {
          autoCashed(this.save, e.bet);
          this.youCashed(e.bet);
        } else {
          this.sky.cashout(e.bet.who, e.bet.cashedAt!, false);
          this.ui.cashed(e.bet);
        }
        break;
      case 'crash': {
        const lost = crashed(this.save, t);
        sfx.crash();
        this.sky.crash();
        this.ui.finish(t.bets);
        this.ui.syncHistory();
        this.ui.announce(`Sugar crash at ${fmtX(e.at)} times.${lost ? ` You lost ${lost}.` : ''}`);
        if (lost) buzz.bad();
        else buzz.heavy();
        this.persist(true);
        break;
      }
      case 'next':
        this.next();
        break;
    }
  }

  private youCashed(b: Bet): void {
    sfx.cashout(b.cashedAt! >= 5);
    this.sky.cashout(YOU, b.cashedAt!, true);
    this.ui.cashed(b);
    this.ui.announce(`Cashed out at ${fmtX(b.cashedAt!)} times for ${b.payout}.`);
    buzz.success();
    this.persist(true);
  }

  private actionState(): ActionState {
    const s = this.save;
    const t = this.table;
    const amount = clampBet(s.settings.bet, Math.max(s.coins, MIN_BET));
    if (!t) return { kind: 'bet', amount };
    const mine = t.yours;
    if (t.phase === 'betting') {
      if (mine) return { kind: 'placed', amount: mine.amount, countdown: t.countdown };
      if (broke(s)) return { kind: 'broke', seconds: s.refillAt ? (s.refillAt - Date.now()) / 1000 : 30 };
      return { kind: 'bet', amount };
    }
    if (t.phase === 'flying' && mine && mine.cashedAt === null) return { kind: 'cash', payout: payoutFor(mine.amount, t.multiplier), m: t.multiplier };
    if (s.queued) return { kind: 'queued', amount: s.queued.amount };
    if (broke(s)) return { kind: 'broke', seconds: s.refillAt ? (s.refillAt - Date.now()) / 1000 : 30 };
    return { kind: 'next', amount };
  }

  // -------------------------------------------------------------------------
  // Controller

  act(): void {
    unlock();
    const s = this.save;
    const t = this.table;
    if (!t) return;
    const state = this.actionState();
    const target = s.settings.autoOn ? s.settings.auto : null;
    switch (state.kind) {
      case 'bet': {
        const r = placeBet(s, t, state.amount, target);
        if (r === 'ok') {
          sfx.bet();
          buzz.tap();
          this.ui.addRow(t.yours!, t.bets);
          this.persist(true);
        } else {
          sfx.nope();
          if (r === 'funds') this.ui.toast(`You need at least ${MIN_BET} coins to bet.`);
        }
        break;
      }
      case 'placed':
        if (cancelBet(s, t)) {
          this.ui.removeRow(YOU, t.bets);
          buzz.tap();
          this.persist(true);
        }
        break;
      case 'cash': {
        const b = cashOut(s, t);
        if (b) this.youCashed(b);
        break;
      }
      case 'next':
        if (queueBet(s, state.amount, target)) {
          sfx.bet();
          buzz.tap();
          this.persist();
        }
        break;
      case 'queued':
        s.queued = null;
        buzz.tap();
        this.persist();
        break;
      case 'broke':
        break;
    }
  }

  setBet(amount: number): void {
    this.save.settings.bet = clampBet(amount, Math.max(this.save.coins, MIN_BET));
    this.persist();
  }

  setAuto(target: number): void {
    this.save.settings.auto = clampTarget(target);
    this.persist();
  }

  setAutoOn(on: boolean): void {
    this.save.settings.autoOn = on;
    this.persist();
  }

  toggleSound(): void {
    unlock();
    this.save.settings.sound = !this.save.settings.sound;
    setSound(this.save.settings.sound);
    if (!this.save.settings.sound) sfx.rushOff();
    this.persist();
  }

  reset(): void {
    const t = this.table;
    if (t?.yours && t.phase === 'betting') cancelBet(this.save, t);
    const sound = this.save.settings.sound;
    this.save = newSave(Date.now());
    this.save.settings.sound = sound;
    localSave.clear();
    nativeSave.clear();
    this.ui.toast('Fresh start: 1,000 coins.');
    this.persist(true);
  }

  verify(r: RoundRecord): Promise<boolean> {
    return verify(r.seed, r.hash, r.crash);
  }

  currentHash(): string {
    return this.table?.round.hash ?? '';
  }

  // -------------------------------------------------------------------------
  // Plumbing

  private bind(): void {
    const first = () => {
      unlock();
      window.removeEventListener('pointerdown', first, true);
      window.removeEventListener('keydown', first, true);
    };
    window.addEventListener('pointerdown', first, true);
    window.addEventListener('keydown', first, true);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.ui.modalOpen) {
        this.ui.closeModal();
        return;
      }
      if ((e.key === ' ' || e.code === 'Space') && !this.ui.typing && !this.ui.modalOpen && !e.repeat) {
        e.preventDefault();
        this.act();
      }
    });
    new ResizeObserver(() => this.sky.resize()).observe(this.canvas);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        suspend(true);
        this.persist(true);
      } else suspend(false);
    });
    window.addEventListener('pagehide', () => this.persist(true));
    onAppState({
      background: () => {
        suspend(true);
        this.persist(true);
      },
      foreground: () => suspend(false),
      back: () => {
        if (!this.ui.modalOpen) return false;
        this.ui.closeModal();
        return true;
      },
    });
  }

  private persist(cloud = false): void {
    const now = Date.now();
    this.save.updatedAt = now;
    const raw = JSON.stringify(this.save);
    localSave.save(raw);
    nativeSave.save(raw);
    this.lastLocal = now;
    if (cloud || now - this.lastCloud > CLOUD_SAVE_MS) {
      this.lastCloud = now;
      void this.cloud.save(raw);
    }
  }

  private async connectCloud(): Promise<void> {
    if (!(await this.cloud.connect())) return;
    const remote = loadSave(await this.cloud.load());
    // The cloud copy wins if it's newer (another device), or on a new device, as long as nothing is riding here.
    if (remote && !this.table?.yours && (remote.updatedAt > this.save.updatedAt + 5_000 || !this.hadSave)) {
      const p = remote.pending;
      const left = settleLeft(remote);
      this.save = remote;
      setSound(remote.settings.sound);
      this.ui.syncSound();
      this.ui.syncHistory();
      if (p && left !== null) this.ui.toast(left ? `Your bet from last time cashed out at ${fmtX(p.target!)}×.` : `Your bet from last time sugar-crashed at ${fmtX(p.crash)}×.`);
      this.persist();
    } else this.persist(true);
  }

  snapshot(): HotData {
    return { save: JSON.stringify(this.save) };
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
