// The screens between (and over) trading sessions: title, premarket,
// pause, the closing summary, the tools shop, records, settings and how to
// play. Each is rebuilt from the career whenever it's shown.
import { h } from '@shared/dom';
import { priceText } from './chart';
import {
  DAY_LENGTHS,
  GOAL,
  LOSS_LIMIT,
  RANKS,
  STOP_CHOICES,
  TARGET_CHOICES,
  TOOLS,
  rankFor,
  type DayLength,
  type ToolId,
} from './defs';
import { money, pctText, signed } from './hud';
import type { Market } from './market';
import { canBuy, has, leverage, type Career, type DaySummary, type Settings } from './meta';

export type Screen = 'title' | 'premarket' | 'pause' | 'summary' | 'tools' | 'records' | 'settings' | 'help';

export interface Controller {
  readonly career: Career;
  /** Today's market, built at premarket. */
  readonly today: Market | null;
  readonly summary: DaySummary | null;
  show(s: Screen): void;
  back(): void;
  premarket(): void;
  ringBell(): void;
  resume(): void;
  endEarly(): void;
  buyTool(id: ToolId): void;
  set<K extends keyof Settings>(k: K, v: Settings[K]): void;
  resetCareer(): void;
}

const btn = (label: string, onclick: () => void, cls = 'btn'): HTMLButtonElement => h('button', { class: cls, type: 'button', onclick }, label);
const vibe = (vol: number): string => (vol >= 0.1 ? 'Wild' : vol >= 0.06 ? 'Lively' : vol >= 0.035 ? 'Steady' : 'Sleepy');

function rankCard(c: Career): HTMLElement {
  const r = rankFor(c.cash);
  const lo = RANKS[r.i].at;
  const k = r.next ? Math.min(1, Math.max(0, (c.cash - lo) / (r.next - lo))) : 1;
  const bar = h('span', { class: 'bar' }, h('span', { class: 'bar-fill' }));
  (bar.firstChild as HTMLElement).style.transform = `scaleX(${k})`;
  return h(
    'div',
    { class: 'card career' },
    h('div', { class: 'career-row' }, h('span', { class: 'rank' }, r.name), h('span', { class: 'cash' }, money(c.cash))),
    bar,
    h('div', { class: 'career-row small' }, h('span', null, `Day ${c.day}`), c.streak > 1 ? h('span', null, `🔥 ${c.streak} green days`) : h('span', null, r.next ? `Next: ${RANKS[r.i + 1].name} at ${money(r.next, false)}` : 'Top of the street')),
  );
}

export function render(s: Screen, g: Controller): HTMLElement {
  switch (s) {
    case 'title':
      return title(g);
    case 'premarket':
      return premarket(g);
    case 'pause':
      return pause(g);
    case 'summary':
      return summary(g);
    case 'tools':
      return tools(g);
    case 'records':
      return records(g);
    case 'settings':
      return settings(g);
    case 'help':
      return help(g);
  }
}

function title(g: Controller): HTMLElement {
  const c = g.career;
  return h(
    'div',
    { class: 'panel title' },
    h('h1', { class: 'logo' }, h('span', null, 'TICKER'), h('span', null, 'RUSH')),
    h('p', { class: 'tag' }, 'Day trade a make-believe market in real time. Fake money, real adrenaline.'),
    rankCard(c),
    btn(`Start day ${c.day}`, () => g.premarket(), 'btn primary big'),
    h('div', { class: 'row' }, btn('Tools', () => g.show('tools')), btn('Records', () => g.show('records')), btn('How to play', () => g.show('help')), btn('Settings', () => g.show('settings'))),
    h('p', { class: 'fine' }, 'Every company here is made up. Not financial advice, obviously.'),
  );
}

