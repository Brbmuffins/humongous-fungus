// Hammy's Arcade as its own page: the front page with the four games as big
// cards, your coins and how each game has gone, and the games themselves,
// which are Hammygotchi's (rules and screens in games/hammygotchi/src),
// betting this page's play-money wallet. No server, no network: it all runs
// and saves in the browser.
import '@fontsource/bagel-fat-one/latin-400.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/latin-700.css';
import './base.css';
import '@hammygotchi/arcade.css';
import './page.css';

import { h, setText } from '@shared/dom';
import { fmt } from '@shared/format';
import { ARCADE, HOME_LINES, type ArcadeDef, type ArcadeGame } from '@hammygotchi/arcade';
import type { ArcadeScreen } from '@hammygotchi/arcadeview';
import { CrossingApp } from '@hammygotchi/crossingview';
import { paintPortrait, type Face } from '@hammygotchi/hammy';
import { MinesApp } from '@hammygotchi/minesview';
import { PlinkoApp } from '@hammygotchi/plinkoview';
import { RocketApp } from '@hammygotchi/rocketview';
import { SlotsApp } from '@hammygotchi/slotsview';
import { setSound, unlock } from '@hammygotchi/sound';
import { START_COINS, TOP_UP_COINS, Wallet } from './wallet';

/** Hammy, when you're out of coins and he has to say where the next ones came from. */
const TOP_UP_OFFERS = [
  'Hammy checked the couch.',
  'Hammy is willing to pawn the gaming PC. Again.',
  'A seagull is circling with something shiny.',
  'Dr. Moss says he can maybe find some coins. Off the books.',
  'Grandma is writing a cheque. It is not your birthday.',
];
const TOP_UP_THANKS = [
  'Found it in the couch. Don’t ask which couch.',
  'The seagull wants these back. Eventually.',
  'Dr. Moss was never here.',
  'Grandma says to spend it wisely. She’s lying.',
  'Pawned the gaming PC. It’s fine. It’s a different PC.',
];

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const coinsText = (n: number): string => (n < 1e12 ? Math.floor(n).toLocaleString('en-US') : fmt(n));
const signed = (n: number): string => (n === 0 ? '0' : `${n > 0 ? '+' : '−'}${coinsText(Math.abs(n))}`);

/** How long you can be out of coins in a game before it offers the top-up: a round may still pay. */
const OFFER_DELAY_IN_GAME = 1600;

class ArcadePage {
  private root = document.getElementById('app')!;
  private modal = document.getElementById('modal')!;
  private balance = h('span', { id: 'balance' });
  private portrait = h('canvas', { class: 'a-portrait', 'aria-hidden': 'true' });
  private cardsEl = h('div', { class: 'a-cards' });
  private soundBtn = h('button', { class: 'a-link', type: 'button', onclick: () => this.wallet.setSound(!this.wallet.sound) });
  private resetBtn = h('button', { class: 'a-link', type: 'button', onclick: () => this.askReset() });
  private toastEl = h('p', { class: 'a-toast', role: 'status', hidden: true });
  private topUpText = h('span', { class: 'a-topup-text' });
  private topUpBtn = h('button', { class: 'btn btn-cheese', type: 'button', onclick: () => this.takeTopUp() });
  private topUpEl = h('div', { class: 'a-topup', role: 'status', hidden: true }, this.topUpText, this.topUpBtn);
  private screen: ArcadeScreen | null = null;
  private game: ArcadeGame | null = null;
  /** The browser history entry the open game pushed, if it did. */
  private pushed = false;
  private toastTimer = 0;
  private offerTimer = 0;
  private resetTimer = 0;
  private resetting = false;
  private offered = false;

