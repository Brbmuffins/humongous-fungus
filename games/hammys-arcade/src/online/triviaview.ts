// The Damp Seat's screen: one card with Hammy's line, the question, three
// answers, the crowd wall, and what happens after each answer. It draws what
// the mirror (online/trivia.ts) knows; the server decides everything.
import { h, setDisabled, setText } from '@shared/dom';
import type { ArcadeScreen, ArcadeSession } from '@hammygotchi/arcadeview';
import { paintPortrait } from '@hammygotchi/hammy';
import { TRIVIA_NAME, type TriviaRevealPub, type TriviaRoundPub } from '../../shared/trivia';
import '../trivia.css';
import type { TriviaMirror } from './trivia';

const LETTERS = ['A', 'B', 'C'];
const coins = (n: number): string => Math.floor(n).toLocaleString('en-US');
const secs = (ms: number): string => String(Math.max(0, Math.ceil(ms / 1000)));
/** Sources are links only if they are plain web addresses. */
const safeUrl = (u: string): string | null => (/^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null);

export class TriviaApp implements ArcadeScreen {
  readonly card: HTMLElement;
  readonly focus: HTMLElement;
  private coinsEl = h('span', { class: 'arcade-coins' });
  private lineEl = h('p', { class: 'ds-line', role: 'status' });
  /** Cube Hammy hosts, in his classic fit. */
  private host = h('canvas', { class: 'ds-avatar', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  private metaEl = h('p', { class: 'ds-meta' });
  private stage = h('div', { class: 'ds-stage' });
  private wall = h('div', { class: 'ds-wall', role: 'img' });
  private foot = h('p', { class: 'ds-foot note' });
  private notice = h('p', { class: 'ds-notice', role: 'alert' });
  private timerText: HTMLElement | null = null;
  private timerBar: HTMLElement | null = null;
  private tallyEl: HTMLElement | null = null;
  private key = '';
  private ticker = 0;
  private dead = false;
  private stops: (() => void)[] = [];
  private buttons: HTMLButtonElement[] = [];

  constructor(
    private wallet: { readonly coins: number; onChange(f: () => void): void },
    close: () => void,
    private m: TriviaMirror,
  ) {
    const x = h('button', { class: 'arcade-close', type: 'button', 'aria-label': 'Close', onclick: close }, '✕');
    this.focus = x;
    this.card = h(
      'section',
      { class: 'arcade-card ds-card', 'aria-label': TRIVIA_NAME },
      h('div', { class: 'arcade-top' }, h('h2', null, TRIVIA_NAME), this.coinsEl, x),
      h('div', { class: 'ds-host' }, this.host, this.lineEl),
      this.metaEl,
      this.stage,
      this.notice,
      this.wall,
      this.foot,
    );
    this.card.addEventListener('keydown', (e) => {
      const n = e.key === '1' ? 0 : e.key === '2' ? 1 : e.key === '3' ? 2 : -1;
      if (n >= 0 && this.buttons[n] && !this.buttons[n].disabled) this.buttons[n].click();
    });
    this.stops.push(m.onChange(() => this.render()));
    wallet.onChange(() => !this.dead && this.paintCoins());
    this.ticker = window.setInterval(() => this.tickTimer(), 100);
    requestAnimationFrame(() => !this.dead && paintPortrait(this.host, 'classic', 'happy', 0, 'cube'));
    void m.refresh();
    this.render();
  }

  close(): ArcadeSession {
    this.dead = true;
    clearInterval(this.ticker);
    for (const f of this.stops) f();
    // Leaving the page leaves the crowd, unless you are in the hot seat (then the clock answers for you).
    if (this.m.you.role === 'crowd' || this.m.you.role === 'next') void this.m.leave();
    return { rounds: 0, net: 0 };
  }

  private paintCoins(): void {
    setText(this.coinsEl, `${coins(this.wallet.coins)} coins`);
  }

  // Drawing -------------------------------------------------------------------

  private render(): void {
    if (this.dead) return;
    const r = this.m.round;
    this.paintCoins();
    setText(this.notice, this.m.problem);
    this.notice.hidden = !this.m.problem;
    if (!r) {
      this.key = 'none';
      setText(this.lineEl, this.m.online() ? 'Hammy is setting up chairs.' : 'Lost the sky. Reconnecting…');
      this.stage.replaceChildren();
      this.wall.replaceChildren();
      return;
    }
    setText(this.lineEl, r.line);
    setText(this.metaEl, r.phase === 'lobby' ? 'Next round' : `Question ${r.i + 1} of ${r.total} · pot ${coins(r.pot)} · ${r.q?.standing ?? 0} standing`);
    const key = `${r.id}:${r.phase}:${r.i}:${this.m.you.role}:${this.m.you.volunteer}:${this.m.you.alive}`;
    if (key !== this.key) {
      this.key = key;
      this.buildStage(r);
    } else this.updateStage(r);
    this.paintWall(r);
    const y = this.m.you;
    setText(this.foot, y.cap ? `You have won ${coins(y.earned)} of ${coins(y.cap)} coins today here. ${y.houseDry ? 'The house is out of prize money until tomorrow.' : 'Free to play. The house pays the prizes.'}` : 'Free to play. The house pays the prizes.');
    this.tickTimer();
  }

  private buildStage(r: TriviaRoundPub): void {
    this.timerText = this.timerBar = this.tallyEl = null;
    this.buttons = [];
    const parts: HTMLElement[] = [];
    if (r.phase === 'lobby') parts.push(...this.lobby(r));
    else if (r.phase === 'ask') parts.push(...this.asking(r));
    else {
      if (r.reveal) parts.push(this.revealBlock(r, r.reveal));
      if (r.phase === 'decide') parts.push(...this.decide(r));
      if (r.phase === 'end') parts.push(...this.ended(r));
    }
    this.stage.replaceChildren(...parts);
  }

  /** The small things that change without a new layout: counts, and the buttons' state. */
  private updateStage(r: TriviaRoundPub): void {
    if (r.phase === 'lobby') this.stage.replaceChildren(...this.lobby(r));
    if (this.tallyEl && r.q) setText(this.tallyEl, `${r.q.answered} of ${r.q.standing} have answered`);
    this.buttons.forEach((b, i) => {
      const picked = this.m.you.picked === i;
      b.classList.toggle('picked', picked);
      setDisabled(b, !this.canAnswer());
    });
  }

  private canAnswer(): boolean {
    const y = this.m.you;
    return (y.role === 'hot' || (y.role === 'crowd' && y.alive)) && y.picked === null && this.m.round?.phase === 'ask';
  }

  private btn(label: string, cls: string, f: () => void): HTMLButtonElement {
    return h('button', { class: `btn ${cls}`, type: 'button', onclick: f }, label);
  }

  private lobby(r: TriviaRoundPub): HTMLElement[] {
    const y = this.m.you;
    const people = r.humans.length;
    const joined = y.role !== 'none';
    this.timerText = h('strong', { class: 'ds-count' });
    const acts: HTMLElement[] = [];
    if (!joined) {
      acts.push(this.btn('Join the crowd', 'btn-cheese', () => void this.m.join(false)));
      acts.push(this.btn('Take the hot seat', 'btn-stink', () => void this.m.join(true)));
    } else {
      acts.push(y.volunteer ? this.btn('Never mind, I’ll stay in the crowd', 'btn-ghost', () => void this.m.volunteer(false)) : this.btn('Take the hot seat', 'btn-stink', () => void this.m.volunteer(true)));
      acts.push(this.btn('Leave', 'btn-ghost', () => void this.m.leave()));
    }
    return [
      h('p', { class: 'ds-big' }, 'Starting in ', this.timerText, ' s'),
      h('p', { class: 'ds-sub' }, `${people} ${people === 1 ? 'person' : 'people'} and ${r.cast.length} made-up friends in the crowd.`),
      h('p', { class: 'ds-sub' }, r.queue.length ? `Hot seat line: ${r.queue.join(', ')}` : 'Nobody wants the hot seat yet. A stranger from the vents will take it.'),
      h('div', { class: 'ds-actions' }, ...acts),
      h('p', { class: 'note' }, 'One player sits in the hot seat; everyone else is the crowd. Wrong answers in the crowd are out, and each one adds to the pot. Free to join.'),
    ];
  }

  private roleLine(r: TriviaRoundPub): string {
    const y = this.m.you;
    if (y.role === 'hot') return 'You are in the hot seat.';
    if (y.role === 'crowd') return y.alive ? 'You are in the crowd.' : 'You are out. Watch the rest.';
    if (y.role === 'next') return 'This one has started. You are in the next.';
    return r.hot ? `${r.hot.name} is in the hot seat.` : '';
  }

  private asking(r: TriviaRoundPub): HTMLElement[] {
    const q = r.q!;
    this.timerText = h('strong', { class: 'ds-count' });
    this.timerBar = h('span', { class: 'ds-bar-fill' });
    this.tallyEl = h('p', { class: 'ds-sub' });
    setText(this.tallyEl, `${q.answered} of ${q.standing} have answered`);
    const picked = this.m.you.picked;
    const can = this.canAnswer();
    this.buttons = q.answers.map((a, i) => {
      const b = h('button', { class: `ds-answer${picked === i ? ' picked' : ''}`, type: 'button', onclick: () => void this.m.answer(i) }, h('span', { class: 'ds-letter', 'aria-hidden': 'true' }, LETTERS[i]), h('span', { class: 'ds-text' }, a));
      b.disabled = !can;
      return b;
    });
    return [
      h('p', { class: 'ds-role' }, this.roleLine(r), ' ', h('span', { class: 'ds-kind' }, q.cat === 'gross' ? 'gross and weird' : 'general')),
      h('div', { class: 'ds-bar' }, this.timerBar),
      h('p', { class: 'ds-clock' }, this.timerText, ' s'),
      h('h3', { class: 'ds-q' }, q.text),
      h('div', { class: 'ds-answers' }, ...this.buttons),
      this.tallyEl,
    ];
  }

  private revealBlock(r: TriviaRoundPub, v: TriviaRevealPub): HTMLElement {
    const total = Math.max(1, v.counts.reduce((a, b) => a + b, 0));
    const url = safeUrl(v.source);
    const hot = r.hot?.name ?? 'The hot seat';
    const y = this.m.you;
    const mine = y.role === 'hot' ? (v.hotOk ? 'You got it.' : 'You missed it.') : y.role === 'crowd' || y.role === 'next' ? (y.picked === v.correct ? 'You got it.' : y.picked === null ? 'You did not answer.' : 'Not that one.') : '';
    const knocked = v.outBots.length + v.outHumans.length;
    return h(
      'div',
      { class: 'ds-reveal' },
      h('h3', { class: 'ds-q' }, v.text),
      h(
        'div',
        { class: 'ds-answers' },
        ...v.answers.map((a, i) =>
          h(
            'div',
            { class: `ds-answer shown${i === v.correct ? ' right' : ''}${y.picked === i || (y.role === 'hot' && v.hotPick === i) ? ' picked' : ''}` },
            h('span', { class: 'ds-letter', 'aria-hidden': 'true' }, i === v.correct ? '✓' : LETTERS[i]),
            h('span', { class: 'ds-text' }, a),
            h('span', { class: 'ds-pct' }, `${Math.round((v.counts[i] / total) * 100)}%`),
          ),
        ),
      ),
      h('p', { class: 'ds-sub' }, `${hot} ${v.hotPick === null ? 'did not answer' : v.hotOk ? 'was right' : 'was wrong'}. ${knocked} knocked out${v.potAdd ? `, +${coins(v.potAdd)} to the pot (${coins(v.pot)})` : ''}. ${mine}`),
      h('p', { class: 'ds-fact' }, v.fact, ' ', url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Source') : null),
    );
  }

  private decide(r: TriviaRoundPub): HTMLElement[] {
    this.timerText = h('strong', { class: 'ds-count' });
    if (this.m.you.role === 'hot') {
      return [
        h('p', { class: 'ds-big' }, `Pot: ${coins(r.pot)} coins`),
        h('div', { class: 'ds-actions' }, this.btn(`Take ${coins(r.pot)} and leave`, 'btn-cheese', () => void this.m.take()), this.btn('Keep going', 'btn-stink', () => void this.m.go())),
        h('p', { class: 'ds-sub' }, 'Decide in ', this.timerText, ' s, or the pot is taken for you. A wrong answer loses it, and the crowd splits a prize.'),
      ];
    }
    return [h('p', { class: 'ds-sub' }, `${r.hot?.name ?? 'The hot seat'} is deciding whether to take ${coins(r.pot)} coins. `, this.timerText, ' s')];
  }

  private ended(r: TriviaRoundPub): HTMLElement[] {
    const e = r.end!;
    this.timerText = h('strong', { class: 'ds-count' });
    const me = e.payouts.find((p) => p.id === this.m.meId);
    const head = { took: 'Pot taken', busted: 'The hot seat fell', cleared: 'Every question cleared', wiped: 'The crowd is gone' }[e.outcome];
    const won = me ? (me.paid ? `You won ${coins(me.paid)} coins${me.paid < me.due ? ' (a daily limit trimmed it)' : ''}.` : 'The daily limit means no prize this time.') : '';
    const crowd = e.payouts.filter((p) => p.role === 'crowd');
    return [
      h('p', { class: 'ds-big' }, head),
      h('p', { class: 'ds-sub' }, e.outcome === 'busted' ? `${crowd.length} still standing split ${coins(Math.max(e.pot, 50))} coins.` : `Pot: ${coins(e.pot)} coins.`, ' ', won),
      h('p', { class: 'ds-sub' }, 'Next round in ', this.timerText, ' s'),
      h('div', { class: 'ds-actions' }, this.m.you.role === 'none' ? this.btn('Join the next one', 'btn-cheese', () => void this.m.join(false)) : this.btn('Take the hot seat next', 'btn-stink', () => void this.m.volunteer(true))),
    ];
  }

  private paintWall(r: TriviaRoundPub): void {
    const out = new Set(r.botsOut);
    const alive = r.cast.length - out.size + r.humans.filter((x) => x.alive).length;
    this.wall.setAttribute('aria-label', `The crowd: ${alive} still standing`);
    const dots: HTMLElement[] = [];
    for (const p of r.humans) dots.push(h('span', { class: `ds-dot you${p.alive ? '' : ' out'}${p.id === this.m.meId ? ' me' : ''}`, title: p.name }, p.emoji));
    r.cast.forEach(([name, emoji], i) => dots.push(h('span', { class: `ds-dot${out.has(i) ? ' out' : ''}`, title: name }, emoji)));
    this.wall.replaceChildren(...dots);
  }

  private tickTimer(): void {
    const r = this.m.round;
    if (!r || this.dead) return;
    const now = this.m.now();
    if (r.phase === 'ask' && r.q) {
      const left = r.q.closesAt - now;
      if (this.timerText) setText(this.timerText, secs(left));
      if (this.timerBar) this.timerBar.style.transform = `scaleX(${Math.max(0, Math.min(1, left / Math.max(1, r.q.closesAt - r.q.opensAt)))})`;
    } else if (this.timerText) setText(this.timerText, secs(r.phaseAt - now));
  }
}
