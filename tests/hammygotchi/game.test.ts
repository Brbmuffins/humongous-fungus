import { describe, expect, it } from 'vitest';
import { FOOD_BY_ID, FIT_BY_ID, MAX_ORDERS, MAX_TEXTS, ROT_SECONDS, SCOOP_COINS, SELF_ORDER_TIP, START_COINS } from '../../games/hammygotchi/src/defs';
import {
  adopt,
  buyFit,
  canCall,
  declineCall,
  endCall,
  hose,
  isAlive,
  needWord,
  order,
  rotDone,
  scoop,
  sendText,
  step,
  textOptions,
  unread,
  wearFit,
} from '../../games/hammygotchi/src/game';
import { deserialize, newGame, serialize } from '../../games/hammygotchi/src/state';

const T0 = 1_700_000_000_000;
const sec = (n: number) => n * 1000;
const hours = (n: number) => n * 3_600_000;
const half = () => 0.5;

describe('a new Hammy', () => {
  it('starts a little hungry, with coins and a text waiting', () => {
    const s = newGame(T0);
    expect(isAlive(s)).toBe(true);
    expect(s.coins).toBe(START_COINS);
    expect(s.belly).toBeLessThan(100);
    expect(unread(s, T0 + 10)).toBe(2);
    expect(s.owned).toEqual(['classic']);
  });
  it('gets hungrier and sadder over time, also while the game is closed', () => {
    const s = newGame(T0);
    const { away } = step(s, T0 + hours(2), half);
    expect(away).not.toBeNull();
    expect(s.belly).toBeCloseTo(55 - 14, 0);
    expect(s.mood).toBeLessThan(70);
    expect(away!.texts).toBeGreaterThan(0);
  });
  it('a short gap is not an away report', () => {
    const s = newGame(T0);
    expect(step(s, T0 + sec(30), half).away).toBeNull();
  });
  it('a fed, happy Hammy makes it through the night', () => {
    const s = newGame(T0);
    s.belly = 100;
    s.mood = 100;
    step(s, T0 + hours(9), half);
    expect(isAlive(s)).toBe(true);
  });
});

describe('DoorDosh', () => {
  it('Dorkitos are free; the rest costs coins', () => {
    const s = newGame(T0);
    expect(order(s, 'dorkitos', T0, half)).toBe(true);
    expect(s.coins).toBe(START_COINS);
    expect(order(s, 'pizza', T0, half)).toBe(true);
    expect(s.coins).toBe(START_COINS - FOOD_BY_ID.pizza.price);
  });
  it('food arrives a few seconds later and turns into gas and poop', () => {
    const s = newGame(T0);
    s.belly = 30;
    order(s, 'burrito', T0, half);
    const belly = s.belly;
    step(s, T0 + sec(2), half);
    expect(s.belly).toBeLessThanOrEqual(belly);
    const { events } = step(s, T0 + sec(20), half);
    expect(events.some((e) => e.type === 'delivery' && e.food === 'burrito')).toBe(true);
    expect(s.belly).toBeGreaterThan(belly + 50);
    expect(s.gas).toBeGreaterThan(0);
    expect(s.poopDue).toHaveLength(FOOD_BY_ID.burrito.poops);
    step(s, T0 + sec(20 + 600), half);
    expect(s.poops).toHaveLength(2);
    expect(s.poopDue).toHaveLength(0);
  });
  it('no more than a few orders at once, and never without the coins', () => {
    const s = newGame(T0);
    for (let i = 0; i < MAX_ORDERS; i++) expect(order(s, 'dorkitos', T0, half)).toBe(true);
    expect(order(s, 'dorkitos', T0, half)).toBe(false);
    const broke = newGame(T0);
    broke.coins = 3;
    expect(order(broke, 'pizza', T0, half)).toBe(false);
  });
  it('gas comes out as farts, and farts make him less fresh', () => {
    const s = newGame(T0);
    s.gas = 60;
    const fresh = s.fresh;
    step(s, T0 + sec(60 * 5), half);
    expect(s.stats.farts).toBeGreaterThan(3);
    expect(s.gas).toBeLessThan(60);
    expect(s.fresh).toBeLessThan(fresh - 5);
  });
  it('when he gets hungry he orders on your coins, tip included', () => {
    const s = newGame(T0);
    s.belly = 19;
    s.coins = 100;
    const { events } = step(s, T0 + sec(60), half);
    const e = events.find((x) => x.type === 'selfOrder');
    expect(e).toBeDefined();
    if (e?.type !== 'selfOrder') return;
    expect(e.cost).toBe(FOOD_BY_ID[e.food].price + SELF_ORDER_TIP);
    expect(s.coins).toBeCloseTo(100 - e.cost, 0);
    expect(s.orders[0].self).toBe(true);
  });
});

