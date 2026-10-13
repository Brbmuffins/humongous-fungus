import { h, setDisabled, setText } from '@shared/dom';
import { PriceChart } from '@shared/chart';
import { fmt, fmtDuration } from '@shared/format';
import { MARKET_TICK_MS, paidIndex, saleValue, windowChange } from '@shared/market';
import { GOODS, GOOD_BY_ID, GOSSIP_CHANCE, GOSSIP_KEPT, GOSSIP_TRUTH, RANKS, START_CAPS, UPGRADES, type GoodId, type UpgradeId } from './defs';
import {
  capFor,
  change,
  forageValue,
  isUnlocked,
  level,
  mostYouCanBuy,
  netWorth,
  rankIndex,
  spread,
  stockValue,
  upgradeCost,
  type AwayReport,
} from './game';
import type { SporeState } from './state';

export type Tab = 'trade' | 'gossip' | 'stall';

export interface Controller {
  readonly state: SporeState;
  buy(id: GoodId, amount: number | 'max'): void;
  sell(id: GoodId, amount: number | 'all'): void;
  upgrade(id: UpgradeId): void;
  eraseSave(): void;
  refresh(): void;
}

interface Panel {
  key(): string;
  build(root: HTMLElement): void;
  sync(): void;
  shown?(): void;
}

/** ▲ 12% / ▼ 4.5%: arrow and sign, so direction never relies on color alone. */
export function changeText(f: number): string {
  const pct = Math.abs(f * 100);
  return `${f >= 0 ? '▲' : '▼'} ${pct < 10 ? pct.toFixed(1) : fmt(Math.round(pct))}%`;
}

function setChange(el: HTMLElement, f: number): void {
  setText(el, changeText(f));
  el.classList.toggle('up', f >= 0);
  el.classList.toggle('down', f < 0);
}

function bar(): { el: HTMLElement; fill: HTMLElement } {
  const fill = h('span', { class: 'bar-fill' });
  return { el: h('span', { class: 'bar' }, fill), fill };
}

function setBar(fill: HTMLElement, fraction: number): void {
  const w = `${Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10}%`;
  if (fill.style.width !== w) fill.style.width = w;
}

// Stock rots continuously, so show and trade it rounded: 9.98 crates is "10".
const amountText = (n: number): string => (n > 0 && n < 0.5 ? 'less than 1' : fmt(Math.round(n)));

/** How far from the current rank to the next, on a log scale. */
function rankProgress(s: SporeState): number {
  const r = rankIndex(s);
  const next = RANKS[r + 1];
  if (!next) return 1;
  const lo = Math.max(START_CAPS, RANKS[r].worth);
  return Math.log(Math.max(1, s.bestWorth) / lo) / Math.log(next.worth / lo);
}

function sparkline(canvas: HTMLCanvasElement, values: number[], color: string): void {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 4 || values.length < 2) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const c = canvas.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  c.strokeStyle = color;
  c.lineWidth = 1.5;
  c.lineJoin = 'round';
  c.beginPath();
  values.forEach((v, i) => {
    const x = (i / (values.length - 1)) * rect.width;
    const y = rect.height - 2 - ((v - lo) / span) * (rect.height - 4);
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  });
  c.stroke();
}

// ---------------------------------------------------------------------------

class TradePanel implements Panel {
  private selected: GoodId = 'apples';
  private chart = new PriceChart();
  private chartKey = '';
  private sparkKey = '';
  private lineColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-line').trim() || '#f6b95c';
  private chips: { id: GoodId; btn: HTMLButtonElement; price: HTMLElement; move: HTMLElement; held: HTMLElement; spark: HTMLCanvasElement | null }[] = [];
  private refs: {
    price: HTMLElement;
    move: HTMLElement;
    held: HTMLElement;
    worth: HTMLElement;
    worthMove: HTMLElement;
    buy: { n: number | 'max'; btn: HTMLButtonElement; sub: HTMLElement }[];
    sell: { n: number | 'all'; btn: HTMLButtonElement; sub: HTMLElement }[];
  } | null = null;

  constructor(private c: Controller) {}

