import {
  GOODS,
  GOOD_BY_ID,
  MARKET_SPREAD,
  MARKET_UNLOCK,
  PRODUCERS,
  PRODUCER_BY_ID,
  SPECIMENS,
  SPECIMEN_BY_ID,
  SPORE_BONUS,
  SPORE_REQUIREMENT,
  UPGRADES,
  biomeName,
  jarLabel,
  type GoodId,
  type ProducerId,
  type UpgradeGroup,
} from '../game/defs';
import {
  availableUpgrades,
  awayCapSeconds,
  baseRate,
  costOf,
  frenzyActive,
  marketScale,
  maxBuyable,
  nextMilestone,
  owned,
  producerVisibility,
  specimenStatus,
  sporesOnSeal,
  totalRate,
  unitRate,
  type AwayReport,
} from '../game/economy';
import { fmt, fmtCountdown, fmtDuration, fmtRate } from '../game/format';
import { holdingChange, maxBuy, paidIndex, saleValue, windowChange } from '../game/market';
import type { GameState } from '../game/state';
import { PriceChart } from './chart';
import { h, setDisabled, setText } from './dom';

export type BuyAmount = 1 | 10 | 100 | 'max';
export type Tab = 'grow' | 'evolve' | 'market' | 'cultivate' | 'spores' | 'journal';

export interface Controller {
  readonly state: GameState;
  buyAmount: BuyAmount;
  setBuyAmount(a: BuyAmount): void;
  buyProducer(id: ProducerId): void;
  buyUpgrade(id: string): void;
  buyGood(id: GoodId, amount: number | 'max'): void;
  sellGood(id: GoodId, amount: number | 'all'): void;
  cultivate(id: string): void;
  harvest(): void;
  seal(): void;
  eraseSave(): void;
  drawIcon(canvas: HTMLCanvasElement, kind: string): void;
  /** Re-render the open panel now (after a panel-local change). */
  refresh(): void;
}

interface Panel {
  key(): string;
  build(root: HTMLElement): void;
  sync(): void;
}

const GROUP_LABEL: Record<UpgradeGroup, string> = {
  producer: 'Species',
  synergy: 'Partnership',
  tap: 'Tap',
  global: 'Whole jar',
  away: 'While away',
};

function icon(c: Controller, kind: string, cls = 'icon'): HTMLCanvasElement {
  const canvas = h('canvas', { class: cls, width: 96, height: 96, 'aria-hidden': 'true' });
  c.drawIcon(canvas, kind);
  return canvas;
}

function bar(cls = ''): { el: HTMLElement; fill: HTMLElement } {
  const fill = h('span', { class: 'bar-fill' });
  return { el: h('span', { class: `bar ${cls}`.trim() }, fill), fill };
}

function setBar(fill: HTMLElement, fraction: number): void {
  const w = `${Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10}%`;
  if (fill.style.width !== w) fill.style.width = w;
}

// ---------------------------------------------------------------------------

class GrowPanel implements Panel {
  private rows: {
    id: ProducerId;
    btn: HTMLButtonElement;
    count: HTMLElement;
    stat: HTMLElement;
    qty: HTMLElement;
    cost: HTMLElement;
  }[] = [];
  private amountBtns: { amount: BuyAmount; el: HTMLButtonElement }[] = [];

  constructor(private c: Controller) {}

  key(): string {
    return `${producerVisibility(this.c.state).join()}|${this.c.state.jarIndex}`;
  }

