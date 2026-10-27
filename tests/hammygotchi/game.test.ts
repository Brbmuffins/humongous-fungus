import { describe, expect, it } from 'vitest';
import {
  FOOD_BY_ID,
  FIT_BY_ID,
  MAX_ORDERS,
  MAX_TEXTS,
  MEAT_PRICE,
  PLAY_COOLDOWN,
  REST,
  ROT_SECONDS,
  SCOOP_COINS,
  SELF_ORDER_TIP,
  SHOWER_COOLDOWN,
  SHOWER_FRESH,
  START_COINS,
  TOILET_COINS,
  TOY_BY_ID,
  URGE_SECONDS,
  VACUUM_SECONDS,
} from '../../games/hammygotchi/src/defs';
import {
  adopt,
  buyFit,
  buyMeat,
  buyToy,
  buyUpgrade,
  canCall,
  declineCall,
  endCall,
  feed,
  formFor,
  formOnDay,
  shower,
  isAlive,
  needWord,
  order,
  pickToy,
  play,
  rest,
  rotDone,
  scoop,
  sendText,
  step,
  textOptions,
  unread,
  useToilet,
  vacuumPoop,
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
    s.poops = [{ x: 0.2, up: false }, { x: 0.5, up: true }];
    s.fresh = 50;
    expect(scoop(s, 1)).toBe(SCOOP_COINS);
    expect(s.poops).toEqual([{ x: 0.2, up: false }]);
    expect(s.coins).toBe(START_COINS + SCOOP_COINS);
    expect(s.fresh).toBeGreaterThan(50);
    expect(scoop(s, 5)).toBe(0);
  });
  it('the shower cleans him, he grumbles, and it needs a minute', () => {
    const s = newGame(T0);
    s.fresh = 20;
    const mood = s.mood;
    expect(shower(s, T0)).toBe(true);
    expect(s.fresh).toBe(20 + SHOWER_FRESH);
    expect(s.mood).toBeLessThan(mood);
    expect(shower(s, T0 + sec(10))).toBe(false);
    expect(shower(s, T0 + sec(SHOWER_COOLDOWN))).toBe(true);
  });
  it('soap makes showers better', () => {
    const plain = newGame(T0);
    const soapy = newGame(T0);
    plain.fresh = soapy.fresh = 10;
    soapy.coins = 1000;
    expect(buyUpgrade(soapy, 'soap')).toBe(true);
    expect(buyUpgrade(soapy, 'soap')).toBe(true);
    shower(plain, T0);
    shower(soapy, T0);
    expect(soapy.fresh).toBeGreaterThan(plain.fresh);
    expect(soapy.mood).toBeGreaterThan(plain.mood);
  });
  it('poop on the floor makes everything stink faster', () => {
    const clean = newGame(T0);
    const dirty = newGame(T0);
    dirty.poops = [0.1, 0.3, 0.5, 0.7].map((x) => ({ x, up: false }));
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
    s.poops = [{ x: 0.3, up: true }];
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
    raw.poops = [0.5, 'x', 7, { x: 0.25, up: true }];
    raw.messages = [{ at: 1, from: 'frog', text: 'hi' }, { at: 2, from: 'you', text: 'ok' }];
    raw.causes = ['belly'];
    const s = deserialize(JSON.stringify(raw))!;
    expect(s.belly).toBe(100);
    expect(s.fresh).toBe(0);
    expect(s.owned).toEqual(['classic', 'golden']);
    expect(s.fit).toBe('classic');
    expect(s.orders).toEqual([{ food: 'pizza', arriveAt: 2, self: false }]);
    // Old saves stored plain positions on the ground floor.
    expect(s.poops).toEqual([{ x: 0.5, up: false }, { x: 1, up: false }, { x: 0.25, up: true }]);
    expect(s.messages).toHaveLength(1);
    // Causes only mean something once he's dead.
    expect(s.causes).toEqual([]);
  });
});

