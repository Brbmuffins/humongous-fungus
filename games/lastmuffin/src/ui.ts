// Every screen that isn't the floor itself: the title, picking a muffin, the
// Pantry, records, and during a run the HUD, level-ups, pie tins, pausing,
// sunrise and the results. Built from plain DOM over the canvas.
import { h, setText } from '@shared/dom';
import { fmt } from '@shared/format';
import {
  DEATH_LINES,
  ENEMIES,
  MAX_LEVEL,
  MUFFIN_BY_ID,
  MUFFINS,
  PANTRY,
  PASSIVE_BY_ID,
  RUN_SECONDS,
  WEAPON_BY_ID,
  WEAPONS,
  WIN_CRUMBS,
  WIN_LINES,
  clockText,
  levelText,
  xpToNext,
  type MuffinId,
  type PantryId,
  type PassiveId,
  type WeaponId,
} from './defs';
import { drawPassiveIcon, drawWeaponIcon } from './draw';
import { canUnlock, pantryCost, type Banked, type MetaState } from './meta';
import type { Offer, Run, RunSummary } from './run';
import { paintEnemy, paintMuffin } from './view';

export type Screen = 'title' | 'select' | 'pantry' | 'records' | 'levelup' | 'chest' | 'pause' | 'sunrise' | 'results' | null;

export interface Controller {
  readonly meta: MetaState;
  readonly run: Run | null;
  start(): void;
  pick(id: MuffinId): void;
  unlock(id: MuffinId): void;
  buy(id: PantryId): void;
  choose(i: number): void;
  reroll(): void;
  skip(): void;
  closeChest(): void;
  keepGoing(): void;
  headHome(): void;
  resume(): void;
  giveUp(): void;
  show(screen: Screen): void;
  toggleSound(): void;
  toggleAutoPick(): void;
  toggleAutoHop(): void;
  eraseSave(): void;
}

const time = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Paint a weapon or passive icon into a small canvas once it's in the page. */
function icon(kind: 'weapon' | 'passive', id: WeaponId | PassiveId, size: number, evolved = false): HTMLCanvasElement {
  const canvas = h('canvas', { class: 'icon', width: size * 2, height: size * 2, style: `width:${size}px;height:${size}px`, 'aria-hidden': 'true' });
  const c = canvas.getContext('2d')!;
  c.setTransform(2, 0, 0, 2, size, size);
  if (kind === 'weapon') {
    const def = WEAPON_BY_ID[id as WeaponId];
    drawWeaponIcon(c, id as WeaponId, size * 0.62, evolved, evolved ? def.evolved.color : def.color);
  } else {
    const def = PASSIVE_BY_ID[id as PassiveId];
    drawPassiveIcon(c, def.color, size * 0.78, def.name[0]);
  }
  return canvas;
}

/** Pantry upgrades that do things for you, listed on their own. */
const AUTOMATION: readonly PantryId[] = ['pulse', 'autopick', 'autohop'];

function crumbsTag(n: number): HTMLElement {
  return h('span', { class: 'crumbs-tag' }, h('span', { class: 'crumb-dot', 'aria-hidden': 'true' }), fmt(n));
}

function offerText(o: Offer, run: Run): { name: string; tag: string; text: string; icon: HTMLCanvasElement | null } {
  if (o.type === 'weapon') {
    const def = WEAPON_BY_ID[o.id];
    const ready = o.level === MAX_LEVEL && run.passiveLevel(def.evolvesWith) > 0;
    return {
      name: def.name,
      tag: o.level === 1 ? 'New weapon' : `Level ${o.level}`,
      text: (o.level === 1 ? def.blurb : levelText(def, o.level - 1)) + (o.level === MAX_LEVEL ? ` Max level: with ${PASSIVE_BY_ID[def.evolvesWith].name}, a boss's pie tin evolves it.${ready ? ' (You have it!)' : ''}` : ''),
      icon: icon('weapon', o.id, 40),
    };
  }
  if (o.type === 'passive') {
    const def = PASSIVE_BY_ID[o.id];
    const evolves = WEAPONS.filter((w) => w.evolvesWith === o.id).map((w) => w.name);
    return { name: def.name, tag: o.level === 1 ? 'New' : `Level ${o.level}`, text: `${def.each}.${evolves.length ? ` Evolves ${evolves.join(', ')}.` : ''}`, icon: icon('passive', o.id, 40) };
  }
  if (o.type === 'snack') return { name: 'A snack', tag: 'Treat', text: '+25 crumbs.', icon: null };
  return { name: 'Glass of milk', tag: 'Treat', text: '+30 health.', icon: null };
}