  constructor(private wallet: Wallet) {
    this.root.append(
      h(
        'main',
        { class: 'a-page' },
        h(
          'header',
          { class: 'a-top' },
          this.portrait,
          h('div', { class: 'a-title' }, h('h1', null, 'Hammy’s Arcade'), h('p', null, 'Five ways to lose imaginary coins on a cube.')),
          h('p', { class: 'coins', 'aria-label': 'Your coins' }, h('span', { class: 'coin', 'aria-hidden': 'true' }, 'H'), this.balance),
        ),
        h('h2', { class: 'a-pick' }, 'Pick a game'),
        this.cardsEl,
        h(
          'footer',
          { class: 'a-foot' },
          h('p', { class: 'note' }, 'Play money only: the coins are pretend, there is nothing to buy and nothing to cash out. Every game pays back about 99 of every 100 coins bet over many rounds, and every round is decided by your browser’s secure random numbers.'),
          h('p', { class: 'a-foot-row' }, this.soundBtn, this.resetBtn),
        ),
      ),
      this.toastEl,
      this.topUpEl,
    );
    wallet.onChange(() => this.render());
    this.render();

    // Browsers only allow sound after a first tap.
    const firstTouch = () => {
      unlock();
      window.removeEventListener('pointerdown', firstTouch, true);
      window.removeEventListener('keydown', firstTouch, true);
    };
    window.addEventListener('pointerdown', firstTouch, true);
    window.addEventListener('keydown', firstTouch, true);

    // Leaving the page squares up whatever round is on (a bet taken out of your
    // coins would otherwise be gone), then keeps the coins.
    window.addEventListener('pagehide', () => {
      this.closeGame(false);
      wallet.save();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') wallet.save();
    });
    // The browser's Back button, or the card's own, after the game pushed an entry.
    window.addEventListener('popstate', () => {
      this.pushed = false;
      if (this.screen) this.closeGame(true);
    });
    new ResizeObserver(() => this.paintPortrait()).observe(this.portrait);

    const linked = ARCADE.find((g) => `#${g.id}` === location.hash);
    if (linked) this.openGame(linked.id, false);
  }

  // The front page -----------------------------------------------------------

  private render(): void {
    const w = this.wallet;
    setText(this.balance, coinsText(w.coins));
    this.cardsEl.replaceChildren(...ARCADE.map((g) => this.card(g)));
    setSound(w.sound);
    setText(this.soundBtn, w.sound ? '🔊 Sound on' : '🔇 Sound off');
    this.soundBtn.setAttribute('aria-pressed', String(w.sound));
    if (!this.resetting) setText(this.resetBtn, 'Start over');
    this.paintPortrait();
    this.syncOffer();
  }

  private card(g: ArcadeDef): HTMLElement {
    const st = this.wallet.state.stats.arcade[g.id];
    const stat = (label: string, value: string, tone = '') => h('div', { class: `a-stat ${tone}` }, h('dt', null, label), h('dd', null, value));
    return h(
      'button',
      { class: 'a-card', type: 'button', style: `--c:${g.color}`, onclick: () => this.openGame(g.id), 'aria-label': `Play ${g.name}. ${g.blurb}` },
      h('span', { class: 'a-icon', 'aria-hidden': 'true' }, g.emoji),
      h('span', { class: 'a-name' }, g.name),
      h('span', { class: 'a-blurb' }, g.blurb),
      st.rounds
        ? h('dl', { class: 'a-stats' }, stat('Rounds', coinsText(st.rounds)), stat('Net', signed(st.net), st.net > 0 ? 'up' : st.net < 0 ? 'down' : ''), stat('Best', st.best ? `${st.best.toFixed(2)}×` : '–'))
        : h('span', { class: 'a-new' }, 'No rounds yet'),
      h('span', { class: 'a-play', 'aria-hidden': 'true' }, 'Play ›'),
    );
  }

  private paintPortrait(): void {
    const face: Face = this.wallet.broke ? 'sad' : 'happy';
    paintPortrait(this.portrait, this.wallet.state.fit, face, 0, this.wallet.form);
  }

  private askReset(): void {
    if (!this.resetting) {
      this.resetting = true;
      setText(this.resetBtn, `Really? Back to ${coinsText(START_COINS)} coins and no stats. Tap again.`);
      this.resetTimer = window.setTimeout(() => {
        this.resetting = false;
        setText(this.resetBtn, 'Start over');
      }, 4000);
      return;
    }
    clearTimeout(this.resetTimer);
    this.resetting = false;
    this.wallet.reset();
    this.say('Fresh start. Hammy has forgotten everything.');
  }

