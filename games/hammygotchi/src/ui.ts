import { h, setDisabled, setText } from '@shared/dom';
import { fmt, fmtCountdown, fmtDuration } from '@shared/format';
import {
  BOWL_MAX,
  CALL_LINES,
  CALL_MAX_MOOD,
  COOK_SECONDS,
  FITS,
  FLUSH_COINS,
  FOODS,
  FORM_BY_ID,
  FURNITURE,
  MAX_TEXTS,
  MEAT_PRICE,
  MENU,
  RING_SECONDS,
  ROT_SECONDS,
  SHOWER_FRESH,
  SOAP_FRESH,
  START_COINS,
  TIDY_COINS,
  TOYS,
  TOY_BY_ID,
  UPGRADES,
  type FitId,
  type FoodDef,
  type FoodId,
  type FormId,
  type FurnitureId,
  type Need,
  type ToyDef,
  type ToyId,
  type UpgradeId,
} from './defs';
import {
  callMood,
  canCall,
  canOrder,
  canShower,
  causeText,
  deadFor,
  isAlive,
  markRead,
  needWord,
  rotDone,
  textOptions,
  typing,
  unread,
  upgradeCost,
  type AwayReport,
} from './game';
import { paintPortrait, type Face } from './hammy';
import { paintToyIcon } from './toys';
import { sfx } from './sound';
import type { HammyState } from './state';

export type Tab = 'care' | 'phone' | 'shop' | 'life';

export interface Controller {
  readonly state: HammyState;
  /** What he is today. */
  readonly form: FormId;
  order(id: FoodId): void;
  /** Floor poop into the toilet, as much as fits. */
  cleanPoop(): void;
  flush(): void;
  /** All his trash down the chute. */
  tidyAll(): void;
  /** Carry him to the shower or the toilet. */
  carry(id: 'shower' | 'toilet'): void;
  buyUpgrade(id: UpgradeId): void;
  buyFurniture(id: FurnitureId): void;
  text(id: string): void;
  call(): void;
  buyFit(id: FitId): void;
  wearFit(id: FitId): void;
  buyToy(id: ToyId): void;
  pickToy(id: ToyId): void;
  adopt(): void;
  toggleSound(): void;
  eraseSave(): void;
  refresh(): void;
}

interface Panel {
  key(): string;
  build(root: HTMLElement): void;
  sync(): void;
  shown?(): void;
}

function setBar(fill: HTMLElement, fraction: number): void {
  const w = `${Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10}%`;
  if (fill.style.width !== w) fill.style.width = w;
}

const age = (s: HammyState, now: number): string => fmtDuration(((s.diedAt ?? now) - s.bornAt) / 1000);