  build(root: HTMLElement): void {
    const vis = producerVisibility(this.c.state);
    this.amountBtns = ([1, 10, 100, 'max'] as BuyAmount[]).map((amount) => ({
      amount,
      el: h(
        'button',
        { class: 'seg-btn', type: 'button', onclick: () => this.c.setBuyAmount(amount) },
        amount === 'max' ? 'Max' : `×${amount}`,
      ),
    }));
    const head = h(
      'div',
      { class: 'panel-head' },
      h('p', { class: 'panel-note' }, 'Grow life in the jar. Everything that lives here feeds you when it sheds or dies.'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'How many to grow at once' }, ...this.amountBtns.map((b) => b.el)),
    );
    const list = h('div', { class: 'list' });
    this.rows = [];
    PRODUCERS.forEach((p, i) => {
      if (vis[i] === 'hidden') return;
      if (vis[i] === 'mystery') {
        list.append(
          h(
            'div',
            { class: 'row row-mystery' },
            icon(this.c, 'unknown'),
            h(
              'div',
              { class: 'row-main' },
              h('div', { class: 'row-title' }, h('span', { class: 'row-name' }, 'Something stirs')),
              h('div', { class: 'row-stat' }, 'Keep growing to find out what moves in.'),
            ),
            h('div', { class: 'price price-muted' }, h('span', { class: 'qty' }, 'at'), h('span', { class: 'cost' }, fmt(p.baseCost))),
          ),
        );
        return;
      }
      const count = h('span', { class: 'row-count' });
      const stat = h('div', { class: 'row-stat' });
      const qty = h('span', { class: 'qty' });
      const cost = h('span', { class: 'cost' });
      const btn = h(
        'button',
        { class: 'row', type: 'button', onclick: () => this.c.buyProducer(p.id) },
        icon(this.c, p.id),
        h(
          'div',
          { class: 'row-main' },
          h('div', { class: 'row-title' }, h('span', { class: 'row-name' }, p.plural), count),
          h('div', { class: 'latin' }, p.latin ?? 'your own threads'),
          stat,
        ),
        h('div', { class: 'price' }, qty, cost),
      );
      btn.title = p.blurb;
      list.append(btn);
      this.rows.push({ id: p.id, btn, count, stat, qty, cost });
    });
    root.append(head, list);
  }

  sync(): void {
    const s = this.c.state;
    for (const b of this.amountBtns) b.el.setAttribute('aria-pressed', String(b.amount === this.c.buyAmount));
    for (const r of this.rows) {
      const def = PRODUCER_BY_ID[r.id];
      const n0 = owned(s, r.id);
      const amount = this.c.buyAmount;
      const n = amount === 'max' ? Math.max(1, maxBuyable(def, n0, s.nutrients)) : amount;
      const cost = costOf(def, n0, n);
      const can = s.nutrients >= cost;
      setDisabled(r.btn, !can);
      r.btn.classList.toggle('affordable', can);
      setText(r.count, n0 > 0 ? String(n0) : '');
      setText(r.qty, `×${n}`);
      setText(r.cost, fmt(cost));
      const each = unitRate(s, r.id);
      const next = nextMilestone(n0);
      const parts = n0 > 0 ? [`${fmtRate(each * n0)}/s`] : [`${fmtRate(each)}/s each`];
      if (n0 > 0 && next) parts.push(`×2 at ${next}`);
      setText(r.stat, parts.join(' · '));
    }
  }
}

// ---------------------------------------------------------------------------

class EvolvePanel implements Panel {
  private cards: { id: string; cost: number; btn: HTMLButtonElement }[] = [];
  private summary!: HTMLElement;

  constructor(private c: Controller) {}

  key(): string {
    return availableUpgrades(this.c.state)
      .map((u) => u.id)
      .join();
  }

  build(root: HTMLElement): void {
    const ups = availableUpgrades(this.c.state);
    this.summary = h('p', { class: 'panel-note' });
    root.append(h('div', { class: 'panel-head' }, this.summary));
    this.cards = [];
    if (ups.length === 0) {
      root.append(h('p', { class: 'empty' }, 'Nothing to evolve right now. New upgrades appear as your jar fills up.'));
      return;
    }
    const list = h('div', { class: 'list' });
    for (const u of ups) {
      const btn = h(
        'button',
        { class: 'card', type: 'button', onclick: () => this.c.buyUpgrade(u.id) },
        h(
          'div',
          { class: 'card-main' },
          h('span', { class: `tag tag-${u.group}` }, GROUP_LABEL[u.group]),
          h('span', { class: 'card-name' }, u.name),
          h('span', { class: 'card-desc' }, u.desc),
        ),
        h('div', { class: 'price' }, h('span', { class: 'cost' }, fmt(u.cost))),
      );
      list.append(btn);
      this.cards.push({ id: u.id, cost: u.cost, btn });
    }
    root.append(list);
  }

  sync(): void {
    const s = this.c.state;
    setText(this.summary, `${s.upgrades.length} of ${UPGRADES.length} upgrades evolved. Upgrades reset when you seal the jar, except the ones marked “While away”.`);
    for (const card of this.cards) {
      const can = s.nutrients >= card.cost;
      setDisabled(card.btn, !can);
      card.btn.classList.toggle('affordable', can);
    }
  }
}

