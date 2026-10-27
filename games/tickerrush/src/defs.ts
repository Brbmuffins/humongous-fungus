// Ticker Rush: the content. Every company, headline, tool and rank lives
// here; the market (market.ts) and your trading desk (desk.ts) read from it.
// All companies are made up, and all of them are food.

export type StockId = 'MUFN' | 'SPUD' | 'SYRP' | 'PIKL' | 'DOUGH' | 'BRGR' | 'FRYR' | 'OVEN' | 'SNAK' | 'OINK' | 'CHEF' | 'FZZY';
export type Sector = 'tech' | 'meme' | 'bio' | 'crypto' | 'consumer' | 'energy' | 'finance' | 'utility';

export interface StockDef {
  id: StockId;
  name: string;
  sector: Sector;
  /** A typical whole-day move (log sigma over the 390-minute session). */
  vol: number;
  /** How much it follows the index. */
  beta: number;
  /** Starting price range for a new career. */
  price: readonly [number, number];
  /** Bid/ask spread, in basis points of the price. */
  spreadBps: number;
  /** Dollars that trade freely: an order moves the price by IMPACT × notional / liquidity. */
  liquidity: number;
  /** A move this big inside 5 minutes halts it. */
  band: number;
  /** Meme stocks can squeeze. */
  meme: boolean;
  /** How often news hits it, relative to the others. */
  newsy: number;
  blurb: string;
}

export const STOCKS: readonly StockDef[] = [
  { id: 'MUFN', name: 'Muffin Top Holdings', sector: 'meme', vol: 0.14, beta: 1.6, price: [18, 40], spreadBps: 10, liquidity: 6e6, band: 0.07, meme: true, newsy: 1.6, blurb: "The internet's favorite bakery stock. Mostly owned by people who post rocket emojis." },
  { id: 'SPUD', name: 'Spudnik Chips', sector: 'tech', vol: 0.06, beta: 1.4, price: [80, 160], spreadBps: 3, liquidity: 4e7, band: 0.055, meme: false, newsy: 1, blurb: 'Computer chips. They started out making the potato kind. Moves with the whole market, only more.' },
  { id: 'SYRP', name: 'Maple Syrup Power & Light', sector: 'utility', vol: 0.02, beta: 0.4, price: [40, 70], spreadBps: 2, liquidity: 5e7, band: 0.035, meme: false, newsy: 0.6, blurb: 'Pipes syrup to every home in town. Dividends. Nothing ever happens here. Usually.' },
  { id: 'PIKL', name: 'Big Dill Pharma', sector: 'bio', vol: 0.09, beta: 0.6, price: [4, 14], spreadBps: 16, liquidity: 3e6, band: 0.07, meme: false, newsy: 1.3, blurb: 'One pickle-based drug in trials. The FDA decides everything.' },
  { id: 'DOUGH', name: 'Dough Coin Trust', sector: 'crypto', vol: 0.12, beta: 1.2, price: [1.5, 6], spreadBps: 24, liquidity: 2.5e6, band: 0.07, meme: true, newsy: 1.4, blurb: 'A trust holding a coin backed by cookie dough. Do not ask what it does.' },
  { id: 'BRGR', name: 'Burger Barn', sector: 'consumer', vol: 0.03, beta: 0.8, price: [25, 55], spreadBps: 4, liquidity: 2e7, band: 0.045, meme: false, newsy: 0.9, blurb: 'Burgers. Same-store sales and the price of beef.' },
  { id: 'FRYR', name: 'Deep Fryer Oil Co', sector: 'energy', vol: 0.04, beta: 0.9, price: [60, 95], spreadBps: 3, liquidity: 3e7, band: 0.045, meme: false, newsy: 1, blurb: 'Fryer oil for the whole planet. Lives and dies by the Fryer Oil Cartel.' },
  { id: 'OVEN', name: 'Smart Oven Labs', sector: 'tech', vol: 0.07, beta: 1.3, price: [120, 260], spreadBps: 3, liquidity: 3e7, band: 0.055, meme: false, newsy: 1, blurb: 'Wi-Fi ovens that text you when the toast is done. Earnings days are a coin flip.' },
  { id: 'SNAK', name: 'Snack Attack Games', sector: 'tech', vol: 0.08, beta: 1.2, price: [20, 45], spreadBps: 7, liquidity: 1e7, band: 0.06, meme: false, newsy: 1.1, blurb: 'Video games about snacks. A delay is a disaster; a trailer is a party.' },
  { id: 'OINK', name: 'Piggy Bank Corp', sector: 'finance', vol: 0.03, beta: 1, price: [35, 60], spreadBps: 2, liquidity: 4e7, band: 0.045, meme: false, newsy: 0.8, blurb: "A bank. It's shaped like a pig. Watch the Fed." },
  { id: 'CHEF', name: 'Robo Chef', sector: 'meme', vol: 0.11, beta: 1.5, price: [8, 22], spreadBps: 12, liquidity: 5e6, band: 0.07, meme: true, newsy: 1.4, blurb: 'Says "AI" forty times per earnings call. The robot flips one pancake.' },
  { id: 'FZZY', name: 'Fizzy Pop Co', sector: 'consumer', vol: 0.025, beta: 0.6, price: [50, 80], spreadBps: 3, liquidity: 3e7, band: 0.045, meme: false, newsy: 0.7, blurb: 'Soda. Steady, sweet, a little flat.' },
];