export class UI {
  private screenEl = document.getElementById('screen')!;
  private hud = document.getElementById('hud')!;
  private xpFill = document.getElementById('xp-fill')!;
  private levelEl = document.getElementById('level')!;
  private clockEl = document.getElementById('clock')!;
  private timerEl = document.getElementById('timer')!;
  private killsEl = document.getElementById('kills')!;
  private crumbsEl = document.getElementById('crumbs')!;
  private loadout = document.getElementById('loadout')!;
  private bossEl = document.getElementById('boss')!;
  private bossName = document.getElementById('boss-name')!;
  private bossFill = document.getElementById('boss-fill')!;
  private warningEl = document.getElementById('warning')!;
  private hopEl = document.getElementById('hop')!;
  private loadoutKey = '';
  private warnTimer = 0;
  current: Screen = null;

  constructor(private c: Controller) {
    document.getElementById('pause')!.addEventListener('click', () => c.show('pause'));
    window.addEventListener('keydown', (e) => {
      if (this.current === 'levelup' && ['1', '2', '3'].includes(e.key)) c.choose(Number(e.key) - 1);
      if (e.key === 'Escape' || e.key === 'p') {
        if (this.current === null && c.run?.state === 'playing') c.show('pause');
        else if (this.current === 'pause') c.resume();
      }
    });
  }

  // -------------------------------------------------------------------------
  // HUD

  showHud(on: boolean): void {
    this.hud.hidden = !on;
  }