// ---------------------------------------------------------------------------

/** ▲ 12% / ▼ 4.5%: arrow and sign, so the direction never relies on color. */
function change(f: number): string {
  const pct = Math.abs(f * 100);
  return `${f >= 0 ? '▲' : '▼'} ${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function setChange(el: HTMLElement, f: number): void {
  setText(el, change(f));
  el.classList.toggle('up', f >= 0);
  el.classList.toggle('down', f < 0);
}

// Stock rots continuously, so show and trade it rounded: 9.98 crates is "10".
const amountText = (n: number): string => (n > 0 && n < 0.5 ? 'less than 1' : fmt(Math.round(n)));

class MarketPanel implements Panel {
  private selected: GoodId = 'apples';
  private chart = new PriceChart();
  private chartKey = '';
  private chips: { id: GoodId; btn: HTMLButtonElement; price: HTMLElement; move: HTMLElement }[] = [];
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

  private lock: { left: HTMLElement; fill: HTMLElement } | null = null;

  key(): string {
    const s = this.c.state;
    return `${this.selected}|${s.market.goods[this.selected].held > 0}|${s.marketOpen}`;
  }

  build(root: HTMLElement): void {
    const def = GOOD_BY_ID[this.selected];
    this.chartKey = '';
    this.chips = GOODS.map((g) => {
      const price = h('span', { class: 'chip-price' });
      const move = h('span', { class: 'chip-move' });
      const btn = h(
        'button',
        {
          class: 'chip',
          type: 'button',
          'aria-pressed': String(g.id === this.selected),
          onclick: () => {
            this.selected = g.id;
            this.c.refresh();
          },
        },
        h('span', { class: 'chip-name' }, g.name),
        h('span', { class: 'chip-line' }, price, move),
      );
      return { id: g.id, btn, price, move };
    });

    const price = h('span', { class: 'quote-price' });
    const move = h('span', { class: 'quote-move' });
    const held = h('span');
    const worth = h('span');
    const worthMove = h('span', { class: 'quote-move' });

    const tradeBtn = (label: string, onclick: () => void) => {
      const sub = h('span', { class: 'trade-sub' });
      const btn = h('button', { class: 'trade-btn', type: 'button', onclick }, h('span', { class: 'trade-label' }, label), sub);
      return { btn, sub };
    };
    const buy = ([1, 10, 'max'] as const).map((n) => ({
      n,
      ...tradeBtn(n === 'max' ? 'Buy max' : `Buy ${n}`, () => this.c.buyGood(this.selected, n)),
    }));
    const sell = ([1, 10, 'all'] as const).map((n) => ({
      n,
      ...tradeBtn(n === 'all' ? 'Sell all' : `Sell ${n}`, () => this.c.sellGood(this.selected, n)),
    }));

    const rot =
      def.rotPerHour > 0
        ? `Rots about ${Math.round(def.rotPerHour * 100)}% an hour while you hold it, even while you're away. You digest rotten stock for a quarter of its value.`
        : 'Never spoils.';

    const open = this.c.state.marketOpen;
    this.lock = null;
    let locked: HTMLElement | null = null;
    if (!open) {
      const left = h('strong');
      const b = bar();
      this.lock = { left, fill: b.fill };
      locked = h(
        'section',
        { class: 'bed' },
        h('p', { class: 'eyebrow' }, 'Opening soon'),
        h('p', { class: 'bed-copy' }, `Trading opens once this jar has digested ${fmt(MARKET_UNLOCK)} nutrients: `, left, ' to go. Watch the prices in the meantime.'),
        b.el,
      );
    }

    root.append(
      h(
        'div',
        { class: 'panel-head' },
        h(
          'p',
          { class: 'panel-note' },
          `Prices change every few seconds, even while the game is closed. Buy low, sell high. The market keeps ${Math.round(MARKET_SPREAD * 100)}% of every sale.`,
        ),
      ),
      ...(locked ? [locked] : []),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Goods' }, ...this.chips.map((x) => x.btn)),
      h(
        'section',
        { class: 'quote', 'aria-label': def.name },
        h(
          'div',
          { class: 'quote-head' },
          h('div', { class: 'quote-name' }, h('h3', { class: 'sub' }, def.name), def.latin ? h('span', { class: 'latin' }, def.latin) : null),
          h('p', { class: 'quote-line' }, price, h('span', { class: 'quote-unit' }, ` per ${def.unit}`), move),
        ),
        this.chart.el,
        h('p', { class: 'quote-blurb' }, def.blurb),
      ),
      h(
        'section',
        { class: 'holding', 'aria-label': 'Your stock' },
        h('p', null, held),
        h('p', null, worth, ' ', worthMove),
        h('p', { class: 'holding-note' }, rot),
      ),
      ...(open ? [h('div', { class: 'trade' }, ...buy.map((b) => b.btn), ...sell.map((b) => b.btn))] : []),
    );
    this.refs = { price, move, held, worth, worthMove, buy, sell };
  }

  sync(): void {
    const s = this.c.state;
    const m = s.market;
    const scale = marketScale(s);
    for (const chip of this.chips) {
      const g = m.goods[chip.id];
      chip.btn.setAttribute('aria-pressed', String(chip.id === this.selected));
      setText(chip.price, fmt(g.price * scale));
      setChange(chip.move, windowChange(m, chip.id));
    }
    if (this.lock) {
      setText(this.lock.left, fmt(Math.max(0, MARKET_UNLOCK - s.jarTotal)));
      setBar(this.lock.fill, s.jarTotal / MARKET_UNLOCK);
    }
    const r = this.refs;
    if (!r) return;
    const id = this.selected;
    const def = GOOD_BY_ID[id];
    const g = m.goods[id];
    setText(r.price, fmt(g.price * scale));
    setChange(r.move, windowChange(m, id));

    const paid = paidIndex(m, id);
    const key = `${m.tickAt}|${id}|${paid}|${fmt(scale)}`;
    if (key !== this.chartKey) {
      this.chartKey = key;
      this.chart.setData(g.history, scale, paid, def.name);
    }

    if (g.held > 0) {
      setText(r.held, `You hold ${amountText(g.held)} of ${def.cap} ${def.units}.`);
      setText(r.worth, `Worth ${fmt(saleValue(m, id, g.held))} now. You paid ${fmt(g.paid)}.`);
      setChange(r.worthMove, holdingChange(m, id) ?? 0);
      r.worthMove.hidden = false;
    } else {
      setText(r.held, `You hold no ${def.units}. Room for ${def.cap}.`);
      setText(r.worth, `One ${def.unit} costs ${fmt(g.price * scale)} right now.`);
      r.worthMove.hidden = true;
    }

    const most = maxBuy(m, id, scale, s.nutrients);
    for (const b of r.buy) {
      const n = b.n === 'max' ? most : b.n;
      setDisabled(b.btn, b.n === 'max' ? most < 1 : most < b.n);
      setText(b.sub, n > 0 ? (b.n === 'max' ? `${n} · ${fmt(n * g.price * scale)}` : fmt(n * g.price * scale)) : 'none');
    }
    for (const b of r.sell) {
      const n = b.n === 'all' ? g.held : Math.min(b.n, g.held);
      setDisabled(b.btn, b.n === 'all' ? g.held <= 0 : Math.round(g.held) < b.n);
      setText(b.sub, n > 0 ? fmt(saleValue(m, id, n)) : '—');
    }
  }
}

