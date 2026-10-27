// Everything on the page that isn't the sky: your coins, the last rounds,
// the bet controls and the big button, the players this round, and the
// stats, fairness and how-to-play cards.
import { h, setText } from '@shared/dom';
import { HOUSE_EDGE, MIN_BET, REFILL_COINS, START_COINS } from './defs';
import type { Bet, Phase } from './game';
import { profit, type RoundRecord, type Save } from './meta';
import { fmtX } from './scene';
import { THEMES, type Theme } from './themes';

export interface Controller {
  readonly save: Save;
  /** The look in use. */
  readonly theme: Theme;
  /** Pick a look (a theme id); it's remembered on this device. */
  setTheme(id: string): void;
  /** The big button. */
  act(): void;
  setBet(amount: number): void;
  setAuto(target: number): void;
  setAutoOn(on: boolean): void;
  toggleSound(): void;
  reset(): void;
  verify(r: RoundRecord): Promise<boolean>;
  /** The hash of the round on the table now. */
  currentHash(): string;
}

export type ActionState =
  | { kind: 'bet'; amount: number }
  | { kind: 'placed'; amount: number; countdown: number }
  | { kind: 'cash'; payout: number; m: number }
  | { kind: 'next'; amount: number }
  | { kind: 'queued'; amount: number }
  | { kind: 'broke'; seconds: number };

const n = (v: number): string => Math.floor(v).toLocaleString('en-US');

export function chipClass(crash: number): string {
  return crash >= 10 ? 'chip gold' : crash >= 2 ? 'chip green' : 'chip';
}

export class Ui {
  private coinsEl = document.getElementById('coins')!;
  private wallet = this.coinsEl.parentElement!;
  private historyEl = document.getElementById('history')!;
  private betInput = document.getElementById('bet') as HTMLInputElement;
  private autoInput = document.getElementById('auto') as HTMLInputElement;
  private autoOn = document.getElementById('auto-on') as HTMLInputElement;
  private action = document.getElementById('action') as HTMLButtonElement;
  private actionMain = document.getElementById('action-main')!;
  private actionSub = document.getElementById('action-sub')!;
  private rowsEl = document.getElementById('rows')!;
  private countEl = document.getElementById('count')!;
  private wageredEl = document.getElementById('wagered')!;
  private toastEl = document.getElementById('toast')!;
  private liveEl = document.getElementById('live')!;
  private modal = document.getElementById('modal')!;
  private soundBtn = document.getElementById('sound-btn')!;
  private themesEl = document.getElementById('themes')!;
  private logoIcon = document.getElementById('logo-icon')!;
  private logoA = document.getElementById('logo-a')!;
  private logoB = document.getElementById('logo-b')!;
  private rows = new Map<string, { li: HTMLElement; out: HTMLElement }>();
  private shownCoins = -1;
  private coinFx = 0;
  private historyKey = '';
  private toastTimer = 0;
  private lastAction = '';

