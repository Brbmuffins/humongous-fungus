// Players and their coins. One wallet per player for the whole arcade; the
// coins are play money and live only here, so a player can't edit them.
// Saved to one JSON file (written to a temp file, then renamed over the old
// one, so a crash never leaves half a file).
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ARCADE, MIN_BET, noBets, payOut, placeBet, refundBet, type ArcadeGame, type ArcadeSeat, type BetStats } from '@hammygotchi/arcade';
import type { FitId } from '@hammygotchi/defs';
import { checkName, NAME_MAX, type NameCheck, type NameError } from '../shared/names';
import { MAX_COINS, START_COINS, TOP_UP_COINS, type Me, type StakeGame } from '../shared/protocol';

export interface Player extends ArcadeSeat {
  id: string;
  name: string;
  emoji: string;
  secretHash: string;
  topUps: number;
  createdAt: number;
  lastSeen: number;
  /** Coins on a round that hasn't finished: held until it does. */
  stakes: Partial<Record<StakeGame, number>>;
}

/** What players ride as. Not the cast's emoji (those are the made-up riders'). */
export const AVATARS: readonly string[] = ['🧑‍🚀', '🦸', '🐸', '🐙', '🦊', '🐼', '🤠', '🥷', '🧙', '🐧', '🦄', '👾', '🐲', '🦖', '🐝', '🦉'];

const FILE_VERSION = 1;
/** The most players we keep. */
export const MAX_PLAYERS = 50_000;

export const hashSecret = (secret: string): string => createHash('sha256').update(`hammys-arcade:${secret}`).digest('hex');

type Saved = Omit<Player, 'fit' | 'fresh' | 'diedAt' | 'stats'> & { stats: Record<ArcadeGame, BetStats> };

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export interface StoreOptions {
  /** The JSON file to keep players in; null keeps them in memory only. */
  file?: string | null;
  now?: () => number;
  /** How long to wait after a change before saving. */
  saveDelayMs?: number;
}

export class Store {
  readonly players = new Map<string, Player>();
  private bySecret = new Map<string, Player>();
  private names = new Map<string, string>();
  private file: string | null;
  private now: () => number;
  private delay: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();
  private dirty = false;

  constructor(opts: StoreOptions = {}) {
    this.file = opts.file ?? null;
    this.now = opts.now ?? Date.now;
    this.delay = opts.saveDelayMs ?? 1500;
  }

  // Loading and saving ----------------------------------------------------------

  /** Read the saved players. Returns how many coins went back to players from rounds a restart cut short. */
  load(): { players: number; refunded: number } {
    let refunded = 0;
    if (this.file && existsSync(this.file)) {
      let raw: { players?: Partial<Saved>[] } | null = null;
      try {
        raw = JSON.parse(readFileSync(this.file, 'utf8')) as { players?: Partial<Saved>[] };
      } catch {
        // A damaged file: keep it (renamed) rather than overwrite it, and start empty.
        try {
          renameSync(this.file, `${this.file}.damaged-${this.now()}`);
        } catch {
          // Nothing more to do.
        }
      }
      for (const d of raw?.players ?? []) {
        const p = this.revive(d);
        if (!p) continue;
        // A round that was on when the server stopped is gone: the stake goes back.
        for (const g of Object.keys(p.stakes) as StakeGame[]) {
          refunded += p.stakes[g] ?? 0;
          this.giveBack(p, g);
        }
        this.add(p);
      }
    }
    return { players: this.players.size, refunded };
  }