// ---------------------------------------------------------------------------

class CultivatePanel implements Panel {
  private progress: { fill: HTMLElement; left: HTMLElement } | null = null;
  private starts: { id: string; cost: number; btn: HTMLButtonElement }[] = [];

  constructor(private c: Controller) {}

  key(): string {
    const now = Date.now();
    return SPECIMENS.map((sp) => specimenStatus(this.c.state, sp, now)).join();
  }

  build(root: HTMLElement): void {
    const s = this.c.state;
    const now = Date.now();
    this.progress = null;
    this.starts = [];

    const bed = h('section', { class: 'bed', 'aria-label': 'Cultivation bed' });
    const growing = s.cultivating ? SPECIMEN_BY_ID.get(s.cultivating.id) : undefined;
    if (growing && s.cultivating) {
      const ready = now >= s.cultivating.endsAt;
      const b = bar('bar-glow');
      const left = h('span', { class: 'bed-left' });
      this.progress = { fill: b.fill, left };
      bed.append(
        h('p', { class: 'eyebrow' }, ready ? 'Ready to harvest' : 'Growing in the bed'),
        h(
          'div',
          { class: 'bed-row' },
          icon(this.c, growing.id, 'icon icon-lg'),
          h(
            'div',
            { class: 'row-main' },
            h('div', { class: 'card-name' }, growing.name),
            h('div', { class: 'latin' }, growing.latin),
            h('div', { class: 'row-stat' }, growing.effectText),
          ),
        ),
        b.el,
        ready
          ? h('button', { class: 'btn btn-glow', type: 'button', onclick: () => this.c.harvest() }, `Harvest ${growing.name}`)
          : left,
      );
    } else {
      bed.append(
        h('p', { class: 'eyebrow' }, 'The bed is empty'),
        h('p', { class: 'bed-copy' }, 'Pick a rare species to grow. It grows in real time, even while the game is closed, and you keep it forever once harvested.'),
      );
    }
    root.append(bed);

    const list = h('div', { class: 'list' });
    for (const sp of SPECIMENS) {
      const status = specimenStatus(s, sp, now);
      if (status === 'hidden' || status === 'growing' || status === 'ready') continue;
      if (status === 'mystery') {
        list.append(
          h(
            'div',
            { class: 'row row-mystery' },
            icon(this.c, 'unknown'),
            h(
              'div',
              { class: 'row-main' },
              h('div', { class: 'row-name' }, 'Unknown specimen'),
              h('div', { class: 'row-stat' }, `Harvest the one above first · grows in ${fmtDuration(sp.seconds)}`),
            ),
          ),
        );
        continue;
      }
      if (status === 'harvested') {
        list.append(
          h(
            'div',
            { class: 'row row-done' },
            icon(this.c, sp.id),
            h(
              'div',
              { class: 'row-main' },
              h('div', { class: 'row-name' }, sp.name),
              h('div', { class: 'latin' }, sp.latin),
              h('div', { class: 'row-stat' }, sp.effectText),
            ),
            h('span', { class: 'done-mark' }, 'In the jar'),
          ),
        );
        continue;
      }
      const btn = h(
        'button',
        { class: 'row', type: 'button', onclick: () => this.c.cultivate(sp.id) },
        icon(this.c, sp.id),
        h(
          'div',
          { class: 'row-main' },
          h('div', { class: 'row-name' }, sp.name),
          h('div', { class: 'latin' }, sp.latin),
          h('div', { class: 'row-stat' }, `${sp.effectText} · grows in ${fmtDuration(sp.seconds)}`),
        ),
        h('div', { class: 'price' }, h('span', { class: 'qty' }, 'plant'), h('span', { class: 'cost' }, fmt(sp.cost))),
      );
      btn.title = sp.blurb;
      list.append(btn);
      this.starts.push({ id: sp.id, cost: sp.cost, btn });
    }
    root.append(list);
  }