describe('forms', () => {
  it('a new Hammy starts out as Cube Hammy', () => {
    const s = newGame(T0);
    expect(formFor(s, T0)).toBe('cube');
  });
  it('after that he changes every day, never the same twice in a row', () => {
    const first = 20_000;
    const days = Array.from({ length: 200 }, (_, i) => formOnDay(first + i, first, 12345));
    expect(days[0]).toBe('cube');
    for (let i = 1; i < days.length; i++) expect(days[i]).not.toBe(days[i - 1]);
    for (const f of ['hamster', 'sub', 'train']) expect(days.filter((d) => d === f).length).toBeGreaterThan(20);
    // Cube Hammy is the usual one.
    const cube = days.filter((d) => d === 'cube').length;
    for (const f of ['hamster', 'sub', 'train']) expect(cube).toBeGreaterThan(days.filter((d) => d === f).length);
  });
  it('the same day is the same form every time you ask', () => {
    expect(formOnDay(20_031, 20_000, 7)).toBe(formOnDay(20_031, 20_000, 7));
  });
});

describe('toys', () => {
  it('start with a hand, a feather and a ball; the rest cost coins', () => {
    const s = newGame(T0);
    expect(s.toys).toEqual(['hand', 'feather', 'ball']);
    expect(pickToy(s, 'glove')).toBe(false);
    s.coins = TOY_BY_ID.glove.price;
    expect(buyToy(s, 'glove')).toBe(true);
    expect(s.coins).toBe(0);
    expect(s.toy).toBe('glove');
    expect(buyToy(s, 'glove')).toBe(false);
  });
  it('nice toys lift his mood, mean ones pay more and cost mood', () => {
    const s = newGame(T0);
    s.toys.push('glove');
    s.mood = 50;
    expect(play(s, 'feather', T0)).toEqual({ mood: TOY_BY_ID.feather.mood, coins: TOY_BY_ID.feather.coins });
    expect(s.mood).toBe(50 + TOY_BY_ID.feather.mood);
    const later = T0 + sec(PLAY_COOLDOWN);
    const before = s.coins;
    play(s, 'glove', later);
    expect(s.mood).toBe(50 + TOY_BY_ID.feather.mood + TOY_BY_ID.glove.mood);
    expect(s.coins).toBe(before + TOY_BY_ID.glove.coins);
    expect(TOY_BY_ID.glove.coins).toBeGreaterThan(TOY_BY_ID.feather.coins);
  });
  it('only count every couple of seconds', () => {
    const s = newGame(T0);
    expect(play(s, 'ball', T0)).not.toBeNull();
    expect(play(s, 'ball', T0 + 100)).toBeNull();
    expect(s.stats.toys).toBe(1);
  });
  it('do nothing with toys you do not own, or once he is dead', () => {
    const s = newGame(T0);
    expect(play(s, 'firecracker', T0)).toBeNull();
    s.diedAt = T0;
    expect(play(s, 'ball', T0 + sec(10))).toBeNull();
  });
  it('are kept, with what you had in hand, across saves and a new Hammy', () => {
    const s = newGame(T0);
    s.coins = 1000;
    buyToy(s, 'magnet');
    const d = deserialize(serialize(s))!;
    expect(d.toys).toContain('magnet');
    expect(d.toy).toBe('magnet');
    d.diedAt = T0 + 1;
    adopt(d, T0 + 2);
    expect(d.toys).toContain('magnet');
  });
  it('a damaged save gets the starting toys back', () => {
    const raw = JSON.parse(serialize(newGame(T0)));
    raw.toys = ['laser', 'pie'];
    raw.toy = 'laser';
    const d = deserialize(JSON.stringify(raw))!;
    expect(d.toys).toEqual(['hand', 'feather', 'ball', 'pie']);
    expect(d.toy).toBe('hand');
  });
});