function effects(f: FoodDef): string {
  const parts = [`+${f.belly} belly`];
  if (f.mood) parts.push(`${f.mood > 0 ? '+' : ''}${f.mood} mood`);
  if (f.fresh) parts.push(`+${f.fresh} fresh`);
  if (f.health) parts.push(`${f.health} health`);
  if (f.gas >= 50) parts.push('gas: severe');
  else if (f.gas >= 25) parts.push('gas: yes');
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------

class CarePanel implements Panel {
  private foods: { id: FoodId; btn: HTMLButtonElement }[] = [];
  private eta: HTMLElement | null = null;
  private scoopBtn: HTMLButtonElement | null = null;
  private scoopSub: HTMLElement | null = null;
  private flushBtn: HTMLButtonElement | null = null;
  private flushSub: HTMLElement | null = null;
  private tidyBtn: HTMLButtonElement | null = null;
  private tidySub: HTMLElement | null = null;
  private toiletBtn: HTMLButtonElement | null = null;
  private toiletSub: HTMLElement | null = null;
  private showerBtn: HTMLButtonElement | null = null;
  private showerSub: HTMLElement | null = null;
  private adoptBtn: HTMLButtonElement | null = null;

  constructor(private c: Controller) {}

  key(): string {
    const s = this.c.state;
    return `${s.n}|${isAlive(s)}|${s.orders.length}|${s.orders.map((o) => o.food).join()}`;
  }

  build(root: HTMLElement): void {
    const s = this.c.state;
    this.foods = [];
    this.eta = null;
    if (!isAlive(s)) {
      this.adoptBtn = h('button', { class: 'btn btn-cheese', type: 'button', onclick: () => this.c.adopt() }, 'Get a new Hammy');
      root.append(
        h(
          'section',
          { class: 'funeral' },
          h('p', { class: 'eyebrow' }, 'Here lies'),
          h('h2', { class: 'sub' }, `Hammy #${s.n}`),
          h('p', null, `Lived ${age(s, Date.now())}. Farted ${fmt(s.stats.farts)} ${s.stats.farts === 1 ? 'time' : 'times'}. Ate ${fmt(s.stats.meals)} meals.`),
          h('p', { class: 'cause' }, causeText(s.causes)),
          this.adoptBtn,
          h('p', { class: 'note' }, `Your furniture, fits, toys and stuff for the unit stay yours. Coins start over at ${START_COINS}.`),
        ),
      );
      return;
    }
    this.adoptBtn = null;

    const action = (name: string, onclick: () => void): [HTMLButtonElement, HTMLElement] => {
      const sub = h('span', { class: 'action-sub' });
      return [h('button', { class: 'action', type: 'button', onclick }, h('span', { class: 'action-name' }, name), sub), sub];
    };
    [this.toiletBtn, this.toiletSub] = action('🚽 Toilet', () => this.c.carry('toilet'));
    [this.flushBtn, this.flushSub] = action('🌀 Flush', () => this.c.flush());
    [this.showerBtn, this.showerSub] = action('🚿 Shower', () => this.c.carry('shower'));
    [this.scoopBtn, this.scoopSub] = action('💩 Poop', () => this.c.cleanPoop());
    [this.tidyBtn, this.tidySub] = action('🗑️ Tidy up', () => this.c.tidyAll());

    const pending = h('div', { class: 'orders' });
    if (s.orders.length) {
      this.eta = h('span', { class: 'eta' });
      const sorted = [...s.orders].sort((a, b) => a.arriveAt - b.arriveAt);
      pending.append(
        h(
          'p',
          { class: 'order-line' },
          h('span', { class: 'dosh-dot', 'aria-hidden': 'true' }),
          h('span', null, sorted.map((o) => FOODS.find((f) => f.id === o.food)!.name).join(', ')),
          this.eta,
        ),
      );
      if (sorted.some((o) => o.self)) pending.append(h('p', { class: 'note' }, 'He ordered this one himself. On your coins. And tipped.'));
    }

    const menu = h('div', { class: 'menu' });
    for (const f of MENU) {
      const btn = h(
        'button',
        { class: 'food', type: 'button', onclick: () => this.c.order(f.id) },
        h('span', { class: 'food-swatch', style: `background:${f.color}`, 'aria-hidden': 'true' }),
        h('span', { class: 'food-main' }, h('span', { class: 'food-name' }, f.name), h('span', { class: 'food-blurb' }, f.blurb), h('span', { class: 'food-fx' }, effects(f))),
        h('span', { class: 'cost' }, f.price ? fmt(f.price) : 'Free'),
      );
      menu.append(btn);
      this.foods.push({ id: f.id, btn });
    }

    root.append(
      h('div', { class: 'actions' }, this.toiletBtn, this.flushBtn, this.showerBtn, this.scoopBtn, this.tidyBtn),
      h(
        'p',
        { class: 'note' },
        'He usually walks to the toilet himself, and never flushes. He won’t shower on his own. In the unit: drag floor poop into the toilet, tap the toilet to flush, tap trash to throw it down the chute.',
      ),
      h('div', { class: 'dosh-head' }, h('h2', { class: 'sub' }, h('span', { class: 'dosh' }, 'DoorDosh')), h('span', { class: 'note' }, 'Drops through the hatch.')),
      pending,
      menu,
      h('h2', { class: 'sub' }, 'Cook for him'),
      h(
        'p',
        { class: 'note' },
        `Tap the fridge for a raw steak (${MEAT_PRICE} coins) and drag it onto the oven. ${COOK_SECONDS} seconds later it’s a steak; leave it and it’s charcoal. He’ll eat it raw if you let him, which he’ll regret.`,
      ),
    );
  }

  sync(): void {
    const s = this.c.state;
    const now = Date.now();
    if (this.adoptBtn) {
      const d = deadFor(s, now) ?? 0;
      const done = rotDone(s, now);
      setDisabled(this.adoptBtn, !done);
      setText(this.adoptBtn, done ? 'Get a new Hammy' : `Still rotting… ${fmtCountdown(ROT_SECONDS - d)}`);
      return;
    }
    if (this.eta) {
      const next = s.orders.reduce((t, o) => Math.min(t, o.arriveAt), Infinity);
      setText(this.eta, Number.isFinite(next) ? `arrives in ${fmtCountdown((next - now) / 1000)}` : '');
    }
    for (const f of this.foods) setDisabled(f.btn, !canOrder(s, f.id));
    if (this.toiletBtn && this.toiletSub) {
      const n = s.urges.length;
      this.toiletBtn.classList.toggle('urgent', n > 0);
      setText(this.toiletSub, n ? (s.bowl >= BOWL_MAX ? 'He has to go. Flush first!' : 'He has to go. Carry him.') : 'Doesn’t need to go.');
    }
    if (this.flushBtn && this.flushSub) {
      const n = s.bowl;
      this.flushBtn.classList.toggle('urgent', n >= BOWL_MAX);
      setText(this.flushSub, n >= BOWL_MAX ? `Clogged · +${n * FLUSH_COINS}` : n ? `${n} in the bowl · +${n * FLUSH_COINS}` : 'Bowl’s clean.');
    }
    if (this.tidyBtn && this.tidySub) {
      const n = s.trash.length;
      setDisabled(this.tidyBtn, n === 0);
      setText(this.tidySub, n ? `${n} lying around · +${n * TIDY_COINS}` : 'Nothing lying around.');
    }
    if (this.showerBtn && this.showerSub) {
      const ready = canShower(s, now);
      setDisabled(this.showerBtn, !ready);
      setText(this.showerSub, ready ? `+${SHOWER_FRESH + SOAP_FRESH[s.upgrades.soap]} fresh` : `Hot water in ${fmtCountdown((s.showerReadyAt - now) / 1000)}`);
    }
    if (this.scoopBtn && this.scoopSub) {
      const n = s.poops.length;
      setDisabled(this.scoopBtn, n === 0 || s.bowl >= BOWL_MAX);
      setText(this.scoopSub, !n ? 'Floor’s clean.' : s.bowl >= BOWL_MAX ? `${n} on the floor. Flush first.` : `${n} on the floor → toilet`);
    }
  }
}

// ---------------------------------------------------------------------------

class PhonePanel implements Panel {
  private status: HTMLElement | null = null;
  private callBtn: HTMLButtonElement | null = null;
  private replies: HTMLButtonElement[] = [];
  private budget: HTMLElement | null = null;
  private thread: HTMLElement | null = null;
  private portrait: HTMLCanvasElement | null = null;

  constructor(private c: Controller) {}

  key(): string {
    const s = this.c.state;
    const now = Date.now();
    const shown = s.messages.filter((m) => m.at <= now);
    return `${s.n}|${isAlive(s)}|${shown.length}|${shown[shown.length - 1]?.at ?? 0}|${typing(s, now)}|${s.fit}`;
  }

  shown(): void {
    markRead(this.c.state, Date.now());
  }

  build(root: HTMLElement): void {
    const s = this.c.state;
    const now = Date.now();
    const alive = isAlive(s);
    this.portrait = h('canvas', { class: 'avatar', 'aria-hidden': 'true' });
    this.status = h('span', { class: 'phone-status' });
    this.callBtn = h('button', { class: 'call-btn', type: 'button', 'aria-label': 'Call Hammy', onclick: () => this.c.call() }, '📞');
    this.thread = h('ol', { class: 'thread', 'aria-label': 'Texts with Hammy', 'aria-live': 'polite' });
    let lastDay = '';
    for (const m of s.messages) {
      if (m.at > now) continue;
      const day = new Date(m.at).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        this.thread.append(h('li', { class: 'day' }, new Date(m.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })));
      }
      const time = new Date(m.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      this.thread.append(
        m.missed
          ? h('li', { class: 'missed' }, `📞 Missed call from Hammy · ${time}`)
          : h('li', { class: `msg msg-${m.from}`, title: time }, m.text),
      );
    }
    if (typing(s, now)) this.thread.append(h('li', { class: 'msg msg-hammy typing', 'aria-label': 'Hammy is typing' }, h('span'), h('span'), h('span')));
    if (!alive) this.thread.append(h('li', { class: 'missed' }, 'Message not delivered'));

    this.replies = alive
      ? textOptions(s).map((o) => h('button', { class: 'reply', type: 'button', onclick: () => this.c.text(o.id) }, o.text))
      : [];
    this.budget = h('span', { class: 'budget', 'aria-hidden': 'true' });

    root.append(
      h(
        'section',
        { class: 'phone' },
        h(
          'div',
          { class: 'phone-head' },
          this.portrait,
          h('div', { class: 'phone-who' }, h('span', { class: 'phone-name' }, 'Hammy'), this.status),
          this.callBtn,
        ),
        this.thread,
        alive
          ? h(
              'div',
              { class: 'compose' },
              h('div', { class: 'replies' }, ...this.replies),
              h('p', { class: 'note budget-line' }, 'Texts he’s not sick of yet ', this.budget),
            )
          : null,
      ),
      h('p', { class: 'note' }, 'Text him and call him, or he gets sad. He calls you too. Missed calls and unread texts make it worse.'),
    );
    paintPortrait(this.portrait, s.fit, alive ? 'happy' : 'dead', 0, this.c.form);
    this.thread.scrollTop = this.thread.scrollHeight;
  }

  sync(): void {
    const s = this.c.state;
    const now = Date.now();
    if (this.status) {
      const text = !isAlive(s)
        ? `last seen ${fmtDuration((now - (s.diedAt ?? now)) / 1000)} ago`
        : typing(s, now)
          ? 'typing…'
          : canCall(s, now)
            ? 'online'
            : `in a game · free in ${fmtCountdown((s.callReadyAt - now) / 1000)}`;
      setText(this.status, text);
    }
    if (this.budget) {
      const n = Math.floor(s.textBudget);
      setText(this.budget, '●'.repeat(n) + '○'.repeat(MAX_TEXTS - n));
    }
  }
}

