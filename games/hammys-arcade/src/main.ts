// Hammy's Arcade as its own page: the front page with the five games as big
// cards, your coins and how each game has gone, and the games themselves,
// which are Hammygotchi's (rules and screens in games/hammygotchi/src),
// betting a play-money wallet. When the arcade's server is there (same site,
// under /arcade/api/) everyone shares one sky: the same rounds, with the
// coins, the dice and the clock on the server, and a name typed once. When
// it isn't (opened as a file, or the server is down) the page falls back to
// playing alone, all in the browser, exactly as before.
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
import type { ArcadeHost, ArcadeScreen } from '@hammygotchi/arcadeview';
import { CrossingApp } from '@hammygotchi/crossingview';
import { paintPortrait, type Face } from '@hammygotchi/hammy';
import { MinesApp } from '@hammygotchi/minesview';
import { PlinkoApp } from '@hammygotchi/plinkoview';
import { RocketApp } from '@hammygotchi/rocketview';
import { SlotsApp, bigText } from '@hammygotchi/slotsview';
import { setSound, unlock } from '@hammygotchi/sound';
import { Arena } from './online/arena';
import { goOnline } from './online/join';
import type { OnlineWallet } from './online/wallet';
import { START_COINS, TOP_UP_COINS, Wallet } from './wallet';