describe('cleaning up', () => {
  it('scooping poop pays coins and freshens the tank', () => {
    const s = newGame(T0);
    s.poops = [0.2, 0.5];
    s.fresh = 50;
    expect(scoop(s, 1)).toBe(SCOOP_COINS);
    expect(s.poops).toEqual([0.2]);
    expect(s.coins).toBe(START_COINS + SCOOP_COINS);
    expect(s.fresh).toBeGreaterThan(50);
    expect(scoop(s, 5)).toBe(0);
  });
  it('the hose works, he hates it, and it needs to refill', () => {
    const s = newGame(T0);
    s.fresh = 20;
    const mood = s.mood;
    expect(hose(s, T0)).toBe(true);
    expect(s.fresh).toBe(70);
    expect(s.mood).toBeLessThan(mood);
    expect(hose(s, T0 + sec(10))).toBe(false);
    expect(hose(s, T0 + sec(5 * 60))).toBe(true);
  });
  it('poop on the floor makes everything stink faster', () => {
    const clean = newGame(T0);
    const dirty = newGame(T0);
    dirty.poops = [0.1, 0.3, 0.5, 0.7];
    step(clean, T0 + hours(1), () => 0);
    step(dirty, T0 + hours(1), () => 0);
    expect(dirty.fresh).toBeLessThan(clean.fresh - 8);
  });
});

describe('the phone', () => {
  it('texting him lifts his mood and he replies a moment later', () => {
    const s = newGame(T0);
    s.mood = 40;
    expect(sendText(s, 'love', T0, half)).toBe(true);
    expect(s.mood).toBe(47);
    expect(s.textBudget).toBe(MAX_TEXTS - 1);
    const reply = s.messages[s.messages.length - 1];
    expect(reply.from).toBe('hammy');
    expect(reply.at).toBeGreaterThan(T0);
    expect(unread(s, T0)).toBe(0);
  });
  it('spamming him stops working', () => {
    const s = newGame(T0);
    s.mood = 10;
    for (let i = 0; i < MAX_TEXTS; i++) sendText(s, 'lol', T0, half);
    const mood = s.mood;
    sendText(s, 'lol', T0, half);
    expect(s.mood).toBe(mood);
    expect(s.messages[s.messages.length - 1].text).toMatch(/chill|blowing up|get it|one text/);
  });
  it('the reply options change after each text', () => {
    const s = newGame(T0);
    const first = textOptions(s).map((o) => o.id);
    expect(new Set(first).size).toBe(3);
    sendText(s, first[0], T0, half);
    expect(textOptions(s).map((o) => o.id)).not.toEqual(first);
  });
  it('a call is worth more the longer it goes, and then he is busy', () => {
    const s = newGame(T0);
    s.mood = 20;
    const short = endCall(s, 3, T0, false);
    expect(short.coins).toBe(0);
    expect(canCall(s, T0 + sec(30))).toBe(false);
    const s2 = newGame(T0);
    s2.mood = 20;
    const long = endCall(s2, 30, T0, true);
    expect(long.mood).toBeGreaterThan(short.mood);
    expect(long.coins).toBeGreaterThan(0);
    expect(s2.mood).toBeGreaterThan(s.mood);
  });
  it('declining hurts more than missing', () => {
    const a = newGame(T0);
    const b = newGame(T0);
    declineCall(a, T0, false);
    declineCall(b, T0, true);
    expect(a.mood).toBeLessThan(b.mood);
    expect(b.messages[b.messages.length - 1].missed).toBe(true);
  });
  it('he calls while you are watching, and you miss his calls while you are away', () => {
    const s = newGame(T0);
    s.nextCallAt = T0 + sec(1);
    const live = step(s, T0 + sec(2), half);
    expect(live.events.some((e) => e.type === 'ring')).toBe(true);
    const away = step(s, T0 + hours(6), half);
    expect(away.away!.missedCalls).toBeGreaterThan(0);
  });
});