  key(): string {
    const s = this.c.state;
    return `${this.selected}|${s.market.goods[this.selected].held > 0}|${rankIndex(s)}|${level(s, 'cellar')}`;
  }

  build(root: HTMLElement): void {
    const s = this.c.state;
    const def = GOOD_BY_ID[this.selected];
    const open = isUnlocked(s, def.id);
    this.chartKey = '';
    this.sparkKey = '';
    this.chips = GOODS.map((g) => {
      const unlocked = isUnlocked(s, g.id);
      const price = h('span', { class: 'chip-price' });
      const move = h('span', { class: 'chip-move' });
      const held = h('span', { class: 'chip-held' });
      const spark = unlocked ? h('canvas', { class: 'chip-spark', 'aria-hidden': 'true' }) : null;
      const btn = h(
        'button',
        {
          class: `chip${unlocked ? '' : ' chip-locked'}`,
          type: 'button',
          'aria-pressed': String(g.id === this.selected),
          onclick: () => {
            this.selected = g.id;
            this.c.refresh();
          },
        },
        h('span', { class: 'chip-top' }, h('span', { class: 'chip-name' }, g.name), held),
        spark ?? h('span', { class: 'chip-lock' }, `Opens for ${RANKS[g.rank].name}s`),
        h('span', { class: 'chip-line' }, price, move),
      );
      return { id: g.id, btn, price, move, held, spark };
    });

    const price = h('span', { class: 'quote-price' });
    const move = h('span', { class: 'quote-move' });
    const held = h('span');
    const worth = h('span');
    const worthMove = h('span', { class: 'quote-move' });
    const tradeBtn = (label: string, primary: boolean, onclick: () => void) => {
      const sub = h('span', { class: 'trade-sub' });
      const btn = h(
        'button',
        { class: `trade-btn${primary ? ' trade-buy' : ' trade-sell'}`, type: 'button', onclick },
        h('span', { class: 'trade-label' }, label),
        sub,
      );
      return { btn, sub };
    };
    const buy = ([1, 10, 'max'] as const).map((n) => ({
      n,
      ...tradeBtn(n === 'max' ? 'Buy max' : `Buy ${n}`, true, () => this.c.buy(this.selected, n)),
    }));
    const sell = ([1, 10, 'all'] as const).map((n) => ({
      n,
      ...tradeBtn(n === 'all' ? 'Sell all' : `Sell ${n}`, false, () => this.c.sell(this.selected, n)),
    }));

    const rot =
      def.rotPerHour > 0
        ? `Rots about ${Math.round(def.rotPerHour * 100)}% an hour while you hold it, even while you're away. Rotten stock goes to the compost cart for a tenth of its value.`
        : 'Never spoils.';

    root.append(
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Goods' }, ...this.chips.map((x) => x.btn)),
      h(
        'section',
        { class: 'quote', 'aria-label': def.name },
        h(
          'div',
          { class: 'quote-head' },
          h('div', { class: 'quote-name' }, h('h2', { class: 'sub' }, def.name), def.latin ? h('span', { class: 'latin' }, def.latin) : null),
          h('p', { class: 'quote-line' }, price, h('span', { class: 'quote-unit' }, ` caps a ${def.unit}`), move),
        ),
        this.chart.el,
        h('p', { class: 'note' }, def.blurb),
      ),
      open
        ? h(
            'section',
            { class: 'holding', 'aria-label': 'Your stock' },
            h('p', null, held),
            h('p', null, worth, ' ', worthMove),
            h('p', { class: 'note' }, rot),
          )
        : h(
            'section',
            { class: 'locked' },
            h('p', { class: 'eyebrow' }, 'Not for sale to you yet'),
            h(
              'p',
              null,
              `The ${def.name.toLowerCase()} sellers only deal with ${RANKS[def.rank].name.toLowerCase()}s. Reach a net worth of ${fmt(RANKS[def.rank].worth)} caps to trade here.`,
            ),
          ),
      ...(open ? [h('div', { class: 'trade' }, ...buy.map((b) => b.btn), ...sell.map((b) => b.btn))] : []),
      h('p', { class: 'note' }, `Prices change every ${MARKET_TICK_MS / 1000} seconds, even while the game is closed. The market keeps ${Math.round(spread(s) * 100)}% of every sale.`),
    );
    this.refs = open ? { price, move, held, worth, worthMove, buy, sell } : { price, move, held, worth, worthMove, buy: [], sell: [] };
  }

