// The Hammy Mines screen: pick a board and how much poop is on it, bet, and
// open his pizza boxes one at a time. The rules are in mines.ts; your coins
// go through arcadeview.ts.
import { h, setDisabled, setText } from '@shared/dom';
import { fmt } from '@shared/format';
import { BetPicker, Choice, Ledger, arcadeCard, fairRoll, pick, x2, type ArcadeHost, type ArcadeScreen, type ArcadeSession } from './arcadeview';
import { isAlive } from './alive';
import { paintPortrait, type Face } from './hammy';
import { MINES_BOOM, MINES_CLEARED, MINES_DEFAULT, MINES_GRIDS, MINES_SAFE, clampMines, layMines, minesMultiplier, tilesOf, type MinesGrid } from './mines';
import { buzz } from './haptics';
import { sfx } from './sound';

/** Kept between sittings while the page is open (not saved). */
const prefs: { grid: MinesGrid; mines: Record<MinesGrid, number> } = { grid: 8, mines: { ...MINES_DEFAULT } };

export class MinesApp implements ArcadeScreen {
  readonly card: HTMLElement;
  private ledger: Ledger;
  private picker: BetPicker;
  private syncCoins: (coins: number) => void;
  private gridChoice: Choice<MinesGrid>;
  /** Which boxes hide poop, this round. */
  private board: boolean[] = [];
  private opened: boolean[] = [];
  private bet = 0;
  private picks = 0;
  private over: 'lost' | 'won' | null = null;
  private won = 0;
  private timer = 0;
  private closed = false;

  private gridEl = h('div', { class: 'mines-grid', role: 'grid', 'aria-label': 'His pizza boxes' });
  private tiles: HTMLButtonElement[] = [];
  private face = h('canvas', { class: 'mines-face', 'aria-hidden': 'true' });
  private says = h('p', { class: 'mines-says' });
  private status = h('p', { class: 'arcade-status', 'aria-live': 'polite' });
  private pays = h('p', { class: 'mines-pays' });
  private count = h('input', { class: 'mines-count', type: 'range', min: 1, step: 1, 'aria-label': 'How many poops' });
  private countLabel = h('span', { class: 'mines-count-label' });
  private go = h('button', { class: 'btn btn-cheese arcade-go', type: 'button' });
  private random = h('button', { class: 'btn btn-quiet arcade-go2', type: 'button' }, 'Random box');

  constructor(
    private host: ArcadeHost,
    close: () => void,
  ) {
    this.ledger = new Ledger(host, 'mines');
    this.picker = new BetPicker(() => host.state.coins);
    this.gridChoice = new Choice<MinesGrid>(
      'Board',
      MINES_GRIDS.map((g) => ({ value: g, label: `${g}×${g}` })),
      () => prefs.grid,
      (g) => {
        prefs.grid = g;
        this.fresh();
      },
    );
    this.count.addEventListener('input', () => {
      prefs.mines[prefs.grid] = clampMines(prefs.grid, Number(this.count.value));
      this.sync();
    });
    this.go.addEventListener('click', () => this.action());
    this.random.addEventListener('click', () => {
      const closed = this.opened.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
      if (closed.length) this.open(closed[Math.floor(Math.random() * closed.length)]);
    });
    const { card, syncCoins } = arcadeCard(
      'mines',
      close,
      h('div', { class: 'mines-head' }, this.face, h('div', { class: 'mines-head-text' }, this.says, this.status)),
      this.gridEl,
      this.pays,
      h('div', { class: 'arcade-buttons' }, this.go, this.random),
      this.gridChoice.el,
      h('label', { class: 'mines-poops' }, h('span', null, '💩'), this.count, this.countLabel),
      this.picker.el,
    );
    this.card = card;
    this.syncCoins = syncCoins;
    this.fresh();
    this.setFace('smug', 'Dorkitos under the boxes. Mostly.');
    setText(this.status, 'Bet, then open boxes. Cash out before you find the poop.');
    this.timer = window.setInterval(() => this.sync(), 400);
  }

  get focus(): HTMLElement {
    return this.go;
  }

  close(): ArcadeSession {
    if (this.closed) return this.ledger.session;
    this.closed = true;
    clearInterval(this.timer);
    if (this.bet && !this.over) {
      if (this.picks) this.cashOut();
      else this.ledger.refund(this.bet);
    }
    return this.ledger.session;
  }

  private get mines(): number {
    return clampMines(prefs.grid, prefs.mines[prefs.grid]);
  }

  /** A clean board, all boxes shut. */
  private fresh(): void {
    const n = tilesOf(prefs.grid);
    this.board = [];
    this.opened = Array.from({ length: n }, () => false);
    this.bet = 0;
    this.picks = 0;
    this.over = null;
    this.gridEl.className = `mines-grid g${prefs.grid}`;
    this.gridEl.style.setProperty('--n', String(prefs.grid));
    this.tiles = this.opened.map((_, i) =>
      h('button', { class: 'mines-tile', type: 'button', 'aria-label': `Box ${(i % prefs.grid) + 1}, row ${Math.floor(i / prefs.grid) + 1}`, onclick: () => this.open(i) }),
    );
    this.gridEl.replaceChildren(...this.tiles);
    this.count.max = String(n - 1);
    this.count.value = String(this.mines);
    this.sync();
  }

