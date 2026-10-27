import { describe, expect, it } from 'vitest';
import { ARCADE } from '../../games/hammygotchi/src/arcade';
import { MAX_COINS, START_COINS, TOP_UP_COINS, Wallet, formOfTheDay, parseSave } from '../../games/hammys-arcade/src/wallet';
import type { LocalSave } from '../../shared/storage';

/** A save slot in memory, standing in for local storage. */
function memory(initial: string | null = null): LocalSave & { raw: string | null } {
  const slot = {
    raw: initial,
    load: () => slot.raw,
    save: (raw: string) => void (slot.raw = raw),
    clear: () => void (slot.raw = null),
  };
  return slot;
}

describe('Hammy’s Arcade: the wallet', () => {
  it('starts a new player with 1,000 coins and no stats', () => {
    const w = new Wallet(memory(), 'cube');
    expect(w.coins).toBe(START_COINS);
    expect(w.broke).toBe(false);
    for (const g of ARCADE) expect(w.state.stats.arcade[g.id]).toEqual({ rounds: 0, net: 0, best: 0 });
  });

  it('takes the bet up front and pays a win on the multiplier', () => {
    const w = new Wallet(memory(), 'cube');
    expect(w.bet('rocket', 100)).toBe(true);
    expect(w.coins).toBe(900);
    expect(w.payOut('rocket', 100, 2.5)).toBe(250);
    expect(w.coins).toBe(1150);
    expect(w.state.stats.arcade.rocket).toEqual({ rounds: 1, net: 150, best: 2.5 });
    // A lost round is a bet that never gets a payout.
    expect(w.bet('mines', 50)).toBe(true);
    expect(w.state.stats.arcade.mines).toEqual({ rounds: 1, net: -50, best: 0 });
  });

  it('turns down a bet you can’t cover, and brings back one that never started', () => {
    const w = new Wallet(memory(), 'cube');
    expect(w.bet('plinko', START_COINS + 1)).toBe(false);
    expect(w.bet('plinko', 0)).toBe(false);
    expect(w.bet('plinko', Number.NaN)).toBe(false);
    expect(w.coins).toBe(START_COINS);
    expect(w.bet('plinko', 40)).toBe(true);
    w.refund('plinko', 40);
    expect(w.coins).toBe(START_COINS);
    expect(w.state.stats.arcade.plinko).toEqual({ rounds: 0, net: 0, best: 0 });
  });

  it('offers the free top-up only when you’re broke', () => {
    const w = new Wallet(memory(), 'cube');
    expect(w.topUp()).toBe(0);
    expect(w.coins).toBe(START_COINS);
    w.bet('crossing', START_COINS);
    expect(w.broke).toBe(true);
    expect(w.topUp()).toBe(TOP_UP_COINS);
    expect(w.coins).toBe(TOP_UP_COINS);
    expect(w.broke).toBe(false);
    expect(w.topUps).toBe(1);
    // Not out any more: no second helping.
    expect(w.topUp()).toBe(0);
    expect(w.coins).toBe(TOP_UP_COINS);
  });

  it('saves on every change and loads it back', () => {
    const store = memory();
    const w = new Wallet(store, 'cube');
    w.bet('mines', 200);
    w.payOut('mines', 200, 3.456);
    w.bet('rocket', 400);
    w.setSound(false);
    expect(store.raw).not.toBeNull();

    const back = new Wallet(store, 'hamster');
    expect(back.coins).toBe(1091);
    expect(back.coins).toBe(w.coins);
    expect(back.sound).toBe(false);
    expect(back.form).toBe('hamster');
    expect(back.state.stats.arcade).toEqual(w.state.stats.arcade);
    expect(back.state.stats.arcade.mines).toEqual({ rounds: 1, net: 491, best: 3.45 });
  });

  it('keeps a top-up across a reload, and starts over on request', () => {
    const store = memory();
    const w = new Wallet(store, 'cube');
    w.bet('rocket', START_COINS);
    w.topUp();
    const back = new Wallet(store, 'cube');
    expect(back.topUps).toBe(1);
    expect(back.coins).toBe(TOP_UP_COINS);
    back.reset();
    expect(back.coins).toBe(START_COINS);
    expect(back.topUps).toBe(0);
    expect(new Wallet(store, 'cube').state.stats.arcade.rocket.rounds).toBe(0);
  });

  it('starts fresh from a damaged or missing save, and never trusts the numbers in one', () => {
    for (const raw of [null, '', 'not json', '[]', '{}', '{"coins":"lots"}', '{"coins":null}']) {
      expect(new Wallet(memory(raw), 'cube').coins).toBe(START_COINS);
    }
    const odd = parseSave(JSON.stringify({ coins: -5, topUps: -2, arcade: { rocket: { rounds: 2.9, net: 'x', best: -1 }, mines: 7 } }))!;
    expect(odd.coins).toBe(0);
    expect(odd.topUps).toBe(0);
    expect(odd.arcade.rocket).toEqual({ rounds: 2, net: 0, best: 0 });
    expect(odd.arcade.mines).toEqual({ rounds: 0, net: 0, best: 0 });
    expect(parseSave(JSON.stringify({ coins: 1e300 }))!.coins).toBe(MAX_COINS);
    // Broke on load means the top-up is on offer straight away.
    expect(new Wallet(memory(JSON.stringify({ coins: 0 })), 'cube').broke).toBe(true);
  });

  it('works when storage is blocked', () => {
    // No localStorage here (as in a private window that blocks it): the shared helper must swallow that.
    expect(typeof localStorage).toBe('undefined');
    const w = new Wallet(undefined, 'cube');
    expect(w.coins).toBe(START_COINS);
    expect(w.bet('rocket', 10)).toBe(true);
    w.payOut('rocket', 10, 2);
    expect(w.coins).toBe(START_COINS + 10);
    expect(w.topUp()).toBe(0);
  });

  it('tells listeners when something changed', () => {
    const w = new Wallet(memory(), 'cube');
    let n = 0;
    w.onChange(() => n++);
    w.bet('rocket', 10);
    w.payOut('rocket', 10, 1);
    w.setSound(true);
    expect(n).toBe(3);
  });

  it('gives Hammy a form for the day, the same all day', () => {
    const noon = new Date(2026, 9, 27, 12);
    expect(formOfTheDay(noon)).toBe(formOfTheDay(new Date(2026, 9, 27, 23, 59)));
    const seen = new Set(Array.from({ length: 60 }, (_, i) => formOfTheDay(new Date(2026, 8, 1 + i, 12))));
    expect(seen.size).toBeGreaterThan(1);
  });
});