  sync(): void {
    const s = this.c.state;
    const now = Date.now();
    if (this.progress && s.cultivating) {
      const c = s.cultivating;
      setBar(this.progress.fill, (now - c.startedAt) / (c.endsAt - c.startedAt));
      setText(this.progress.left, `${fmtCountdown((c.endsAt - now) / 1000)} left`);
    }
    for (const st of this.starts) {
      const can = !s.cultivating && s.nutrients >= st.cost;
      setDisabled(st.btn, !can);
      st.btn.classList.toggle('affordable', can);
    }
  }
}

// ---------------------------------------------------------------------------

class SporesPanel implements Panel {
  private confirming = false;
  private refs: {
    spores: HTMLElement;
    bonus: HTMLElement;
    digested: HTMLElement;
    gain: HTMLElement;
    fill: HTMLElement | null;
  } | null = null;

  constructor(private c: Controller) {}

  key(): string {
    return `${sporesOnSeal(this.c.state) > 0}|${this.confirming}|${this.c.state.jarIndex}`;
  }

  build(root: HTMLElement): void {
    const s = this.c.state;
    const canSeal = sporesOnSeal(s) > 0;
    const spores = h('span', { class: 'big-num glow' });
    const bonus = h('span', { class: 'big-sub' });
    const digested = h('span');
    const gain = h('span');
    let fill: HTMLElement | null = null;

    const status = h('div', { class: 'seal-status' });
    if (canSeal) {
      status.append(h('p', null, 'This jar is ready. Sealing it now releases ', gain, '.'));
    } else {
      const b = bar();
      fill = b.fill;
      status.append(
        h('p', null, 'Spores form once one jar has digested ', h('strong', null, fmt(SPORE_REQUIREMENT)), ' nutrients. This jar: ', digested, '.'),
        b.el,
      );
    }

    const next = `${jarLabel(s.jarIndex + 1)} · ${biomeName(s.jarIndex + 1)}`;
    const action = this.confirming
      ? h(
          'div',
          { class: 'confirm' },
          h('p', null, `Seal ${jarLabel(s.jarIndex)} and start ${next}?`),
          h(
            'div',
            { class: 'confirm-row' },
            h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => this.setConfirm(false) }, 'Keep growing'),
            h(
              'button',
              {
                class: 'btn btn-glow',
                type: 'button',
                onclick: () => {
                  this.confirming = false;
                  this.c.seal();
                },
              },
              'Seal and release',
            ),
          ),
        )
      : h(
          'button',
          { class: 'btn btn-glow', type: 'button', disabled: !canSeal, onclick: () => this.setConfirm(true) },
          'Seal this jar',
        );

    root.append(
      h(
        'section',
        { class: 'spore-hero' },
        h('p', { class: 'eyebrow' }, 'Spores'),
        h('div', { class: 'big-line' }, spores, bonus),
      ),
      status,
      action,
      h(
        'div',
        { class: 'keeps' },
        h('div', null, h('p', { class: 'eyebrow' }, 'Starts over'), h('p', null, 'Nutrients, everything you grew, market stock, and most upgrades.')),
        h(
          'div',
          null,
          h('p', { class: 'eyebrow' }, 'You keep'),
          h('p', null, `Spores (each gives +${Math.round(SPORE_BONUS * 100)}% production forever), specimens, “While away” upgrades and your journal.`),
        ),
      ),
      h('p', { class: 'panel-note' }, `Next jar: ${next}. Spores grow with the square root of what one jar digests, so a fuller jar releases more.`),
    );
    this.refs = { spores, bonus, digested, gain, fill };
  }

  private setConfirm(v: boolean): void {
    this.confirming = v;
    this.c.refresh();
  }

  sync(): void {
    if (!this.refs) return;
    const s = this.c.state;
    const g = sporesOnSeal(s);
    setText(this.refs.spores, fmt(s.spores));
    setText(this.refs.bonus, `+${fmt(Math.round(s.spores * SPORE_BONUS * 100))}% production`);
    setText(this.refs.digested, fmt(s.jarTotal));
    setText(this.refs.gain, `${fmt(g)} spores (+${fmt(Math.round(g * SPORE_BONUS * 100))}% production)`);
    if (this.refs.fill) setBar(this.refs.fill, Math.log10(s.jarTotal + 1) / Math.log10(SPORE_REQUIREMENT));
  }
}