// ---------------------------------------------------------------------------

function toyEffects(t: ToyDef): string {
  if (t.id === 'hand') return 'Throwing him: + mood';
  const parts = [`${t.mood > 0 ? '+' : ''}${t.mood} mood`];
  if (t.fresh) parts.push(`+${t.fresh} fresh`);
  if (t.belly) parts.push(`+${t.belly} belly`);
  parts.push(`+${t.coins} ${t.coins === 1 ? 'coin' : 'coins'}`);
  return `${parts.join(' · ')} a hit`;
}

class ShopPanel implements Panel {
  private cards: { btn: HTMLButtonElement; price: number }[] = [];
  private portraits: { canvas: HTMLCanvasElement; fit: FitId }[] = [];
  private icons: { canvas: HTMLCanvasElement; toy: ToyId }[] = [];

  constructor(private c: Controller) {}

  key(): string {
    const s = this.c.state;
    return `${s.fit}|${s.owned.join()}|${s.toy}|${s.toys.join()}|${s.upgrades.vacuum}|${s.upgrades.soap}|${s.furniture.join()}|${isAlive(s)}|${this.c.form}`;
  }

  private price(price: number): HTMLElement {
    return h('span', null, h('span', { class: 'coin coin-small', 'aria-hidden': 'true' }, 'H'), fmt(price));
  }

