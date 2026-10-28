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
import type { MinesSource } from './roundsource';
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
  // Only when the rounds come from a server (see roundsource.ts).
  private roundId = -1;
  private pending = false;
  private shown = false;
  private wasOnline = true;
  private othersKey = '';

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
  private clockEl = h('p', { class: 'mines-clock', 'aria-live': 'off' });
  private fairEl = h('p', { class: 'fair-line' });
  private othersEl = h('ul', { class: 'rocket-crowd mines-crowd', 'aria-label': 'Who else is on this floor' });

  /** `src`: one floor at a time for everyone, laid out on a server, instead of rolled here. */
  constructor(
    private host: ArcadeHost,
    close: () => void,
    private src?: MinesSource,
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
      src ? h('h3', { class: 'arcade-sub' }, 'Racing you on this floor') : null,
      src ? this.othersEl : null,
      src ? this.fairEl : null,
    );
    this.card = card;
    this.syncCoins = syncCoins;
    this.fresh();
    this.setFace('smug', 'Dorkitos under the boxes. Mostly.');
    setText(this.status, src ? 'Everyone races on the same floor. One go each, then wait for the next floor.' : 'Bet, then open boxes. Cash out before you find the poop.');
    if (src) this.card.querySelector('.mines-head-text')?.append(this.clockEl);
    this.timer = window.setInterval(
      () => {
        this.follow();
        this.sync();
      },
      src ? 250 : 400,
    );
  }

  get focus(): HTMLElement {
    return this.go;
  }

  close(): ArcadeSession {
    if (this.closed) return this.ledger.session;
    this.closed = true;
    clearInterval(this.timer);
    if (this.src) {
      // Leaving a floor mid-run: the server cashes you out (or gives the bet back).
      if (this.bet && !this.over) void this.src.cash();
      return this.ledger.session;
    }
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
    this.shown = false;
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
    if (this.closed || this.pending) return;
    if (this.src) return this.act(this.src);
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
    if (this.src) return this.openRemote(this.src, i);
    this.reveal(i, this.board[i]);
  }

  /** Box `i` is open: poop or a Dorkito. */
  private reveal(i: number, poop: boolean): void {
    this.opened[i] = true;
    const tile = this.tiles[i];
    if (poop) {
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
      if (!this.src) this.picks += 1;
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
    // Online the server has paid already: this is only the show.
    this.won = this.src ? Math.floor(this.bet * mult) : this.ledger.pay(this.bet, mult);
    if (this.src) this.ledger.session.net += this.won;
    this.over = 'won';
    sfx.kaching();
    buzz.success();
    this.setFace('eat', 'Fine. Take them.');
    setText(this.status, `Cashed out at ${x2(mult)}: ${fmt(this.won)} coins.`);
    this.showAll();
    this.sync();
  }

  // One floor for everyone ------------------------------------------------------

  private act(src: MinesSource): void {
    if (this.bet && !this.over) {
      const picks = this.picks;
      this.pending = true;
      void src.cash().then((r) => {
        this.pending = false;
        if (!r.ok) return void setText(this.status, r.message);
        if (picks) this.cashOut();
        else {
          this.ledger.session.rounds -= 1;
          this.ledger.session.net += this.bet;
          this.bet = 0;
          setText(this.status, 'Bet taken back. You had your go on this floor: wait for the next one.');
        }
        this.sync();
      });
      return;
    }
    if (this.over) this.fresh();
    const amount = this.picker.amount;
    if (!this.picker.affordable) return void setText(this.status, 'Not enough coins for that bet.');
    this.pending = true;
    void src.start(amount, prefs.grid, this.mines).then((r) => {
      this.pending = false;
      if (!r.ok) return void setText(this.status, r.message);
      this.bet = amount;
      this.picks = 0;
      this.ledger.session.rounds += 1;
      this.ledger.session.net -= amount;
      sfx.coin();
      this.setFace('smug', 'Go on. Pick one.');
      setText(this.status, `You’re in for ${fmt(amount)}. ${this.mines} ${this.mines === 1 ? 'poop' : 'poops'} under ${tilesOf(prefs.grid)} boxes.`);
      this.sync();
    });
  }

  private openRemote(src: MinesSource, i: number): void {
    if (this.pending) return;
    this.pending = true;
    void src.open(i).then((r) => {
      this.pending = false;
      if (!r.ok) {
        // Already open (a run picked up after a reload): show it as a safe one.
        if (/open/i.test(r.message)) {
          this.opened[i] = true;
          this.tiles[i].classList.add('dorkito');
        }
        return void setText(this.status, r.message);
      }
      this.picks = r.picks;
      this.reveal(i, !r.safe);
      this.sync();
    });
  }

  /** Follow the shared floor: the clock, who's racing you, and the floor ending under you. */
  private follow(): void {
    const src = this.src;
    if (!src || this.closed) return;
    const online = src.online();
    if (online !== this.wasOnline) {
      this.wasOnline = online;
      setText(this.status, online ? 'Back on the floor.' : 'Lost the floor. Reconnecting…');
    }
    const r = src.round();
    if (!r) return;
    const srv = src.now();
    if (r.id !== this.roundId) {
      this.roundId = r.id;
      this.fresh();
    }
    const mine = r.runners.find((x) => x.id === src.me);
    // A run that was on when this page was loaded: pick it up.
    if (mine && mine.state === 'alive' && !this.bet && !this.over && !this.pending && r.phase === 'open') {
      prefs.grid = mine.grid as MinesGrid;
      prefs.mines[prefs.grid] = mine.mines;
      this.fresh();
      this.bet = mine.bet;
      this.picks = mine.picks;
      setText(this.status, 'Welcome back. Your run is still on: keep opening boxes, or cash out.');
    }
    if (r.phase === 'end') {
      if (mine && this.bet && !this.over) {
        // The floor ended with you still on it: the server cashed you out.
        this.picks = mine.picks;
        if (mine.picks) this.cashOut();
        else {
          this.ledger.session.rounds -= 1;
          this.ledger.session.net += this.bet;
          this.over = 'won';
          this.won = this.bet;
          setText(this.status, 'The floor ended before you opened a box. Bet back.');
        }
      }
      if (!this.shown && this.bet) {
        const f = src.floor(mine?.grid ?? prefs.grid, mine?.mines ?? this.mines);
        if (f) {
          this.board = f;
          this.shown = true;
          this.showAll();
        }
      }
    }
    const left = Math.max(0, Math.ceil((r.endsAt - srv) / 1000));
    setText(this.clockEl, r.phase === 'open' ? `Floor ${r.id} ends in ${left}s` : `Floor ${r.id} is over. The next one opens in a moment.`);
    setText(this.fairEl, src.fair());
    this.renderOthers(r, src.me);
  }

  private renderOthers(r: NonNullable<ReturnType<MinesSource['round']>>, me: string): void {
    const rows = r.runners.filter((x) => x.id !== me).sort((a, b) => Number(b.real) - Number(a.real));
    const how = (x: (typeof rows)[number]) => (x.state === 'hit' ? 'found the poop' : x.state === 'cashed' ? `cashed ${x2(x.mult)}` : x.state === 'cleared' ? `cleared it ${x2(x.mult)}` : x.picks ? `${x.picks} · ${x2(x.mult)}` : 'sizing it up');
    const key = rows.map((x) => `${x.id}:${how(x)}`).join('|');
    if (key === this.othersKey) return;
    this.othersKey = key;
    this.othersEl.replaceChildren(
      ...rows.map((x) =>
        h(
          'li',
          { class: `${x.real ? 'real ' : ''}${x.state === 'hit' ? 'lost' : x.state === 'cashed' || x.state === 'cleared' ? 'won' : ''}`.trim() || null },
          h('span', { class: 'rocket-who' }, `${x.emoji} ${x.name}`),
          h('span', { class: 'rocket-bet' }, `${fmt(x.bet)} · ${x.grid}×${x.grid}, ${x.mines} ${x.mines === 1 ? 'poop' : 'poops'} · ${how(x)}`),
        ),
      ),
    );
    if (!rows.length) this.othersEl.append(h('li', { class: 'none' }, 'Just you, for now'));
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

  /** The big button when the floors are shared: one go each per floor, then wait. */
  private syncGo(src: MinesSource, playing: boolean): void {
    const r = src.round();
    const mine = r?.runners.find((x) => x.id === src.me);
    let label: string;
    let off = this.pending || !src.online();
    if (playing) label = this.picks ? `Cash out ${fmt(Math.floor(this.bet * minesMultiplier(prefs.grid, this.mines, this.picks)))}` : `Take back ${fmt(this.bet)}`;
    else if (!r || r.phase === 'end') {
      label = 'Next floor opening…';
      off = true;
    } else if (mine) {
      label = `You’ve had your go. Next floor in ${Math.max(0, Math.ceil((r.endsAt - src.now()) / 1000))}s`;
      off = true;
    } else {
      label = this.over ? `Bet ${fmt(this.picker.amount)} on this floor` : `Bet ${fmt(this.picker.amount)}`;
      off = off || !this.picker.affordable;
    }
    setText(this.go, label);
    setDisabled(this.go, off);
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
    if (this.src) this.syncGo(this.src, playing);
    else setText(this.go, playing ? (this.picks ? `Cash out ${fmt(Math.floor(this.bet * minesMultiplier(prefs.grid, this.mines, this.picks)))}` : `Take back ${fmt(this.bet)}`) : this.over ? `Bet ${fmt(this.picker.amount)} again` : `Bet ${fmt(this.picker.amount)}`);
    this.go.classList.toggle('bail', playing && this.picks > 0);
    if (!this.src) setDisabled(this.go, !isAlive(s) || (!playing && !this.picker.affordable));
    setDisabled(this.random, !playing || this.pending);
    this.random.hidden = !playing;
    const next = minesMultiplier(prefs.grid, this.mines, this.picks + 1);
    setText(this.pays, playing ? `Next Dorkito: ${x2(next)}` : `First Dorkito pays ${x2(minesMultiplier(prefs.grid, this.mines, 1))}`);
    this.gridEl.classList.toggle('live', playing);
  }
}