// ---------------------------------------------------------------------------

class JournalPanel implements Panel {
  private confirming = false;
  private stats: { el: HTMLElement; value: () => string }[] = [];

  constructor(private c: Controller) {}

  key(): string {
    return `${this.c.state.discovered.join()}|${this.confirming}|${this.c.state.jarIndex}`;
  }

  build(root: HTMLElement): void {
    const s = this.c.state;
    const species = [
      ...PRODUCERS.map((p) => ({ id: p.id, name: p.plural, latin: p.latin ?? 'your own threads' })),
      ...SPECIMENS.map((sp) => ({ id: sp.id, name: sp.name, latin: sp.latin })),
    ];
    const found = species.filter((x) => s.discovered.includes(x.id)).length;
    const grid = h('div', { class: 'species' });
    for (const sp of species) {
      const known = s.discovered.includes(sp.id);
      grid.append(
        h(
          'div',
          { class: `species-card${known ? '' : ' unknown'}` },
          icon(this.c, known ? sp.id : 'unknown'),
          h('span', { class: 'species-name' }, known ? sp.name : 'Not found yet'),
          known ? h('span', { class: 'latin' }, sp.latin) : null,
        ),
      );
    }

    const rows: [string, () => string][] = [
      ['Digested, all jars', () => fmt(s.lifetime)],
      ['This jar', () => fmt(s.jarTotal)],
      ['Jars sealed', () => String(s.jarIndex)],
      ['Best rate', () => `${fmtRate(s.stats.bestRate)}/s`],
      ['Taps', () => fmt(s.stats.taps)],
      ['Blooms caught', () => fmt(s.stats.blooms)],
      ['Time with the jar open', () => fmtDuration(s.stats.playSeconds)],
      ['Away limit', () => fmtDuration(awayCapSeconds(s))],
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
          { class: 'confirm danger' },
          h('p', null, 'Erase everything, including spores and specimens? This cannot be undone.'),
          h(
            'div',
            { class: 'confirm-row' },
            h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => this.setConfirm(false) }, 'Keep my jar'),
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
      h('div', { class: 'panel-head' }, h('p', { class: 'panel-note' }, `${found} of ${species.length} species found.`)),
      grid,
      h('h3', { class: 'sub' }, 'Field notes'),
      dl,
      h('div', { class: 'erase' }, erase),
    );
  }

  private setConfirm(v: boolean): void {
    this.confirming = v;
    this.c.refresh();
  }

  sync(): void {
    for (const st of this.stats) setText(st.el, st.value());
  }
}