  updateHud(run: Run): void {
    const need = xpToNext(run.level);
    const fill = `scaleX(${Math.min(1, run.xp / need).toFixed(3)})`;
    if (this.xpFill.style.transform !== fill) this.xpFill.style.transform = fill;
    setText(this.levelEl, `Lv ${run.level}`);
    setText(this.clockEl, run.overtime ? `Overtime ${time(run.t - RUN_SECONDS)}` : clockText(run.t));
    setText(this.timerEl, time(run.t));
    setText(this.killsEl, fmt(run.kills));
    setText(this.crumbsEl, fmt(Math.floor(run.crumbs)));
    const boss = run.enemies.find((e) => e.def.boss);
    this.bossEl.hidden = !boss;
    if (boss) {
      setText(this.bossName, boss.def.name);
      this.bossFill.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100).toFixed(1)}%`;
    }
    this.hopEl.classList.toggle('cooling', run.t < run.hopReadyAt);
    const key = run.weapons.map((w) => `${w.id}${w.level}${w.evolved}`).join() + '|' + run.passives.map((p) => `${p.id}${p.level}`).join();
    if (key !== this.loadoutKey) {
      this.loadoutKey = key;
      this.loadout.replaceChildren(
        ...run.weapons.map((w) => h('span', { class: `slot${w.evolved ? ' evolved' : ''}`, title: WEAPON_BY_ID[w.id].name }, icon('weapon', w.id, 22, w.evolved), h('b', null, w.evolved ? '★' : String(w.level)))),
        ...run.passives.map((p) => h('span', { class: 'slot passive', title: PASSIVE_BY_ID[p.id].name }, icon('passive', p.id, 22), h('b', null, String(p.level)))),
      );
    }
  }

  warn(text: string, ms = 2200): void {
    setText(this.warningEl, text);
    this.warningEl.hidden = false;
    this.warningEl.classList.remove('show');
    void this.warningEl.offsetWidth;
    this.warningEl.classList.add('show');
    clearTimeout(this.warnTimer);
    this.warnTimer = window.setTimeout(() => (this.warningEl.hidden = true), ms);
  }

  // -------------------------------------------------------------------------
  // Screens

  show(screen: Screen, extra?: { summary?: RunSummary; banked?: Banked; dead?: boolean }): void {
    this.current = screen;
    this.screenEl.replaceChildren();
    this.screenEl.hidden = screen === null;
    this.screenEl.className = `screen screen-${screen ?? 'none'}`;
    if (!screen) return;
    const card = this.build(screen, extra);
    this.screenEl.append(card);
    card.querySelector<HTMLElement>('[data-focus]')?.focus();
    // A level-up can pop up under a thumb that's still steering: give it a
    // moment before a tap counts.
    if (screen === 'levelup') {
      const offers = [...card.querySelectorAll<HTMLButtonElement>('.offer')];
      for (const b of offers) b.classList.add('arming');
      window.setTimeout(() => offers.forEach((b) => b.classList.remove('arming')), 300);
    }
    requestAnimationFrame(() => {
      for (const cv of card.querySelectorAll<HTMLCanvasElement>('canvas[data-muffin]')) paintMuffin(cv, cv.dataset.muffin as MuffinId, (cv.dataset.face as 'happy') ?? 'happy', cv.dataset.locked === '1');
      for (const cv of card.querySelectorAll<HTMLCanvasElement>('canvas[data-enemy]')) paintEnemy(cv, cv.dataset.enemy as never);
    });
  }

  private build(screen: Exclude<Screen, null>, extra?: { summary?: RunSummary; banked?: Banked; dead?: boolean }): HTMLElement {
    switch (screen) {
      case 'title':
        return this.title();
      case 'select':
        return this.select();
      case 'pantry':
        return this.pantry();
      case 'records':
        return this.records();
      case 'levelup':
        return this.levelUp();
      case 'chest':
        return this.chest();
      case 'pause':
        return this.pause();
      case 'sunrise':
        return this.sunrise();
      case 'results':
        return this.results(extra!.summary!, extra!.banked!);
    }
  }

  private btn(label: string | Node, onclick: () => void, cls = 'btn', focus = false): HTMLButtonElement {
    return h('button', { class: cls, type: 'button', onclick, 'data-focus': focus || null }, label);
  }

  private title(): HTMLElement {
    const m = this.c.meta;
    return h(
      'div',
      { class: 'title' },
      h('h1', { class: 'wordmark' }, h('span', null, 'Last'), h('span', null, 'Muffin'), h('span', null, 'Standing')),
      h('canvas', { class: 'hero', 'data-muffin': m.muffin, 'aria-hidden': 'true' }),
      h('p', { class: 'tagline' }, 'Survive the night in the bakery. Everything wants to eat you.'),
      h(
        'div',
        { class: 'title-buttons' },
        this.btn(`Play as ${MUFFIN_BY_ID[m.muffin].name}`, () => this.c.start(), 'btn btn-big', true),
        h('div', { class: 'title-row' }, this.btn('Muffins', () => this.c.show('select'), 'btn btn-quiet'), this.btn('The Pantry', () => this.c.show('pantry'), 'btn btn-quiet')),
        this.btn('Records', () => this.c.show('records'), 'btn btn-quiet'),
      ),
      h('p', { class: 'title-foot' }, crumbsTag(m.crumbs), ' crumbs', m.wins ? ` · ${m.wins} ${m.wins === 1 ? 'sunrise' : 'sunrises'}` : ''),
    );
  }

  private select(): HTMLElement {
    const m = this.c.meta;
    const grid = h('div', { class: 'muffins' });
    for (const mu of MUFFINS) {
      const have = m.muffins.includes(mu.id);
      const picked = m.muffin === mu.id;
      const best = m.best[mu.id];
      const w = WEAPON_BY_ID[mu.weapon];
      const lockText = mu.price === 'win' ? 'Survive until sunrise to unlock' : `Unlock for ${fmt(mu.price)} crumbs`;
      grid.append(
        h(
          'button',
          {
            class: `muffin-card${picked ? ' picked' : ''}${have ? '' : ' locked'}`,
            type: 'button',
            'aria-pressed': String(picked),
            disabled: !have && !canUnlock(m, mu.id),
            onclick: () => (have ? this.c.pick(mu.id) : this.c.unlock(mu.id)),
          },
          h('canvas', { class: 'muffin-pic', 'data-muffin': mu.id, 'data-locked': have ? '0' : '1', 'aria-hidden': 'true' }),
          h('span', { class: 'muffin-name' }, have ? mu.name : '???'),
          have
            ? h('span', { class: 'muffin-weapon' }, icon('weapon', mu.weapon, 18), w.name)
            : h('span', { class: 'muffin-lock' }, mu.price === 'win' ? '🔒' : crumbsTag(mu.price)),
          h('span', { class: 'muffin-perk' }, have ? mu.perk : lockText),
          have && best ? h('span', { class: 'muffin-best' }, best.won ? '☀️ Made it to sunrise' : `Best: ${time(best.seconds)}`) : null,
        ),
      );
    }
    const mu = MUFFIN_BY_ID[m.muffin];
    return h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, this.btn('‹ Back', () => this.c.show('title'), 'btn-link'), h('h2', null, 'Pick a muffin'), h('span', { class: 'panel-crumbs' }, crumbsTag(m.crumbs))),
      grid,
      h('div', { class: 'panel-foot' }, this.btn(`Start the night as ${mu.name}`, () => this.c.start(), 'btn btn-big', true)),
    );
  }

  /** On/off switches for what the Pantry has automated. */
  private automationToggles(): HTMLElement | null {
    const m = this.c.meta;
    const rows: HTMLElement[] = [];
    const sw = (label: string, on: boolean, onclick: () => void) =>
      h('button', { class: 'toggle', type: 'button', role: 'switch', 'aria-checked': String(on), onclick }, h('span', null, label), h('span', { class: 'toggle-state' }, on ? 'On' : 'Off'));
    if (m.pantry.autopick) rows.push(sw('Recipe Book picks level-ups', m.autoPick, () => this.c.toggleAutoPick()));
    if (m.pantry.autohop) rows.push(sw('Auto-Hop', m.autoHop, () => this.c.toggleAutoHop()));
    return rows.length ? h('div', { class: 'toggles' }, ...rows) : null;
  }

  private pantry(): HTMLElement {
    const m = this.c.meta;
    const list = h('div', { class: 'pantry' });
    const auto = h('div', { class: 'pantry' });
    for (const p of PANTRY) {
      const level = m.pantry[p.id];
      const cost = pantryCost(m, p.id);
      const pips = h('span', { class: 'pips', 'aria-label': `Level ${level} of ${p.prices.length}` }, ...p.prices.map((_, i) => h('span', { class: `pip${i < level ? ' on' : ''}` })));
      (AUTOMATION.includes(p.id) ? auto : list).append(
        h(
          'div',
          { class: 'pantry-row' },
          h('span', { class: 'pantry-main' }, h('span', { class: 'pantry-name' }, p.name), h('span', { class: 'pantry-each' }, p.each), pips),
          cost === null
            ? h('span', { class: 'maxed' }, p.prices.length === 1 ? 'Owned' : 'Maxed')
            : h('button', { class: `buy${m.crumbs >= cost ? ' can' : ''}`, type: 'button', disabled: m.crumbs < cost, onclick: () => this.c.buy(p.id) }, crumbsTag(cost)),
        ),
      );
    }
    return h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, this.btn('‹ Back', () => this.c.show('title'), 'btn-link'), h('h2', null, 'The Pantry'), h('span', { class: 'panel-crumbs' }, crumbsTag(m.crumbs))),
      h('p', { class: 'note' }, 'Crumbs you bring home buy these. They last forever and help every muffin.'),
      list,
      h('h3', null, 'Automation'),
      h('p', { class: 'note' }, 'Less to do, more to watch. The Sous Chef passive, found while leveling up, fetches sprinkles for you too.'),
      auto,
      this.automationToggles(),
    );
  }

  private records(): HTMLElement {
    const m = this.c.meta;
    const rows = MUFFINS.filter((mu) => m.muffins.includes(mu.id)).map((mu) => {
      const b = m.best[mu.id];
      return h('li', null, h('span', null, mu.name), h('span', null, b ? (b.won ? `☀️ Sunrise · Lv ${b.level}` : `${time(b.seconds)} · Lv ${b.level}`) : '—'));
    });
    const evolved = h(
      'div',
      { class: 'collection' },
      ...WEAPONS.map((w) => {
        const got = m.evolved.includes(w.id);
        return h('span', { class: `collect${got ? '' : ' unknown'}`, title: got ? `${w.evolved.name}: ${w.name} + ${PASSIVE_BY_ID[w.evolvesWith].name}` : 'Not evolved yet' }, icon('weapon', w.id, 30, got), h('small', null, got ? w.evolved.name : '?'));
      }),
    );
    const pests = h(
      'div',
      { class: 'collection' },
      ...ENEMIES.filter((e) => e.id !== 'moldling').map((e) => {
        const met = m.met.includes(e.id);
        return h('span', { class: `collect${met ? '' : ' unknown'}` }, met ? h('canvas', { class: 'pest-pic', 'data-enemy': e.id, 'aria-hidden': 'true' }) : h('span', { class: 'pest-pic unknown-pic' }, '?'), h('small', null, met ? e.name : '?'));
      }),
    );
    let confirming = false;
    const erase = h('div', { class: 'erase' });
    const drawErase = () => {
      erase.replaceChildren(
        confirming
          ? h('div', { class: 'confirm' }, h('p', null, 'Erase every crumb, muffin and record? This cannot be undone.'), h('div', { class: 'confirm-row' }, this.btn('Keep it', () => ((confirming = false), drawErase()), 'btn btn-quiet'), this.btn('Erase save', () => this.c.eraseSave(), 'btn btn-danger')))
          : this.btn('Erase save…', () => ((confirming = true), drawErase()), 'btn btn-quiet'),
      );
    };
    drawErase();
    return h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, this.btn('‹ Back', () => this.c.show('title'), 'btn-link'), h('h2', null, 'Records')),
      h('dl', { class: 'stats' }, ...([['Runs', m.runs], ['Sunrises', m.wins], ['Pests squashed', m.kills]] as const).map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, fmt(v))))),
      h('h3', null, 'Best nights'),
      h('ul', { class: 'bests' }, ...rows),
      h('h3', null, 'Evolutions'),
      h('p', { class: 'note' }, 'A weapon at max level, plus the right passive, plus a pie tin from a boss.'),
      evolved,
      h('h3', null, 'Pests'),
      pests,
      h('h3', null, 'Settings'),
      h('button', { class: 'toggle', type: 'button', role: 'switch', 'aria-checked': String(m.sound), onclick: () => this.c.toggleSound() }, h('span', null, 'Sound'), h('span', { class: 'toggle-state' }, m.sound ? 'On' : 'Off')),
      this.automationToggles(),
      erase,
    );
  }

  private levelUp(): HTMLElement {
    const run = this.c.run!;
    const cards = run.offers.map((o, i) => {
      const t = offerText(o, run);
      return h(
        'button',
        { class: `offer${t.tag.startsWith('New') ? ' new' : ''}`, type: 'button', onclick: () => this.c.choose(i), 'data-focus': i === 0 || null },
        t.icon ?? h('span', { class: 'treat', 'aria-hidden': 'true' }, o.type === 'snack' ? '🧁' : '🥛'),
        h('span', { class: 'offer-main' }, h('span', { class: 'offer-name' }, t.name, h('span', { class: 'offer-tag' }, t.tag)), h('span', { class: 'offer-text' }, t.text)),
        h('kbd', { 'aria-hidden': 'true' }, String(i + 1)),
      );
    });
    return h(
      'div',
      { class: 'modal-card levelup', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lv-title' },
      h('p', { class: 'eyebrow' }, 'Level up'),
      h('h2', { id: 'lv-title' }, `Level ${run.level - run.levelUps + 1}!`),
      h('div', { class: 'offers' }, ...cards),
      h(
        'div',
        { class: 'offer-foot' },
        h('button', { class: 'btn btn-quiet', type: 'button', disabled: run.rerolls <= 0, title: run.rerolls ? null : 'Second Opinion in the Pantry gives rerolls', onclick: () => this.c.reroll() }, `Reroll (${run.rerolls})`),
        this.btn('Skip: +10 health', () => this.c.skip(), 'btn btn-quiet'),
      ),
      this.c.meta.pantry.autopick ? this.btn('📖 Let the Recipe Book pick from now on', () => this.c.toggleAutoPick(), 'btn-link') : null,
    );
  }

  private chest(): HTMLElement {
    const run = this.c.run!;
    const ch = run.chest!;
    const body: Node[] = [];
    if (ch.evolved) {
      const def = WEAPON_BY_ID[ch.evolved];
      body.push(h('div', { class: 'evolve' }, icon('weapon', ch.evolved, 34), h('span', { class: 'arrow' }, '→'), icon('weapon', ch.evolved, 54, true)), h('p', { class: 'big-line' }, `${def.name} evolved into ${def.evolved.name}!`), h('p', null, def.evolved.blurb));
    } else if (ch.upgrades.length) {
      body.push(h('ul', { class: 'chest-list' }, ...ch.upgrades.map((o) => h('li', null, offerText(o, run).icon ?? '', h('span', null, offerText(o, run).name, ' ', h('b', null, offerText(o, run).tag))))));
    } else {
      body.push(h('p', null, 'Just crumbs this time.'));
    }
    const evo = WEAPONS.find((w) => run.weapons.some((s) => s.id === w.id && !s.evolved));
    return h(
      'div',
      { class: 'modal-card chest-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'chest-title' },
      h('p', { class: 'eyebrow' }, 'Pie tin'),
      h('h2', { id: 'chest-title' }, ch.evolved ? 'Evolution!' : 'Freshly baked.'),
      ...body,
      h('p', { class: 'chest-crumbs' }, '+', crumbsTag(Math.round(ch.crumbs)), ' crumbs'),
      !ch.evolved && evo ? h('p', { class: 'note' }, `Tip: a weapon at level 5 plus its passive evolves in the next pie tin. ${evo.name} needs ${PASSIVE_BY_ID[evo.evolvesWith].name}.`) : null,
      this.btn('Nice', () => this.c.closeChest(), 'btn btn-big', true),
    );
  }

  private loadoutTable(run: { weapons: readonly { id: WeaponId; level: number; evolved: boolean; damage: number; kills: number }[] }): HTMLElement {
    const weapons = run.weapons;
    return h(
      'table',
      { class: 'damage' },
      h('thead', null, h('tr', null, h('th', null, 'Weapon'), h('th', null, 'Lv'), h('th', null, 'Damage'), h('th', null, 'Kills'))),
      h(
        'tbody',
        null,
        ...weapons.map((w) =>
          h(
            'tr',
            null,
            h('td', null, icon('weapon', w.id, 18, w.evolved), w.evolved ? WEAPON_BY_ID[w.id].evolved.name : WEAPON_BY_ID[w.id].name),
            h('td', null, w.evolved ? '★' : String(w.level)),
            h('td', null, fmt(w.damage)),
            h('td', null, fmt(w.kills)),
          ),
        ),
      ),
    );
  }

  private pause(): HTMLElement {
    const run = this.c.run!;
    const m = this.c.meta;
    return h(
      'div',
      { class: 'modal-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pause-title' },
      h('p', { class: 'eyebrow' }, `${clockText(run.t)} · Level ${run.level}`),
      h('h2', { id: 'pause-title' }, 'Paused'),
      this.loadoutTable(run),
      run.passives.length ? h('p', { class: 'passives-line' }, ...run.passives.map((p) => h('span', null, icon('passive', p.id, 18), `${PASSIVE_BY_ID[p.id].name} ${p.level}`))) : null,
      this.btn('Keep going', () => this.c.resume(), 'btn btn-big', true),
      h('div', { class: 'confirm-row' }, this.btn(`Sound: ${m.sound ? 'on' : 'off'}`, () => this.c.toggleSound(), 'btn btn-quiet'), this.btn('Give up', () => this.c.giveUp(), 'btn btn-quiet')),
      this.automationToggles(),
    );
  }

  private sunrise(): HTMLElement {
    const run = this.c.run!;
    return h(
      'div',
      { class: 'modal-card sunrise', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sun-title' },
      h('canvas', { class: 'modal-pic', 'data-muffin': run.muffin, 'data-face': 'bonk', 'aria-hidden': 'true' }),
      h('p', { class: 'eyebrow' }, '6:00 AM'),
      h('h2', { id: 'sun-title' }, 'Sunrise!'),
      h('p', null, `The bakery is open and the pests go home. ${MUFFIN_BY_ID[run.muffin].name} is still standing. +${WIN_CRUMBS} crumbs.`),
      this.btn('Head home', () => this.c.headHome(), 'btn btn-big', true),
      this.btn('Keep going (overtime)', () => this.c.keepGoing(), 'btn btn-quiet'),
      h('p', { class: 'note' }, 'Overtime: the pests keep coming, faster and tougher, until you go stale. Your crumbs are kept.'),
    );
  }

  private results(s: RunSummary, b: Banked): HTMLElement {
    const dead = !s.won;
    return h(
      'div',
      { class: 'modal-card results', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'res-title' },
      h('canvas', { class: 'modal-pic', 'data-muffin': s.muffin, 'data-face': dead ? 'dead' : 'happy', 'aria-hidden': 'true' }),
      h('p', { class: 'eyebrow' }, s.won ? (s.seconds > RUN_SECONDS + 1 ? `Overtime: ${time(s.seconds - RUN_SECONDS)}` : 'Made it to sunrise') : `Lasted until ${clockText(s.seconds)}`),
      h('h2', { id: 'res-title' }, s.won ? 'Still standing.' : DEATH_LINES[s.kills % DEATH_LINES.length]),
      s.won ? h('p', null, WIN_LINES[s.kills % WIN_LINES.length]) : null,
      h(
        'dl',
        { class: 'stats' },
        h('div', null, h('dt', null, 'Survived'), h('dd', null, time(s.seconds))),
        h('div', null, h('dt', null, 'Level'), h('dd', null, String(s.level))),
        h('div', null, h('dt', null, 'Pests squashed'), h('dd', null, fmt(s.kills))),
        h('div', null, h('dt', null, 'Bosses'), h('dd', null, String(s.bosses))),
      ),
      h('p', { class: 'big-line' }, '+', crumbsTag(b.crumbs), ' crumbs', b.newBest ? h('span', { class: 'best-tag' }, 'New best!') : null),
      b.unlocked.length ? h('p', { class: 'unlock-line' }, `Unlocked: ${b.unlocked.map((id) => MUFFIN_BY_ID[id].name).join(', ')}!`) : null,
      this.loadoutTable(s),
      h('div', { class: 'confirm-row' }, this.btn('Again', () => this.c.start(), 'btn btn-big', true), this.btn('The Pantry', () => this.c.show('pantry'), 'btn btn-quiet'), this.btn('Muffins', () => this.c.show('select'), 'btn btn-quiet')),
    );
  }
}