  private revive(d: Partial<Saved>): Player | null {
    if (!d || typeof d !== 'object' || typeof d.id !== 'string' || typeof d.secretHash !== 'string' || typeof d.name !== 'string') return null;
    const saved = (d.stats ?? {}) as Record<string, Partial<BetStats> | undefined>;
    const arcade = noBets();
    for (const g of ARCADE) {
      const b = saved[g.id];
      if (b && typeof b === 'object') arcade[g.id] = { rounds: Math.max(0, Math.floor(num(b.rounds, 0))), net: Math.floor(num(b.net, 0)), best: Math.max(0, num(b.best, 0)) };
    }
    const stakes: Player['stakes'] = {};
    for (const g of ['rocket', 'crossing', 'mines'] as const) {
      const v = d.stakes?.[g];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) stakes[g] = Math.floor(v);
    }
    return {
      id: d.id,
      name: d.name,
      emoji: typeof d.emoji === 'string' ? d.emoji : AVATARS[0],
      secretHash: d.secretHash,
      topUps: Math.max(0, Math.floor(num(d.topUps, 0))),
      createdAt: num(d.createdAt, this.now()),
      lastSeen: num(d.lastSeen, this.now()),
      stakes,
      coins: Math.min(MAX_COINS, Math.max(0, Math.floor(num(d.coins, START_COINS)))),
      fit: 'classic' as FitId,
      fresh: 100,
      diedAt: null,
      stats: { arcade },
    };
  }

  private serialize(): string {
    const players = [...this.players.values()].map((p): Saved => {
      const { fit: _f, fresh: _r, diedAt: _d, stats, ...rest } = p;
      return { ...rest, stats: stats.arcade };
    });
    return JSON.stringify({ v: FILE_VERSION, savedAt: this.now(), players });
  }

  /** Something changed: save soon. */
  touch(): void {
    if (!this.file) return;
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.save();
    }, this.delay);
    this.timer.unref?.();
  }

  /** Save now (async; one write at a time). */
  save(): Promise<void> {
    const file = this.file;
    if (!file || !this.dirty) return this.writing;
    this.dirty = false;
    const body = this.serialize();
    const tmp = `${file}.${process.pid}.tmp`;
    this.writing = this.writing
      .then(async () => {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(tmp, body);
        await rename(tmp, file);
      })
      .catch((e: unknown) => {
        this.dirty = true;
        console.error('hammys-arcade: could not save wallets:', e instanceof Error ? e.message : e);
      });
    return this.writing;
  }

  /** Save now and wait for it (shutdown, tests). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.writing;
    await this.save();
  }

  /** Save before the process ends, with nothing async left to wait on. */
  flushSync(): void {
    const file = this.file;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.sync.tmp`;
    writeFileSync(tmp, this.serialize());
    renameSync(tmp, file);
    this.dirty = false;
  }

  // Players ---------------------------------------------------------------------

  private add(p: Player): void {
    this.players.set(p.id, p);
    this.bySecret.set(p.secretHash, p);
    this.names.set(p.name.toLowerCase(), p.id);
  }

  /** A name nobody has: the one asked for, or with #digits on the end. */
  private uniqueName(name: string, self?: string): string {
    const taken = (n: string) => {
      const owner = this.names.get(n.toLowerCase());
      return owner !== undefined && owner !== self;
    };
    if (!taken(name)) return name;
    for (let tries = 0; tries < 50; tries++) {
      const suffix = `#${100 + randomBytes(2).readUInt16BE() % 9900}`;
      const candidate = `${name.slice(0, NAME_MAX)}${suffix}`;
      if (!taken(candidate)) return candidate;
    }
    return `${name.slice(0, NAME_MAX)}#${randomBytes(4).toString('hex')}`;
  }

  /** A new player. Returns the secret, once: only its hash is kept. */
  create(raw: unknown): { ok: true; player: Player; secret: string } | { ok: false; error: NameError | 'full' } {
    const c = checkName(raw);
    if (!c.ok) return c;
    if (this.players.size >= MAX_PLAYERS) return { ok: false, error: 'full' };
    const secret = randomBytes(24).toString('base64url');
    const t = this.now();
    const p: Player = {
      id: randomBytes(6).toString('hex'),
      name: this.uniqueName(c.name),
      emoji: AVATARS[randomBytes(1)[0] % AVATARS.length],
      secretHash: hashSecret(secret),
      topUps: 0,
      createdAt: t,
      lastSeen: t,
      stakes: {},
      coins: START_COINS,
      fit: 'classic' as FitId,
      fresh: 100,
      diedAt: null,
      stats: { arcade: noBets() },
    };
    this.add(p);
    this.touch();
    return { ok: true, player: p, secret };
  }

  /** Whose secret is this? */
  auth(secret: unknown): Player | null {
    if (typeof secret !== 'string' || secret.length < 8 || secret.length > 128) return null;
    const p = this.bySecret.get(hashSecret(secret)) ?? null;
    if (p) p.lastSeen = this.now();
    return p;
  }

  rename(p: Player, raw: unknown): NameCheck {
    const c = checkName(raw);
    if (!c.ok) return c;
    if (c.name.toLowerCase() === p.name.toLowerCase()) {
      p.name = c.name;
    } else {
      this.names.delete(p.name.toLowerCase());
      p.name = this.uniqueName(c.name, p.id);
      this.names.set(p.name.toLowerCase(), p.id);
    }
    this.touch();
    return { ok: true, name: p.name };
  }

  me(p: Player): Me {
    return { id: p.id, name: p.name, emoji: p.emoji, coins: p.coins, topUps: p.topUps, riding: this.hasStake(p), stats: structuredClone(p.stats.arcade) };
  }

  // Coins -----------------------------------------------------------------------

  /** Does the player have coins on a round that hasn't finished? */
  hasStake(p: Player): boolean {
    return Object.keys(p.stakes).length > 0;
  }

  /** The free top-up: only when out of coins and nothing's riding. Returns what was given. */
  topUp(p: Player): number {
    if (p.coins >= MIN_BET || this.hasStake(p)) return 0;
    p.coins += TOP_UP_COINS;
    p.topUps += 1;
    this.touch();
    return TOP_UP_COINS;
  }

  /** Put coins on a round and hold them until it ends. False if the player can't (or already has coins on that game). */
  stake(p: Player, game: StakeGame, amount: number): boolean {
    if (p.stakes[game] !== undefined || !Number.isSafeInteger(amount) || !placeBet(p, game, amount)) return false;
    p.stakes[game] = amount;
    this.touch();
    return true;
  }

  /** The round paid `mult` on the stake: pay it, clear the stake. Returns what came back. */
  win(p: Player, game: StakeGame, mult: number): number {
    const bet = p.stakes[game];
    if (bet === undefined) return 0;
    delete p.stakes[game];
    const won = payOut(p, game, bet, mult);
    this.clamp(p, game);
    this.touch();
    return won;
  }

  /** The stake is lost (it was already taken out of the coins). */
  lose(p: Player, game: StakeGame): void {
    if (p.stakes[game] === undefined) return;
    delete p.stakes[game];
    this.touch();
  }

  /** The stake comes back as if never placed (taken back, or the round was cut short). */
  giveBack(p: Player, game: StakeGame): void {
    const bet = p.stakes[game];
    if (bet === undefined) return;
    delete p.stakes[game];
    refundBet(p, game, bet);
    this.touch();
  }

  /** A bet that's paid or lost at once (Poop Plinko). Returns what came back, or null if the bet isn't allowed. */
  instant(p: Player, game: ArcadeGame, amount: number, mult: number): number | null {
    if (!Number.isSafeInteger(amount) || !placeBet(p, game, amount)) return null;
    const won = payOut(p, game, amount, mult);
    this.clamp(p, game);
    this.touch();
    return won;
  }

  private clamp(p: Player, game: ArcadeGame): void {
    p.coins = Math.min(MAX_COINS, p.coins);
    const st = p.stats.arcade[game];
    st.net = Math.max(-MAX_COINS, Math.min(MAX_COINS, st.net));
  }
}