  build(root: HTMLElement): void {
    const s = this.c.state;
    this.cards = [];
    this.portraits = [];
    this.icons = [];

    const furniture = h('div', { class: 'toys' });
    for (const f of FURNITURE) {
      const have = s.furniture.includes(f.id);
      const btn = h('button', { class: `fit-btn${have ? ' wearing' : ' buy'}`, type: 'button', onclick: () => this.c.buyFurniture(f.id) }, have ? 'In the unit' : this.price(f.price));
      if (have) btn.disabled = true;
      furniture.append(
        h(
          'div',
          { class: `toy${have ? ' fit-on' : ''}` },
          h('span', { class: 'toy-pic toy-emoji', 'aria-hidden': 'true' }, f.icon),
          h('span', { class: 'toy-main' }, h('span', { class: 'fit-name' }, f.name), h('span', { class: 'fit-blurb' }, f.blurb)),
          btn,
        ),
      );
      if (!have) this.cards.push({ btn, price: f.price });
    }

    const stuff = h('div', { class: 'toys' });
    for (const u of UPGRADES) {
      const have = s.upgrades[u.id];
      const next = u.levels[have];
      const cost = upgradeCost(s, u.id);
      const btn = h(
        'button',
        { class: `fit-btn${cost === null ? ' wearing' : ' buy'}`, type: 'button', onclick: () => this.c.buyUpgrade(u.id) },
        cost === null ? 'Got it' : this.price(cost),
      );
      if (cost === null) btn.disabled = true;
      const current = have ? u.levels[have - 1].name : 'None yet';
      stuff.append(
        h(
          'div',
          { class: `toy${have ? ' fit-on' : ''}` },
          h('span', { class: 'toy-pic toy-emoji', 'aria-hidden': 'true' }, u.id === 'vacuum' ? '🤖' : '🧼'),
          h(
            'span',
            { class: 'toy-main' },
            h('span', { class: 'fit-name' }, next ? next.name : u.levels[have - 1].name),
            h('span', { class: 'fit-blurb' }, next ? next.blurb : u.levels[have - 1].blurb),
            h('span', { class: 'toy-fx' }, next && have ? `You have: ${current}` : have ? 'Maxed out' : ''),
          ),
          btn,
        ),
      );
      if (cost !== null) this.cards.push({ btn, price: cost });
    }

    const toys = h('div', { class: 'toys' });
    for (const t of TOYS) {
      const owned = s.toys.includes(t.id);
      const inHand = s.toy === t.id;
      const icon = h('canvas', { class: 'toy-pic', 'aria-hidden': 'true' });
      const btn = h(
        'button',
        {
          class: `fit-btn${inHand ? ' wearing' : ''}${owned ? '' : ' buy'}`,
          type: 'button',
          onclick: () => (owned ? this.c.pickToy(t.id) : this.c.buyToy(t.id)),
        },
        inHand ? 'In hand' : owned ? 'Use' : this.price(t.price),
      );
      if (inHand) btn.disabled = true;
      toys.append(
        h(
          'div',
          { class: `toy${inHand ? ' fit-on' : ''}` },
          icon,
          h(
            'span',
            { class: 'toy-main' },
            h('span', { class: 'fit-name' }, t.name),
            h('span', { class: 'fit-blurb' }, `${t.blurb} ${t.how}`),
            h('span', { class: `toy-fx${t.mood < 0 ? ' mean' : ''}` }, toyEffects(t)),
          ),
          btn,
        ),
      );
      this.cards.push({ btn, price: owned ? 0 : t.price });
      this.icons.push({ canvas: icon, toy: t.id });
    }

    const form = this.c.form;
    const grid = h('div', { class: 'fits' });
    for (const f of FITS) {
      const owned = s.owned.includes(f.id);
      const wearing = s.fit === f.id;
      const canvas = h('canvas', { class: 'fit-pic', 'aria-hidden': 'true' });
      const btn = h(
        'button',
        {
          class: `fit-btn${wearing ? ' wearing' : ''}${owned ? '' : ' buy'}`,
          type: 'button',
          onclick: () => (owned ? this.c.wearFit(f.id) : this.c.buyFit(f.id)),
        },
        wearing ? 'Wearing' : owned ? 'Wear' : this.price(f.price),
      );
      if (wearing) btn.disabled = true;
      grid.append(h('div', { class: `fit${wearing ? ' fit-on' : ''}` }, canvas, h('span', { class: 'fit-name' }, f.name), h('span', { class: 'fit-blurb' }, f.blurb), btn));
      this.cards.push({ btn, price: owned ? 0 : f.price });
      this.portraits.push({ canvas, fit: f.id });
    }

    root.append(
      h('h2', { class: 'sub' }, 'Furniture'),
      h(
        'p',
        { class: 'note' },
        s.furniture.length === FURNITURE.length
          ? 'The unit is fully furnished. It all stays if he dies.'
          : 'The unit came with a toilet and a shower. Everything else is on you. Tap an empty spot in the unit to see what goes there. It stays if he dies.',
      ),
      furniture,
      h('h2', { class: 'sub' }, 'For the unit'),
      h('p', { class: 'note' }, 'Stuff that makes him less work. It stays if he dies.'),
      stuff,
      h('h2', { class: 'sub' }, 'Toys'),
      h('p', { class: 'note' }, 'Pick a toy in the bar under the unit and use it on him. Nice toys lift his mood. Mean ones pay more coins and cost you his mood. Each one counts every couple of seconds.'),
      toys,
      h('h2', { class: 'sub' }, 'Fits'),
      h(
        'p',
        { class: 'note' },
        form === 'cube' || form === 'hamster'
          ? 'New looks for Hammy. Fits stay yours even if he dies.'
          : `Today he's ${FORM_BY_ID[form].today} Hats and glasses still go on; shirts and costumes wait until he's a cube again. Fits stay yours even if he dies.`,
      ),
      grid,
    );
    requestAnimationFrame(() => {
      for (const x of this.portraits) paintPortrait(x.canvas, x.fit, 'happy', 400, form);
      for (const x of this.icons) paintToyIcon(x.canvas, x.toy);
    });
  }

