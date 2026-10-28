// What this page knows about The Damp Seat's shared round: a copy kept up to
// date from the sky's events, and the calls that send your choices.
import type { Snapshot } from '../../shared/protocol';
import { TRIVIA_GRACE_MS, type TriviaPayout, type TriviaRoundPub, type TriviaYou } from '../../shared/trivia';
import type { Answer, Api } from './api';
import type { Sky } from './sky';
import type { OnlineWallet } from './wallet';

const NOBODY: TriviaYou = { role: 'none', volunteer: false, alive: false, picked: null, earned: 0, cap: 0, houseDry: false };

export class TriviaMirror {
  round: TriviaRoundPub | null = null;
  you: TriviaYou = { ...NOBODY };
  /** What the last call that failed said (cleared by the next good one). */
  problem = '';
  private listeners = new Set<() => void>();
  private asking = false;

  constructor(
    private sky: Sky,
    private api: Api,
    private wallet: OnlineWallet,
  ) {
    sky.on('snapshot', (d: Snapshot) => {
      this.round = d.trivia.round;
      void this.refresh();
      this.changed();
    });
    sky.on('trivia.round', (d) => {
      this.round = d.round;
      this.you = { ...this.you, picked: null, alive: false };
      void this.refresh();
      this.changed();
    });
    sky.on('trivia.crowd', (d) => {
      const r = this.mine(d.round);
      if (!r) return;
      r.humans = d.humans;
      r.queue = d.queue;
      r.waiting = d.waiting;
      this.changed();
    });
    sky.on('trivia.ask', (d) => {
      const r = this.mine(d.round);
      if (!r) return;
      r.phase = 'ask';
      r.i = d.i;
      r.hot = d.hot;
      r.humans = d.humans;
      r.q = d.q;
      r.line = d.line;
      r.pot = d.pot;
      r.reveal = null;
      r.end = null;
      r.phaseAt = d.q.closesAt + TRIVIA_GRACE_MS;
      if (d.cast) r.cast = d.cast;
      this.you = { ...this.you, picked: null };
      // The first question is when the lobby becomes a seat and a crowd.
      if (d.i === 0) void this.refresh();
      this.changed();
    });
    sky.on('trivia.tally', (d) => {
      const r = this.mine(d.round);
      if (!r?.q || r.i !== d.i) return;
      r.q.answered = d.answered;
      r.q.standing = d.standing;
      this.changed();
    });
    sky.on('trivia.closing', (d) => {
      const r = this.mine(d.round);
      if (!r?.q || r.i !== d.i) return;
      r.q.closesAt = d.closesAt;
      r.phaseAt = d.closesAt + TRIVIA_GRACE_MS;
      this.changed();
    });
    sky.on('trivia.reveal', (d) => {
      const r = this.mine(d.round);
      if (!r || r.i !== d.i) return;
      r.phase = 'reveal';
      r.reveal = d.reveal;
      r.pot = d.reveal.pot;
      r.line = d.line;
      r.botsOut = [...new Set([...r.botsOut, ...d.reveal.outBots])];
      for (const h of r.humans) if (d.reveal.outHumans.includes(h.id)) h.alive = false;
      if (r.q) r.q.standing = d.standing;
      if (d.reveal.outHumans.includes(this.wallet.id)) this.you = { ...this.you, alive: false };
      this.changed();
    });
    sky.on('trivia.decide', (d) => {
      const r = this.mine(d.round);
      if (!r) return;
      r.phase = 'decide';
      r.pot = d.pot;
      r.phaseAt = d.until;
      r.line = d.line;
      this.changed();
    });
    sky.on('trivia.end', (d) => {
      const r = this.mine(d.round);
      if (!r) return;
      r.phase = 'end';
      r.end = d.end;
      r.line = d.line;
      r.phaseAt = d.end.nextAt;
      if (d.end.payouts.some((p: TriviaPayout) => p.id === this.wallet.id && p.paid > 0)) this.wallet.refresh();
      void this.refresh();
      this.changed();
    });
  }

  private mine(id: unknown): TriviaRoundPub | null {
    return this.round && this.round.id === id ? this.round : null;
  }

  now(): number {
    return this.sky.now();
  }

  online(): boolean {
    return this.sky.up;
  }

  get meId(): string {
    return this.wallet.id;
  }

  onChange(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  private changed(): void {
    for (const f of [...this.listeners]) {
      try {
        f();
      } catch (e) {
        console.error(e);
      }
    }
  }

  /** Ask the server who you are in this round. */
  async refresh(): Promise<void> {
    if (this.asking || !this.api.secret) return;
    this.asking = true;
    try {
      const r = await this.api.post('trivia/status');
      if (r.ok && r.you) this.you = { ...r.you, picked: r.you.picked ?? this.you.picked };
    } finally {
      this.asking = false;
      this.changed();
    }
  }

  private async send(action: string, body: Record<string, unknown> = {}): Promise<Answer> {
    const r = await this.api.post(`trivia/${action}`, body);
    if (r.me) this.wallet.applyMe(r.me);
    if (r.ok && r.you) {
      this.you = r.you;
      this.problem = '';
    } else if (!r.ok) this.problem = r.message;
    this.changed();
    return r;
  }

  join(hot = false): Promise<Answer> {
    return this.send('join', { hot });
  }

  volunteer(on: boolean): Promise<Answer> {
    return this.send('volunteer', { on });
  }

  leave(): Promise<Answer> {
    return this.send('leave');
  }

  /** Pick one of the three, as shown. */
  async answer(choice: number): Promise<Answer> {
    const r = this.round;
    if (!r?.q) return { ok: false, error: 'late', message: 'No question is open.' };
    const before = this.you.picked;
    this.you = { ...this.you, picked: choice };
    this.changed();
    const a = await this.send('answer', { round: r.id, i: r.i, choice });
    if (!a.ok && a.error !== 'already') {
      this.you = { ...this.you, picked: before };
      this.changed();
    }
    return a;
  }

  take(): Promise<Answer> {
    return this.send('take');
  }

  go(): Promise<Answer> {
    return this.send('go');
  }
}