  sync(): void {
    const s = this.c.state;
    const m = s.market;
    const sp = spread(s);
    const sparkKey = `${m.tickAt}`;
    const redrawSparks = sparkKey !== this.sparkKey;
    this.sparkKey = sparkKey;
    for (const chip of this.chips) {
      const g = m.goods[chip.id];
      chip.btn.setAttribute('aria-pressed', String(chip.id === this.selected));
      setText(chip.price, fmt(g.price));
      setChange(chip.move, windowChange(m, chip.id));
      setText(chip.held, g.held > 0 ? amountText(g.held) : '');
      if (chip.spark && redrawSparks) sparkline(chip.spark, g.history.slice(-60), this.lineColor);
    }
    const r = this.refs;
    if (!r) return;
    const id = this.selected;
    const def = GOOD_BY_ID[id];
    const g = m.goods[id];
    setText(r.price, fmt(g.price));
    setChange(r.move, windowChange(m, id));
    const paid = paidIndex(m, id);
    const key = `${m.tickAt}|${id}|${paid}`;
    if (key !== this.chartKey) {
      this.chartKey = key;
      this.chart.setData(g.history, 1, paid, def.name);
    }
    if (!isUnlocked(s, id)) return;

    const cap = capFor(s, id);
    if (g.held > 0) {
      setText(r.held, `You hold ${amountText(g.held)} of ${fmt(cap)} ${def.units}.`);
      setText(r.worth, `Worth ${fmt(saleValue(m, id, g.held, sp))} now. You paid ${fmt(g.paid)}.`);
      setChange(r.worthMove, change(s, id) ?? 0);
      r.worthMove.hidden = false;
    } else {
      setText(r.held, `You hold no ${def.units}. Your cellar has room for ${fmt(cap)}.`);
      setText(r.worth, `One ${def.unit} costs ${fmt(g.price)} caps right now.`);
      r.worthMove.hidden = true;
    }
    const most = mostYouCanBuy(s, id);
    for (const b of r.buy) {
      const n = b.n === 'max' ? most : b.n;
      setDisabled(b.btn, b.n === 'max' ? most < 1 : most < b.n);
      setText(b.sub, n > 0 ? (b.n === 'max' ? `${fmt(n)} · ${fmt(n * g.price)}` : fmt(n * g.price)) : g.held >= cap - 0.5 ? 'cellar full' : 'too few caps');
    }
    for (const b of r.sell) {
      const n = b.n === 'all' ? g.held : Math.min(b.n, g.held);
      setDisabled(b.btn, b.n === 'all' ? g.held <= 0 : Math.round(g.held) < b.n);
      setText(b.sub, n > 0 ? fmt(saleValue(m, id, n, sp)) : '—');
    }
  }
}

// ---------------------------------------------------------------------------

class GossipPanel implements Panel {
  private ages: { el: HTMLElement; at: number }[] = [];

  constructor(private c: Controller) {}

  key(): string {
    const s = this.c.state;
    return `${s.gossip[0]?.at ?? 0}|${s.gossip.length}|${level(s, 'gossip')}|${rankIndex(s)}`;
  }

  shown(): void {
    const s = this.c.state;
    s.gossipSeenAt = Math.max(s.gossipSeenAt, s.gossip[0]?.at ?? 0);
  }