describe('fits', () => {
  it('cost Hammy coins and can be swapped', () => {
    const s = newGame(T0);
    expect(buyFit(s, 'roadtrip')).toBe(true);
    expect(s.coins).toBe(START_COINS - FIT_BY_ID.roadtrip.price);
    expect(s.fit).toBe('roadtrip');
    expect(buyFit(s, 'golden')).toBe(false);
    expect(wearFit(s, 'golden')).toBe(false);
    expect(wearFit(s, 'classic')).toBe(true);
  });
});

describe('dying', () => {
  it('neglect kills him, then he rots, then you lose', () => {
    const s = newGame(T0);
    s.coins = 0;
    s.mood = 40;
    const { events } = step(s, T0 + hours(48), half);
    expect(events.some((e) => e.type === 'died')).toBe(true);
    expect(isAlive(s)).toBe(false);
    expect(s.causes).toContain('belly');
    expect(s.causes).toContain('mood');
    expect(s.diedAt).toBeLessThan(T0 + hours(48));
    expect(rotDone(s, s.diedAt! + sec(ROT_SECONDS - 1))).toBe(false);
    expect(rotDone(s, s.diedAt! + sec(ROT_SECONDS))).toBe(true);
    // Dead is dead: nothing more happens.
    const farts = s.stats.farts;
    step(s, T0 + hours(60), half);
    expect(s.stats.farts).toBe(farts);
    expect(order(s, 'dorkitos', T0 + hours(60), half)).toBe(false);
    expect(sendText(s, 'up', T0 + hours(60), half)).toBe(false);
  });
  it('gas station sushi can finish him off', () => {
    const s = newGame(T0);
    s.health = 10;
    s.coins = 100;
    order(s, 'sushi', T0, half);
    step(s, T0 + sec(30), half);
    expect(isAlive(s)).toBe(false);
    expect(s.causes).toEqual(['sushi']);
  });
  it('a new Hammy keeps your fits and your graveyard, not your coins', () => {
    const s = newGame(T0);
    s.coins = 500;
    buyFit(s, 'cowboy');
    s.belly = s.mood = s.fresh = 0;
    s.health = 1;
    step(s, T0 + hours(1), half);
    expect(isAlive(s)).toBe(false);
    expect(adopt(s, T0 + hours(2))).toBe(true);
    expect(isAlive(s)).toBe(true);
    expect(s.n).toBe(2);
    expect(s.coins).toBe(START_COINS);
    expect(s.owned).toContain('cowboy');
    expect(s.graves).toHaveLength(1);
    expect(s.graves[0].n).toBe(1);
    expect(s.stats.farts).toBe(0);
    expect(adopt(s, T0 + hours(3))).toBe(false);
  });
});

describe('words', () => {
  it('describe each meter', () => {
    expect(needWord('fresh', 100)).toBe('Fresh-ish');
    expect(needWord('fresh', 30)).toBe('Rancid');
    expect(needWord('belly', 0)).toBe('Empty');
    expect(needWord('mood', 10)).toBe('Crying');
  });
});

describe('saves', () => {
  it('round-trip', () => {
    const s = newGame(T0);
    order(s, 'pizza', T0, half);
    s.poops = [0.3];
    buyFit(s, 'roadtrip');
    sendText(s, 'wyd', T0, half);
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it('rejects garbage', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('null')).toBeNull();
    expect(deserialize('{"version":2}')).toBeNull();
  });
  it('repair what is damaged', () => {
    const raw = JSON.parse(serialize(newGame(T0)));
    raw.belly = 900;
    raw.fresh = -4;
    raw.owned = ['golden', 'dragon'];
    raw.fit = 'dragon';
    raw.orders = [{ food: 'caviar', arriveAt: 1 }, { food: 'pizza', arriveAt: 2 }];
    raw.poops = [0.5, 'x', 7];
    raw.messages = [{ at: 1, from: 'frog', text: 'hi' }, { at: 2, from: 'you', text: 'ok' }];
    raw.causes = ['belly'];
    const s = deserialize(JSON.stringify(raw))!;
    expect(s.belly).toBe(100);
    expect(s.fresh).toBe(0);
    expect(s.owned).toEqual(['classic', 'golden']);
    expect(s.fit).toBe('classic');
    expect(s.orders).toEqual([{ food: 'pizza', arriveAt: 2, self: false }]);
    expect(s.poops).toEqual([0.5, 1]);
    expect(s.messages).toHaveLength(1);
    // Causes only mean something once he's dead.
    expect(s.causes).toEqual([]);
  });
});