// ---------------------------------------------------------------------------

export class GameUI {
  private tab: Tab = 'grow';
  private panels: Record<Tab, Panel>;
  private builtKey = '';
  private toastTimer = 0;
  private modalClose: (() => void) | null = null;
  private marketUnseen = false;

  private amount = document.getElementById('amount')!;
  private rate = document.getElementById('rate')!;
  private jarName = document.getElementById('jarName')!;
  private panel = document.getElementById('panel')!;
  private frenzy = document.getElementById('frenzy')!;
  private hint = document.getElementById('hint')!;
  private toastEl = document.getElementById('toast')!;
  private modal = document.getElementById('modal')!;
  private tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-tab]')];

  constructor(private c: Controller) {
    this.panels = {
      grow: new GrowPanel(c),
      evolve: new EvolvePanel(c),
      market: new MarketPanel(c),
      cultivate: new CultivatePanel(c),
      spores: new SporesPanel(c),
      journal: new JournalPanel(c),
    };
    for (const t of this.tabs) t.addEventListener('click', () => this.setTab(t.dataset.tab as Tab));
    this.tabs[0].parentElement!.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const tabs = this.tabs.filter((t) => !t.hidden);
      const i = tabs.findIndex((t) => t.dataset.tab === this.tab);
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      this.setTab(next.dataset.tab as Tab);
      next.focus();
    });
    this.modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });
    this.setTab('grow');
  }

  setTab(tab: Tab): void {
    if (tab === 'market') this.marketUnseen = false;
    this.tab = tab;
    document.getElementById('app')!.dataset.tab = tab;
    for (const t of this.tabs) {
      const on = t.dataset.tab === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    }
    this.panel.setAttribute('aria-labelledby', `tab-${tab}`);
    this.panel.scrollTop = 0;
    this.sync(true);
  }

  /** The market just opened: show its tab with a dot until it is visited. */
  announceMarket(): void {
    this.marketUnseen = true;
    this.sync();
  }

  /** Refresh the open panel and the tab badges. Rebuilds only when its contents change. */
  sync(force = false): void {
    const p = this.panels[this.tab];
    const key = `${this.tab}|${p.key()}`;
    if (force || key !== this.builtKey) {
      const scroll = this.panel.scrollTop;
      const focusedIndex = [...this.panel.querySelectorAll('button')].indexOf(document.activeElement as HTMLButtonElement);
      this.panel.replaceChildren();
      p.build(this.panel);
      this.builtKey = key;
      this.panel.scrollTop = scroll;
      if (focusedIndex >= 0) this.panel.querySelectorAll('button')[focusedIndex]?.focus();
    }
    p.sync();
    this.syncBadges();
  }

  private syncBadges(): void {
    const s = this.c.state;
    const now = Date.now();
    const affordable = availableUpgrades(s).filter((u) => u.cost <= s.nutrients).length;
    const ready = s.cultivating && now >= s.cultivating.endsAt;
    const canPlant =
      !s.cultivating && SPECIMENS.some((sp) => specimenStatus(s, sp, now) === 'available' && sp.cost <= s.nutrients);
    // A count, a dot (something to do), or a pulsing dot (something is waiting).
    const badges: Record<Tab, string> = {
      grow: '',
      evolve: affordable ? String(affordable) : '',
      market: GOODS.some((g) => (holdingChange(s.market, g.id) ?? 0) >= 0.1) ? 'ready' : this.marketUnseen ? 'dot' : '',
      cultivate: ready ? 'ready' : canPlant ? 'dot' : '',
      spores: sporesOnSeal(s) > 0 ? 'ready' : '',
      journal: '',
    };
    for (const t of this.tabs) {
      const b = t.querySelector<HTMLElement>('.badge')!;
      const value = badges[t.dataset.tab as Tab];
      const kind = value === 'dot' || value === 'ready' ? value : 'count';
      if (b.dataset.kind !== kind) b.dataset.kind = kind;
      setText(b, kind === 'count' ? value : '');
      b.hidden = !value;
    }
  }

  /** Per-frame: the big counter and the frenzy timer. */
  updateCounter(now: number): void {
    const s = this.c.state;
    setText(this.amount, fmt(s.nutrients));
    setText(this.rate, fmtRate(totalRate(s, now)));
    setText(this.jarName, `${jarLabel(s.jarIndex)} · ${biomeName(s.jarIndex)}`);
    const on = frenzyActive(s, now);
    this.frenzy.hidden = !on;
    if (on) setText(this.frenzy, `Frenzy ×7 · ${Math.ceil((s.frenzyUntil - now) / 1000)}s`);
    this.hint.hidden = s.stats.taps >= 12;
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
    }, 2800);
  }

  private showModal(children: Node[], action: string, onClose?: () => void): void {
    const btn = h('button', { class: 'btn btn-glow', type: 'button' }, action);
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

  get modalOpen(): boolean {
    return !this.modal.hidden;
  }

  showIntro(): void {
    this.showModal(
      [
        h('p', { class: 'eyebrow' }, `${jarLabel(0)} · ${biomeName(0)}`),
        h('h2', { id: 'modal-title' }, 'You are the rot in the jar'),
        h(
          'p',
          null,
          'You are a fungus: a web of threads living in the soil of a sealed terrarium. Tap the soil to digest fallen leaves into nutrients.',
        ),
        h(
          'p',
          null,
          'Spend nutrients to grow moss, mushrooms, ferns and animals. Everything that grows sheds and dies back into the soil, and feeds you more. The jar keeps working while you are away.',
        ),
      ],
      'Start digesting',
    );
  }

  showWelcome(r: AwayReport, onClose?: () => void): void {
    const s = this.c.state;
    const children: Node[] = [
      h('p', { class: 'eyebrow' }, `Away for ${fmtDuration(r.elapsed)}`),
      h('h2', { id: 'modal-title' }, 'While you were away, your network digested'),
      h('p', { class: 'modal-big' }, `+${fmt(r.earned)}`),
      h('p', { class: 'modal-unit' }, 'nutrients'),
    ];
    if (r.capped) {
      children.push(
        h(
          'p',
          { class: 'modal-note' },
          `Only the first ${fmtDuration(r.credited)} counted. Dormancy upgrades in Evolve let the jar keep working longer.`,
        ),
      );
    }
    const moves = r.market.filter((mv) => mv.heldBefore > 0);
    if (moves.length) {
      const lines = moves.map((mv) => {
        const def = GOOD_BY_ID[mv.id];
        const rotted = mv.heldBefore - mv.heldAfter;
        const rot = rotted >= 1 ? `, ${fmt(rotted)} rotted` : '';
        return `${def.name} ${change(mv.to / mv.from - 1)}${rot}`;
      });
      const salvage = r.salvage >= 1 ? ` You digested ${fmt(r.salvage)} from rotten stock.` : '';
      children.push(h('p', { class: 'modal-note' }, `Market: ${lines.join(' · ')}.${salvage}`));
    }
    if (r.specimenReady) {
      const sp = SPECIMEN_BY_ID.get(r.specimenReady);
      if (sp) children.push(h('p', { class: 'modal-note glow' }, `Your ${sp.name} finished growing. Harvest it in Cultivate.`));
    }
    if (baseRate(s) === 0 && r.earned === 0) {
      children.splice(1, 3, h('h2', { id: 'modal-title' }, 'Nothing grew while you were away'), h('p', null, 'Grow hyphae so the jar can work without you.'));
    }
    this.showModal(children, 'Collect', onClose);
  }
}