  build(root: HTMLElement): void {
    const s = this.c.state;
    const g = level(s, 'gossip');
    this.ages = [];
    root.append(
      h(
        'p',
        { class: 'note' },
        `The town talks when a price is about to turn. You hear about ${Math.round(GOSSIP_CHANCE[g] * 100)}% of turns, and the talk is right about ${Math.round(GOSSIP_TRUTH[g] * 100)}% of the time. A better gossip network in Stall improves both.`,
      ),
    );
    if (s.gossip.length === 0) {
      root.append(h('p', { class: 'empty' }, 'Nothing yet. Rumors show up here as prices start to move. Check back in a minute or two.'));
      return;
    }
    const list = h('ol', { class: 'gossip' });
    for (const r of s.gossip) {
      const def = GOOD_BY_ID[r.good];
      const age = h('span', { class: 'gossip-age' });
      this.ages.push({ el: age, at: r.at });
      list.append(
        h(
          'li',
          { class: `rumor${r.at > s.gossipSeenAt ? ' rumor-new' : ''}` },
          h(
            'div',
            { class: 'rumor-top' },
            h('span', { class: 'eyebrow' }, def.name),
            h('span', { class: `claim ${r.claim === 'up' ? 'up' : 'down'}` }, r.claim === 'up' ? '▲ says up' : '▼ says down'),
          ),
          h('p', { class: 'rumor-text' }, `“${r.text}”`),
          age,
        ),
      );
    }
    root.append(list);
  }

  sync(): void {
    const now = Date.now();
    for (const a of this.ages) setText(a.el, `${fmtDuration((now - a.at) / 1000)} ago`);
  }
}

// ---------------------------------------------------------------------------

class StallPanel implements Panel {
  private confirming = false;
  private ups: { id: UpgradeId; btn: HTMLButtonElement | null; cost: number | null }[] = [];
  private stats: { el: HTMLElement; value: () => string }[] = [];
  private progress: HTMLElement | null = null;

  constructor(private c: Controller) {}

  key(): string {
    const s = this.c.state;
    return `${rankIndex(s)}|${UPGRADES.map((u) => level(s, u.id)).join()}|${this.confirming}`;
  }

  private setConfirm(v: boolean): void {
    this.confirming = v;
    this.c.refresh();
  }

  build(root: HTMLElement): void {
    const s = this.c.state;
    const r = rankIndex(s);

    const ladder = h('ol', { class: 'ladder' });
    this.progress = null;
    RANKS.forEach((rank, i) => {
      const goods = GOODS.filter((g) => g.rank === i).map((g) => g.name);
      const state = i < r ? 'done' : i === r ? 'current' : i === r + 1 ? 'next' : 'later';
      let extra: Node | null = null;
      if (state === 'next') {
        const b = bar();
        this.progress = b.fill;
        extra = b.el;
      }
      ladder.append(
        h(
          'li',
          { class: `rung rung-${state}` },
          h('span', { class: 'rung-name' }, rank.name),
          h('span', { class: 'rung-worth' }, i === 0 ? 'start' : `${fmt(rank.worth)} caps`),
          goods.length ? h('span', { class: 'rung-goods' }, `Unlocks ${goods.join(', ')}`) : null,
          extra,
        ),
      );
    });

    this.ups = [];
    const upList = h('div', { class: 'list' });
    for (const u of UPGRADES) {
      const l = level(s, u.id);
      const cost = upgradeCost(s, u.id);
      const btn =
        cost === null
          ? null
          : h(
              'button',
              { class: 'card', type: 'button', onclick: () => this.c.upgrade(u.id) },
              h(
                'div',
                { class: 'card-main' },
                h('span', { class: 'card-name' }, u.name),
                h('span', { class: 'card-level' }, `Level ${l} of ${u.max}`),
                h('span', { class: 'card-desc' }, u.next(l)),
              ),
              h('span', { class: 'cost' }, fmt(cost)),
            );
      upList.append(
        btn ??
          h(
            'div',
            { class: 'card card-done' },
            h('div', { class: 'card-main' }, h('span', { class: 'card-name' }, u.name), h('span', { class: 'card-level' }, `Level ${l} of ${u.max}, fully upgraded`)),
          ),
      );
      this.ups.push({ id: u.id, btn, cost });
    }

    const rows: [string, () => string][] = [
      ['Net worth', () => fmt(netWorth(s))],
      ['Best net worth', () => fmt(s.bestWorth)],
      ['Stock on hand', () => fmt(stockValue(s))],
      ['Profit from trades', () => `${s.stats.profit < 0 ? '-' : ''}${fmt(Math.abs(s.stats.profit))}`],
      ['Trades', () => fmt(s.stats.trades)],
      ['Times foraged', () => fmt(s.stats.forages)],
      ['Each forage finds', () => `${fmt(forageValue(s))} caps`],
    ];
    this.stats = [];
    const dl = h('dl', { class: 'stats' });
    for (const [label, value] of rows) {
      const dd = h('dd');
      dl.append(h('div', null, h('dt', null, label), dd));
      this.stats.push({ el: dd, value });
    }

    const erase = this.confirming
      ? h(
          'div',
          { class: 'confirm' },
          h('p', null, 'Erase your stall, caps and stock and start over? This cannot be undone.'),
          h(
            'div',
            { class: 'confirm-row' },
            h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => this.setConfirm(false) }, 'Keep my stall'),
            h(
              'button',
              {
                class: 'btn btn-danger',
                type: 'button',
                onclick: () => {
                  this.confirming = false;
                  this.c.eraseSave();
                },
              },
              'Erase save',
            ),
          ),
        )
      : h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => this.setConfirm(true) }, 'Erase save…');

    root.append(
      h('h2', { class: 'sub' }, 'Your standing'),
      ladder,
      h('h2', { class: 'sub' }, 'Improve the stall'),
      upList,
      h('h2', { class: 'sub' }, 'Ledger'),
      dl,
      h('div', { class: 'erase' }, erase),
    );
  }

  sync(): void {
    const s = this.c.state;
    if (this.progress) setBar(this.progress, rankProgress(s));
    for (const u of this.ups) {
      if (!u.btn || u.cost === null) continue;
      const can = s.caps >= u.cost;
      setDisabled(u.btn, !can);
      u.btn.classList.toggle('affordable', can);
    }
    for (const st of this.stats) setText(st.el, st.value());
  }
}

