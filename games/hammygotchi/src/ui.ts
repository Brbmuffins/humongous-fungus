import { h, setDisabled, setText } from '@shared/dom';
import { fmt, fmtCountdown, fmtDuration } from '@shared/format';
import {
  CALL_LINES,
  CALL_MAX_MOOD,
  FITS,
  FOODS,
  HOSE_FRESH,
  MAX_TEXTS,
  RING_SECONDS,
  ROT_SECONDS,
  SCOOP_COINS,
  START_COINS,
  type FitId,
  type FoodDef,
  type FoodId,
  type Need,
} from './defs';
import {
  callMood,
  canCall,
  canHose,
  canOrder,
  causeText,
  deadFor,
  isAlive,
  markRead,
  needWord,
  rotDone,
  textOptions,
  typing,
  unread,
  type AwayReport,
} from './game';
import { paintPortrait, type Face } from './hammy';
import { sfx } from './sound';
import type { HammyState } from './state';

export type Tab = 'care' | 'phone' | 'fits' | 'life';

export interface Controller {
  readonly state: HammyState;
  order(id: FoodId): void;
  scoopAll(): void;
  hose(): void;
  text(id: string): void;
  call(): void;
  buyFit(id: FitId): void;
  wearFit(id: FitId): void;
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
  private hoseBtn: HTMLButtonElement | null = null;
  private hoseSub: HTMLElement | null = null;
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
          h('p', { class: 'note' }, `Your fits stay yours. Coins start over at ${START_COINS}.`),
        ),
      );
      return;
    }
    this.adoptBtn = null;

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
    for (const f of FOODS) {
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

    this.scoopSub = h('span', { class: 'action-sub' });
    this.scoopBtn = h(
      'button',
      { class: 'action', type: 'button', onclick: () => this.c.scoopAll() },
      h('span', { class: 'action-name' }, 'Scoop the poop'),
      this.scoopSub,
    );
    this.hoseSub = h('span', { class: 'action-sub' });
    this.hoseBtn = h('button', { class: 'action', type: 'button', onclick: () => this.c.hose() }, h('span', { class: 'action-name' }, 'Hose him down'), this.hoseSub);

    root.append(
      h('div', { class: 'dosh-head' }, h('h2', { class: 'sub' }, h('span', { class: 'dosh' }, 'DoorDosh')), h('span', { class: 'note' }, 'He only eats delivery.')),
      pending,
      menu,
      h('h2', { class: 'sub' }, 'Clean up after him'),
      h('div', { class: 'actions' }, this.scoopBtn, this.hoseBtn),
      h('p', { class: 'note' }, 'Grab Hammy and throw him: he loves it. A quick tap is a pet. Farts and poop make the tank stink, and his neighbors leave when it gets bad.'),
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
    if (this.scoopBtn && this.scoopSub) {
      const n = s.poops.length;
      setDisabled(this.scoopBtn, n === 0);
      setText(this.scoopSub, n ? `${n} on the floor · +${n * SCOOP_COINS} coins` : 'Floor is clean. For now.');
    }
    if (this.hoseBtn && this.hoseSub) {
      const ready = canHose(s, now);
      setDisabled(this.hoseBtn, !ready);
      setText(this.hoseSub, ready ? `+${HOSE_FRESH} fresh. He hates it.` : `Hose refills in ${fmtCountdown((s.hoseReadyAt - now) / 1000)}`);
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
    paintPortrait(this.portrait, s.fit, alive ? 'happy' : 'dead');
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

class FitsPanel implements Panel {
  private cards: { id: FitId; btn: HTMLButtonElement; price: number }[] = [];
  private canvases: { canvas: HTMLCanvasElement; fit: FitId }[] = [];

  constructor(private c: Controller) {}

  key(): string {
    const s = this.c.state;
    return `${s.fit}|${s.owned.join()}|${isAlive(s)}`;
  }

  build(root: HTMLElement): void {
    const s = this.c.state;
    this.cards = [];
    this.canvases = [];
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
        wearing ? 'Wearing' : owned ? 'Wear' : h('span', null, h('span', { class: 'coin coin-small', 'aria-hidden': 'true' }, 'H'), fmt(f.price)),
      );
      if (wearing) btn.disabled = true;
      grid.append(h('div', { class: `fit${wearing ? ' fit-on' : ''}` }, canvas, h('span', { class: 'fit-name' }, f.name), h('span', { class: 'fit-blurb' }, f.blurb), btn));
      this.cards.push({ id: f.id, btn, price: owned ? 0 : f.price });
      this.canvases.push({ canvas, fit: f.id });
    }
    root.append(h('p', { class: 'note' }, 'Spend Hammy coins on new looks. You earn them by scooping poop, texting, calling, and keeping him happy. Fits stay yours even if he dies.'), grid);
    requestAnimationFrame(() => {
      for (const x of this.canvases) paintPortrait(x.canvas, x.fit, 'happy', 400);
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
      ['Poops scooped', () => fmt(s.stats.scooped)],
      ['Calls', () => fmt(s.stats.calls)],
      ['Texts sent', () => fmt(s.stats.texts)],
      ['Times thrown', () => fmt(s.stats.flings)],
      ['Hosed down', () => fmt(s.stats.hoses)],
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

export class GameUI {
  private tab: Tab = 'care';
  private panels: Record<Tab, Panel>;
  private builtKey = '';
  private toastTimer = 0;
  private modalClose: (() => void) | null = null;
  private callTimer = 0;

  private coins = document.getElementById('coins')!;
  private who = document.getElementById('who')!;
  private ageEl = document.getElementById('age')!;
  private hint = document.getElementById('hint')!;
  private panel = document.getElementById('panel')!;
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
    this.panels = { care: new CarePanel(c), phone: new PhonePanel(c), fits: new FitsPanel(c), life: new LifePanel(c) };
    for (const t of this.tabs) t.addEventListener('click', () => this.setTab(t.dataset.tab as Tab));
    this.tabs[0].parentElement!.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = this.tabs.findIndex((t) => t.dataset.tab === this.tab);
      const next = this.tabs[(i + (e.key === 'ArrowRight' ? 1 : this.tabs.length - 1)) % this.tabs.length];
      this.setTab(next.dataset.tab as Tab);
      next.focus();
    });
    this.setTab('care');
  }

  get currentTab(): Tab {
    return this.tab;
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
    const now = Date.now();
    const alive = isAlive(s);
    const texts = unread(s, now);
    const fits = FITS.filter((f) => !s.owned.includes(f.id) && s.coins >= f.price).length;
    const badges: Record<Tab, string> = {
      care: alive && s.poops.length ? String(s.poops.length) : '',
      phone: this.tab === 'phone' || !texts || !alive ? '' : String(texts),
      fits: fits ? String(fits) : '',
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
    this.hint.hidden = s.stats.flings >= 2 || !this.toastEl.hidden || !isAlive(s) || this.modalOpen;
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
        h('p', { class: 'eyebrow' }, 'Your new roommate'),
        h('h2', { id: 'modal-title' }, 'This is Hammy. He’s a lot.'),
        h('p', null, 'He lives in your tank now. He only eats DoorDosh, mostly Dorkitos. He poops, he farts, and he stinks. The neighbors hate him.'),
        h('p', null, 'Feed him, scoop his poop, and text and call him on his phone, or he gets sad. Ignore him long enough and he dies, rots, and turns into mushrooms. Then you lose.'),
        h('p', { class: 'stink' }, 'He keeps living while the game is closed.'),
      ],
      'Fine.',
    );
    requestAnimationFrame(() => paintPortrait(pic, this.c.state.fit, 'joy'));
  }

  showWelcome(r: AwayReport): void {
    const lines: string[] = [];
    if (r.farts) lines.push(`farted ${fmt(r.farts)} ${r.farts === 1 ? 'time' : 'times'}`);
    if (r.poops) lines.push(`pooped ${r.poops} ${r.poops === 1 ? 'time' : 'times'}`);
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
    this.showModal(children, r.died ? 'Go look' : 'Back to the tank');
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
    paintPortrait(pic, this.c.state.fit, 'joy');
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
      paintPortrait(pic, this.c.state.fit, faces[Math.floor(secs / 2.6) % faces.length], now);
    };
    tick();
    this.callTimer = window.setInterval(tick, 250);
  }
}