function premarket(g: Controller): HTMLElement {
  const c = g.career;
  const m = g.today;
  const start = c.cash;
  const list = m
    ? m.tickers.map((tk) => {
        const gap = tk.open / tk.prev - 1;
        const news = m.news.find((n) => n.kind === 'gap' && n.id === tk.def.id);
        return h(
          'li',
          { class: news ? 'gapper' : '' },
          h('div', { class: 'pm-top' }, h('b', { class: 'pm-id' }, tk.def.id), h('span', { class: 'pm-name' }, tk.def.name), h('span', { class: 'pm-vibe', 'data-vibe': vibe(tk.def.vol) }, vibe(tk.def.vol))),
          h('div', { class: 'pm-px' }, h('span', null, `Prev ${priceText(tk.prev)}`), h('span', { 'data-tone': gap > 0.001 ? 'up' : gap < -0.001 ? 'down' : 'flat' }, `Pre ${priceText(tk.open)} ${pctText(gap)}`)),
          news ? h('p', { class: 'pm-news', 'data-tone': news.sign > 0 ? 'up' : 'down' }, `📰 ${news.text}`) : h('p', { class: 'pm-blurb' }, tk.def.blurb),
        );
      })
    : [];
  const lev = leverage(c);
  return h(
    'div',
    { class: 'panel premarket' },
    h('header', { class: 'pm-head' }, h('span', { class: 'eyebrow' }, `Day ${c.day} · Premarket`), h('h2', null, "Today's watchlist")),
    h('ol', { class: 'pm-list' }, ...list),
    h(
      'div',
      { class: 'pm-rules' },
      h('span', null, h('b', null, 'Goal '), signed(start * GOAL, false)),
      h('span', null, h('b', null, 'Risk limit '), `−${money(start * LOSS_LIMIT, false)}`),
      h('span', null, h('b', null, 'Margin '), `${lev}×`),
      h('span', null, h('b', null, 'Session '), DAY_LENGTHS[c.settings.length].name),
    ),
    btn('🔔 Ring the opening bell', () => g.ringBell(), 'btn primary big'),
    h('div', { class: 'row' }, btn('Tools', () => g.show('tools')), btn('Menu', () => g.show('title'))),
  );
}

function pause(g: Controller): HTMLElement {
  return h(
    'div',
    { class: 'panel pause' },
    h('h2', null, 'Paused'),
    h('p', { class: 'muted' }, 'The market waits for you. (It never does in real life.)'),
    btn('Resume', () => g.resume(), 'btn primary big'),
    h('div', { class: 'row' }, btn('How to play', () => g.show('help')), btn('Settings', () => g.show('settings'))),
    btn('Close everything and end the day', () => g.endEarly(), 'btn danger'),
  );
}

