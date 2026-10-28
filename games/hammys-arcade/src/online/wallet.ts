// The online wallet: the server holds the coins, this keeps a copy to show.
// Every answer from the server carries your latest `me`, and that replaces
// the copy. It looks like the offline Wallet to the front page.
import { MIN_BET, noBets, type ArcadeGame } from '@hammygotchi/arcade';
import type { ArcadeHost } from '@hammygotchi/arcadeview';
import type { FitId, FormId } from '@hammygotchi/defs';
import { MAX_COINS, START_COINS, TOP_UP_COINS, type Me } from '../../shared/protocol';
import { formOfTheDay } from '../wallet';
import type { Api } from './api';

const PREFS_KEY = 'hammys-arcade.prefs.v1';

export class OnlineWallet implements ArcadeHost {
  readonly state = { coins: START_COINS, fit: 'classic' as FitId, fresh: 100, diedAt: null as number | null, stats: { arcade: noBets() } };
  readonly form: FormId = formOfTheDay();
  readonly online = true;
  id = '';
  name = '';
  emoji = '🙂';
  topUps = 0;
  sound = true;
  /** What the server says you have, before anything held back. */
  private real = START_COINS;
  private riding = false;
  /** Winnings the server has paid already that a ball is still bouncing towards. */
  private held = 0;
  private listeners: (() => void)[] = [];
  private pending = 0;

  constructor(private api: Api) {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as { sound?: unknown } | null;
      if (p && p.sound === false) this.sound = false;
    } catch {
      // Fresh prefs.
    }
  }

  get coins(): number {
    return this.state.coins;
  }

  get broke(): boolean {
    return this.real < MIN_BET && !this.riding;
  }

  onChange(f: () => void): void {
    this.listeners.push(f);
  }

  /** The server's word on who you are and what you have. */
  applyMe(me: Me): void {
    this.id = me.id;
    this.name = me.name;
    this.emoji = me.emoji;
    this.topUps = me.topUps;
    this.riding = me.riding;
    this.real = Math.min(MAX_COINS, me.coins);
    this.state.coins = Math.max(0, this.real - this.held);
    this.state.stats.arcade = me.stats as Record<ArcadeGame, (typeof me.stats)[ArcadeGame]>;
    this.changed();
  }

  hold(coins: number): void {
    this.held += coins;
    this.state.coins = Math.max(0, this.real - this.held);
    this.changed();
  }

  release(coins: number): void {
    this.held = Math.max(0, this.held - coins);
    this.state.coins = Math.max(0, this.real - this.held);
    this.changed();
  }

  /** Ask the server again (soon, and not more than once in a burst). */
  refresh(): void {
    if (this.pending) return;
    this.pending = window.setTimeout(async () => {
      this.pending = 0;
      const r = await this.api.post('me');
      if (r.me) this.applyMe(r.me);
    }, 250);
  }

  // The offline wallet's calls. The online games never use them: their coins move on the server.
  bet(): boolean {
    return false;
  }
  payOut(): number {
    return 0;
  }
  refund(): void {}

  /** The free coins for when you're out. Returns what you got: 0 if you aren't out. */
  async topUp(): Promise<number> {
    const r = await this.api.post('topup');
    if (r.me) this.applyMe(r.me);
    return r.ok ? Number(r.given) || TOP_UP_COINS : 0;
  }

  async rename(name: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const r = await this.api.post('rename', { name });
    if (r.me) this.applyMe(r.me);
    return r.ok ? { ok: true } : { ok: false, message: r.message };
  }

  setSound(on: boolean): void {
    this.sound = on;
    this.save();
    this.changed();
  }

  save(): void {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ sound: this.sound }));
    } catch {
      // Not saved.
    }
  }

  private changed(): void {
    for (const f of this.listeners) f();
  }
}