  private say(text: string, ms = 4200): void {
    setText(this.toastEl, text);
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), ms);
  }

  // Out of coins -------------------------------------------------------------

  /** Offer the free top-up when there's nothing left to bet. */
  private syncOffer(): void {
    if (!this.wallet.broke) {
      clearTimeout(this.offerTimer);
      this.offerTimer = 0;
      this.offered = false;
      this.topUpEl.hidden = true;
      return;
    }
    if (this.offered || this.offerTimer) return;
    // In a game a round may still pay out, so give it a moment first.
    this.offerTimer = window.setTimeout(
      () => {
        this.offerTimer = 0;
        if (!this.wallet.broke) return;
        this.offered = true;
        setText(this.topUpText, `You’re out of coins. ${pick(TOP_UP_OFFERS)}`);
        setText(this.topUpBtn, `Free ${coinsText(TOP_UP_COINS)} coins`);
        this.topUpEl.hidden = false;
      },
      this.screen ? OFFER_DELAY_IN_GAME : 0,
    );
  }

  private takeTopUp(): void {
    if (!this.wallet.topUp()) return;
    this.say(`+${coinsText(TOP_UP_COINS)} coins. ${pick(TOP_UP_THANKS)}`);
  }

  // The games ----------------------------------------------------------------

  private openGame(id: ArcadeGame, push = true): void {
    if (this.screen) return;
    const close = () => this.leave();
    const make: Record<ArcadeGame, () => ArcadeScreen> = {
      rocket: () => new RocketApp(this.wallet, close),
      mines: () => new MinesApp(this.wallet, close),
      crossing: () => new CrossingApp(this.wallet, close),
      plinko: () => new PlinkoApp(this.wallet, close),
      slots: () => new SlotsApp(this.wallet, close),
    };
    const app = make[id]();
    // The way back to the front page, where the ✕ would be.
    const back = h('button', { class: 'a-back', type: 'button', onclick: close }, h('span', { 'aria-hidden': 'true' }, '‹'), ' Arcade');
    back.setAttribute('aria-label', 'Back to the front page');
    app.card.querySelector('.arcade-top')?.prepend(back);
    this.screen = app;
    this.game = id;
    this.modal.replaceChildren(app.card);
    this.modal.hidden = false;
    document.body.classList.add('playing');
    this.topUpEl.hidden = true;
    this.toastEl.hidden = true;
    this.offered = false;
    try {
      if (push) {
        history.pushState({ arcade: id }, '', `#${id}`);
        this.pushed = true;
      }
    } catch {
      // No history (a sandboxed frame): the back button on the card still works.
    }
    app.focus.focus();
    this.syncOffer();
  }

  /** The back button, the ✕ and Escape: back to the front page, through the browser's history if the game pushed an entry. */
  private leave(): void {
    if (this.pushed) {
      try {
        history.back();
        return;
      } catch {
        this.pushed = false;
      }
    }
    this.closeGame(true);
  }

  /** Square up whatever round is on, and say how the sitting went. */
  private closeGame(talk: boolean): void {
    const app = this.screen;
    const game = this.game;
    if (!app || !game) return;
    this.screen = null;
    this.game = null;
    const r = app.close();
    this.modal.hidden = true;
    this.modal.replaceChildren();
    document.body.classList.remove('playing');
    if (!this.pushed && location.hash) {
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch {
        // Leave the address as it is.
      }
    }
    this.offered = false;
    this.render();
    if (talk && r.rounds) {
      const home = HOME_LINES[game];
      const line = pick(r.net > 0 ? home.won : r.net < 0 ? home.lost : home.even);
      this.say(`${r.net ? `${signed(r.net)} coins. ` : ''}${line}`);
    }
    // Back on the front page, with the card you came from focused.
    (this.cardsEl.children[ARCADE.findIndex((g) => g.id === game)] as HTMLElement | undefined)?.focus({ preventScroll: true });
  }
}

new ArcadePage(new Wallet());