  sync(): void {
    const s = this.c.state;
    for (const card of this.cards) {
      if (card.price === 0) continue;
      const can = s.coins >= card.price;
      setDisabled(card.btn, !can);
      card.btn.classList.toggle('affordable', can);
    }
  }
}

// ---------------------------------------------------------------------------

class LifePanel implements Panel {
  private confirming = false;
  private stats: { el: HTMLElement; value: () => string }[] = [];

  constructor(private c: Controller) {}

  key(): string {
    const s = this.c.state;
    return `${s.n}|${s.graves.length}|${isAlive(s)}|${s.sound}|${this.confirming}`;
  }

  private setConfirm(v: boolean): void {
    this.confirming = v;
    this.c.refresh();
  }

  build(root: HTMLElement): void {
    const s = this.c.state;
    const rows: [string, () => string][] = [
      ['Age', () => age(s, Date.now())],
      ['Farts', () => fmt(s.stats.farts)],
      ['Meals', () => fmt(s.stats.meals)],
      ['Floor poops you binned', () => fmt(s.stats.scooped)],
      ['Calls', () => fmt(s.stats.calls)],
      ['Texts sent', () => fmt(s.stats.texts)],
      ['Times thrown', () => fmt(s.stats.flings)],
      ['Showers', () => fmt(s.stats.showers)],
      ['Toilet trips', () => fmt(s.stats.toilet)],
      ['…by himself', () => fmt(s.stats.selfToilet)],
      ['Flushed by you', () => fmt(s.stats.flushed)],
      ['Trash he left around', () => fmt(s.stats.littered)],
      ['Trash you picked up', () => fmt(s.stats.tidied)],
      ['Steaks cooked', () => fmt(s.stats.cooked)],
      ['Trash vacuumed', () => fmt(s.stats.vacuumed)],
      ['Orders on your coins', () => fmt(s.stats.selfOrders)],
      ['He spent', () => `${fmt(s.stats.selfSpent)} coins`],
    ];
    this.stats = [];
    const dl = h('dl', { class: 'stats' });
    for (const [label, value] of rows) {
      const dd = h('dd');
      dl.append(h('div', null, h('dt', null, label), dd));
      this.stats.push({ el: dd, value });
    }

    const graves = h('ol', { class: 'graves' });
    for (const g of s.graves) {
      graves.append(
        h(
          'li',
          { class: 'grave' },
          h('span', { class: 'grave-name' }, `🪦 Hammy #${g.n}`),
          h('span', { class: 'grave-life' }, `Lived ${fmtDuration((g.diedAt - g.bornAt) / 1000)} · ${fmt(g.farts)} farts`),
          h('span', { class: 'grave-cause' }, causeText(g.causes)),
        ),
      );
    }

    const erase = this.confirming
      ? h(
          'div',
          { class: 'confirm' },
          h('p', null, 'Erase Hammy, his graveyard, your fits and your coins, and start over? This cannot be undone.'),
          h(
            'div',
            { class: 'confirm-row' },
            h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => this.setConfirm(false) }, 'Keep him'),
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
      h('h2', { class: 'sub' }, `Hammy #${s.n}${isAlive(s) ? '' : ' (deceased)'}`),
      dl,
      h('h2', { class: 'sub' }, 'Graveyard'),
      s.graves.length ? graves : h('p', { class: 'empty' }, 'Nobody here yet. Keep it that way.'),
      h('h2', { class: 'sub' }, 'Settings'),
      h(
        'button',
        { class: 'toggle', type: 'button', role: 'switch', 'aria-checked': String(s.sound), onclick: () => this.c.toggleSound() },
        h('span', null, 'Sound (yes, the farts)'),
        h('span', { class: 'toggle-state' }, s.sound ? 'On' : 'Off'),
      ),
      h('div', { class: 'erase' }, erase),
    );
  }

  sync(): void {
    for (const st of this.stats) setText(st.el, st.value());
  }
}

// ---------------------------------------------------------------------------

const TAB_TITLES: Record<Tab, string> = { care: 'Care', phone: 'Phone', shop: 'Shop', life: 'Life' };

export class GameUI {
  private tab: Tab = 'care';
  /** On phones the sections slide up over the unit; on wide screens they're docked beside it. */
  private sheetOpen = false;
  private docked = matchMedia('(min-width: 900px)');
  private panels: Record<Tab, Panel>;
  private builtKey = '';
  private toastTimer = 0;
  private modalClose: (() => void) | null = null;
  private callTimer = 0;