function summary(g: Controller): HTMLElement {
  const s = g.summary;
  const c = g.career;
  if (!s) return title(g);
  const notes: HTMLElement[] = [];
  if (s.goal) notes.push(h('li', { 'data-tone': 'up' }, `🎯 Goal hit: ${pctText(GOAL)} or better.`));
  if (s.streak > 1) notes.push(h('li', { 'data-tone': 'up' }, `🔥 ${s.streak} green days in a row.`));
  if (s.locked) notes.push(h('li', { 'data-tone': 'down' }, '🔒 The risk desk took your keys after a 10% drawdown.'));
  if (s.blown) notes.push(h('li', { 'data-tone': 'down' }, `💥 Account blown. The firm staked you a fresh ${money(c.cash, false)}.`));
  if (s.rankAfter !== s.rankBefore && !s.blown) notes.push(h('li', { 'data-tone': s.equity > s.start ? 'up' : 'down' }, `${s.equity > s.start ? '⭐ Promoted' : '📉 Demoted'}: ${s.rankAfter}.`));
  if (s.trades === 0) notes.push(h('li', null, 'No trades today. Sometimes the best trade is none... but not every day.'));
  const trade = (label: string, t: DaySummary['best']) =>
    t ? h('div', { class: 'tr' }, h('span', null, label), h('b', null, `${t.id} ${t.side}`), h('span', { 'data-tone': t.pnl >= 0 ? 'up' : 'down' }, signed(t.pnl))) : '';
  const hist = c.history.slice(-14);
  const peak = Math.max(1e-9, ...hist.map((d) => Math.abs(d.pct)));
  return h(
    'div',
    { class: 'panel summary' },
    h('span', { class: 'eyebrow' }, `Day ${s.day} · Closing bell`),
    h('div', { class: 'grade', 'data-grade': s.grade }, s.grade),
    h('div', { class: 'big-pnl', 'data-tone': s.pnl > 0 ? 'up' : s.pnl < 0 ? 'down' : 'flat' }, signed(s.pnl)),
    h('div', { class: 'muted' }, `${pctText(s.pct)} · account ${money(s.equity)}`),
    h('div', { class: 'stats-row' }, h('span', null, h('b', null, String(s.trades)), ' trades'), h('span', null, h('b', null, s.trades ? `${Math.round((s.wins / s.trades) * 100)}%` : '—'), ' wins'), h('span', null, h('b', null, money(s.fees)), ' fees')),
    s.trades ? h('div', { class: 'trades' }, trade('Best', s.best), s.trades > 1 ? trade('Worst', s.worst) : '') : '',
    notes.length ? h('ul', { class: 'notes' }, ...notes) : '',
    hist.length > 1
      ? h(
          'div',
          { class: 'hist', 'aria-label': 'Recent days' },
          ...hist.map((d) => {
            const bar = h('i', { 'data-tone': d.pnl >= 0 ? 'up' : 'down', title: `Day ${d.day}: ${pctText(d.pct)}` });
            bar.style.height = `${Math.max(6, (Math.abs(d.pct) / peak) * 100)}%`;
            return bar;
          }),
        )
      : '',
    btn(`Day ${c.day} →`, () => g.premarket(), 'btn primary big'),
    h('div', { class: 'row' }, btn('Tools', () => g.show('tools')), btn('Menu', () => g.show('title'))),
  );
}

function tools(g: Controller): HTMLElement {
  const c = g.career;
  return h(
    'div',
    { class: 'panel tools' },
    h('header', { class: 'pm-head' }, h('span', { class: 'eyebrow' }, 'Tools'), h('h2', null, 'Upgrade your desk'), h('p', { class: 'muted' }, `Paid from your account: ${money(c.cash)}. Yours for good, even if you blow up.`)),
    h(
      'ul',
      { class: 'tool-list' },
      ...TOOLS.map((t) => {
        const state = canBuy(c, t.id);
        const label = state === 'owned' ? 'Owned' : state === 'needs' ? `Needs ${TOOLS.find((x) => x.id === t.needs)!.name}` : money(t.cost, false);
        const b = btn(label, () => g.buyTool(t.id), `btn ${state === 'ok' ? 'primary' : ''}`);
        b.disabled = state !== 'ok';
        return h('li', { class: state === 'owned' ? 'owned' : '' }, h('div', null, h('b', null, t.name), h('p', null, t.blurb)), b);
      }),
    ),
    btn('Back', () => g.back()),
  );
}