/** What the front page needs of a wallet, local or the server's. */
type WalletLike = ArcadeHost & {
  readonly coins: number;
  readonly broke: boolean;
  readonly sound: boolean;
  onChange(f: () => void): void;
  topUp(): number | Promise<number>;
  setSound(on: boolean): void;
  save(): void;
};

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
  private skyEl = h('p', { class: 'a-sky' });
  private tickerEl = h('p', { class: 'a-ticker', role: 'status', 'aria-live': 'polite', hidden: true });
  private tickerTimer = 0;
  private nameBtn = h('button', { class: 'a-link', type: 'button', onclick: () => this.askRename() });
  private renameEl = h('form', { class: 'a-rename', hidden: true });
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

  constructor(
    private wallet: WalletLike,
    private arena: Arena | null,
  ) {
    this.root.append(
      h(
        'main',
        { class: 'a-page' },
        h(
          'header',
          { class: 'a-top' },
          this.portrait,
          h('div', { class: 'a-title' }, h('h1', null, 'Hammy’s Arcade'), h('p', null, 'Five ways to lose imaginary coins on a cube.'), this.skyEl, this.tickerEl),
          h('p', { class: 'coins', 'aria-label': 'Your coins' }, h('span', { class: 'coin', 'aria-hidden': 'true' }, 'H'), this.balance),
        ),
        h('h2', { class: 'a-pick' }, 'Pick a game'),
        this.cardsEl,
        h(
          'footer',
          { class: 'a-foot' },
          h(
            'p',
            { class: 'note' },
            arena
              ? 'Play money only: the coins are pretend, there is nothing to buy and nothing to cash out. Everyone plays the same rounds, and every round is decided by the arcade’s server, which shows a fingerprint of its secret before each round and the secret after, so your browser can check it. Every game pays back about 99 of every 100 coins bet over many rounds.'
              : 'Play money only: the coins are pretend, there is nothing to buy and nothing to cash out. Every game pays back about 99 of every 100 coins bet over many rounds, and every round is decided by your browser’s secure random numbers.',
          ),
          this.renameEl,
          h('p', { class: 'a-foot-row' }, this.soundBtn, arena ? this.nameBtn : this.resetBtn),
        ),
      ),
      this.toastEl,
      this.topUpEl,
    );
    wallet.onChange(() => this.render());
    this.render();
    if (arena) {
      for (const e of ['players', 'status', 'snapshot']) arena.sky.on(e, () => this.renderSky());
      // Somebody else's big win on Hammy Slots, for a few seconds. Nothing else the machines do is announced.
      arena.slots.onBig((w) => {
        setText(this.tickerEl, bigText(w));
        this.tickerEl.hidden = false;
        clearTimeout(this.tickerTimer);
        this.tickerTimer = window.setTimeout(() => (this.tickerEl.hidden = true), 9000);
      });
    }

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
    this.renderSky();
    this.paintPortrait();
    this.syncOffer();
  }

  /** Who's here: how many are in the sky and who you are, or that you're on your own. */
  private renderSky(): void {
    const a = this.arena;
    this.skyEl.className = `a-sky ${a ? (a.sky.up ? 'live' : 'down') : 'offline'}`;
    if (!a) {
      setText(this.skyEl, 'offline');
      this.skyEl.title = 'The arcade’s server isn’t there, so you’re playing alone. Your coins are saved on this device.';
      return;
    }
    const w = this.wallet as unknown as OnlineWallet;
    const n = a.sky.players;
    setText(this.skyEl, a.sky.up ? `${n} ${n === 1 ? 'player' : 'players'} in the sky · you’re ${w.emoji} ${w.name}` : 'Lost the sky. Reconnecting…');
    this.skyEl.title = '';
    setText(this.nameBtn, 'Change name');
  }

  /** The small "change name" link: a box in the footer; your coins stay. */
  private askRename(): void {
    const w = this.wallet as unknown as OnlineWallet;
    const input = h('input', { class: 'a-join-name', type: 'text', maxlength: 16, 'aria-label': 'New name', autocomplete: 'nickname' });
    input.value = w.name;
    const err = h('span', { class: 'a-join-err', role: 'alert' });
    const save = h('button', { class: 'btn btn-cheese', type: 'submit' }, 'Save');
    const cancel = h('button', { class: 'a-link', type: 'button', onclick: () => ((this.renameEl.hidden = true), this.renameEl.replaceChildren()) }, 'Cancel');
    this.renameEl.onsubmit = async (e) => {
      e.preventDefault();
      save.disabled = true;
      const r = await w.rename(input.value.trim());
      save.disabled = false;
      if (!r.ok) return void setText(err, r.message);
      this.renameEl.hidden = true;
      this.renameEl.replaceChildren();
      this.say(`You’re ${w.name} now. Your coins came with you.`);
    };
    this.renameEl.replaceChildren(input, save, cancel, err);
    this.renameEl.hidden = false;
    input.focus();
    input.select();
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
    if (this.wallet instanceof Wallet) this.wallet.reset();
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
    void Promise.resolve(this.wallet.topUp()).then((got) => {
      if (!got) return;
      this.say(`+${coinsText(got)} coins. ${pick(TOP_UP_THANKS)}`);
    });
  }

  // The games ----------------------------------------------------------------

  private openGame(id: ArcadeGame, push = true): void {
    if (this.screen) return;
    const close = () => this.leave();
    // With the server there: the shared rounds. Without: the same screens on rounds rolled here.
    const a = this.arena;
    const make: Record<ArcadeGame, () => ArcadeScreen> = {
      rocket: () => new RocketApp(this.wallet, close, a?.rocket),
      mines: () => new MinesApp(this.wallet, close, a?.mines),
      crossing: () => new CrossingApp(this.wallet, close, a?.crossing),
      plinko: () => new PlinkoApp(this.wallet, close, a?.plinko),
      slots: () => new SlotsApp(this.wallet, close, a?.slots),
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

/** Start: look for the arcade's server (a moment), come in with a name if it's there, and fall back to playing alone if not. */
async function start(): Promise<void> {
  const root = document.getElementById('app')!;
  const wanted = location.protocol !== 'file:' && !new URLSearchParams(location.search).has('offline');
  if (wanted) {
    root.replaceChildren(h('p', { class: 'a-connecting', role: 'status' }, 'Finding the arcade…'));
    const arena = new Arena();
    if (await goOnline(arena, root)) {
      root.replaceChildren();
      new ArcadePage(arena.wallet, arena);
      return;
    }
  }
  root.replaceChildren();
  new ArcadePage(new Wallet(), null);
}

void start();