describe('the toilet', () => {
  it('a meal comes out as an urge first, and he holds it for a while', () => {
    const s = newGame(T0);
    s.poopDue = [T0 + sec(10)];
    const { events } = step(s, T0 + sec(11), half);
    expect(events.some((e) => e.type === 'urge')).toBe(true);
    expect(s.urges).toHaveLength(1);
    expect(s.poops).toHaveLength(0);
  });
  it('put him on the toilet in time and nothing hits the floor', () => {
    const s = newGame(T0);
    s.poopDue = [T0 + sec(10)];
    step(s, T0 + sec(11), half);
    const coins = s.coins;
    expect(useToilet(s)).toBe(1);
    expect(s.coins).toBe(coins + TOILET_COINS);
    step(s, T0 + sec(10 + URGE_SECONDS + 5), half);
    expect(s.poops).toHaveLength(0);
    expect(s.stats.toilet).toBe(1);
  });
  it('too late, and it ends up on the floor', () => {
    const s = newGame(T0);
    s.poopDue = [T0 + sec(10)];
    step(s, T0 + sec(11), half);
    const { events } = step(s, T0 + sec(10 + URGE_SECONDS + 1), half);
    expect(events.some((e) => e.type === 'poop')).toBe(true);
    expect(s.poops).toHaveLength(1);
    expect(s.urges).toHaveLength(0);
  });
  it('sitting there without needing to go does nothing', () => {
    const s = newGame(T0);
    expect(useToilet(s)).toBe(0);
  });
});

describe('furniture', () => {
  it('the bed lifts his mood, but only so far', () => {
    const s = newGame(T0);
    s.mood = 30;
    expect(rest(s, 'bed', T0)).toEqual({ mood: REST.bed!.mood, coins: 0 });
    expect(rest(s, 'bed', T0 + 100)).toBeNull();
    s.mood = REST.bed!.cap;
    expect(rest(s, 'bed', T0 + sec(REST.bed!.every))?.mood).toBe(0);
    expect(s.mood).toBe(REST.bed!.cap);
  });
  it('at the PC his stream pays a coin now and then', () => {
    const s = newGame(T0);
    s.mood = 40;
    const coins = s.coins;
    expect(rest(s, 'pc', T0)?.coins).toBe(1);
    expect(rest(s, 'pc', T0 + sec(REST.pc!.every))?.coins).toBe(0);
    expect(s.coins).toBe(coins + 1);
  });
});

describe('cooking', () => {
  it('the fridge sells raw steak; cooked is much better than raw', () => {
    const s = newGame(T0);
    expect(buyMeat(s)).toBe(true);
    expect(s.coins).toBe(START_COINS - MEAT_PRICE);
    const raw = newGame(T0);
    const cooked = newGame(T0);
    raw.belly = cooked.belly = 20;
    feed(raw, 'rawsteak', T0, half);
    feed(cooked, 'steak', T0, half);
    expect(cooked.belly).toBeGreaterThan(raw.belly);
    expect(cooked.mood).toBeGreaterThan(raw.mood);
    expect(raw.health).toBeLessThan(100);
    expect(cooked.stats.cooked).toBe(1);
  });
  it('only home food goes through feed, and not with an empty wallet', () => {
    const s = newGame(T0);
    expect(feed(s, 'pizza', T0, half)).toBe(false);
    s.coins = 1;
    expect(buyMeat(s)).toBe(false);
  });
});

describe('robot vacuums', () => {
  it('eat floor poop while you are away', () => {
    const s = newGame(T0);
    s.coins = 1000;
    expect(buyUpgrade(s, 'vacuum')).toBe(true);
    s.poops = [0.2, 0.4, 0.6].map((x) => ({ x, up: false }));
    const { away } = step(s, T0 + sec(VACUUM_SECONDS * 4), half);
    expect(s.poops).toHaveLength(0);
    expect(s.stats.vacuumed).toBe(3);
    // The welcome-back screen says so.
    expect(away?.vacuumed).toBe(3);
  });
  it('and while you watch, when they drive into one', () => {
    const s = newGame(T0);
    s.poops = [{ x: 0.5, up: false }];
    expect(vacuumPoop(s, 0)).toBe(false);
    s.upgrades.vacuum = 1;
    expect(vacuumPoop(s, 0)).toBe(true);
    expect(s.poops).toHaveLength(0);
  });
  it('have a level limit', () => {
    const s = newGame(T0);
    s.coins = 1e6;
    expect(buyUpgrade(s, 'vacuum')).toBe(true);
    expect(buyUpgrade(s, 'vacuum')).toBe(true);
    expect(buyUpgrade(s, 'vacuum')).toBe(false);
    expect(deserialize(serialize(s))!.upgrades.vacuum).toBe(2);
  });
});