// ---------------------------------------------------------------------------

export class GameUI {
  private tab: Tab = 'trade';
  private panels: Record<Tab, Panel>;
  private builtKey = '';
  private toastTimer = 0;
  private modalClose: (() => void) | null = null;

  private caps = document.getElementById('caps')!;
  private worth = document.getElementById('worth')!;
  private rank = document.getElementById('rank')!;
  private rankFill = document.getElementById('rankFill')!;
  private hint = document.getElementById('hint')!;
  private panel = document.getElementById('panel')!;
  private toastEl = document.getElementById('toast')!;
  private modal = document.getElementById('modal')!;
  private tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-tab]')];

  constructor(private c: Controller) {
    this.panels = { trade: new TradePanel(c), gossip: new GossipPanel(c), stall: new StallPanel(c) };
    for (const t of this.tabs) t.addEventListener('click', () => this.setTab(t.dataset.tab as Tab));
    this.tabs[0].parentElement!.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = this.tabs.findIndex((t) => t.dataset.tab === this.tab);
      const next = this.tabs[(i + (e.key === 'ArrowRight' ? 1 : this.tabs.length - 1)) % this.tabs.length];
      this.setTab(next.dataset.tab as Tab);
      next.focus();
    });
    this.modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });
    this.setTab('trade');
  }

  setTab(tab: Tab): void {
    this.tab = tab;
    for (const t of this.tabs) {
      const on = t.dataset.tab === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    }
    this.panel.setAttribute('aria-labelledby', `tab-${tab}`);
    this.panel.scrollTop = 0;
    this.sync(true);
  }

  sync(force = false): void {
    const p = this.panels[this.tab];
    const key = `${this.tab}|${p.key()}`;
    if (force || key !== this.builtKey) {
      const scroll = this.panel.scrollTop;
      const focused = [...this.panel.querySelectorAll('button')].indexOf(document.activeElement as HTMLButtonElement);
      this.panel.replaceChildren();
      p.build(this.panel);
      this.builtKey = key;
      this.panel.scrollTop = scroll;
      if (focused >= 0) this.panel.querySelectorAll('button')[focused]?.focus();
    }
    p.shown?.();
    p.sync();
    this.syncBadges();
  }

  private syncBadges(): void {
    const s = this.c.state;
    const unread = s.gossip.filter((r) => r.at > s.gossipSeenAt).length;
    const affordable = UPGRADES.filter((u) => {
      const cost = upgradeCost(s, u.id);
      return cost !== null && cost <= s.caps;
    }).length;
    const badges: Record<Tab, string> = {
      trade: '',
      gossip: this.tab === 'gossip' || !unread ? '' : String(unread),
      stall: affordable ? String(affordable) : '',
    };
    for (const t of this.tabs) {
      const b = t.querySelector<HTMLElement>('.badge')!;
      const text = badges[t.dataset.tab as Tab];
      setText(b, text);
      b.hidden = !text;
    }
  }

  updateHeader(): void {
    const s = this.c.state;
    setText(this.caps, fmt(s.caps));
    setText(this.worth, fmt(netWorth(s)));
    setText(this.rank, RANKS[rankIndex(s)].name);
    setBar(this.rankFill, rankProgress(s));
    this.hint.hidden = s.stats.forages >= 8 || !this.toastEl.hidden;
  }

  toast(message: string): void {
    setText(this.toastEl, message);
    this.toastEl.hidden = false;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.hidden = true;
    }, 3000);
  }

  get modalOpen(): boolean {
    return !this.modal.hidden;
  }

  private showModal(children: Node[], action: string, onClose?: () => void): void {
    const btn = h('button', { class: 'btn btn-lantern', type: 'button' }, action);
    const card = h('div', { class: 'modal-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' }, ...children, btn);
    this.modal.replaceChildren(card);
    this.modal.hidden = false;
    this.modalClose = () => {
      this.modal.hidden = true;
      this.modal.replaceChildren();
      this.modalClose = null;
      onClose?.();
    };
    btn.addEventListener('click', () => this.closeModal());
    btn.focus();
  }

  closeModal(): void {
    this.modalClose?.();
  }

  showIntro(): void {
    this.showModal(
      [
        h('p', { class: 'eyebrow' }, 'The night market'),
        h('h2', { id: 'modal-title' }, 'Welcome, sporemonger'),
        h('p', null, 'You have 250 caps and an empty stall. Prices change every few seconds, day and night, even while you sleep.'),
        h('p', null, 'Buy low and sell high. Most goods rot while you hold them, so time it well. Listen to the gossip, and tap the woods to forage when you are short.'),
      ],
      'Open the stall',
    );
  }

  showWelcome(r: AwayReport): void {
    const delta = r.worthBefore > 0 ? r.worthAfter / r.worthBefore - 1 : 0;
    const children: Node[] = [
      h('p', { class: 'eyebrow' }, `Away for ${fmtDuration(r.elapsed)}`),
      h('h2', { id: 'modal-title' }, 'While you were away, your stall became worth'),
      h('p', { class: 'modal-big' }, fmt(r.worthAfter)),
      h('p', { class: `modal-delta ${delta >= 0 ? 'up' : 'down'}` }, `${changeText(delta)} since you left`),
    ];
    if (r.moves.length) {
      const lines = r.moves.map((mv) => {
        const def = GOOD_BY_ID[mv.id];
        const rotted = mv.heldBefore - mv.heldAfter;
        return `${def.name} ${changeText(mv.to / mv.from - 1)}${rotted >= 1 ? `, ${fmt(rotted)} rotted` : ''}`;
      });
      children.push(h('p', null, lines.join(' · ')));
    } else {
      children.push(h('p', null, 'You were not holding anything, so nothing changed. Buy before you leave next time.'));
    }
    if (r.compost >= 1) children.push(h('p', null, `The compost cart paid ${fmt(r.compost)} caps for rotten stock.`));
    if (r.rumors > GOSSIP_KEPT) children.push(h('p', { class: 'spore' }, `The town never stopped talking. The latest ${GOSSIP_KEPT} rumors are in Gossip.`));
    else if (r.rumors > 0) children.push(h('p', { class: 'spore' }, `${r.rumors} new ${r.rumors === 1 ? 'rumor' : 'rumors'} in Gossip.`));
    this.showModal(children, 'Back to the stall');
  }
}