export const STOCK: Record<StockId, StockDef> = Object.fromEntries(STOCKS.map((s) => [s.id, s])) as Record<StockId, StockDef>;

// ---------------------------------------------------------------------------
// The session

/** 9:30 to 4:00. */
export const DAY_MINUTES = 390;
/** The sim moves in steps of this many market minutes (6 seconds). */
export const STEP = 0.1;
/** Each candle is 5 market minutes. */
export const CANDLE = 5;
/** Power hour: the last hour gets busier. */
export const POWER_HOUR = 330;
/** A halted stock stays frozen this long. */
export const HALT_MINUTES = 10;
/** The index everything leans on. */
export const INDEX_VOL = 0.012;

export type DayLength = 'blitz' | 'normal' | 'chill';
/** Real seconds for a whole session. */
export const DAY_LENGTHS: Record<DayLength, { name: string; seconds: number }> = {
  blitz: { name: 'Blitz · 2½ min', seconds: 150 },
  normal: { name: 'Normal · 4 min', seconds: 240 },
  chill: { name: 'Chill · 6 min', seconds: 360 },
};

// ---------------------------------------------------------------------------
// The desk

export const START_CASH = 10_000;
/** Lose this much of the day's starting equity and the risk desk takes your keys. */
export const LOSS_LIMIT = 0.1;
/** A good day: up this much. */
export const GOAL = 0.03;
/** Below this at the bell, the account is blown and you start over. */
export const BLOWN_BELOW = 1_000;
/** Commission per share, with a minimum per order and a cap of 1% of the order. */
export const FEE_PER_SHARE = 0.005;
export const FEE_MIN = 1;
/** How hard your own orders push the price. */
export const IMPACT = 0.1;
export const BASE_LEVERAGE = 2;
export const BASE_SLOTS = 5;

export type SizeId = 'tenth' | 'quarter' | 'half' | 'max';
/** Order size, as a share of your biggest possible position. */
export const SIZES: Record<SizeId, { name: string; share: number }> = {
  tenth: { name: '10%', share: 0.1 },
  quarter: { name: '25%', share: 0.25 },
  half: { name: '50%', share: 0.5 },
  max: { name: 'MAX', share: 1 },
};
export const SIZE_ORDER: readonly SizeId[] = ['tenth', 'quarter', 'half', 'max'];

/** Bracket orders: stop loss and take profit, as a fraction of the entry. */
export const STOP_CHOICES = [0.01, 0.02, 0.03, 0.05] as const;
export const TARGET_CHOICES = [0.02, 0.04, 0.06, 0.1] as const;

// ---------------------------------------------------------------------------
// Tools: bought with account cash, kept for the career and the next.

export type ToolId = 'brackets' | 'level2' | 'squawk' | 'feecut' | 'scanner' | 'margin4' | 'margin6';

export interface ToolDef {
  id: ToolId;
  name: string;
  cost: number;
  blurb: string;
  needs?: ToolId;
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'brackets', name: 'Bracket orders', cost: 1_000, blurb: 'Every entry gets a stop loss and a take profit, so the desk sells for you. Pick the distances in Settings.' },
  { id: 'level2', name: 'Level 2 & tape', cost: 1_500, blurb: 'Watch every print. Whale-size orders show up just before a stock starts trending.' },
  { id: 'feecut', name: 'Pro pricing', cost: 3_000, blurb: 'Half price commission on every order.' },
  { id: 'scanner', name: 'Scanner', cost: 4_000, blurb: 'Seven tickers on your watchlist instead of five, and alerts when one halts.' },
  { id: 'squawk', name: 'News squawk', cost: 6_000, blurb: 'Headlines reach you a beat before the price reacts. Front-run the crowd.' },
  { id: 'margin4', name: '4× margin', cost: 8_000, blurb: 'Your buying power is four times your account instead of two. Gains and losses, both.' },
  { id: 'margin6', name: '6× margin', cost: 40_000, blurb: 'Six times. The risk desk is nervous.', needs: 'margin4' },
];

