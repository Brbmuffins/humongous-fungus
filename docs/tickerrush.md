# Ticker Rush — design notes

Day trading as an arcade game. A whole session, 9:30 to 4:00, runs in about
three minutes of real time on a make-believe market where every company is
food. You watch five tickers,
read the news as it hits, and go long or short with a couple of taps. At the
bell everything closes and the day is booked. Fake companies, fake money: it's
a game, not a simulator, and nothing in it is advice.

It's a cousin of Sporemonger (the mushroom-market trader): that one is slow and
idle, with prices that move every few seconds and goods that rot. This one is
all about the next ten seconds.

## A day

- **Premarket.** Today's watchlist: five tickers picked from twelve, always
  with at least one wild one and one calm one. A gapper or two opens far from
  yesterday's close on overnight news. Your goal (+3%) and risk limit (−10%)
  for the day are shown.
- **The session.** 390 market minutes in 3 real minutes (Normal), 2 (Blitz) or
  5 (Chill). Prices update about twenty times a second, in 5-minute candles.
  The session bar and the goal meter under your P&L show where the day is and
  where you stand.
- **The bell.** Every position closes at market. The summary grades the day
  (A+ to F), lists your best and worst trades, and keeps the last 14 days as
  bars.

A day in progress is checkpointed every candle. Close the app mid-session
and, when you come back, the desk has closed you out at the last checkpoint
(no replaying a bad day).

## The companies (`STOCKS` in `src/defs.ts`)

Twelve, all made up and all food, each with its own personality:

| Ticker | Company | Feels like |
|---|---|---|
| MUFN | Muffin Top Holdings | The meme stock: wild, squeezes |
| CHEF | Robo Chef | Meme AI hype: wild, squeezes |
| DOUGH | Dough Coin Trust | Crypto: wild, cheap, wide spread, squeezes |
| PIKL | Big Dill Pharma | Biotech: lives and dies by the FDA |
| SNAK | Snack Attack Games | Video games: launches and delays |
| OVEN | Smart Oven Labs | Tech: big earnings days |
| SPUD | Spudnik Chips | Chips (the computer kind): follows the market, only more |
| FRYR | Deep Fryer Oil Co | Energy: the Fryer Oil Cartel's headlines |
| BRGR | Burger Barn | Restaurants: steady |
| OINK | Piggy Bank Corp | A bank: watch the Fed |
| FZZY | Fizzy Pop Co | Soda: sweet and a little flat |
| SYRP | Maple Syrup Power & Light | The utility: nothing ever happens. Usually |

The analysts are Goldman Snacks, Merrill Lunch, Bank of Americano and friends.

## The market (`src/market.ts`)

A seeded sim, stepped 0.1 market minutes at a time, so the same career and
day always plays the same session until your own orders push the price.

- **Regimes.** Each stock chops around VWAP (with a pull back to it), then
  trends up or down for 20-odd minutes. Trends drift at 0.32 sigma a minute:
  enough to ride, not enough to be free. The next regime is picked when the
  current one starts, which is what lets whales tip it off.
- **The clock.** Busy at the open, quiet at lunch, busy again for power hour
  (from 3:00). Volume follows.
- **News.** 7–11 headlines a day on today's stocks, plus a macro headline or
  two that moves the whole index (and every stock by its beta). A headline
  hits the wire, then the price reacts 0.4–1.6 minutes later: half the move
  at once (the algos), the rest over a few minutes with an overshoot, then
  half of the overshoot back. Some news fizzles (it was priced in); rumors are
  denied 40% of the time; one in four earnings beats gets sold on the call.
  The follow-up headline always explains the reversal.
- **Halts.** A move past a stock's band (4–8%) inside 5 minutes halts it for
  10 market minutes. Whatever news hadn't finished moving it lands in the
  reopening gap, plus a jump that keeps going 60% of the time.
- **Squeezes.** On about a third of days with a meme stock on the list, it
  squeezes: a headline, then a steep run, usually a halt or two, then a fade.
- **Whales.** In the 4 minutes before a trend starts, whale-size prints show
  up on the tape on the side of the coming trend. Decoys show up too.
- **Prices to the cent.** Bid and ask sit around the price by each stock's
  spread; cheap stocks have wide spreads in practice.

## The desk (`src/desk.ts`)

- Market orders: buys at the ask, sells at the bid. Big orders on thin stocks
  pay a little more and push the price (impact = 0.1 × order / liquidity).
