// Getting in: one step, one box. The first time on a device the page asks for
// a name (a silly one is already filled in, so Enter alone works) and that's
// all: no account, no email, no password. Next time it remembers.
import { h, setText } from '@shared/dom';
import { SILLY_NAMES } from '../../shared/names';
import { loadSaved } from './api';
import type { Arena } from './arena';

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/**
 * Show the name box in `root` until the arcade lets the player in (a taken
 * name just gets a number on the end, so only a bad name or a dead server can
 * stop it). Resolves true once in, false if the server has gone away.
 */
export function askName(arena: Arena, root: HTMLElement, hint = ''): Promise<boolean> {
  return new Promise((done) => {
    const input = h('input', {
      class: 'a-join-name',
      type: 'text',
      name: 'nickname',
      maxlength: 16,
      autocomplete: 'nickname',
      autocapitalize: 'words',
      spellcheck: 'false',
      'aria-label': 'Your name',
    });
    input.value = hint || pick(SILLY_NAMES);
    const err = h('p', { class: 'a-join-err', role: 'alert' });
    const go = h('button', { class: 'btn btn-cheese a-join-go', type: 'submit' }, 'Hop in');
    const form = h(
      'form',
      { class: 'a-join', autocomplete: 'off' },
      h('div', { class: 'a-join-emoji', 'aria-hidden': 'true' }, '🧊'),
      h('h1', null, 'Hammy’s Arcade'),
      h('p', { class: 'a-join-ask' }, 'The seagull on the door wants a name for the scoreboard. Make one up.'),
      input,
      go,
      err,
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      go.disabled = true;
      setText(err, '');
      const r = await arena.hello(input.value.trim());
      if (r.ok) {
        form.remove();
        return done(true);
      }
      go.disabled = false;
      if (r.error === 'network') {
        form.remove();
        return done(false);
      }
      setText(err, r.message);
      input.focus();
    });
    root.replaceChildren(form);
    input.focus();
    input.select();
  });
}

/** Connect to the arcade's server, or say there isn't one. */
export async function goOnline(arena: Arena, root: HTMLElement): Promise<boolean> {
  if (!(await arena.api.healthy())) return false;
  let in_ = arena.known ? await arena.hello() : ({ ok: false, error: 'new', message: '' } as const);
  if (!in_.ok) {
    if (in_.error === 'network') return false;
    if (!(await askName(arena, root, loadSaved()?.name ?? ''))) return false;
    in_ = { ok: true };
  }
  if (!(await arena.sky.open())) {
    arena.sky.close();
    return false;
  }
  arena.watchReconnects();
  return true;
}