  private action(): void {
    if (this.closed) return;
    if (this.bet && !this.over) {
      if (this.picks) this.cashOut();
      else {
        this.ledger.refund(this.bet);
        this.bet = 0;
        setText(this.status, 'Bet taken back.');
        this.sync();
      }
      return;
    }
    this.start();
  }

  private start(): void {
    if (this.over) this.fresh();
    const amount = this.ledger.bet(this.picker.amount);
    if (!amount) {
      setText(this.status, isAlive(this.host.state) ? 'Not enough coins for that bet.' : 'Hammy is dead. Nobody hid any Dorkitos.');
      return;
    }
    this.bet = amount;
    this.board = layMines(prefs.grid, this.mines, fairRoll);
    sfx.coin();
    this.setFace('smug', 'Go on. Pick one.');
    setText(this.status, `You’re in for ${fmt(amount)}. ${this.mines} ${this.mines === 1 ? 'poop' : 'poops'} under ${tilesOf(prefs.grid)} boxes.`);
    this.sync();
  }

  private open(i: number): void {
    if (this.closed || this.opened[i]) return;
    if (!this.bet || this.over) {
      setText(this.status, this.over ? 'Bet again for a new floor.' : 'Bet first, then open boxes.');
      return;
    }
    this.opened[i] = true;
    const tile = this.tiles[i];
    if (this.board[i]) {
      this.over = 'lost';
      tile.classList.add('poop', 'boom');
      tile.textContent = '💩';
      sfx.splat();
      buzz.bad();
      this.card.classList.remove('splat');
      void this.card.offsetWidth;
      this.card.classList.add('splat');
      this.setFace('shock', pick(MINES_BOOM));
      setText(this.status, this.picks ? `Poop. You lost ${fmt(this.bet)} after ${this.picks} ${this.picks === 1 ? 'Dorkito' : 'Dorkitos'}.` : `Poop, first box. You lost ${fmt(this.bet)}.`);
      this.showAll();
    } else {
      this.picks += 1;
      tile.classList.add('dorkito');
      tile.append(h('span', { class: 'chip-dorkito', 'aria-hidden': 'true' }));
      sfx.crunch();
      buzz.tap();
      if (this.picks === tilesOf(prefs.grid) - this.mines) {
        this.cashOut();
        this.setFace('joy', MINES_CLEARED);
        return;
      }
      this.setFace('joy', pick(MINES_SAFE));
      setText(this.status, `${this.picks} ${this.picks === 1 ? 'Dorkito' : 'Dorkitos'}: ${x2(minesMultiplier(prefs.grid, this.mines, this.picks))}. Keep going or cash out.`);
    }
    this.sync();
  }

  private cashOut(): void {
    const mult = minesMultiplier(prefs.grid, this.mines, this.picks);
    this.won = this.ledger.pay(this.bet, mult);
    this.over = 'won';
    sfx.kaching();
    buzz.success();
    this.setFace('eat', 'Fine. Take them.');
    setText(this.status, `Cashed out at ${x2(mult)}: ${fmt(this.won)} coins.`);
    this.showAll();
    this.sync();
  }

  /** The round's over: lift every box. */
  private showAll(): void {
    this.board.forEach((poop, i) => {
      if (this.opened[i]) return;
      const t = this.tiles[i];
      t.classList.add('shown', poop ? 'poop' : 'dorkito');
      if (poop) t.textContent = '💩';
      else t.append(h('span', { class: 'chip-dorkito', 'aria-hidden': 'true' }));
    });
  }

  private setFace(face: Face, line: string): void {
    setText(this.says, `“${line}”`);
    paintPortrait(this.face, this.host.state.fit, face, performance.now(), this.host.form);
  }

  private sync(): void {
    const s = this.host.state;
    const playing = this.bet > 0 && !this.over;
    this.syncCoins(s.coins);
    this.picker.lock(playing);
    this.gridChoice.lock(playing);
    this.gridChoice.sync();
    if (this.count.disabled !== playing) this.count.disabled = playing;
    setText(this.countLabel, `${this.mines} ${this.mines === 1 ? 'poop' : 'poops'}`);
    setText(this.go, playing ? (this.picks ? `Cash out ${fmt(Math.floor(this.bet * minesMultiplier(prefs.grid, this.mines, this.picks)))}` : `Take back ${fmt(this.bet)}`) : this.over ? `Bet ${fmt(this.picker.amount)} again` : `Bet ${fmt(this.picker.amount)}`);
    this.go.classList.toggle('bail', playing && this.picks > 0);
    setDisabled(this.go, !isAlive(s) || (!playing && !this.picker.affordable));
    setDisabled(this.random, !playing);
    this.random.hidden = !playing;
    const next = minesMultiplier(prefs.grid, this.mines, this.picks + 1);
    setText(this.pays, playing ? `Next Dorkito: ${x2(next)}` : `First Dorkito pays ${x2(minesMultiplier(prefs.grid, this.mines, 1))}`);
    this.gridEl.classList.toggle('live', playing);
  }
}