- Long or short. Size is a share of your biggest possible position (10%,
  25%, 50% or MAX of buying power). The other button closes the whole
  position, so a tap never flips you by accident.
- Buying power: 2× your account (4× and 6× with tools).
- Commission: half a cent a share, $1 minimum, never more than 1% of the order.
- **The risk desk:** lose 10% of the day's starting equity and everything is
  flattened and your keys are taken until tomorrow.
- **Blown account:** under $1,000 at the bell and the firm stakes you a fresh
  $10,000. Tools stay.

## Tools (`TOOLS` in `src/defs.ts`)

Bought with account cash between days, so every tool is a bet that it'll earn
back more than it costs.

| Tool | Cost | What it does |
|---|---|---|
| Bracket orders | $1,000 | Every entry gets a stop loss and take profit (pick 1–5% and 2–10% in Settings) |
| Level 2 & tape | $1,500 | The time and sales tape for the stock you're watching, whales highlighted |
| Pro pricing | $3,000 | Half commission |
| Scanner | $4,000 | Seven tickers a day instead of five, and alerts when any of them halts |
| News squawk | $6,000 | Headlines arrive 1 market minute earlier; the prices are exactly the same day |
| 4× margin | $8,000 | Twice the buying power |
| 6× margin | $40,000 | More (needs 4×) |

## Career

Your account carries over from day to day. Ranks by account size: Intern,
Junior trader ($25k), Trader ($100k), Senior trader ($500k), Desk head
($2.5M), Whale ($10M), Market legend ($100M). Records keep green days, best
streak, win rate, best and worst trades and days, fees, halts and peak
account.

## Balance

`npm run sim:tickerrush -- 100` runs bots for 100 days each from a fresh
$10,000 at 2× margin, five random tickers a day:

| Bot | Avg/day | Green days | Notes |
|---|---|---|---|
| Random | −2.4% | 37% | Spread and fees eat it |
| Late trend (3 candles in a row) | −6.7% | 11% | Chasing what already happened |
| Momentum (one big candle on the right side of VWAP) | +1.7% | 63% | Reading the chart pays a little |
| Reader, 1 s to react | +4.7% | 81% | The headline-trader, quick |
| Reader, 2 s to react | −1.2% | 39% | Too slow: you buy the overshoot |
| Reader + News squawk | +9.9% | 96% | What the $6,000 buys |
| Whale follower (Level 2) | +4.6% | 76% | Trades the tape on every stock at once |
| Instant reader (0 s) | +13.4% | 100% | Not a human |

About 1.3 halts a day across the watchlist. Speed decides the news edge, which
is the point: Chill gives you more real time per market minute, Blitz less.

## Screens and feel

- Phone first: the ticker crawl, account bar, watchlist chips (price, change,
  sparkline, position badge), the chart, the wire and tape, the order ticket.
  On wide screens the wire and ticket move to a right-hand column.
- The chart has three modes (tap LIVE, 1M or 5M, or press C):
  - **LIVE** (the default) is every tick as a line that scrolls with the
    clock: the last 20 market minutes (30 on wide screens), gliding between
    ticks so it never jumps, with a glowing head that pulses while it trades,
    green or red on the day, and a volume bar per minute. The market keeps
    every tick of the day (`ticks`, `vols` and `vws` on each ticker).
  - **1M** and **5M** are candles built from the same ticks.
  - All three show VWAP, yesterday's close, your position line with live P&L,
    bracket lines, triangles where you filled, news dots, stripes while
    halted, and a price tag that flashes when it ticks a cent.
- Prices flash green or red as they tick, on the chips and the chart header.
  The crawl across the top scrolls every ticker and the RUSH 500 index. The
  ticket shows the bid and ask with their size, changing with every tick.
- Breaking news slides over the chart; tap it to jump to that stock. Closed
  trades float their P&L up the chart; big wins (over 1% of the account)
  throw confetti. Banners for the opening bell, power hour, the goal, the
  risk desk and the close.
- Every sound is synthesized: fills up and down, the till for wins, a thud for
  losses, a news blip, the halt alarm, and a struck bell for open and close.
- Keys: B buy · S sell/short · X close · F flatten all · 1–4 size · arrows
  switch stock · P or Esc pause.
- First-day tips explain buying, closing, news and halts once each.

## Ideas for later

- Native iOS and Android projects (the Capacitor config and `native.ts` are
  ready).
- Limit orders and a trailing stop.
- Options on the meme stocks.
- Weekly challenges with a fixed seed, so friends trade the same day.