function records(g: Controller): HTMLElement {
  const c = g.career;
  const st = c.stats;
  const rows: [string, string][] = [
    ['Days traded', String(st.days)],
    ['Green days', st.days ? `${st.green} (${Math.round((st.green / st.days) * 100)}%)` : '—'],
    ['Best streak', `${st.bestStreak} days`],
    ['Goals hit', String(st.goals)],
    ['Trades', String(st.trades)],
    ['Win rate', st.trades ? `${Math.round((st.wins / st.trades) * 100)}%` : '—'],
    ['Best day', signed(st.bestDay)],
    ['Worst day', signed(st.worstDay)],
    ['Best trade', signed(st.bestTrade)],
    ['Worst trade', signed(st.worstTrade)],
    ['Fees paid', money(st.fees)],
    ['Halts seen', String(st.halts)],
    ['Peak account', money(st.peak)],
    ['Accounts blown', String(st.blown)],
  ];
  return h(
    'div',
    { class: 'panel records' },
    h('header', { class: 'pm-head' }, h('span', { class: 'eyebrow' }, 'Records'), h('h2', null, rankFor(c.cash).name)),
    h('dl', { class: 'stats' }, ...rows.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
    btn('Back', () => g.back()),
  );
}

function settings(g: Controller): HTMLElement {
  const c = g.career;
  const s = c.settings;
  const seg = <T extends string | number>(label: string, options: readonly T[], current: T, name: (v: T) => string, pick: (v: T) => void, note?: string) =>
    h(
      'div',
      { class: 'setting' },
      h('span', { class: 'setting-name' }, label),
      h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label }, ...options.map((v) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === current), class: v === current ? 'on' : '', onclick: () => pick(v) }, name(v)))),
      note ? h('small', { class: 'muted' }, note) : '',
    );
  const lengths = Object.keys(DAY_LENGTHS) as DayLength[];
  const brackets = has(c, 'brackets');
  return h(
    'div',
    { class: 'panel settings' },
    h('header', { class: 'pm-head' }, h('span', { class: 'eyebrow' }, 'Settings')),
    seg('Sound', [true, false].map(String), String(s.sound), (v) => (v === 'true' ? 'On' : 'Off'), (v) => g.set('sound', v === 'true')),
    seg('Haptics', [true, false].map(String), String(s.haptics), (v) => (v === 'true' ? 'On' : 'Off'), (v) => g.set('haptics', v === 'true')),
    seg('Session length', lengths, s.length, (v) => DAY_LENGTHS[v].name, (v) => g.set('length', v), 'Longer sessions give you more time to react. Takes effect from the next day.'),
    seg('Stop loss', STOP_CHOICES, s.stop, (v) => `${v * 100}%`, (v) => g.set('stop', v), brackets ? 'How far it can go against you before the desk sells.' : 'Needs Bracket orders (Tools).'),
    seg('Take profit', TARGET_CHOICES, s.target, (v) => `${v * 100}%`, (v) => g.set('target', v), brackets ? 'How far it can run your way before the desk sells.' : undefined),
    btn('Back', () => g.back()),
    btn('Reset career', () => {
      if (confirm('Start over with $10,000? Tools and records go too.')) g.resetCareer();
    }, 'btn danger subtle'),
  );
}

function help(g: Controller): HTMLElement {
  const tips: [string, string][] = [
    ['The day', 'A whole session, 9:30 to 4:00, runs in a few minutes. Everything closes at the bell: day traders don\'t hold overnight.'],
    ['Buy and short', 'BUY if you think it\'s going up, SHORT if you think it\'s going down. The other button closes the position. Size is a share of your buying power.'],
    ['News moves prices', 'Headlines hit the wire and the price reacts a moment later. Be quick. Rumors get denied, and good earnings sometimes get sold anyway.'],
    ['Trends', 'Stocks chop around VWAP (the yellow line), then trend for a while. Ride the trends, don\'t fight them.'],
    ['Halts', 'Move too far too fast and a stock freezes for a bit, then reopens with a jump. You can\'t trade it while it\'s halted.'],
    ['Gappers', 'A stock or two opens far from yesterday on overnight news. Some keep going, some fill the gap.'],
    ['Power hour', 'The last hour gets busy again. The bell closes everything at market.'],
    ['The risk desk', `Lose ${LOSS_LIMIT * 100}% of your account in a day and they take your keys until tomorrow. Below $1,000 at the bell, the account is blown and the firm stakes you a new one.`],
    ['Keys', 'B buy · S sell/short · X close · F flatten all · 1–4 size · ←/→ switch stock · P pause'],
  ];
  return h(
    'div',
    { class: 'panel help' },
    h('header', { class: 'pm-head' }, h('span', { class: 'eyebrow' }, 'How to play')),
    h('dl', { class: 'tips' }, ...tips.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
    btn('Got it', () => g.back(), 'btn primary'),
  );
}