  private coins = document.getElementById('coins')!;
  private who = document.getElementById('who')!;
  private ageEl = document.getElementById('age')!;
  private today = document.getElementById('today')!;
  private toybar = document.getElementById('toybar')!;
  private toyKey = '';
  private hint = document.getElementById('hint')!;
  private panel = document.getElementById('panel')!;
  private sheet = document.getElementById('sheet')!;
  private sheetTitle = document.getElementById('sheet-title')!;
  private toastEl = document.getElementById('toast')!;
  private modal = document.getElementById('modal')!;
  private tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  private meters = [...document.querySelectorAll<HTMLElement>('.meter')].map((el) => ({
    need: el.dataset.need as Need | 'health',
    el,
    word: el.querySelector<HTMLElement>('.meter-word')!,
    fill: el.querySelector<HTMLElement>('.bar-fill')!,
  }));

  constructor(private c: Controller) {
    this.panels = { care: new CarePanel(c), phone: new PhonePanel(c), shop: new ShopPanel(c), life: new LifePanel(c) };
    for (const t of this.tabs) {
      t.addEventListener('click', () => {
        const tab = t.dataset.tab as Tab;
        // Tapping the open section again puts it away.
        if (tab === this.tab && this.sheetOpen && !this.docked.matches) this.closeSheet();
        else this.setTab(tab);
      });
    }
    this.tabs[0].parentElement!.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = this.tabs.findIndex((t) => t.dataset.tab === this.tab);
      const next = this.tabs[(i + (e.key === 'ArrowRight' ? 1 : this.tabs.length - 1)) % this.tabs.length];
      this.setTab(next.dataset.tab as Tab);
      next.focus();
    });
    document.getElementById('sheet-close')!.addEventListener('click', () => this.closeSheet());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.contains(e.target as Node)) this.closeSheet();
    });
    this.docked.addEventListener('change', () => this.showSheet());
    this.setTab('care', false);
  }

  /** The section you can see right now, if any. */
  get visibleTab(): Tab | null {
    return this.sheetOpen || this.docked.matches ? this.tab : null;
  }

  /** Switch section, and (unless `open` is false) bring it up. */
  setTab(tab: Tab, open = true): void {
    this.tab = tab;
    if (open) this.sheetOpen = true;
    this.panel.scrollTop = 0;
    this.showSheet();
  }

  /** Put the section away. Returns whether there was one to put away. */
  closeSheet(): boolean {
    if (!this.sheetOpen || this.docked.matches) return false;
    this.sheetOpen = false;
    this.showSheet();
    this.tabs.find((t) => t.dataset.tab === this.tab)?.focus();
    return true;
  }

  private showSheet(): void {
    const visible = this.visibleTab !== null;
    this.sheet.hidden = !visible;
    for (const t of this.tabs) {
      const on = t.dataset.tab === this.tab;
      t.setAttribute('aria-selected', String(on && visible));
      t.setAttribute('aria-expanded', String(on && visible));
      t.tabIndex = on ? 0 : -1;
    }
    setText(this.sheetTitle, TAB_TITLES[this.tab]);
    this.panel.setAttribute('aria-labelledby', `tab-${this.tab}`);
    this.sync(true);
  }

  sync(force = false): void {
    this.syncBadges();
    this.syncToybar();
    if (this.visibleTab === null) return;
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
  }

  /** The toy bar under the unit: every toy you own, and a way to get more. */
  private syncToybar(): void {
    const s = this.c.state;
    const key = `${s.toys.join()}|${s.toy}|${isAlive(s)}`;
    if (key === this.toyKey) return;
    this.toyKey = key;
    const icons: { canvas: HTMLCanvasElement; toy: ToyId }[] = [];
    const buttons = TOYS.filter((t) => s.toys.includes(t.id)).map((t) => {
      const canvas = h('canvas', { class: 'toy-icon', 'aria-hidden': 'true' });
      icons.push({ canvas, toy: t.id });
      return h(
        'button',
        {
          class: 'toy-btn',
          type: 'button',
          'aria-pressed': String(s.toy === t.id),
          'aria-label': t.name,
          title: `${t.name}: ${t.how}`,
          disabled: !isAlive(s),
          onclick: () => this.c.pickToy(t.id),
        },
        canvas,
      );
    });
    const more =
      s.toys.length < TOYS.length
        ? h('button', { class: 'toy-btn toy-more', type: 'button', 'aria-label': 'Get more toys', title: 'Get more toys', onclick: () => this.setTab('shop') }, h('span', { class: 'toy-plus', 'aria-hidden': 'true' }, '+'))
        : null;
    this.toybar.replaceChildren(...buttons, ...(more ? [more] : []));
    requestAnimationFrame(() => {
      for (const x of icons) paintToyIcon(x.canvas, x.toy);
    });
  }

  /** Explain a toy the moment you pick it up. */
  toyPicked(id: ToyId): void {
    const t = TOY_BY_ID[id];
    this.toast(`${t.name}: ${t.how}`, 3500);
  }

  private syncBadges(): void {
    const s = this.c.state;
    const now = Date.now();
    const alive = isAlive(s);
    const texts = unread(s, now);
    const shop =
      FITS.filter((f) => !s.owned.includes(f.id) && s.coins >= f.price).length +
      TOYS.filter((t) => !s.toys.includes(t.id) && s.coins >= t.price).length +
      UPGRADES.filter((u) => {
        const cost = upgradeCost(s, u.id);
        return cost !== null && s.coins >= cost;
      }).length +
      FURNITURE.filter((f) => !s.furniture.includes(f.id) && s.coins >= f.price).length;
    const mess = s.poops.length + s.trash.length + (s.bowl ? 1 : 0);
    const badges: Record<Tab, string> = {
      care: !alive ? '' : s.urges.length || s.bowl >= BOWL_MAX ? '!' : mess ? String(mess) : '',
      phone: this.visibleTab === 'phone' || !texts || !alive ? '' : String(texts),
      shop: shop ? String(shop) : '',
      life: '',
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
    const now = Date.now();
    setText(this.coins, fmt(s.coins));
    setText(this.who, `Hammy #${s.n}`);
    setText(this.ageEl, isAlive(s) ? `${age(s, now)} old` : 'deceased');
    setText(this.today, `Today: ${FORM_BY_ID[this.c.form].name.toLowerCase()}`);
    for (const m of this.meters) {
      const value = s[m.need];
      setBar(m.fill, value / 100);
      setText(m.word, needWord(m.need, value));
      m.el.classList.toggle('low', value < 25);
      const now = String(Math.round(value));
      if (m.el.getAttribute('aria-valuenow') !== now) {
        m.el.setAttribute('aria-valuenow', now);
        m.el.setAttribute('aria-valuetext', `${now} of 100, ${needWord(m.need, value)}`);
      }
    }
    // Each chore gets explained the first time it comes up.
    const chore =
      s.bowl && !s.stats.flushed
        ? 'He didn’t flush. Tap the toilet to flush it.'
        : s.poops.length && !s.stats.scooped
          ? 'Drag his poop into the toilet.'
          : s.trash.length && !s.stats.tidied
            ? 'Tap his trash to throw it down the chute.'
            : null;
    const first = s.stats.flings < 2 && s.stats.showers + s.stats.toilet === 0;
    setText(this.hint, chore ?? 'Drag Hammy around. Drop him in the shower.');
    this.hint.hidden = !(chore || first) || s.toy !== 'hand' || !this.toastEl.hidden || !isAlive(s) || this.modalOpen;
  }

  toast(message: string, ms = 3000): void {
    setText(this.toastEl, message);
    this.toastEl.hidden = false;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.hidden = true;
    }, ms);
  }

  // Modals -------------------------------------------------------------------

  get modalOpen(): boolean {
    return !this.modal.hidden;
  }

  private open(card: HTMLElement, onClose?: () => void, focus?: HTMLElement): void {
    this.modal.replaceChildren(card);
    this.modal.hidden = false;
    this.modalClose = () => {
      clearInterval(this.callTimer);
      this.modal.hidden = true;
      this.modal.replaceChildren();
      this.modalClose = null;
      onClose?.();
    };
    (focus ?? card.querySelector('button'))?.focus();
  }

  closeModal(): void {
    this.modalClose?.();
  }

  private showModal(children: (Node | null)[], action: string, onClose?: () => void): void {
    const btn = h('button', { class: 'btn btn-cheese', type: 'button', onclick: () => this.closeModal() }, action);
    const card = h('div', { class: 'modal-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' }, ...children, btn);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });
    this.open(card, onClose, btn);
  }

  showIntro(): void {
    const pic = h('canvas', { class: 'modal-pic', 'aria-hidden': 'true' });
    this.showModal(
      [
        pic,
        h('p', { class: 'eyebrow' }, 'Subject: Hammy'),
        h('h2', { id: 'modal-title' }, 'This is Hammy. He’s a lot.'),
        h('p', null, 'He lives in a containment unit now. It came with a toilet and a shower, and that’s it: the bed, the chair, the fridge and the gaming PC are on you, from the Shop. He eats DoorDosh, he farts, and the scientist watching him on the camera needs a gas mask.'),
        h(
          'p',
          null,
          'He lives like a Sim, badly. He walks to the toilet himself but never flushes, and leaves his trash wherever he’s done with it, also while you sleep. Drag his floor poop into the toilet and flush it, tap the trash to bin it, and drag him into the shower when he stinks. Text and call him, or he gets sad. Ignore him long enough and he dies, rots, and turns into mushrooms. Then you lose.',
        ),
        h('p', null, 'The toys under the unit are for him. Some days he wakes up as something else. Just go with it.'),
        h('p', { class: 'stink' }, 'He keeps living while the game is closed.'),
      ],
      'Fine.',
    );
    requestAnimationFrame(() => paintPortrait(pic, this.c.state.fit, 'joy', 0, this.c.form));
  }

  showWelcome(r: AwayReport): void {
    const lines: string[] = [];
    if (r.farts) lines.push(`farted ${fmt(r.farts)} ${r.farts === 1 ? 'time' : 'times'}`);
    if (r.selfToilet) lines.push(`used the toilet ${r.selfToilet === 1 ? 'once' : `${r.selfToilet} times`} and didn’t flush${r.selfToilet === 1 ? '' : ' once'}`);
    if (r.poops) lines.push(`pooped on the floor ${r.poops} ${r.poops === 1 ? 'time' : 'times'}${r.bowl >= BOWL_MAX ? ' (the toilet was full)' : ''}`);
    if (r.littered) lines.push(`left ${r.littered} ${r.littered === 1 ? 'piece' : 'pieces'} of trash around${r.vacuumed ? ` (the robot vacuum got ${r.vacuumed >= r.littered ? 'all of it' : r.vacuumed})` : ''}`);
    if (r.texts) lines.push(`texted you ${r.texts} ${r.texts === 1 ? 'time' : 'times'}`);
    if (r.missedCalls) lines.push(`called ${r.missedCalls} ${r.missedCalls === 1 ? 'time' : 'times'} (you missed it)`);
    const change = (need: Need, label: string) => {
      const d = Math.round(r.after[need] - r.before[need]);
      return h('li', null, h('span', null, label), h('span', { class: d < 0 ? 'down' : 'up' }, `${d >= 0 ? '+' : ''}${d}`));
    };
    const children: (Node | null)[] = [
      h('p', { class: 'eyebrow' }, `Away for ${fmtDuration(r.elapsed)}`),
      h('h2', { id: 'modal-title' }, r.died ? 'Hammy died while you were gone' : 'While you were gone, Hammy…'),
      lines.length ? h('p', null, `…${lines.join(', ')}.`) : h('p', null, '…just sat there, mostly.'),
      r.selfOrders
        ? h('p', { class: 'stink' }, `He ordered DoorDosh ${r.selfOrders === 1 ? 'once' : `${r.selfOrders} times`} on your coins, tip included: ${fmt(r.selfSpent)} coins.`)
        : null,
      r.died
        ? h('p', null, causeText(this.c.state.causes))
        : h('ul', { class: 'changes' }, change('belly', 'Belly'), change('fresh', 'Fresh'), change('mood', 'Mood')),
    ];
    this.showModal(children, r.died ? 'Go look' : 'Back to the unit');
  }

  /** He's calling. Answer, decline, or let it ring out. */
  showRinging(handlers: { answer(): void; decline(): void; miss(): void }): void {
    const pic = h('canvas', { class: 'call-pic', 'aria-hidden': 'true' });
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      this.closeModal();
      fn();
    };
    const accept = h('button', { class: 'round-btn accept', type: 'button', 'aria-label': 'Answer', onclick: () => settle(handlers.answer) }, '📞');
    const decline = h('button', { class: 'round-btn decline', type: 'button', 'aria-label': 'Decline', onclick: () => settle(handlers.decline) }, '✕');
    const card = h(
      'div',
      { class: 'modal-card call-card ringing', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
      h('p', { class: 'eyebrow' }, 'Incoming call'),
      pic,
      h('h2', { id: 'modal-title' }, 'Hammy'),
      h('p', null, 'is calling you…'),
      h('div', { class: 'call-row' }, h('span', { class: 'call-opt' }, decline, 'Decline'), h('span', { class: 'call-opt' }, accept, 'Answer')),
    );
    this.open(card, undefined, accept);
    paintPortrait(pic, this.c.state.fit, 'joy', 0, this.c.form);
    const started = Date.now();
    sfx.ring();
    this.callTimer = window.setInterval(() => {
      if (Date.now() - started > RING_SECONDS * 1000) settle(handlers.miss);
      else sfx.ring();
    }, 1400);
  }

  /** On the phone with him. Returns nothing; calls onEnd with the seconds talked. */
  showCall(incoming: boolean, onEnd: (seconds: number) => void): void {
    const pic = h('canvas', { class: 'call-pic', 'aria-hidden': 'true' });
    const timer = h('p', { class: 'call-time' }, '0:00');
    const caption = h('p', { class: 'caption', 'aria-live': 'polite' }, '“Yo!”');
    const fill = h('span', { class: 'bar-fill' });
    const end = h('button', { class: 'round-btn decline', type: 'button', 'aria-label': 'End call' }, '✕');
    const card = h(
      'div',
      { class: 'modal-card call-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
      h('p', { class: 'eyebrow' }, incoming ? 'You picked up' : 'Calling Hammy'),
      pic,
      h('h2', { id: 'modal-title' }, 'Hammy'),
      timer,
      caption,
      h('p', { class: 'note' }, 'Mood from this call'),
      h('span', { class: 'bar' }, fill),
      h('div', { class: 'call-row' }, h('span', { class: 'call-opt' }, end, 'End call')),
    );
    const started = Date.now();
    const lines = [...CALL_LINES].sort(() => Math.random() - 0.5);
    let line = 0;
    let lastLine = started;
    const faces: Face[] = ['happy', 'joy', 'smug', 'eat', 'happy'];
    end.addEventListener('click', () => this.closeModal());
    this.open(card, () => onEnd((Date.now() - started) / 1000), end);
    const tick = () => {
      const now = Date.now();
      const secs = (now - started) / 1000;
      setText(timer, `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`);
      setBar(fill, callMood(secs, false) / CALL_MAX_MOOD);
      if (now - lastLine > 2600) {
        lastLine = now;
        setText(caption, `“${lines[line++ % lines.length]}”`);
      }
      paintPortrait(pic, this.c.state.fit, faces[Math.floor(secs / 2.6) % faces.length], now, this.c.form);
    };
    tick();
    this.callTimer = window.setInterval(tick, 250);
  }
}