  constructor(private c: Controller) {
    const s = c.save;
    this.betInput.value = String(s.settings.bet);
    this.autoInput.value = s.settings.auto.toFixed(2);
    this.autoOn.checked = s.settings.autoOn;
    this.action.addEventListener('click', () => c.act());
    const commitBet = () => {
      const v = Number(this.betInput.value.replace(/[^0-9.]/g, ''));
      c.setBet(Number.isFinite(v) ? v : MIN_BET);
      this.betInput.value = String(c.save.settings.bet);
    };
    this.betInput.addEventListener('change', commitBet);
    this.betInput.addEventListener('blur', commitBet);
    const commitAuto = () => {
      const v = Number(this.autoInput.value.replace(/[^0-9.]/g, ''));
      c.setAuto(Number.isFinite(v) ? v : 2);
      this.autoInput.value = c.save.settings.auto.toFixed(2);
    };
    this.autoInput.addEventListener('change', commitAuto);
    this.autoInput.addEventListener('blur', commitAuto);
    this.autoInput.addEventListener('focus', () => {
      if (!this.autoOn.checked) {
        this.autoOn.checked = true;
        c.setAutoOn(true);
      }
    });
    this.autoOn.addEventListener('change', () => c.setAutoOn(this.autoOn.checked));
    for (const b of document.querySelectorAll<HTMLButtonElement>('.quick-row button')) {
      b.addEventListener('click', () => {
        const cur = c.save.settings.bet;
        const q = b.dataset.q;
        const next = q === 'half' ? cur / 2 : q === 'double' ? cur * 2 : q === 'min' ? MIN_BET : c.save.coins;
        c.setBet(next);
        this.betInput.value = String(c.save.settings.bet);
      });
    }
    for (const el of [this.betInput, this.autoInput]) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      });
    }
    document.getElementById('stats-btn')!.addEventListener('click', () => this.showStats());
    document.getElementById('fair-btn')!.addEventListener('click', () => this.showFair());
    document.getElementById('help-btn')!.addEventListener('click', () => this.showHelp(false));
    this.soundBtn.addEventListener('click', () => {
      c.toggleSound();
      this.syncSound();
    });
    this.historyEl.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-round]')?.dataset.round;
      if (id) this.showFair(Number(id));
    });
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });
    this.buildThemes();
    this.syncTheme();
    this.syncSound();
    this.syncHistory(true);
  }

  // -------------------------------------------------------------------------
  // The look

  /** The picker: one chip per theme, a radio group (arrow keys move between them). */
  private buildThemes(): void {
    const chips = THEMES.map((t) =>
      h(
        'button',
        { class: 'theme-chip', type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-label': t.name, title: `${t.name}: ${t.blurb}`, 'data-theme': t.id },
        h('span', { class: 'tc-icon', 'aria-hidden': 'true' }, t.icon),
        h('span', { class: 'tc-label' }, t.chip),
      ),
    );
    this.themesEl.replaceChildren(...chips);
    this.themesEl.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-theme]')?.dataset.theme;
      if (id) this.c.setTheme(id);
    });
    this.themesEl.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const i = THEMES.findIndex((t) => t.id === this.c.theme.id);
      const next = THEMES[(i + d + THEMES.length) % THEMES.length];
      this.c.setTheme(next.id);
      this.themesEl.querySelector<HTMLElement>(`[data-theme="${next.id}"]`)?.focus();
    });
  }

  /** Show the active theme: its colors, wordmark and the picker's state. */
  syncTheme(): void {
    const t = this.c.theme;
    const root = document.documentElement;
    for (const [k, v] of Object.entries(t.css)) root.style.setProperty(k, v);
    root.dataset.theme = t.id;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.themeColor);
    document.title = t.logo.join(' ');
    setText(this.logoA, t.logo[0]);
    setText(this.logoB, t.logo[1]);
    this.logoIcon.className = t.logoIcon ? 'logo-emoji' : 'logo-donut';
    setText(this.logoIcon, t.logoIcon ?? '');
    this.logoA.parentElement!.setAttribute('aria-label', t.logo.join(' '));
    for (const b of this.themesEl.querySelectorAll<HTMLElement>('[data-theme]')) {
      const on = b.dataset.theme === t.id;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  }

  get modalOpen(): boolean {
    return !this.modal.hidden;
  }

  /** Typing in a field: the space bar is for the field, not the button. */
  get typing(): boolean {
    const a = document.activeElement;
    return a === this.betInput || a === this.autoInput;
  }

  syncSound(): void {
    const on = this.c.save.settings.sound;
    setText(this.soundBtn, on ? '🔊' : '🔇');
    this.soundBtn.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
  }

  // -------------------------------------------------------------------------
  // Every frame

  update(state: ActionState, now: number): void {
    // Coins count up or down to the real number.
    const coins = this.c.save.coins;
    if (this.shownCoins < 0) this.shownCoins = coins;
    if (this.shownCoins !== coins) {
      const d = coins - this.shownCoins;
      this.wallet.classList.toggle('up', d > 0);
      this.wallet.classList.toggle('down', d < 0);
      this.coinFx = now + 700;
      this.shownCoins = Math.abs(d) < 1 ? coins : this.shownCoins + d * 0.18;
    } else if (now > this.coinFx) {
      this.wallet.classList.remove('up', 'down');
    }
    setText(this.coinsEl, n(Math.round(this.shownCoins)));

    const key = `${state.kind}|${'amount' in state ? state.amount : ''}|${'payout' in state ? state.payout : ''}|${'countdown' in state ? Math.ceil(state.countdown * 10) : ''}|${'seconds' in state ? Math.ceil(state.seconds) : ''}`;
    if (key === this.lastAction) return;
    this.lastAction = key;
    const b = this.action;
    b.classList.toggle('cash', state.kind === 'cash');
    b.classList.toggle('waiting', state.kind === 'placed');
    b.classList.toggle('queued', state.kind === 'queued');
    b.disabled = state.kind === 'broke';
    switch (state.kind) {
      case 'bet':
        setText(this.actionMain, 'Bet');
        setText(this.actionSub, `${n(state.amount)} coins · space`);
        break;
      case 'placed':
        setText(this.actionMain, 'Cancel bet');
        setText(this.actionSub, `${n(state.amount)} in · launch in ${state.countdown.toFixed(1)}s`);
        break;
      case 'cash':
        setText(this.actionMain, `Cash out ${n(state.payout)}`);
        setText(this.actionSub, `at ${fmtX(state.m)}×`);
        break;
      case 'next':
        setText(this.actionMain, 'Bet next round');
        setText(this.actionSub, `${n(state.amount)} coins`);
        break;
      case 'queued':
        setText(this.actionMain, 'Queued for next round');
        setText(this.actionSub, `${n(state.amount)} coins · tap to cancel`);
        break;
      case 'broke':
        setText(this.actionMain, 'Out of coins');
        setText(this.actionSub, `${this.c.theme.refill.who} is slipping you ${n(REFILL_COINS)} · ${Math.ceil(state.seconds)}s`);
        break;
    }
  }

  // -------------------------------------------------------------------------
  // The players

  resetRows(): void {
    this.rows.clear();
    this.rowsEl.replaceChildren();
    this.syncTotals([]);
  }

  addRow(bet: Bet, bets: readonly Bet[]): void {
    const out = h('span', { class: 'out' }, '—');
    const li = h('li', { class: `row${bet.you ? ' you' : ''}` }, h('span', { class: 'who' }, bet.who), h('span', { class: 'amt' }, n(bet.amount)), out);
    this.rows.set(bet.who, { li, out });
    // You on top, then the biggest bets.
    const order = [...bets].sort((a, b) => Number(b.you) - Number(a.you) || b.amount - a.amount);
    const i = order.indexOf(bet);
    const after = order.slice(i + 1).find((x) => this.rows.has(x.who) && x !== bet);
    const ref = after ? this.rows.get(after.who)!.li : null;
    this.rowsEl.insertBefore(li, ref);
    this.syncTotals(bets);
  }

  /** The crowd got new names (a theme change): lay the whole table out again, as it stood. */
  syncRows(bets: readonly Bet[], phase: Phase): void {
    this.resetRows();
    for (const b of bets) this.addRow(b, bets);
    for (const b of bets) if (b.cashedAt !== null) this.cashed(b);
    if (phase === 'crashed') this.finish(bets);
  }

  removeRow(who: string, bets: readonly Bet[]): void {
    this.rows.get(who)?.li.remove();
    this.rows.delete(who);
    this.syncTotals(bets);
  }

  cashed(bet: Bet): void {
    const r = this.rows.get(bet.who);
    if (!r) return;
    r.li.classList.add('won');
    setText(r.out, `${fmtX(bet.cashedAt!)}× +${n(bet.payout - bet.amount)}`);
  }

  /** The round crashed: everyone still in lost. */
  finish(bets: readonly Bet[]): void {
    for (const b of bets) {
      if (b.cashedAt !== null) continue;
      const r = this.rows.get(b.who);
      if (!r) continue;
      r.li.classList.add('lost');
      setText(r.out, `−${n(b.amount)}`);
    }
  }

  private syncTotals(bets: readonly Bet[]): void {
    setText(this.countEl, `${bets.length} ${bets.length === 1 ? 'player' : 'players'}`);
    setText(this.wageredEl, n(bets.reduce((s, b) => s + b.amount, 0)));
  }

  // -------------------------------------------------------------------------
  // The last rounds

  syncHistory(initial = false): void {
    const h0 = this.c.save.history;
    const key = h0.map((r) => r.id).join();
    if (key === this.historyKey) return;
    const fresh = !initial && this.historyKey !== '' ? h0[0]?.id : -1;
    this.historyKey = key;
    this.historyEl.replaceChildren(
      ...h0.slice(0, 25).map((r) =>
        h('button', { class: `${chipClass(r.crash)}${r.id === fresh ? ' fresh' : ''}`, type: 'button', 'data-round': r.id, title: `Round ${r.id}: check it` }, `${fmtX(r.crash)}×`),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Messages

  toast(text: string, ms = 3200): void {
    setText(this.toastEl, text);
    this.toastEl.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), ms);
  }

  /** For screen readers. */
  announce(text: string): void {
    setText(this.liveEl, text);
  }

  // -------------------------------------------------------------------------
  // Cards

  private open(...children: (Node | null)[]): void {
    const card = h('div', { class: 'card', role: 'dialog', 'aria-modal': 'true' }, ...children);
    this.modal.replaceChildren(card);
    this.modal.hidden = false;
    card.querySelector<HTMLElement>('button')?.focus();
  }

  closeModal(): void {
    this.modal.hidden = true;
    this.modal.replaceChildren();
  }

  private ok(label = this.c.theme.help.back, primary = false): HTMLButtonElement {
    return h('button', { class: `ok${primary ? ' primary' : ''}`, type: 'button', onclick: () => this.closeModal() }, label);
  }

  showHelp(first: boolean): void {
    const t = this.c.theme;
    this.open(
      h('p', { class: 'eyebrow' }, first ? t.help.eyebrow : 'How to play'),
      h('h2', null, 'Cash out before you crash'),
      h('p', null, t.help.story),
      h('p', null, 'Bet during the countdown. Hit Cash out (or the space bar) during the rush, or set an auto cash out and it pays the moment it gets there. Missed the countdown? Your bet goes on the next round.'),
      h('p', null, `Some rounds go past 100×. About 2 in 100 crash right at 1.00×. Over time the house keeps ${Math.round(HOUSE_EDGE * 100)}%, whatever you do: no system beats it.`),
      h('p', null, `Play money only: you start with ${n(START_COINS)} coins, and ${t.refill.who} slips you ${n(REFILL_COINS)} more if you go broke. Coins can’t be bought, won for real or cashed out. Everyone else at the table is made up.`),
      this.ok(first ? 'Let’s go' : 'Got it', true),
    );
  }

  showStats(): void {
    const s = this.c.save;
    const st = s.stats;
    const p = profit(s);
    const row = (label: string, value: string, cls = '') => h('div', null, h('dt', null, label), h('dd', { class: cls }, value));
    this.open(
      h('p', { class: 'eyebrow' }, 'Your flight log'),
      h('h2', null, 'Stats'),
      h(
        'dl',
        { class: 'stats' },
        row('Coins', n(s.coins)),
        row('Profit', `${p >= 0 ? '+' : '−'}${n(Math.abs(p))}`, p >= 0 ? 'pos' : 'neg'),
        row('Rounds played', n(st.rounds)),
        row('Cashed out', st.rounds ? `${Math.round((st.wins / st.rounds) * 100)}%` : '—'),
        row('Wagered', n(st.wagered)),
        row('Biggest win', st.biggestWin ? `+${n(st.biggestWin)}` : '—', st.biggestWin ? 'pos' : ''),
        row('Best cash out', st.bestCashout ? `${fmtX(st.bestCashout)}×` : '—'),
        row('Highest crash seen', st.highestCrash ? `${fmtX(st.highestCrash)}×` : '—'),
        row(this.c.theme.refill.stat, n(st.refills)),
      ),
      this.ok(),
      h(
        'button',
        {
          class: 'ok danger',
          type: 'button',
          onclick: (e: Event) => {
            const b = e.currentTarget as HTMLButtonElement;
            if (b.dataset.sure !== '1') {
              b.dataset.sure = '1';
              b.textContent = 'Tap again to start over';
              return;
            }
            this.c.reset();
            this.closeModal();
          },
        },
        'Start over',
      ),
    );
  }

  showFair(pick?: number): void {
    const list = h('ol', { class: 'rounds' });
    for (const r of this.c.save.history.slice(0, 12)) {
      const verify = h('button', { class: 'verify', type: 'button' }, 'Check it');
      verify.addEventListener('click', async () => {
        verify.textContent = 'Checking…';
        const good = await this.c.verify(r);
        verify.textContent = good ? '✓ Checks out' : '✗ Doesn’t match';
        verify.classList.add(good ? 'good' : 'bad');
      });
      list.append(
        h(
          'li',
          { class: r.id === pick ? 'picked' : '' },
          h('span', { class: 'top-line' }, h('span', null, `Round ${r.id}`), h('span', { class: chipClass(r.crash) }, `${fmtX(r.crash)}×`)),
          h('code', null, `hash ${r.hash}`),
          h('code', null, `seed ${r.seed}`),
          verify,
        ),
      );
    }
    this.open(
      h('p', { class: 'eyebrow' }, 'Provably fair'),
      h('h2', null, 'Every round is locked in first'),
      h('p', null, 'Before a round starts it gets a secret seed, and you see the seed’s SHA-256 hash: from then on the round can’t change. After the crash the seed is revealed, so you can check it matches, and that it gives exactly that crash point.'),
      h('p', { class: 'hash' }, `This round’s hash: ${this.c.currentHash()}`),
      h('pre', { class: 'formula' }, `outcome = SHA-256(seed + ":sugar-crash")\nu = first 13 hex digits of outcome / 2^52\ncrash = max(1.00, floor(99 / (1 − u)) / 100)\n\nP(crash ≥ x) = 0.99 / x`),
      list.childElementCount ? list : h('p', null, 'Finished rounds show up here.'),
      this.ok(),
    );
    if (pick !== undefined) list.querySelector('.picked')?.scrollIntoView({ block: 'center' });
  }
}