export const TOOL: Record<ToolId, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<ToolId, ToolDef>;

/** Extra market minutes of warning that News squawk gives. */
export const SQUAWK_LEAD = 1;

// ---------------------------------------------------------------------------
// Ranks, by account size.

export const RANKS: readonly { name: string; at: number }[] = [
  { name: 'Intern', at: 0 },
  { name: 'Junior trader', at: 25_000 },
  { name: 'Trader', at: 100_000 },
  { name: 'Senior trader', at: 500_000 },
  { name: 'Desk head', at: 2_500_000 },
  { name: 'Whale', at: 10_000_000 },
  { name: 'Market legend', at: 100_000_000 },
];

export function rankFor(equity: number): { name: string; i: number; next: number | null } {
  let i = 0;
  while (i + 1 < RANKS.length && equity >= RANKS[i + 1].at) i++;
  return { name: RANKS[i].name, i, next: RANKS[i + 1]?.at ?? null };
}

// ---------------------------------------------------------------------------
// News. {name} is the company, {id} the ticker, {bank} an analyst,
// {pt} a price target, {eps} and {est} earnings numbers.

export type NewsSize = 'small' | 'medium' | 'big';
export type NewsKind = 'analyst' | 'earnings' | 'product' | 'ceo' | 'fda' | 'crypto' | 'oil' | 'macro' | 'rumor' | 'legal' | 'meme';

export interface NewsTemplate {
  kind: NewsKind;
  sign: 1 | -1;
  size: NewsSize;
  text: string;
  /** Only these sectors get it (all if missing). */
  sectors?: readonly Sector[];
  /** Might be denied a few minutes later. */
  rumor?: boolean;
}

/** The size of a move, as a share of the stock's daily vol. */
export const NEWS_MOVE: Record<NewsSize, number> = { small: 0.15, medium: 0.29, big: 0.54 };
/** Chance a rumor gets denied, and an earnings beat gets sold anyway. */
export const DENY_CHANCE = 0.4;
export const SELL_THE_NEWS = 0.25;

export const BANKS = ['Goldman Snacks', 'Merrill Lunch', 'Bank of Americano', 'Crumb Suisse', 'J.P. Muffin', 'Morgan Scone-ly', 'Wells Fargo-nzola'];

