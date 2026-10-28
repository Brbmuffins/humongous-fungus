// The arcade's leaderboard. Two boards (biggest single payout, best multiplier),
// each for this week and for all time, and each player appears once on each: with
// their best. It is fed from one place, the store's settling of a payout, so every
// game, now or later, is on it without any wiring of its own, and only real players
// can be on it because only they have a wallet there. It is kept in the wallet file.
import type { ArcadeGame } from '@hammygotchi/arcade';
import { BOARD_KINDS, BOARD_PERIODS, BOARD_TOP, type BoardKind, type BoardLists, type BoardMine, type BoardPeriod, type BoardRow, type BoardState } from '../shared/protocol';

/** How many of the best a list remembers. Someone below that has no rank until they get above it. */
export const BOARD_KEEP = 500;

const DAY = 86_400_000;
const ZONE = 'America/New_York';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const clock = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' });

function wall(ms: number): { y: number; m: number; d: number; h: number; mi: number; s: number; wd: number } {
  const o: Record<string, string> = {};
  for (const p of clock.formatToParts(ms)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: DAYS.indexOf(o.weekday) };
}

/** US Eastern's offset from UTC at that moment, in ms (negative). */
function offsetAt(ms: number): number {
  const w = wall(ms);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

/** The most recent Monday 00:00 in US Eastern (daylight saving included), as a UTC time in ms. */
export function weekStartET(ms: number): number {
  const w = wall(ms);
  const civil = Date.UTC(w.y, w.m - 1, w.d - ((w.wd + 6) % 7));
  // Nothing changes the clock on a Monday, so the offset at 05:00 UTC that day is the one at midnight.
  return civil - offsetAt(civil + 5 * 3_600_000);
}

/** The Monday 00:00 after the week `start` began. */
export const weekEndET = (start: number): number => weekStartET(start + 7.5 * DAY);

interface Entry {
  who: string;
  game: ArcadeGame;
  bet: number;
  won: number;
  mult: number;
  at: number;
  /** Order of arrival: what breaks a tie. */
  seq: number;
}

export interface BoardChange {
  kind: BoardKind;
  period: BoardPeriod;
}

type Lists = Record<BoardKind, Record<BoardPeriod, Entry[]>>;
const emptyLists = (): Lists => ({ win: { week: [], all: [] }, mult: { week: [], all: [] } });
const value = (kind: BoardKind, e: Entry): number => (kind === 'win' ? e.won : e.mult);
/** Better first; the same value, whoever got there first. */
const before = (kind: BoardKind, a: Entry, b: Entry): boolean => value(kind, a) > value(kind, b) || (value(kind, a) === value(kind, b) && a.seq < b.seq);

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export class Board {
  private lists: Lists = emptyLists();
  private week: number;
  private seq = 0;

  constructor(private now: () => number = Date.now) {
    this.week = weekStartET(this.now());
  }

  /** A payout settled. Only a win counts: more than the stake came back, at a multiplier above 1. Returns the lists whose top ten changed. */
  record(who: string, game: ArcadeGame, bet: number, won: number, mult: number, at = this.now()): BoardChange[] {
    const changes = this.roll(at);
    const m = Math.floor(mult * 100) / 100;
    if (!(bet >= 1) || !finite(won) || !(won > bet) || !(m > 1)) return changes;
    const e: Entry = { who, game, bet, won, mult: m, at, seq: ++this.seq };
    for (const kind of BOARD_KINDS) {
      for (const period of BOARD_PERIODS) {
        if (this.put(kind, this.lists[kind][period], e) && !changes.some((c) => c.kind === kind && c.period === period)) changes.push({ kind, period });
      }
    }
    return changes;
  }

  /** Put the entry in its place if it beats that player's own best there. Whether the top ten moved. */
  private put(kind: BoardKind, list: Entry[], e: Entry): boolean {
    const top = () => list.slice(0, BOARD_TOP).map((x) => x.seq).join();
    const was = top();
    const i = list.findIndex((x) => x.who === e.who);
    if (i >= 0) {
      if (!before(kind, e, list[i])) return false;
      list.splice(i, 1);
    }
    let at = list.findIndex((x) => before(kind, e, x));
    if (at < 0) at = list.length;
    if (at >= BOARD_KEEP) return false;
    list.splice(at, 0, e);
    if (list.length > BOARD_KEEP) list.length = BOARD_KEEP;
    return top() !== was;
  }

  /** When the week turned over, forget last week's. Returns the weekly lists that changed. */
  private roll(at: number): BoardChange[] {
    const w = weekStartET(at);
    if (w <= this.week) return [];
    this.week = w;
    const changes: BoardChange[] = [];
    for (const kind of BOARD_KINDS) {
      if (this.lists[kind].week.length) changes.push({ kind, period: 'week' });
      this.lists[kind].week = [];
    }
    return changes;
  }

  /** The next time something changes with no payout: the week turning over. */
  nextAt(): number {
    return weekEndET(this.week);
  }

  /** Do whatever is due by now. */
  tick(): BoardChange[] {
    return this.roll(this.now());
  }

  // Reading ---------------------------------------------------------------------------

  private row(e: Entry, rank: number, who: (id: string) => { name: string; emoji: string } | undefined): BoardRow | null {
    const p = who(e.who);
    return p ? { rank, who: e.who, name: p.name, emoji: p.emoji, game: e.game, bet: e.bet, won: e.won, mult: e.mult, at: e.at } : null;
  }

  private rows(list: Entry[], who: (id: string) => { name: string; emoji: string } | undefined, n: number): BoardRow[] {
    const out: BoardRow[] = [];
    for (let i = 0; i < list.length && out.length < n; i++) {
      const r = this.row(list[i], i + 1, who);
      if (r) out.push(r);
    }
    return out;
  }

  top(kind: BoardKind, period: BoardPeriod, who: (id: string) => { name: string; emoji: string } | undefined): BoardRow[] {
    this.roll(this.now());
    return this.rows(this.lists[kind][period], who, BOARD_TOP);
  }

  state(who: (id: string) => { name: string; emoji: string } | undefined): BoardState {
    this.roll(this.now());
    const lists = {} as BoardLists;
    for (const k of BOARD_KINDS) lists[k] = { week: this.rows(this.lists[k].week, who, BOARD_TOP), all: this.rows(this.lists[k].all, who, BOARD_TOP) };
    return { weekStart: this.week, weekEnd: weekEndET(this.week), lists };
  }

  /** Where this player stands on every list. */
  mine(id: string, who: (id: string) => { name: string; emoji: string } | undefined): BoardMine {
    this.roll(this.now());
    const out = {} as BoardMine;
    for (const k of BOARD_KINDS) {
      out[k] = { week: null, all: null };
      for (const p of BOARD_PERIODS) {
        const list = this.lists[k][p];
        const i = list.findIndex((x) => x.who === id);
        out[k][p] = i < 0 ? null : this.row(list[i], i + 1, who);
      }
    }
    return out;
  }

  // Keeping ---------------------------------------------------------------------------

  save(): unknown {
    return { week: this.week, seq: this.seq, lists: this.lists };
  }

  /** Read what `save` wrote; anything damaged is left out rather than trusted. */
  load(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const d = raw as { week?: unknown; seq?: unknown; lists?: Record<string, Record<string, unknown> | undefined> };
    const week = finite(d.week) ? d.week : this.week;
    let seq = finite(d.seq) ? Math.floor(d.seq) : 0;
    const lists = emptyLists();
    for (const kind of BOARD_KINDS) {
      for (const period of BOARD_PERIODS) {
        const src = d.lists?.[kind]?.[period];
        if (!Array.isArray(src)) continue;
        const seen = new Set<string>();
        const out: Entry[] = [];
        for (const x of src as Partial<Entry>[]) {
          if (!x || typeof x.who !== 'string' || typeof x.game !== 'string' || x.game.length > 24 || !finite(x.bet) || !finite(x.won) || !finite(x.mult) || !finite(x.at) || !finite(x.seq)) continue;
          if (seen.has(x.who) || !(x.won > x.bet) || !(x.mult > 1)) continue;
          seen.add(x.who);
          out.push({ who: x.who, game: x.game as ArcadeGame, bet: x.bet, won: x.won, mult: x.mult, at: x.at, seq: x.seq });
          seq = Math.max(seq, x.seq);
        }
        out.sort((a, b) => (before(kind, a, b) ? -1 : before(kind, b, a) ? 1 : 0));
        lists[kind][period] = out.slice(0, BOARD_KEEP);
      }
    }
    this.lists = lists;
    this.week = week;
    this.seq = seq;
    // A week that ended while the server was off.
    this.roll(this.now());
  }
}
