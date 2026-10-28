// The leaderboard on the front page: the top ten of two boards (biggest win,
// best multiplier), each for this week and all time. Only there when the
// arcade's server is; offline there is nobody to compare with.
import { h, setText } from '@shared/dom';
import { fmt } from '@shared/format';
import { ARCADE_BY_ID } from '@hammygotchi/arcade';
import { BOARD_TOP, type BoardKind, type BoardPeriod, type BoardRow } from '../shared/protocol';
import type { Arena } from './online/arena';
import type { OnlineWallet } from './online/wallet';

const KINDS: { id: BoardKind; label: string }[] = [
  { id: 'win', label: 'Biggest win' },
  { id: 'mult', label: 'Best multiplier' },
];
const PERIODS: { id: BoardPeriod; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'all', label: 'All-time' },
];

export const xText = (m: number): string => `${m >= 1000 ? Math.floor(m).toLocaleString('en-US') : m.toFixed(2)}×`;

/** "just now", "5 min ago", "3 h ago", "2 d ago", then the date. */
export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  if (s < 14 * 86_400) return `${Math.round(s / 86_400)} d ago`;
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** How long until this week's board starts over. */
export function resetsIn(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(m / 1440);
  const hh = Math.floor((m % 1440) / 60);
  return d ? `${d} d ${hh} h` : hh ? `${hh} h ${m % 60} min` : `${m} min`;
}

export class BoardPanel {
  readonly el: HTMLElement;
  private kind: BoardKind = 'win';
  private period: BoardPeriod = 'week';
  private tabs = new Map<string, HTMLButtonElement>();
  private note = h('p', { class: 'a-board-note' });
  private list = h('ol', { class: 'a-board-list' });
  private me = h('div', { class: 'a-board-me', hidden: true });

  constructor(private arena: Arena) {
    const group = <T extends string>(label: string, items: { id: T; label: string }[], pick: (id: T) => void) =>
      h(
        'div',
        { class: 'a-board-tabs', role: 'group', 'aria-label': label },
        ...items.map((t) => {
          const b = h('button', { class: 'a-board-tab', type: 'button', onclick: () => pick(t.id) }, t.label);
          this.tabs.set(t.id, b);
          return b;
        }),
      );
    this.el = h(
      'section',
      { class: 'a-board', 'aria-labelledby': 'a-board-h' },
      h('h2', { class: 'a-pick', id: 'a-board-h' }, 'Leaderboard'),
      h(
        'div',
        { class: 'a-board-bar' },
        group('Board', KINDS, (k) => ((this.kind = k), this.render())),
        group('Period', PERIODS, (p) => ((this.period = p), this.render())),
      ),
      this.note,
      this.list,
      this.me,
    );
    arena.board.onChange(() => this.render());
    // Coins moved, so a round probably settled: see where you stand now.
    arena.wallet.onChange(() => arena.board.ask(2000));
    // Times on the rows get older; the week gets shorter.
    window.setInterval(() => this.render(), 30_000);
    this.render();
  }

  private row(r: BoardRow, mine: boolean): HTMLElement {
    const g = ARCADE_BY_ID[r.game];
    const main = this.kind === 'win' ? `${fmt(r.won)}` : xText(r.mult);
    const how = this.kind === 'win' ? `${xText(r.mult)} on ${fmt(r.bet)}` : `${fmt(r.won)} on ${fmt(r.bet)}`;
    const when = ago(r.at, this.arena.sky.now());
    return h(
      'li',
      { class: `a-board-row${mine ? ' me' : ''}`, value: r.rank },
      h('span', { class: 'a-board-rank' }, String(r.rank)),
      h('span', { class: 'a-board-who' }, `${r.emoji} ${r.name}`, mine ? h('em', null, ' you') : null),
      h('span', { class: 'a-board-val' }, main, this.kind === 'win' ? h('small', null, ' coins') : null),
      h('span', { class: 'a-board-sub' }, `${g?.emoji ?? ''} ${g?.name ?? r.game} · ${how} · ${when}`),
    );
  }

  render(): void {
    for (const [id, b] of this.tabs) {
      const on = id === this.kind || id === this.period;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    const b = this.arena.board;
    const w = this.arena.wallet as OnlineWallet;
    const rows = b.state?.lists[this.kind][this.period] ?? [];
    const mine = b.standing?.[this.kind][this.period] ?? null;
    setText(
      this.note,
      this.period === 'week' && b.state
        ? `Starts over Monday at midnight US Eastern, in ${resetsIn(b.state.weekEnd - this.arena.sky.now())}. Only wins count, one line per player.`
        : 'Only wins count, one line per player: their best.',
    );
    this.list.replaceChildren(...rows.slice(0, BOARD_TOP).map((r) => this.row(r, r.who === w.id)));
    if (!rows.length) this.list.append(h('li', { class: 'a-board-none' }, b.state ? 'Nobody yet. Win something and you’re first.' : 'Waiting for the arcade…'));
    // Where you are, when that is below the top ten (or nowhere yet).
    if (mine && mine.rank > BOARD_TOP) {
      this.me.replaceChildren(h('span', { class: 'a-board-gap', 'aria-hidden': 'true' }, '⋯'), h('ol', { class: 'a-board-list', start: mine.rank }, this.row(mine, true)));
      this.me.hidden = false;
    } else if (!mine && rows.length && !rows.some((r) => r.who === w.id)) {
      this.me.replaceChildren(document.createTextNode('You’re not on this one yet. Win something.'));
      this.me.hidden = false;
    } else this.me.hidden = true;
  }
}