export const NEWS: readonly NewsTemplate[] = [
  { kind: 'analyst', sign: 1, size: 'medium', text: '{bank} upgrades {id} to Buy, price target ${pt}' },
  { kind: 'analyst', sign: 1, size: 'small', text: '{bank} raises its {id} target to ${pt}' },
  { kind: 'analyst', sign: -1, size: 'medium', text: '{bank} downgrades {id} to Sell, target ${pt}' },
  { kind: 'analyst', sign: -1, size: 'small', text: '{bank} trims its {id} target to ${pt}' },
  { kind: 'earnings', sign: 1, size: 'big', text: '{name} smashes earnings: EPS ${eps} vs ${est} expected' },
  { kind: 'earnings', sign: -1, size: 'big', text: '{name} misses on revenue and cuts guidance' },
  { kind: 'product', sign: 1, size: 'medium', text: '{name} lands a $2 billion government contract', sectors: ['tech', 'energy', 'meme', 'finance'] },
  { kind: 'product', sign: 1, size: 'medium', text: '{name} unveils its new flagship. Pre-orders crash the website', sectors: ['tech', 'meme', 'consumer'] },
  { kind: 'product', sign: 1, size: 'medium', text: "{name}'s new flavor sells out in an hour", sectors: ['consumer', 'meme'] },
  { kind: 'product', sign: -1, size: 'medium', text: "{name}'s new flavor is mayo crunch. Nobody asked", sectors: ['consumer', 'meme'] },
  { kind: 'product', sign: -1, size: 'small', text: 'The health inspector visited {name}. It did not go well', sectors: ['consumer', 'meme'] },
  { kind: 'product', sign: -1, size: 'medium', text: '{name} recalls 40,000 units over "a smell"', sectors: ['tech', 'meme', 'consumer'] },
  { kind: 'product', sign: -1, size: 'big', text: '{name} delays its big launch to next year', sectors: ['tech', 'meme'] },
  { kind: 'ceo', sign: 1, size: 'small', text: '{name} CEO tweets a rocket emoji', sectors: ['meme', 'crypto', 'tech'] },
  { kind: 'ceo', sign: 1, size: 'medium', text: '{name} CEO buys $5 million of stock', },
  { kind: 'ceo', sign: -1, size: 'medium', text: '{name} CEO quits "to spend more time with my yacht"' },
  { kind: 'ceo', sign: -1, size: 'small', text: 'Filing: {name} CEO sold shares last week' },
  { kind: 'fda', sign: 1, size: 'big', text: "FDA approves {name}'s pickle-based drug", sectors: ['bio'] },
  { kind: 'fda', sign: -1, size: 'big', text: "FDA rejects {name}'s trial data. Too briny", sectors: ['bio'] },
  { kind: 'fda', sign: 1, size: 'medium', text: '{name} trial hits its main goal early', sectors: ['bio'] },
  { kind: 'crypto', sign: 1, size: 'big', text: 'A big payment app now takes Dough Coin', sectors: ['crypto'] },
  { kind: 'crypto', sign: -1, size: 'big', text: 'Exchange hack spooks crypto traders', sectors: ['crypto'] },
  { kind: 'crypto', sign: 1, size: 'medium', text: 'Dough Coin passes Bagel Coin in market cap', sectors: ['crypto'] },
  { kind: 'crypto', sign: -1, size: 'medium', text: 'Someone sold 40 billion Dough Coins at once', sectors: ['crypto'] },
  { kind: 'oil', sign: 1, size: 'medium', text: 'The Fryer Oil Cartel surprises with an output cut', sectors: ['energy'] },
  { kind: 'oil', sign: -1, size: 'medium', text: 'Fryer oil stockpiles balloon. Prices slide', sectors: ['energy'] },
  { kind: 'oil', sign: 1, size: 'small', text: '{name} finds a giant olive grove', sectors: ['energy'] },
  { kind: 'legal', sign: -1, size: 'medium', text: '{name} hit with an antitrust probe' },
  { kind: 'legal', sign: 1, size: 'medium', text: '{name} wins its patent case' },
  { kind: 'legal', sign: -1, size: 'small', text: 'Regulators fine {name} $40 million' },
  { kind: 'rumor', sign: 1, size: 'big', text: 'RUMOR: {name} in buyout talks', rumor: true },
  { kind: 'rumor', sign: -1, size: 'medium', text: 'RUMOR: short seller report coming on {id}', rumor: true },
  { kind: 'rumor', sign: 1, size: 'medium', text: 'RUMOR: {name} joining the big index', rumor: true },
  { kind: 'meme', sign: 1, size: 'medium', text: '{id} is the #1 ticker on r/wallstreetbakes', sectors: ['meme', 'crypto'] },
  { kind: 'meme', sign: -1, size: 'medium', text: 'Big meme account says it sold all its {id}', sectors: ['meme', 'crypto'] },
];

export const MACRO: readonly NewsTemplate[] = [
  { kind: 'macro', sign: 1, size: 'medium', text: 'Fed chair hints at a rate cut' },
  { kind: 'macro', sign: -1, size: 'medium', text: 'Inflation runs hotter than expected' },
  { kind: 'macro', sign: 1, size: 'small', text: 'Jobs report blows past forecasts' },
  { kind: 'macro', sign: -1, size: 'small', text: 'Bond yields jump to a 16-year high' },
  { kind: 'macro', sign: 1, size: 'small', text: 'Trade deal reached, says the White House' },
  { kind: 'macro', sign: -1, size: 'medium', text: 'Recession warning from the big banks' },
  { kind: 'macro', sign: -1, size: 'small', text: 'Butter hits a record high. Bakers panic' },
  { kind: 'macro', sign: 1, size: 'small', text: 'Sugar tariffs scrapped overnight' },
];

/** A macro headline moves the index by this much (log). */
export const MACRO_MOVE: Record<NewsSize, number> = { small: 0.004, medium: 0.008, big: 0.014 };

/** Follow-ups that undo a move. */
export const DENIALS = ['{name} denies the report', '{name}: "no comment", says a spokesperson, then denies it', 'False alarm: the {id} story was a fake account'];
export const SOLD_NEWS = ['{id} guidance disappoints on the call', '{id} gives back the pop: "priced in"', 'Sell the news: {id} slides as the call drags on'];
export const SQUEEZE_NEWS = ['Short interest in {id} tops 140%', '{id} short squeeze! Shorts scramble to cover', '{id} options volume goes vertical'];
export const GAP_NEWS: Record<1 | -1, readonly string[]> = {
  1: ['{name} beat earnings overnight', 'Overnight: {name} to be bought out at a premium', '{bank} names {id} its top pick'],
  [-1]: ['{name} missed earnings overnight', 'Overnight: {name} under investigation', '{name} cut its forecast after the close'],
};
